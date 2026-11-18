"""Provision LibRaw 0.22.3 for offline Windows x64 development and releases.

Unmodified upstream Windows archive, including the corresponding sources and
the LGPL-2.1/CDDL-1.0 texts: https://www.libraw.org/data/LibRaw-0.22.3-Win64.zip
"""
import argparse
import hashlib
from io import BytesIO
from pathlib import Path
import tempfile
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
VERSION = '0.22.3'
ARCHIVE_PATH = Path('third_party/libraw') / f'LibRaw-{VERSION}-Win64.zip'
ARCHIVE_SHA256 = '4e2213a0b10e32199a30b9114a61376cdb40f94df861262b4a6dca659701276b'
ARCHIVE_SIZE = 3503107
NATIVE_PATH = Path('inference/public-raw/native')
BINARY_DIGESTS = {
    'dcraw_emu.exe': '86f27d677339a440aba61d5de793a21e2e4fa2dde9c3edc8306d20bac5ace2c9',
    'libraw.dll': '2c4df36d9011267fd3ffd5c23e80d69d5f42c3d503f03ac02448f5c8a7fe0fa2',
}


def enabled(root):
    """Keep historical release trees without RAW support buildable."""
    dirs = (root / NATIVE_PATH.parent, root / ARCHIVE_PATH.parent)
    return any(folder.exists() or folder.is_symlink() for folder in dirs)


def fixed_path(path):
    if path.resolve() != path or path.is_symlink():
        raise ValueError(f'LibRaw 路径不可重定向：{path.name}')
    return path


def archive_bytes(root):
    archive = root / ARCHIVE_PATH
    directory = fixed_path(archive.parent)
    if not directory.is_dir() or not fixed_path(archive).is_file():
        raise ValueError('缺少固定版本的 LibRaw 官方源码和运行时归档。')
    if {entry.name for entry in directory.iterdir()} != {archive.name}:
        raise ValueError('LibRaw 第三方目录包含不受支持的文件。')
    with archive.open('rb') as stream:
        data = stream.read(ARCHIVE_SIZE + 1)
    if len(data) != ARCHIVE_SIZE or hashlib.sha256(data).hexdigest() != ARCHIVE_SHA256:
        raise ValueError('LibRaw 官方归档的 SHA-256 不匹配。')
    return data


def verify_native(native):
    if not fixed_path(native).is_dir() or {entry.name for entry in native.iterdir()} != set(BINARY_DIGESTS):
        raise ValueError('LibRaw 运行时缺失或包含不受支持的文件。')
    for name, expected in BINARY_DIGESTS.items():
        binary = fixed_path(native / name)
        if not binary.is_file():
            raise ValueError(f'LibRaw 运行文件无效：{name}')
        with binary.open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != expected:
                raise ValueError(f'LibRaw 运行时 SHA-256 不匹配：{name}')


def verify(root, *, source_only=False):
    root = root.resolve()
    archive_bytes(root)
    native = root / NATIVE_PATH
    if source_only:
        if native.exists() or native.is_symlink():
            raise ValueError('LibRaw 源码包包含重复或不受支持的运行文件。')
    else:
        verify_native(native)


def provision(root=ROOT):
    root = root.resolve()
    data = archive_bytes(root)
    native = fixed_path(root / NATIVE_PATH)
    if native.exists():
        verify_native(native)
        return native
    native.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(BytesIO(data)) as archive, tempfile.TemporaryDirectory(dir=native.parent) as temporary:
        staging = Path(temporary) / 'native'
        staging.mkdir()
        # Only two pinned members become runnable. No generic archive extraction.
        for name in BINARY_DIGESTS:
            (staging / name).write_bytes(archive.read(f'LibRaw-{VERSION}/bin/{name}'))
        verify_native(staging)
        staging.rename(native)
    return native


def stage(source, destination):
    data = archive_bytes(source.resolve())
    archive = fixed_path(destination.resolve() / ARCHIVE_PATH)
    archive.parent.mkdir(parents=True, exist_ok=True)
    with archive.open('xb') as stream:
        stream.write(data)
    provision(destination)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', action='store_true', help='核对已准备的开发运行时')
    args = parser.parse_args()
    if args.verify:
        verify(ROOT)
    else:
        provision()
    print(f'LibRaw {VERSION} · {NATIVE_PATH.as_posix()}')
