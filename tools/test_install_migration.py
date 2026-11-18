"""用无私有内容的占位文件测试 Windows 安装事务。"""
import ctypes
from ctypes import wintypes
import hashlib
import json
import subprocess
import shutil
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name('install-app.ps1')


class InstallationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.parent = Path(self.temp.name).resolve()
        self.install = self.parent / '光屿测试'
        self.stage = self.parent / '光屿测试.guangyu-stage-test'
        self.install.mkdir()
        self.stage.mkdir()
        for root in [self.install, self.stage]:
            (root / 'resources/app').mkdir(parents=True)
            (root / '.guangyu-trial').write_text('guangyu-retouch-trial\n', 'ascii')
            (root / 'resources/app/package.json').write_text('{"name":"guangyu-retouch"}', 'utf8')
        (self.install / '光屿修图.exe').write_bytes(b'old public test program')
        (self.stage / '光屿修图.exe').write_bytes(b'new public test program')
        (self.install / 'resources/app/old-model.bin').write_bytes(b'non-private placeholder')
        (self.stage / 'resources/app/public-model.task').write_bytes(b'public test placeholder')
        (self.install / '照片.png').write_bytes(b'personal photo placeholder')
        (self.install / '历史工程.guangyu.json').write_text('{"original":"retained"}', 'utf8')
        (self.install / 'shortcut-settings.json').write_text('{"brush":"X"}', 'utf8')
        (self.install / 'resources/app/旧照片.png').write_bytes(b'photo saved inside program folder')
        (self.install / 'resources/app/inference/old-templates').mkdir(parents=True)
        (self.install / 'resources/app/inference/old-templates/mask.png').write_bytes(b'non-private old template placeholder')

    def run_install(self, install=None, delta_manifest=None):
        command = ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(SCRIPT),
                   '-InstallRoot', str(self.install if install is None else install), '-StageRoot', str(self.stage)]
        if delta_manifest is not None:
            command += ['-DeltaManifestPath', str(delta_manifest)]
        return subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=30)

    def assert_user_data(self):
        self.assertEqual((self.install / '照片.png').read_bytes(), b'personal photo placeholder')
        self.assertEqual((self.install / '历史工程.guangyu.json').read_text('utf8'), '{"original":"retained"}')
        self.assertEqual((self.install / 'shortcut-settings.json').read_text('utf8'), '{"brush":"X"}')
        self.assertEqual((self.install / 'resources/app/旧照片.png').read_bytes(), b'photo saved inside program folder')

    def test_upgrade_quarantines_old_resources_and_preserves_user_data(self):
        result = self.run_install()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertFalse((self.install / 'resources/app/old-model.bin').exists())
        self.assertFalse((self.install / 'resources/app/inference/old-templates/mask.png').exists())
        self.assertTrue((self.install / 'resources/app/public-model.task').is_file())
        self.assertEqual((self.install / '光屿修图.exe').read_bytes(), b'new public test program')
        self.assert_user_data()
        backups = list(self.parent.glob('光屿测试.guangyu-backup-*'))
        self.assertEqual(len(backups), 1)
        self.assertEqual((backups[0] / 'old/resources/app/old-model.bin').read_bytes(), b'non-private placeholder')

    def test_failed_journal_replacement_keeps_the_previous_recovery_record(self):
        old = self.parent / 'transaction.json'
        temporary = self.parent / 'transaction.tmp'
        old.write_text('previous recovery record', 'utf8')
        temporary.write_text('next recovery record', 'utf8')
        quote = lambda p: "'" + str(p).replace("'", "''") + "'"
        code = "$ErrorActionPreference='Stop';$tokens=$null;$errors=$null;"
        code += '$ast=[Management.Automation.Language.Parser]::ParseFile(' + quote(SCRIPT) + ',[ref]$tokens,[ref]$errors);'
        code += "$function=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Publish-Journal'},$true);if(-not $function){throw 'Atomic journal publisher missing'};Invoke-Expression $function.Extent.Text;"
        code += '$handle=[IO.File]::Open(' + quote(temporary) + ",'Open','Read','Read');$failed=$false;try{Publish-Journal " + quote(temporary) + ' ' + quote(old) + '}catch{$failed=$true}finally{$handle.Dispose()};if(-not $failed){throw \'Expected file lock failure\'};'
        code += 'if([IO.File]::ReadAllText(' + quote(old) + ") -ne 'previous recovery record'){throw 'Recovery record lost'}"
        result = subprocess.run(['powershell.exe', '-NoProfile', '-Command', code], capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr.decode('utf8', 'replace'))
        self.assertEqual(old.read_text('utf8'), 'previous recovery record')

    def test_locked_old_executable_rolls_back_resources_without_losing_user_data(self):
        create = ctypes.windll.kernel32.CreateFileW
        create.restype = ctypes.c_void_p
        handle = create(str(self.install / '光屿修图.exe'), 0x80000000, 1, None, 3, 0, None)
        self.assertNotEqual(handle, ctypes.c_void_p(-1).value)
        try:
            result = self.run_install()
        finally:
            ctypes.windll.kernel32.CloseHandle(ctypes.c_void_p(handle))
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue((self.install / 'resources/app/old-model.bin').is_file())
        self.assertFalse((self.install / 'resources/app/public-model.task').exists())
        self.assertEqual((self.install / '光屿修图.exe').read_bytes(), b'old public test program')
        self.assert_user_data()

    def test_unrecognized_installation_is_left_untouched(self):
        (self.install / '.guangyu-trial').unlink()
        result = self.run_install()
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue((self.install / 'resources/app/old-model.bin').is_file())
        self.assertTrue((self.stage / 'resources/app/public-model.task').is_file())
        self.assert_user_data()

    def test_pending_transaction_recovers_a_resources_swap_before_an_interrupted_journal_update(self):
        self.recover_interrupted_swap('transaction.json')

    def test_pending_temporary_journal_recovers_when_the_final_record_is_absent(self):
        self.recover_interrupted_swap('transaction.tmp')

    def open_install_mutex(self):
        identity = hashlib.sha256(str(self.install).upper().encode('utf8')).hexdigest()
        name = rf'Global\GuangyuRetouch.Install.{identity}'
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.CreateMutexW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR]
        kernel.CreateMutexW.restype = wintypes.HANDLE
        kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        kernel.WaitForSingleObject.restype = wintypes.DWORD
        kernel.ReleaseMutex.argtypes = kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        mutex = kernel.CreateMutexW(None, False, name)
        if not mutex:
            raise ctypes.WinError(ctypes.get_last_error())
        self.addCleanup(kernel.CloseHandle, mutex)
        return kernel, mutex, name

    def test_active_install_mutex_rejects_second_migration_without_touching_pending_journal(self):
        backup = self.interrupted_swap('transaction.json')
        record = backup / 'transaction.json'
        before = record.read_bytes()
        kernel, mutex, _ = self.open_install_mutex()
        self.assertEqual(kernel.WaitForSingleObject(mutex, 0), 0)
        try:
            alternate = str(self.install.parent).upper() + '\\.\\' + self.install.name + '\\'
            result = InstallationTests.run_install(self, install=alternate)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Another installation is active', result.stdout + result.stderr)
            self.assertEqual(record.read_bytes(), before)
            self.assertTrue((self.install / 'resources/app/public-model.task').is_file())
            self.assertTrue((backup / 'old/resources/app/old-model.bin').is_file())
            self.assertFalse((backup / 'failed-new').exists())
            self.assertTrue((self.stage / '光屿修图.exe').is_file())
        finally:
            kernel.ReleaseMutex(mutex)
        result = InstallationTests.run_install(self)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Incomplete staged application', result.stdout + result.stderr)
        self.assertEqual(json.loads(record.read_text('utf8'))['Status'], 'rolled-back')
        self.assert_user_data()

    def test_abandoned_install_mutex_allows_recovery_of_pending_journal(self):
        _, _, name = self.open_install_mutex()
        hold_and_exit = (
            f"$mutex=[Threading.Mutex]::new($false,'{name}');"
            "if(-not $mutex.WaitOne(0)){[Environment]::Exit(1)};"
            "[Environment]::Exit(0)"
        )
        stopped = subprocess.run(['powershell.exe', '-NoProfile', '-Command', hold_and_exit],
                                 capture_output=True, timeout=30)
        self.assertEqual(stopped.returncode, 0, stopped.stderr.decode('utf8', 'replace'))
        # 测试进程持有句柄但不占用所有权，确保进程离开后仍能收到弃置通知。
        backup = self.interrupted_swap('transaction.json')
        self.assert_recovered(backup, InstallationTests.run_install(self))

    def set_version(self, root, version):
        (root / 'resources/app/package.json').write_text(
            json.dumps({'name': 'guangyu-retouch', 'version': version}), 'utf8')

    def delta_manifest(self, base='0.20.0', target='0.21.0'):
        manifest = self.parent / 'delta.json'
        manifest.write_text(json.dumps({'format': 1, 'baseVersion': base, 'targetVersion': target}), 'utf8')
        return manifest

    def test_delta_staged_before_another_update_keeps_the_newer_installation_unchanged(self):
        self.set_version(self.install, '0.22.0')
        self.set_version(self.stage, '0.21.0')
        manifest = self.delta_manifest()

        def snapshot(folder):
            return {item.relative_to(folder): item.read_bytes() for item in folder.rglob('*') if item.is_file()}

        live_before = snapshot(self.install)
        stage_before = snapshot(self.stage)
        result = InstallationTests.run_install(self, delta_manifest=manifest)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Installed version changed', result.stdout + result.stderr)
        self.assertEqual(snapshot(self.install), live_before)
        self.assertEqual(snapshot(self.stage), stage_before)
        self.assertEqual(list(self.parent.glob('*.guangyu-backup-*')), [])

    def test_delta_rechecks_target_and_size_then_swaps_when_versions_still_match(self):
        self.set_version(self.install, '0.20.0')
        self.set_version(self.stage, '0.22.0')
        manifest = self.delta_manifest()
        wrong_version = InstallationTests.run_install(self, delta_manifest=manifest)
        self.assertNotEqual(wrong_version.returncode, 0)
        self.assertIn('Staged version does not match', wrong_version.stdout + wrong_version.stderr)
        self.set_version(self.stage, '0.21.0')
        manifest.write_bytes(b'a' * (4 * 1024**2 + 1))
        too_large = InstallationTests.run_install(self, delta_manifest=manifest)
        self.assertNotEqual(too_large.returncode, 0)
        self.assertIn('Invalid incremental inventory size', too_large.stdout + too_large.stderr)
        self.assertTrue((self.install / 'resources/app/old-model.bin').is_file())
        self.assertEqual(list(self.parent.glob('*.guangyu-backup-*')), [])
        self.assertFalse((self.stage / 'resources/app/旧照片.png').exists())

        result = InstallationTests.run_install(self, delta_manifest=self.delta_manifest())
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        saved = json.loads((self.install / 'resources/app/package.json').read_text('utf8'))
        self.assertEqual(saved['version'], '0.21.0')
        self.assert_user_data()


    def interrupted_swap(self, record_name):
        backup = self.parent / '光屿测试.guangyu-backup-interrupted'
        (backup / 'old').mkdir(parents=True)
        shutil.move(str(self.install / 'resources'), str(backup / 'old/resources'))
        shutil.move(str(self.stage / 'resources'), str(self.install / 'resources'))
        journal = {'InstallRoot': str(self.install), 'StageRoot': str(self.stage), 'Status': 'pending',
                   'Entries': [{'Name': 'resources', 'OldPresent': True, 'NewIntent': True}]}
        (backup / record_name).write_text(json.dumps(journal), 'utf8')
        return backup

    def recover_interrupted_swap(self, record_name):
        backup = self.interrupted_swap(record_name)
        # 模拟进程在新资源移入后中断；下一次安装先恢复旧应用，缺少完整新包时不继续。
        self.assert_recovered(backup, self.run_install())

    def assert_recovered(self, backup, result):
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue((self.install / 'resources/app/old-model.bin').is_file())
        self.assertEqual((self.install / '光屿修图.exe').read_bytes(), b'old public test program')
        self.assertEqual(json.loads((backup / 'transaction.json').read_text('utf8'))['Status'], 'rolled-back')
        self.assert_user_data()


if __name__ == '__main__':
    unittest.main()
