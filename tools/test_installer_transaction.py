"""编译并实际执行微型 NSIS 安装包，避免改动真实桌面快捷方式与注册表。"""
import os
import subprocess
import unittest
from pathlib import Path
import test_install_migration as migration


class NSISInstallationTests(migration.InstallationTests):
    def run_install(self):
        tools = Path(__file__).parent.resolve()
        output = self.parent / 'test-setup.exe'
        script = (tools / 'installer.nsi').read_text('utf8')
        # 安装事务与正式包完全相同；在注册卸载信息、创建快捷方式之前结束测试包。
        script = script.split(' WriteUninstaller', 1)[0] + '\nSectionEnd\n'
        script = script.replace('@VERSION@', '0.10.0').replace('@PAYLOAD@', str(self.stage))
        script = script.replace('@OUTFILE@', str(output)).replace('@MIGRATOR@', str(tools / 'install-app.ps1'))
        source = self.parent / 'test.nsi'
        source.write_text(script, 'utf-8-sig')
        nsis = Path(os.environ['LOCALAPPDATA']) / 'electron-builder/Cache/nsis-3.0.4.1/nsis-3.0.4.1-1mx3n/makensis.exe'
        compiled = subprocess.run([str(nsis), '/V2', str(source)], capture_output=True)
        self.assertEqual(compiled.returncode, 0, compiled.stdout.decode('utf8', 'replace') + compiled.stderr.decode('utf8', 'replace'))
        return subprocess.run([str(output), '/S', '/D=' + str(self.install)], capture_output=True,
                              encoding='utf8', errors='replace', timeout=40)


if __name__ == '__main__':
    unittest.main()
