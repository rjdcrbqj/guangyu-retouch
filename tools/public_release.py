"""在新目录收集公开运行代码；旧研究树和旧发布缓存只读保留。"""
import argparse
import json
import re
import shutil
import hashlib
import os
import subprocess
import tempfile
import zipfile
from pathlib import Path
from release_assets import AssetRoot, require_public_model_assets

ROOT = Path(__file__).resolve().parents[1]
TEXT = {'.js', '.mjs', '.cjs', '.json', '.html', '.css'}
QUOTED = re.compile(r'''["']([^"'\r\n]+)["']''')
ENTRIES = ['main.cjs', 'preload.cjs', 'export-session.cjs', 'updates.cjs',
           'update-config.json', 'package.json', 'index.html', 'styles.css', 'src/app.js']


def copy_runtime_dependencies(source, destination):
    """Windows x64 发行包只复制可加载的 ONNX 原生后端，保留公共代码与许可。"""
    source=source.resolve()
    def ignore(folder,names):
        relative=Path(folder).resolve().relative_to(source).parts
        if relative[:2]==('onnxruntime-node','bin'):
            if len(relative)==3:
                return [name for name in names if (Path(folder)/name).is_dir() and name!='win32']
            if len(relative)==4 and relative[-1]=='win32':
                return [name for name in names if (Path(folder)/name).is_dir() and name!='x64']
        return []
    shutil.copytree(source,destination,ignore=ignore)


def runtime_files(root, entries):
    """收集本地依赖及工作页，拒绝越界；不遍历研究目录。"""
    root = root.resolve()
    pending = [root / entry for entry in entries]
    found = set()
    while pending:
        file = pending.pop().resolve()
        if not file.is_relative_to(root):
            raise ValueError('运行依赖超出源码目录：' + str(file))
        if 'node_modules' in file.relative_to(root).parts or file in found:
            continue
        if not file.is_file():
            raise ValueError('运行依赖缺失：' + str(file))
        found.add(file)
        if file.suffix not in TEXT:
            continue
        for value in QUOTED.findall(file.read_text('utf-8-sig')):
            if '://' in value or '\n' in value or len(value) > 250:
                continue
            if not (value.startswith('.') or Path(value).suffix.lower() in TEXT):
                continue
            candidate = file.parent / value
            options = [candidate] if candidate.suffix else [candidate, *(Path(str(candidate) + ext) for ext in ['.cjs', '.js', '.json'])]
            for option in options:
                if option.is_file():
                    pending.append(option)
                    break
    return found


def stage(destination):
    """只创建全新暂存目录，模型与许可由固定分发记录核对。"""
    destination = destination.resolve()
    if destination.exists():
        raise ValueError('暂存目录已存在，请选择新的目录，旧目录会保留')
    entries = list(ENTRIES)
    # 工作页通过路径拼接加载，显式加入公开后端入口。
    for directory in (ROOT / 'inference').glob('public-*'):
        if directory.is_dir():
            entries.extend(p.relative_to(ROOT).as_posix() for p in directory.rglob('*')
                           if p.is_file() and (p.suffix in TEXT or p.name in ['LICENSE', 'NOTICE']))
    files = runtime_files(ROOT, entries)
    policy = ROOT / 'tools/model-distribution.json'
    for approval in json.loads(policy.read_text('utf8'))['approvals']:
        for name in ['path', 'licenseFile']:
            files.add(ROOT / 'inference' / approval[name])
    destination.mkdir(parents=True)
    for file in sorted(files):
        target = destination / file.relative_to(ROOT)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file, target)
    # 模型、代码和最终依赖共同核对；失败时保留目录以供诊断。
    copy_runtime_dependencies(ROOT / 'inference/node_modules', destination / 'inference/node_modules')
    report = require_public_model_assets({
        'source': AssetRoot(destination / 'inference', exclude_any=('node_modules',)),
        'dependencies': AssetRoot(destination / 'inference/node_modules', prefix='node_modules/'),
        'source-ui': destination / 'src'
    }, policy, destination.parent / (destination.name + '-audit.json'))
    return {'directory': str(destination), 'runtimeFiles': len(files), 'checkedModels': len(report['approved'])}


def prepare_payload(source, destination, runtime, version):
    """用新暂存代码准备全新安装内容，拒绝覆盖旧版本目录。"""
    if not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', version):
        raise ValueError('版本号无效')
    if destination.exists():
        raise ValueError('安装内容目录已存在，旧内容会保留')
    if (runtime / 'resources/app').exists():
        raise ValueError('运行环境包含未审核的应用目录')
    shutil.copytree(runtime, destination)
    (destination / 'electron.exe').rename(destination / '光屿修图.exe')
    app = destination / 'resources/app'
    shutil.copytree(source, app)
    package = json.loads((app / 'package.json').read_text('utf8'))
    package['version'] = version
    (app / 'package.json').write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', 'utf8')
    index = (app / 'index.html').read_text('utf8')
    index = re.sub(r'(离线试用版|功能扩展试验|光屿 ·) \d+\.\d+\.\d+', lambda m: m[1] + ' ' + version, index)
    (app / 'index.html').write_text(index, 'utf8')
    (destination / '.guangyu-trial').write_text('guangyu-retouch-trial\n', 'ascii')
    return app


def build(source, output, version):
    """构建前后分别审查实际文件，输出固定安装包及升级清单。"""
    output = output.resolve()
    if output.exists():
        raise ValueError('构建目录已存在，旧发布会保留')
    policy = ROOT / 'tools/model-distribution.json'
    def audit(app, name):
        return require_public_model_assets({
            'source': AssetRoot(app / 'inference', exclude_any=('node_modules',)),
            'dependencies': AssetRoot(app / 'inference/node_modules', prefix='node_modules/'),
            'source-ui': app / 'src'
        }, policy, output / name)
    audit(source, 'source-audit.json')
    payload = output / 'payload'
    app = prepare_payload(source, payload, ROOT / 'runtime', version)
    for name in ['vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll', 'msvcp140_1.dll', 'msvcp140_2.dll', 'msvcp140_atomic_wait.dll', 'msvcp140_codecvt_ids.dll', 'concrt140.dll']:
        shutil.copy2(Path(os.environ.get('SystemRoot', 'C:/Windows')) / 'System32' / name, payload / name)
    audit(app, 'payload-audit.json')
    installer = output / 'GuangyuRetouchSetup.exe'
    script = (ROOT / 'tools/installer.nsi').read_text('utf8').replace('@VERSION@', version).replace('@PAYLOAD@', str(payload)).replace('@OUTFILE@', str(installer)).replace('@MIGRATOR@', str(ROOT / 'tools/install-app.ps1'))
    nsi = output / 'installer.nsi'
    nsi.write_text(script, 'utf-8-sig')
    nsis = os.environ.get('MAKENSIS') or str(Path(os.environ['LOCALAPPDATA']) / 'electron-builder/Cache/nsis-3.0.4.1/nsis-3.0.4.1-1mx3n/makensis.exe')
    subprocess.run([nsis, '/V2', str(nsi)], check=True)
    digest = hashlib.sha256()
    with installer.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    update = {'version': version, 'installer': installer.name, 'size': installer.stat().st_size, 'sha256': digest.hexdigest()}
    (output / 'update.json').write_text(json.dumps(update, indent=2) + '\n', 'utf8')
    return update


def write_source_archive(app, destination, version):
    """发行源码仅取干净应用树与明确的构建文件，不携带本地 Git 历史。"""
    if destination.exists():
        raise ValueError('源码归档已存在，旧归档会保留')
    entries={}
    for folder, directories, files in os.walk(app):
        directories[:]=[name for name in directories if name not in ('node_modules','.git','__pycache__')]
        for name in files:
            file=Path(folder)/name
            entries[file.relative_to(app).as_posix()]=file
    extras=['README.md','CHANGELOG.md','SOURCE_BUNDLE.md','.gitignore','inference/package.json','inference/package-lock.json',
            'tools/model-distribution.json','tools/release_assets.py','tools/public_release.py',
            'tools/install-app.ps1','tools/installer.nsi','tools/test_public_release.py',
            'tools/test_install_migration.py','tools/test_installer_transaction.py',
            'tests/legacy-eye-public.test.mjs','tests/public-render-dependencies.test.mjs',
            'tests/desktop-public-legacy-render.mjs']
    extras.extend(p.relative_to(ROOT).as_posix() for p in (ROOT/'tests').glob('public-*-render.mjs'))
    for name in extras:
        if (ROOT/name).is_file():
            entries[name]=ROOT/name
    destination.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(destination,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        for name,file in sorted(entries.items()):
            if name=='package.json':
                package=json.loads(file.read_text('utf8'))
                package['version']=version
                package['scripts']={'start':'electron .','test':'node --test tests/*.test.mjs',
                                    'test:legacy':'node tests/desktop-public-legacy-render.mjs'}
                archive.writestr(name,json.dumps(package,ensure_ascii=False,indent=2)+'\n')
            else:
                archive.write(file,name)
    with tempfile.TemporaryDirectory(prefix='guangyu-source-review-') as folder:
        with zipfile.ZipFile(destination) as archive:
            archive.extractall(folder)
        extracted=Path(folder)
        report=require_public_model_assets({
            'source':extracted/'inference','source-ui':extracted/'src'
        },ROOT/'tools/model-distribution.json',destination.with_suffix('.audit.json'))
    return {'source':str(destination),'files':len(entries),'approvedModels':len(report['approved']),
            'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--build-from', type=Path)
    parser.add_argument('--source-from', type=Path)
    parser.add_argument('--version', default='0.10.0')
    args = parser.parse_args()
    if args.source_from:
        result=write_source_archive(args.source_from.resolve(),args.destination,args.version)
    else:
        result = build(args.build_from.resolve(), args.destination, args.version) if args.build_from else stage(args.destination)
    print(json.dumps(result, ensure_ascii=False))
