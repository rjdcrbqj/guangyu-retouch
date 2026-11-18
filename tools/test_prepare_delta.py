"""Test incremental install preparation with isolated Windows payloads."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('prepare-delta.ps1')
PACKAGE = 'resources/app/package.json'
MODEL = 'resources/app/inference/model.onnx'
NEW_CODE = 'resources/app/core.cjs'


class PrepareDeltaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='guangyu-delta-prepare-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.base = self.root / '光屿修图'
        self.stage = self.root / '光屿修图.guangyu-stage-test'
        self.manifest_path = self.root / 'delta.json'
        self.expected = {
            '.guangyu-trial': (b'guangyu-retouch-trial\n', 'base'),
            PACKAGE: (b'{"name":"guangyu-retouch","version":"0.22.0"}', 'changed'),
            MODEL: (b'public model placeholder', 'base'),
            NEW_CODE: (b'module.exports = 12;', 'changed'),
        }
        for name, (contents, source) in self.expected.items():
            self.write(self.base if source == 'base' else self.stage, name, contents)
        self.original_package = b'{"name":"guangyu-retouch","version":"0.21.0"}'
        self.write(self.base, PACKAGE, self.original_package)
        self.write(self.base, 'resources/app/retired.txt', b'retired program file')
        self.write(self.base, 'user.guangyu.json', b'{"personal":true}')
        self.manifest = dict(format=1, baseVersion='0.21.0', targetVersion='0.22.0', files=[
            dict(path=name, size=len(contents), sha256=hashlib.sha256(contents).hexdigest(), source=source)
            for name, (contents, source) in self.expected.items()
        ])

    @staticmethod
    def write(root, name, contents):
        destination = root / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(contents)

    def prepare(self):
        self.manifest_path.write_text(json.dumps(self.manifest, ensure_ascii=False), 'utf8')
        return subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(SCRIPT),
                               '-InstallRoot', str(self.base), '-StageRoot', str(self.stage),
                               '-ManifestPath', str(self.manifest_path)], capture_output=True, text=True,
                              encoding='utf8', errors='replace', timeout=30)

    def assert_base_untouched(self):
        self.assertEqual((self.base / PACKAGE).read_bytes(), self.original_package)
        self.assertEqual((self.base / 'user.guangyu.json').read_bytes(), b'{"personal":true}')
        self.assertTrue((self.base / 'resources/app/retired.txt').is_file())

    def test_reconstructs_only_reviewed_target_files_with_independent_copies(self):
        result = self.prepare()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        actual = {path.relative_to(self.stage).as_posix(): path.read_bytes()
                  for path in self.stage.rglob('*') if path.is_file()}
        self.assertEqual(actual, {name: data[0] for name, data in self.expected.items()})
        self.assert_base_untouched()
        self.write(self.stage, MODEL, b'probe')
        self.assertEqual((self.base / MODEL).read_bytes(), self.expected[MODEL][0])

    def test_corrupt_reused_file_is_rejected_before_copy(self):
        self.write(self.base, MODEL, b'X' * len(self.expected[MODEL][0]))
        self.assertNotEqual(self.prepare().returncode, 0)
        self.assertFalse((self.stage / MODEL).exists())
        self.assert_base_untouched()

    def test_corrupt_changed_file_is_rejected_before_copy(self):
        self.write(self.stage, NEW_CODE, b'bad')
        self.assertNotEqual(self.prepare().returncode, 0)
        self.assertFalse((self.stage / MODEL).exists())
        self.assert_base_untouched()

    def test_valid_archive_from_another_base_does_not_change_installed_program(self):
        self.manifest['baseVersion'] = '0.20.0'
        self.assertNotEqual(self.prepare().returncode, 0)
        self.assertFalse((self.stage / MODEL).exists())
        self.assert_base_untouched()

    def test_rejects_path_aliases_and_unmanifested_staged_files(self):
        original = self.manifest['files'][:]
        for name in ('../outside.bin', 'RESOURCES/app/CORE.cjs', 'resources/app/aux.bin', 'resources/app/alias.'):
            with self.subTest(name=name):
                self.manifest['files'] = [*original, dict(original[-1], path=name)]
                self.assertNotEqual(self.prepare().returncode, 0)
                self.assertFalse((self.stage / MODEL).exists())
        self.manifest['files'] = original
        self.write(self.stage, 'unlisted.dll', b'unlisted')
        self.assertNotEqual(self.prepare().returncode, 0)
        self.assertFalse((self.stage / MODEL).exists())
        self.assert_base_untouched()


if __name__ == '__main__':
    unittest.main()
