import tempfile
import json
import unittest
from pathlib import Path
from unittest.mock import patch
import zipfile
import public_release


class PublicStageTests(unittest.TestCase):
    def test_windows_dependencies_keep_x64_runtime_and_licenses_without_copying_other_platforms(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder).resolve()
            source=root/'source'
            for platform in ['win32/x64','win32/arm64','darwin/arm64','linux/x64']:
                path=source/'onnxruntime-node/bin/napi-v6'/platform
                path.mkdir(parents=True)
                (path/'runtime.fixture').write_text('public synthetic runtime', 'utf8')
            (source/'onnxruntime-node/LICENSE').write_text('synthetic license', 'utf8')
            target=root/'target'
            public_release.copy_runtime_dependencies(source,target)
            self.assertTrue((target/'onnxruntime-node/bin/napi-v6/win32/x64/runtime.fixture').is_file())
            self.assertTrue((target/'onnxruntime-node/LICENSE').is_file())
            for platform in ['win32/arm64','darwin/arm64','linux/x64']:
                self.assertFalse((target/'onnxruntime-node/bin/napi-v6'/platform).exists())
                self.assertTrue((source/'onnxruntime-node/bin/napi-v6'/platform/'runtime.fixture').is_file())
    def test_source_archive_contains_clean_source_and_build_manifests_without_git_or_dependencies(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder).resolve()
            app=root/'app'
            for name in ['src','inference/node_modules','tools','.git/objects']:
                (app/name).mkdir(parents=True)
            (app/'src/app.js').write_text('export const value=1;', 'utf8')
            (app/'package.json').write_text('{"version":"0.9.0"}', 'utf8')
            (app/'inference/node_modules/private.fixture').write_text('not source', 'utf8')
            (app/'.git/objects/private.fixture').write_text('not distributable history', 'utf8')
            (app/'tools/model-distribution.json').write_text('{"version":1,"approvals":[]}', 'utf8')
            (app/'inference/package.json').write_text('{"dependencies":{}}', 'utf8')
            output=root/'source.zip'
            with patch.object(public_release,'ROOT',app):
                public_release.write_source_archive(app,output,'0.10.0')
            with zipfile.ZipFile(output) as archive:
                names=archive.namelist()
                self.assertIn('src/app.js',names)
                self.assertIn('inference/package.json',names)
                self.assertFalse(any('.git/' in name or 'node_modules/' in name for name in names))
                self.assertEqual(json.loads(archive.read('package.json'))['version'],'0.10.0')
    def test_payload_uses_only_selected_stage_and_preserves_existing_payloads(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            runtime = root / 'runtime'
            runtime.mkdir()
            (runtime / 'electron.exe').write_bytes(b'test runtime')
            source = root / 'stage'
            source.mkdir()
            (source / 'package.json').write_text('{"version":"0.9.0"}', 'utf8')
            (source / 'index.html').write_text('光屿 · 0.9.0', 'utf8')
            target = root / 'payload'
            public_release.prepare_payload(source, target, runtime, '0.10.0')
            self.assertEqual((target / '光屿修图.exe').read_bytes(), b'test runtime')
            self.assertIn('0.10.0', (target / 'resources/app/package.json').read_text('utf8'))
            self.assertIn('0.9.0', (source / 'package.json').read_text('utf8'))
            with self.assertRaisesRegex(ValueError, '已存在'):
                public_release.prepare_payload(source, target, runtime, '0.10.1')

    def test_collects_reachable_code_and_worker_without_unused_recovered_data(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            (root / 'src').mkdir()
            (root / 'src/app.js').write_text("import './engine.js';", 'utf8')
            (root / 'src/engine.js').write_text("const worker=new URL('./worker.html',import.meta.url)", 'utf8')
            (root / 'src/worker.html').write_text('<script src="worker.mjs"></script>', 'utf8')
            (root / 'src/worker.mjs').write_text('export const value=1;', 'utf8')
            (root / 'src/recovered-private.js').write_text('private test fixture', 'utf8')
            files = public_release.runtime_files(root, ['src/app.js'])
            self.assertEqual({p.relative_to(root).as_posix() for p in files},
                             {'src/app.js', 'src/engine.js', 'src/worker.html', 'src/worker.mjs'})

    def test_rejects_a_dependency_that_escapes_the_source_root(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / 'source'
            root.mkdir()
            (Path(folder) / 'outside.js').write_text('private fixture', 'utf8')
            (root / 'app.js').write_text("import '../outside.js';", 'utf8')
            with self.assertRaisesRegex(ValueError, '目录'):
                public_release.runtime_files(root, ['app.js'])

    def test_staging_returns_a_successful_distribution_audit(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve() / 'source'
            for name in ['src', 'inference/node_modules', 'tools']:
                (root / name).mkdir(parents=True, exist_ok=True)
            (root / 'src/app.js').write_text('export const value=1;', 'utf8')
            (root / 'tools/model-distribution.json').write_text('{"version":1,"approvals":[]}', 'utf8')
            destination = root.parent / 'stage'
            with patch.object(public_release, 'ROOT', root), patch.object(public_release, 'ENTRIES', ['src/app.js']):
                result = public_release.stage(destination)
                self.assertEqual(result['checkedModels'], 0)
                self.assertEqual((destination / 'src/app.js').read_text('utf8'), 'export const value=1;')
                with self.assertRaisesRegex(ValueError, '已存在'):
                    public_release.stage(destination)


if __name__ == '__main__':
    unittest.main()
