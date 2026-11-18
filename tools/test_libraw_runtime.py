import hashlib
import io
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import libraw_runtime
import public_release


class LibRawRuntimeTests(unittest.TestCase):
    def with_archive(self, root):
        archive = root / libraw_runtime.ARCHIVE_PATH
        archive.parent.mkdir(parents=True)
        shutil.copy2(libraw_runtime.ROOT / libraw_runtime.ARCHIVE_PATH, archive)
        return archive

    def test_development_runtime_has_exact_vendor_dll_and_exe_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            vendor = self.with_archive(root)
            with zipfile.ZipFile(vendor) as archive:
                for entry in ('LICENSE.CDDL', 'LICENSE.LGPL', 'samples/dcraw_emu.cpp', 'LibRaw.sln'):
                    self.assertTrue(archive.read(f'LibRaw-{libraw_runtime.VERSION}/{entry}'))
            native = libraw_runtime.provision(root)
            self.assertEqual(native, root / libraw_runtime.NATIVE_PATH)
            self.assertEqual({file.name for file in native.iterdir()}, {'dcraw_emu.exe', 'libraw.dll'})
            for name, expected in libraw_runtime.BINARY_DIGESTS.items():
                self.assertEqual(hashlib.sha256((native / name).read_bytes()).hexdigest(), expected)
            self.assertEqual(libraw_runtime.provision(root), native)
            (native / 'libraw.dll').write_bytes(b'unrelated DLL')
            with self.assertRaisesRegex(ValueError, 'SHA-256'):
                libraw_runtime.provision(root)
            self.assertEqual((native / 'libraw.dll').read_bytes(), b'unrelated DLL')

    def test_modified_archive_and_extra_runtime_items_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            vendor = self.with_archive(root)
            original = vendor.read_bytes()
            with zipfile.ZipFile(vendor, 'a') as archive:
                archive.writestr('unreviewed.onnx', b'fixture for the rejection test')
            with self.assertRaisesRegex(ValueError, 'SHA-256'):
                libraw_runtime.provision(root)
            self.assertFalse((root / libraw_runtime.NATIVE_PATH).exists())
            vendor.write_bytes(original)
            native = libraw_runtime.provision(root)
            (native / 'unreviewed.zip').write_bytes(b'unreviewed archive fixture')
            with self.assertRaisesRegex(ValueError, '不受支持'):
                libraw_runtime.verify(root)

    def test_stage_installer_and_source_archive_take_only_pinned_vendor_assets(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder).resolve()
            root = base / 'repo'
            archive_path = self.with_archive(root)
            for name in ['src', 'inference/node_modules', 'tools', 'inference/public-raw/native']:
                (root / name).mkdir(parents=True)
            shutil.copy2(Path(libraw_runtime.__file__), root / 'tools/libraw_runtime.py')
            (root / 'tools/model-distribution.json').write_text('{"version":1,"approvals":[]}', 'utf8')
            (root / 'package.json').write_text('{"version":"0.1.0"}', 'utf8')
            (root / 'index.html').write_text('<main>光屿 · 0.1.0</main>', 'utf8')
            (root / 'src/app.js').write_text('export {};', 'utf8')
            (root / 'inference/public-raw/service.cjs').write_text('module.exports={};', 'utf8')
            (root / libraw_runtime.NATIVE_PATH / 'private.fixture.json').write_text('{"fixture":true}', 'utf8')
            runtime = base / 'runtime'
            runtime.mkdir()
            (runtime / 'electron.exe').write_bytes(b'test executable')
            stage = base / 'stage'
            payload = base / 'payload'
            source = base / 'source.zip'
            with patch.object(public_release, 'ROOT', root), patch.object(public_release, 'ENTRIES', ['src/app.js', 'package.json', 'index.html']):
                public_release.stage(stage)
                self.assertFalse((stage / libraw_runtime.NATIVE_PATH / 'private.fixture.json').exists())
                app = public_release.prepare_payload(stage, payload, runtime, '0.2.0')
                libraw_runtime.verify(app)
                self.assertEqual((app / libraw_runtime.ARCHIVE_PATH).read_bytes(), archive_path.read_bytes())
                info = public_release.write_source_archive(app, source, '0.2.0')
                self.assertEqual(info['approvedModels'], 0)
                with zipfile.ZipFile(source) as files:
                    self.assertEqual(json.loads(files.read('package.json'))['version'], '0.2.0')
                    self.assertIn('tools/libraw_runtime.py', files.namelist())
                    self.assertTrue(all(not name.startswith(libraw_runtime.NATIVE_PATH.as_posix() + '/')
                                        for name in files.namelist()))
                    vendor = files.read(libraw_runtime.ARCHIVE_PATH.as_posix())
                    self.assertEqual(vendor, archive_path.read_bytes())
                    with zipfile.ZipFile(io.BytesIO(vendor)) as origin:
                        self.assertIn(f'LibRaw-{libraw_runtime.VERSION}/LICENSE.LGPL', origin.namelist())

                (stage / libraw_runtime.ARCHIVE_PATH.parent / 'other.zip').write_bytes(b'other fixture')
                with self.assertRaisesRegex(ValueError, '不受支持'):
                    public_release.prepare_payload(stage, base / 'reject', runtime, '0.2.0')
                self.assertFalse((base / 'reject').exists())


if __name__ == '__main__':
    unittest.main()
