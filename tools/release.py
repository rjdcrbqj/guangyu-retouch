"""在同一项目内构建和发布版本，固定输出文件，拒绝覆盖历史标签。"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
PAYLOAD = DIST / 'payload'
REPOSITORY = json.loads((ROOT / 'update-config.json').read_text('utf8'))['repository']
INSTALLER = 'GuangyuRetouchSetup.exe'
ROOT_FILES = ['main.cjs', 'preload.cjs', 'export-session.cjs', 'package.json', 'index.html', 'styles.css', 'updates.cjs', 'update-config.json']


def command(args, **kwargs):
    return subprocess.run(list(map(str, args)), cwd=ROOT, check=True, **kwargs)


def program(env, name, fallback):
    value = os.environ.get(env) or shutil.which(name) or fallback
    if not value or not Path(value).is_file():
        raise RuntimeError(f'没有找到 {name}，请设置 {env}')
    return value


def digest(file):
    value = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def build(version, source):
    assert re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', version)
    for required in [ROOT / 'runtime/electron.exe', ROOT / 'inference/assets', ROOT / 'inference/node_modules']:
        if not required.exists():
            raise RuntimeError(f'缺少离线构建资源：{required}')
    DIST.mkdir(exist_ok=True)
    # 一个固定缓存，离线依赖只复制一次；不把本机照片和特征打包。
    if not PAYLOAD.exists():
        shutil.copytree(ROOT / 'runtime', PAYLOAD)
        (PAYLOAD / 'electron.exe').rename(PAYLOAD / '光屿修图.exe')
        assets = PAYLOAD / 'resources/app/inference/assets'
        assets.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(ROOT / 'inference/assets', assets,
                        ignore=lambda folder, names: {'examples', 'features', '__pycache__'} if Path(folder) == ROOT / 'inference/assets' else {'__pycache__'})
        shutil.copytree(ROOT / 'inference/node_modules', assets.parent / 'node_modules', ignore=shutil.ignore_patterns('__pycache__'))
        for dll in ['vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll', 'msvcp140_1.dll', 'msvcp140_2.dll', 'msvcp140_atomic_wait.dll', 'msvcp140_codecvt_ids.dll', 'concrt140.dll']:
            shutil.copyfile(Path(os.environ.get('SystemRoot', 'C:/Windows')) / 'System32' / dll, PAYLOAD / dll)
    app = PAYLOAD / 'resources/app'
    # 只清理本项目固定打包缓存内的旧代码；保留已复制的运行库和模型。
    for directory in [app / 'src', *(item for item in (app / 'inference').iterdir() if item.is_dir() and item.name not in ['assets', 'node_modules'])]:
        if directory.exists():
            assert directory.resolve().is_relative_to(PAYLOAD.resolve()) and not directory.is_symlink()
            shutil.rmtree(directory)
    for file in [*app.glob('*'), *(app / 'inference').glob('*')]:
        if file.is_file():
            file.unlink()
    for name in ROOT_FILES:
        if (source / name).is_file():
            shutil.copyfile(source / name, app / name)
    shutil.copytree(source / 'src', app / 'src')
    shutil.copytree(source / 'inference', app / 'inference', dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('assets', 'node_modules', '__pycache__', '*.log'))
    manifest = app / 'inference/assets/manifest.json'
    data = json.loads(manifest.read_text('utf8'))
    data['features'] = []
    manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2), 'utf8')
    package = json.loads((app / 'package.json').read_text('utf8'))
    package['version'] = version
    (app / 'package.json').write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', 'utf8')
    index = (app / 'index.html').read_text('utf8')
    index = re.sub(r'(功能扩展试验|离线试用版) \d+\.\d+\.\d+', '离线试用版 ' + version, index)
    index = re.sub(r'光屿 · \d+\.\d+\.\d+', '光屿 · ' + version, index)
    index = index.replace('id="load-examples"', 'id="load-examples" hidden')
    (app / 'index.html').write_text(index, 'utf8')
    (PAYLOAD / '.guangyu-trial').write_text('guangyu-retouch-trial\n', 'ascii')
    (PAYLOAD / '使用说明.txt').write_text('光屿修图 ' + version + '\n\nCtrl＋滚轮缩放；右上角可设置快捷键和检查更新。\n更新前请保存工程。\n版本记录：https://github.com/' + REPOSITORY + '/releases\n', 'utf-8-sig')
    script = (ROOT / 'tools/installer.nsi').read_text('utf8')
    script = script.replace('@VERSION@', version).replace('@PAYLOAD@', str(PAYLOAD)).replace('@OUTFILE@', str(DIST / INSTALLER))
    nsi = DIST / 'installer.nsi'
    nsi.write_text(script, 'utf-8-sig')
    nsis = program('MAKENSIS', 'makensis', str(Path(os.environ['LOCALAPPDATA']) / 'electron-builder/Cache/nsis-3.0.4.1/nsis-3.0.4.1-1mx3n/makensis.exe'))
    command([nsis, '/V2', nsi])
    output = DIST / INSTALLER
    update = dict(version=version, installer=INSTALLER, size=output.stat().st_size, sha256=digest(output))
    (DIST / 'update.json').write_text(json.dumps(update, indent=2) + '\n', 'utf8')
    print(json.dumps(update), flush=True)
    return output


def source_files():
    files = [ROOT / name for name in ROOT_FILES + ['.gitignore', 'README.md', 'CHANGELOG.md'] if (ROOT / name).is_file()]
    for name in ['src', 'inference', 'tests', 'tools']:
        for file in (ROOT / name).rglob('*'):
            if any(part in ['assets', 'node_modules', '__pycache__'] for part in file.relative_to(ROOT).parts):
                continue
            if file.is_file() and file.suffix.lower() in ['.cjs', '.mjs', '.js', '.json', '.py', '.nsi', '.ps1', '.s16', '.f32'] and file.name != 'release.local.json':
                files.append(file)
    return sorted(set(files))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['build', 'publish'])
    parser.add_argument('--version')
    parser.add_argument('--notes', default='功能更新与问题修复')
    parser.add_argument('--source-dir', type=Path)
    args = parser.parse_args()
    package_file = ROOT / 'package.json'
    package = json.loads(package_file.read_text('utf8'))
    version = args.version or package['version']
    if not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', version):
        raise RuntimeError('版本号必须为数字，例如0.8.1')
    if args.action == 'publish':
        if args.source_dir:
            raise RuntimeError('历史源码构建请先build，再用现有标签发布')
        git = program('GIT_EXE', 'git', 'C:/Program Files/Git/cmd/git.exe')
        gh = program('GH_EXE', 'gh', 'D:/app/GitHub CLI/gh.exe')
        if subprocess.run([git, 'rev-parse', '--verify', 'refs/tags/v' + version], cwd=ROOT, capture_output=True).returncode == 0:
            raise RuntimeError('该版本已存在；请使用新的版本号，历史发布不会被覆盖')
        if tuple(map(int, version.split('.'))) <= tuple(map(int, package['version'].split('.'))):
            raise RuntimeError('新版本号必须大于当前版本')
        package['version'] = version
        package_file.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', 'utf8')
        index = ROOT / 'index.html'
        index_text = re.sub(r'(离线试用版|功能扩展试验) \d+\.\d+\.\d+', '离线试用版 ' + version, index.read_text('utf8'))
        index.write_text(re.sub(r'光屿 · \d+\.\d+\.\d+', '光屿 · ' + version, index_text), 'utf8')
        changes = ROOT / 'CHANGELOG.md'
        changes.write_text(changes.read_text('utf8').replace('# 更新记录', '# 更新记录\n\n## ' + version + '\n\n' + args.notes, 1), 'utf8')
        node = program('NODE_EXE', 'node', 'D:/app/node/node.exe')
        command([node, '--test', 'tests/updates.test.cjs', 'tests/shortcuts.test.mjs', 'tests/view-zoom.test.mjs'])
    build(version, (args.source_dir or ROOT).resolve())
    if args.action == 'publish':
        command([git, 'add', '-u'])
        command([git, 'add', '--', *[str(p.relative_to(ROOT)) for p in source_files()]])
        command([git, 'commit', '-m', '发布 v' + version + '：' + args.notes])
        command([git, 'tag', 'v' + version])
        command([git, 'push', 'origin', 'main', 'v' + version])
        notes = DIST / 'release-notes.md'
        notes.write_text(args.notes, 'utf8')
        command([gh, 'release', 'create', 'v' + version, str(DIST / INSTALLER), str(DIST / 'update.json'), '--repo', REPOSITORY, '--title', '光屿修图 ' + version, '--notes-file', str(notes), '--verify-tag', '--latest'])


if __name__ == '__main__':
    main()
