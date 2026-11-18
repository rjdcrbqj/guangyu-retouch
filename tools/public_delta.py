"""Prepare verified changed files and a complete target inventory from two clean payloads."""
import argparse
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import tempfile


TOOLS_DIR = Path(__file__).resolve().parent
MARKER = '.guangyu-trial'
PACKAGE = 'resources/app/package.json'
PRODUCT = 'guangyu-retouch'
VERSION = re.compile(r'(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})')
RESERVED = {'con', 'prn', 'aux', 'nul', 'conin$', 'conout$',
            *(prefix + number for prefix in ('com', 'lpt') for number in '123456789¹²³')}
FORBIDDEN = re.compile(r'[<>:"/\\|?*\x00-\x1f\ud800-\udfff]')
MAX_ENTRIES = 20_000
MAX_FILE_SIZE = 2 * 1024**3 - 1
MAX_PAYLOAD_SIZE = 8 * 1024**3
MAX_RELATIVE_PATH = 512


@dataclass(frozen=True)
class Fingerprint:
    size: int
    sha256: str


def _windows_name_key(name: str) -> str:
    """生成 Windows 安全的单个名称键，兼容大小写冲突检查。"""
    if not name or name.endswith(('.', ' ')) or FORBIDDEN.search(name):
        raise ValueError(f'无效的 Windows 文件名：{name!r}')
    key = name.casefold()
    if key.split('.', 1)[0].rstrip(' ') in RESERVED or len(name.encode('utf-16-le')) > 510:
        raise ValueError(f'无效的 Windows 文件名：{name!r}')
    return key


def _checked_stat(path: Path) -> os.stat_result:
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode) or (getattr(info, 'st_file_attributes', 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT):
        raise ValueError(f'不支持链接或重解析点：{path}')
    return info


def _check_directory(path: Path) -> None:
    """逐级确认根目录和上层没有被链接替代。"""
    try:
        for directory in (*reversed(path.parents), path):
            if not stat.S_ISDIR(_checked_stat(directory).st_mode):
                raise ValueError(f'目录无效：{directory}')
    except FileNotFoundError as error:
        raise ValueError(f'目录不存在：{path}') from error


def _fingerprint(path: Path) -> Fingerprint:
    info = _checked_stat(path)
    if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_FILE_SIZE:
        raise ValueError(f'文件类型或大小超出允许范围：{path}')
    hash_value = hashlib.sha256()
    size = 0
    with path.open('rb') as stream:
        opened = os.fstat(stream.fileno())
        if not os.path.samestat(info, opened) or opened.st_size != info.st_size:
            raise ValueError(f'清点期间文件发生变化：{path}')
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            size += len(chunk)
            if size > info.st_size:
                raise ValueError(f'清点期间文件发生变化：{path}')
            hash_value.update(chunk)
    after = _checked_stat(path)
    if size != info.st_size or not os.path.samestat(info, after) or info.st_mtime_ns != after.st_mtime_ns:
        raise ValueError(f'清点期间文件发生变化：{path}')
    return Fingerprint(size, hash_value.hexdigest())


def _inventory(root: Path) -> tuple[dict[str, Fingerprint], set[str]]:
    files = {}
    top = set()
    pending = [root]
    entries = total_size = 0
    while pending:
        folder = pending.pop()
        keys = set()
        for path in folder.iterdir():
            entries += 1
            if entries > MAX_ENTRIES:
                raise ValueError('载荷文件和目录数量超出允许范围。')
            name_key = _windows_name_key(path.name)
            if name_key in keys:
                raise ValueError(f'Windows 路径大小写冲突：{path}')
            keys.add(name_key)
            relative = path.relative_to(root).as_posix()
            if len(relative.encode('utf-16-le')) > 2 * MAX_RELATIVE_PATH:
                raise ValueError(f'载荷相对路径过长：{relative}')
            if folder == root:
                top.add(path.name)
            info = _checked_stat(path)
            if stat.S_ISDIR(info.st_mode):
                pending.append(path)
                continue
            if not stat.S_ISREG(info.st_mode):
                raise ValueError(f'载荷包含非常规文件：{path}')
            total_size += info.st_size
            if total_size > MAX_PAYLOAD_SIZE:
                raise ValueError('载荷总大小超出允许范围。')
            files[relative] = _fingerprint(path)
    return files, top


def _product_version(root: Path, files: dict[str, Fingerprint]) -> tuple[str, tuple[int, ...]]:
    if (MARKER not in files or files[MARKER].size > 64 or
            (root / MARKER).read_bytes().rstrip(b'\r\n') != PRODUCT.encode('ascii') + b'-trial'):
        raise ValueError(f'载荷产品标记无效：{root}')
    if PACKAGE not in files or files[PACKAGE].size > 1024 * 1024:
        raise ValueError(f'载荷应用记录无效：{root}')
    try:
        package = json.loads((root / PACKAGE).read_text('utf-8-sig'))
    except (UnicodeError, ValueError, RecursionError) as error:
        raise ValueError(f'载荷应用记录无效：{root}') from error
    if not isinstance(package, dict) or package.get('name') != PRODUCT:
        raise ValueError(f'载荷不属于光屿修图：{root}')
    version = package.get('version')
    match = VERSION.fullmatch(version) if isinstance(version, str) else None
    if not match:
        raise ValueError(f'载荷版本无效：{root}')
    return version, tuple(map(int, match.groups()))


def _overlap(first: Path, second: Path) -> bool:
    return first.is_relative_to(second) or second.is_relative_to(first)


def prepare_delta(base: Path, target: Path, output: Path) -> dict:
    """仅在全新的输出目录生成相对路径无变化的增量及完整文件清单。"""
    base, target, output = (Path(os.path.abspath(directory)) for directory in (base, target, output))
    if _overlap(base, target) or any(_overlap(output, root) for root in (base, target)):
        raise ValueError('两个载荷根目录与输出目录必须彼此独立。')
    for directory in (base, target, output.parent):
        _check_directory(directory)
    if os.path.lexists(output):
        raise ValueError(f'输出目录已存在，请指定新目录：{output}')

    old_files, old_top = _inventory(base)
    new_files, new_top = _inventory(target)
    base_version, base_parts = _product_version(base, old_files)
    target_version, target_parts = _product_version(target, new_files)
    if target_parts <= base_parts:
        raise ValueError('增量目标版本必须高于基线版本。')
    manifest_top = {name.split('/', 1)[0] for name in new_files}
    if old_top - manifest_top or new_top - manifest_top:
        raise ValueError('增量无法表示旧顶层条目删除或新顶层空目录。')

    output.mkdir()
    changed = output / 'changed'
    changed.mkdir()
    rows = []
    for name, current in sorted(new_files.items()):
        reusable = old_files.get(name) == current
        if not reusable:
            destination = changed / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(target / name, destination)
            if _fingerprint(destination) != current:
                raise ValueError(f'复制后的增量文件校验失败：{name}')
        rows.append({'path': name, 'size': current.size, 'sha256': current.sha256,
                     'source': 'base' if reusable else 'changed'})
    manifest = {'format': 1, 'baseVersion': base_version, 'targetVersion': target_version, 'files': rows}
    # 所有文件复核通过后，最后原子地公布清单。
    _publish_json(output / 'delta.json', manifest)
    return manifest


def _safe_nsis_literal(value: Path | str) -> str:
    text = str(value)
    if any(character in text for character in ('"', '$')) or any(ord(character) < 32 for character in text):
        raise ValueError(f'路径无法安全写入 NSIS：{text!r}')
    return text


def _replace_installer_tokens(template: str, replacements: dict[str, str]) -> str:
    header, separator, body = template.partition('\n')
    if header.strip() != 'Unicode true' or not separator or any(
            token not in body for token in (*replacements, '${DELTA_MANIFEST}', '${DELTA_PREPARER}')):
        raise ValueError('NSIS 模板缺少 Unicode 头或增量安装支持。')
    pattern = re.compile('|'.join(re.escape(token) for token in replacements))
    expanded = pattern.sub(lambda match: replacements[match.group()], body)
    return header + separator + expanded


def _publish_json(path: Path, value: dict) -> None:
    temporary = path.with_name(f'.{path.name}.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8', newline='\n')
    temporary.rename(path)


def build_delta(base: Path, target: Path, output: Path) -> dict:
    """编译精确匹配基线的增量 NSIS EXE，最后发布可选更新旁件。"""
    output = Path(os.path.abspath(output))
    _safe_nsis_literal(output)
    template = (TOOLS_DIR / 'installer.nsi').read_text('utf-8-sig')
    migrator = _safe_nsis_literal(TOOLS_DIR / 'install-app.ps1')
    preparer = _safe_nsis_literal(TOOLS_DIR / 'prepare-delta.ps1')
    if not Path(migrator).is_file() or not Path(preparer).is_file():
        raise ValueError('NSIS 增量准备或迁移脚本不存在。')
    # 在产生输出之前检测模板，防止用未接入准备器的全量模板编译增量。
    _replace_installer_tokens(template, dict.fromkeys(('@VERSION@', '@PAYLOAD@', '@OUTFILE@', '@MIGRATOR@'), ''))
    manifest = prepare_delta(base, target, output)
    for entry in manifest['files']:
        if entry['source'] == 'changed':
            _safe_nsis_literal(entry['path'])
    base_version, target_version = manifest['baseVersion'], manifest['targetVersion']
    installer = output / f'GuangyuRetouchUpdate-{base_version}-to-{target_version}.exe'
    inventory = output / 'delta.json'
    contents = _fingerprint(inventory)
    script = _replace_installer_tokens(template, {
        '@VERSION@': target_version,
        '@PAYLOAD@': str(output / 'changed'),
        '@OUTFILE@': str(installer),
        '@MIGRATOR@': migrator,
    })
    header, separator, rest = script.partition('\n')
    script = (header + separator +
              f'!define DELTA_MANIFEST "{inventory}"\n'
              f'!define DELTA_PREPARER "{preparer}"\n' + rest)
    compiler = os.environ.get('MAKENSIS')
    if not compiler:
        compiler = str(Path(os.environ['LOCALAPPDATA']) / 'electron-builder/Cache/nsis-3.0.4.1/nsis-3.0.4.1-1mx3n/makensis.exe')
    with tempfile.TemporaryDirectory(prefix='.nsis-', dir=output) as temporary:
        script_path = Path(temporary) / 'installer.nsi'
        script_path.write_text(script, encoding='utf-8-sig')
        subprocess.run([compiler, '/V2', str(script_path)], check=True)

    executable = _fingerprint(installer)
    if executable.size == 0 or _fingerprint(inventory) != contents:
        raise ValueError('NSIS 输出或增量文件清单校验失败。')
    descriptor = {
        'format': 1, 'baseVersion': base_version, 'targetVersion': target_version,
        'installer': installer.name, 'size': executable.size, 'sha256': executable.sha256,
        'inventorySha256': contents.sha256,
    }
    _publish_json(output / 'incremental.json', descriptor)
    return descriptor


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', type=Path, required=True, help='基线版本的干净 payload 根目录')
    parser.add_argument('--target', type=Path, required=True, help='目标版本的干净 payload 根目录')
    parser.add_argument('--output', type=Path, required=True, help='新建输出目录')
    args = parser.parse_args(argv)
    report = build_delta(args.base, args.target, args.output)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
