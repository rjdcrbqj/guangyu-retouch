import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from public_delta import build_delta, prepare_delta, _windows_name_key


class PublicDeltaTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.base = self.root / 'base'
        self.target = self.root / 'target'
        self.output = self.root / 'delta'
        self.payload(self.base, '0.20.0')
        self.payload(self.target, '0.21.0')

    @staticmethod
    def put(root, name, content):
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path

    def payload(self, root, version):
        self.put(root, '.guangyu-trial', b'guangyu-retouch-trial\n')
        self.put(root, 'resources/app/package.json',
                 json.dumps({'name': 'guangyu-retouch', 'version': version}).encode())
        self.put(root, 'runtime.exe', b'same synthetic runtime')
        self.put(root, 'resources/app/runtime/same.bin', b'reused')

    def test_manifest_reconstructs_only_target_files_and_copies_separate_changed_bytes(self):
        self.put(self.base, 'resources/app/removed.txt', b'retired')
        self.put(self.base, 'resources/app/changed.txt', b'old')
        self.put(self.target, 'resources/app/changed.txt', b'new')
        self.put(self.target, 'resources/app/新文件.js', b'added')
        (self.target / 'resources/app/node_modules/empty-scope').mkdir(parents=True)
        report = prepare_delta(self.base, self.target, self.output)
        self.assertEqual(report, json.loads((self.output / 'delta.json').read_text('utf8')))
        self.assertEqual(set(report), {'format', 'baseVersion', 'targetVersion', 'files'})
        self.assertEqual((report['format'], report['baseVersion'], report['targetVersion']), (1, '0.20.0', '0.21.0'))

        files = {item['path']: item for item in report['files']}
        self.assertEqual(list(files), sorted(files))
        target_files = {file.relative_to(self.target).as_posix() for file in self.target.rglob('*') if file.is_file()}
        self.assertEqual(set(files), target_files)
        changed = {'resources/app/changed.txt', 'resources/app/新文件.js', 'resources/app/package.json'}
        self.assertEqual({name for name, item in files.items() if item['source'] == 'changed'}, changed)
        out_files = {file.relative_to(self.output / 'changed').as_posix() for file in (self.output / 'changed').rglob('*') if file.is_file()}
        self.assertEqual(out_files, changed)
        for name, item in files.items():
            self.assertEqual(set(item), {'path', 'size', 'sha256', 'source'})
            expected = (self.target / name).read_bytes()
            selected = self.base if item['source'] == 'base' else self.output / 'changed'
            self.assertEqual((selected / name).read_bytes(), expected)
            self.assertEqual((item['size'], item['sha256']), (len(expected), hashlib.sha256(expected).hexdigest()))
        (self.target / 'resources/app/changed.txt').write_bytes(b'later changed')
        self.assertEqual((self.output / 'changed/resources/app/changed.txt').read_bytes(), b'new')

    def test_rejects_invalid_product_non_upgrade_and_independent_top_level_removal(self):
        marker = self.target / '.guangyu-trial'
        marker.write_text('unrecognized', 'utf8')
        with self.assertRaisesRegex(ValueError, '标记'):
            prepare_delta(self.base, self.target, self.output)
        marker.write_text('guangyu-retouch-trial\n', 'utf8')
        for version in ['0.20.0', '0.19.9', 'v0.21.0', '0.021.0']:
            self.payload(self.target, version)
            with self.assertRaisesRegex(ValueError, '版本'):
                prepare_delta(self.base, self.target, self.output)
        self.payload(self.target, '0.21.0')
        self.put(self.base, 'obsolete-dir/runtime.bin', b'old')
        with self.assertRaisesRegex(ValueError, '顶层'):
            prepare_delta(self.base, self.target, self.output)
        (self.target / 'obsolete-dir').mkdir()
        with self.assertRaisesRegex(ValueError, '顶层'):
            prepare_delta(self.base, self.target, self.output)
        self.assertFalse(self.output.exists())

    def test_rejects_existing_or_nested_destination_and_overlapping_input_roots(self):
        self.output.mkdir()
        keep = self.put(self.output, 'keep.me', b'not our output')
        with self.assertRaisesRegex(ValueError, '目录'):
            prepare_delta(self.base, self.target, self.output)
        self.assertEqual(keep.read_bytes(), b'not our output')
        for output in (self.base / 'inside-base', self.target / 'inside-target'):
            with self.assertRaises(ValueError):
                prepare_delta(self.base, self.target, output)
            self.assertFalse(output.exists())
        self.payload(self.base / 'nested-target', '0.21.0')
        with self.assertRaises(ValueError):
            prepare_delta(self.base, self.base / 'nested-target', self.root / 'another-delta')

    def test_rejects_windows_reserved_paths_and_casefold_aliases(self):
        for name in ('', '.', '..', 'with space ', 'suffix.', 'a:b', 'sub/path', 'sub\\path',
                     'NUL.bin', 'prn', 'COM1.exe', 'LPT².obj', 'CONOUT$', 'bad\x1fname', 'a'*256):
            with self.subTest(name=name), self.assertRaises(ValueError):
                _windows_name_key(name)
        self.assertEqual(_windows_name_key('Straße'), _windows_name_key('STRASSE'))
        self.put(self.target, 'resources/app/Straße/a.txt', b'one')
        self.put(self.target, 'resources/app/STRASSE/b.txt', b'two')
        with self.assertRaisesRegex(ValueError, '冲突'):
            prepare_delta(self.base, self.target, self.output)
        self.assertFalse(self.output.exists())

    def test_rejects_file_or_directory_links_in_reused_and_changed_trees(self):
        external = self.put(self.root, 'external/source.txt', b'outside')
        link = self.base / 'resources/app/linked'
        try:
            os.symlink(external.parent, link, target_is_directory=True)
        except OSError as error:
            if os.name != 'nt':
                self.skipTest(f'directory links unavailable: {error}')
            result = subprocess.run(['cmd.exe', '/d', '/c', 'mklink', '/J', str(link), str(external.parent)],
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
            if result.returncode:
                self.skipTest('directory links and Windows junctions unavailable')
        with self.assertRaisesRegex(ValueError, '链接'):
            prepare_delta(self.base, self.target, self.output)
        self.assertFalse(self.output.exists())
        self.assertEqual(external.read_bytes(), b'outside')

    def test_failed_copy_does_not_publish_a_manifest(self):
        self.put(self.target, 'resources/app/changed.txt', b'expected')
        with patch('public_delta.shutil.copyfile', side_effect=OSError('copy failed')):
            with self.assertRaisesRegex(OSError, 'copy failed'):
                prepare_delta(self.base, self.target, self.output)
        self.assertFalse((self.output / 'delta.json').exists())



    def installer_tools(self):
        tools = self.root / 'tool templates'
        template = ('Unicode true\nName "Guangyu @VERSION@"\nOutFile "@OUTFILE@"\n'
                    'File /r "@PAYLOAD@\\*.*"\nFile "@MIGRATOR@"\n'
                    'File "${DELTA_MANIFEST}"\nFile "${DELTA_PREPARER}"\n')
        self.put(tools, 'installer.nsi', template.encode())
        self.put(tools, 'install-app.ps1', b'# migrator')
        self.put(tools, 'prepare-delta.ps1', b'# delta preparer')
        return tools

    def test_build_emits_verified_incremental_descriptor_and_defines(self):
        tools = self.installer_tools()
        output = self.root / 'delta with space'
        installer = 'GuangyuRetouchUpdate-0.20.0-to-0.21.0.exe'
        binary = b'MZ mock installer content'

        def compile_installer(command, *, check):
            self.assertEqual(command[:2], ['mock-makensis.exe', '/V2'])
            self.assertTrue(check)
            script = Path(command[2])
            text = script.read_text('utf-8-sig')
            self.assertEqual(text.splitlines()[:3], [
                'Unicode true',
                f'!define DELTA_MANIFEST "{output / "delta.json"}"',
                f'!define DELTA_PREPARER "{tools / "prepare-delta.ps1"}"',
            ])
            self.assertIn(f'OutFile "{output / installer}"', text)
            self.assertIn(f'File /r "{output / "changed"}\\*.*"', text)
            self.assertIn(f'File "{tools / "install-app.ps1"}"', text)
            self.assertIn('Name "Guangyu 0.21.0"', text)
            self.assertTrue((output / 'changed/resources/app/package.json').is_file())
            (output / installer).write_bytes(binary)

        with patch('public_delta.TOOLS_DIR', tools), patch.dict(os.environ, MAKENSIS='mock-makensis.exe'), \
                patch('public_delta.subprocess.run', side_effect=compile_installer) as compiled:
            result = build_delta(self.base, self.target, output)
        compiled.assert_called_once()
        self.assertEqual(result, json.loads((output / 'incremental.json').read_text('utf8')))
        self.assertEqual(result, {
            'format': 1, 'baseVersion': '0.20.0', 'targetVersion': '0.21.0',
            'installer': installer, 'size': len(binary), 'sha256': hashlib.sha256(binary).hexdigest(),
            'inventorySha256': hashlib.sha256((output / 'delta.json').read_bytes()).hexdigest(),
        })
        self.assertEqual(set(path.name for path in output.iterdir()),
                         {'changed', 'delta.json', installer, 'incremental.json'})

    def test_build_rejects_unsafe_nsis_paths_and_keeps_failed_descriptor_unpublished(self):
        tools = self.installer_tools()
        with patch('public_delta.TOOLS_DIR', tools), patch('public_delta.subprocess.run') as compiled:
            unsafe = self.root / 'has$dollar'
            with self.assertRaisesRegex(ValueError, 'NSIS'):
                build_delta(self.base, self.target, unsafe)
            self.assertFalse(unsafe.exists())
            self.put(self.target, 'resources/app/$unexpected.bin', b'mock')
            with self.assertRaisesRegex(ValueError, 'NSIS'):
                build_delta(self.base, self.target, self.output)
            compiled.assert_not_called()
        self.assertFalse((self.output / 'incremental.json').exists())

    def test_build_requires_delta_aware_template_and_compiler_success(self):
        tools = self.installer_tools()
        self.put(tools, 'installer.nsi', b'Unicode true\nFile /r "@PAYLOAD@"\n')
        with patch('public_delta.TOOLS_DIR', tools), patch('public_delta.subprocess.run') as compiled:
            with self.assertRaisesRegex(ValueError, 'NSIS'):
                build_delta(self.base, self.target, self.output)
            compiled.assert_not_called()
        self.assertFalse(self.output.exists())

        self.installer_tools()
        with patch('public_delta.TOOLS_DIR', tools), patch.dict(os.environ, MAKENSIS='mock-makensis.exe'), \
                patch('public_delta.subprocess.run', side_effect=subprocess.CalledProcessError(1, 'makensis')):
            with self.assertRaises(subprocess.CalledProcessError):
                build_delta(self.base, self.target, self.output)
        self.assertFalse((self.output / 'incremental.json').exists())


if __name__ == '__main__':
    unittest.main()
