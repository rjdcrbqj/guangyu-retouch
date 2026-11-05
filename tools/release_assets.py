"""发布前核对模型和二进制数据的分发记录；不执行模型、不修改本机权重。"""
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import fnmatch
from dataclasses import dataclass

MODEL_SUFFIXES = {'.onnx', '.ort', '.pt', '.pth', '.safetensors', '.tflite', '.task', '.caffemodel', '.pb', '.bin', '.f32', '.s16'}

# 旧 UI 以单个长字符串保存原版纹理和查找表。只报告文件名，不解码或输出内容。
INLINE_RESOURCE = re.compile(rb"""(["'`])[A-Za-z0-9+/_-]{2048,}={0,2}\1""")

@dataclass(frozen=True)
class AssetRoot:
    path: Path
    prefix: str = ''
    exclude_top: tuple = ()
    exclude_any: tuple = ()
    exclude_patterns: tuple = ()


def excluded(relative, spec):
    return (relative.parts[0] in spec.exclude_top or bool(set(relative.parts) & set(spec.exclude_any))
            or any(fnmatch.fnmatch(part, pattern) for part in relative.parts for pattern in spec.exclude_patterns))


def file_digest(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def audit_model_assets(roots, policy_path):
    policy = json.loads(Path(policy_path).read_text('utf8'))
    if policy.get('version') != 1 or not isinstance(policy.get('approvals'), list):
        raise ValueError('模型分发记录格式无效')
    approvals = {}
    for entry in policy['approvals']:
        name = entry.get('path', '')
        relative = PurePosixPath(name)
        if not name or '\\' in name or ':' in name or relative.is_absolute() or '..' in relative.parts or relative.as_posix() != name or name.casefold() in approvals:
            raise ValueError('模型分发记录路径无效或重复')
        if not re.fullmatch(r'[0-9a-f]{64}', entry.get('sha256', '')):
            raise ValueError('模型分发记录必须绑定 SHA-256')
        license_name = entry.get('licenseFile', '')
        license_relative = PurePosixPath(license_name)
        if not license_name or '\\' in license_name or ':' in license_name or license_relative.is_absolute() or '..' in license_relative.parts or license_relative.as_posix() != license_name:
            raise ValueError('模型分发记录必须绑定有效的许可文件路径')
        if not re.fullmatch(r'[0-9a-f]{64}', entry.get('licenseSha256', '')):
            raise ValueError('模型许可文件必须绑定 SHA-256')
        approvals[name.casefold()] = entry
    checked, blocked = [], []
    for label, folder in roots.items():
        spec = folder if isinstance(folder, AssetRoot) else AssetRoot(folder)
        root = Path(spec.path).resolve()
        if not root.is_dir():
            raise ValueError('模型目录不存在：' + str(root))
        for path in sorted(root.rglob('*')):
            relative = path.relative_to(root)
            # 排除项由真实复制规则提供；旧缓存不会传入任何排除项。
            if excluded(relative, spec):
                continue
            suffix = path.suffix.lower()
            renderer = label in ('source-ui', 'cache-ui') and suffix in ('.js', '.mjs', '.cjs', '.json', '.html')
            if not renderer and suffix not in MODEL_SUFFIXES:
                continue
            item = {'root': label, 'path': spec.prefix + relative.as_posix()}
            if not path.resolve().is_relative_to(root) or not path.is_file():
                blocked.append({**item, 'reason': 'outside-root-or-not-file'})
                continue
            if renderer:
                if INLINE_RESOURCE.search(path.read_bytes()):
                    blocked.append({**item, 'reason': 'unreviewed-inline-data'})
                continue
            entry = approvals.get(item['path'].casefold())
            if not entry or entry.get('redistributionAllowed') is not True or not all(isinstance(entry.get(key), str) and entry[key].strip() for key in ('source', 'license')):
                blocked.append({**item, 'reason': 'unreviewed-distribution'})
                continue
            # 未获准的文件只记录路径，不读取候选权重内容。
            if file_digest(path) != entry['sha256']:
                blocked.append({**item, 'reason': 'hash-mismatch'})
                continue
            license_relative = PurePosixPath(entry['licenseFile'])
            prefix = PurePosixPath(spec.prefix or '.')
            if not license_relative.is_relative_to(prefix):
                blocked.append({**item, 'reason': 'license-not-packaged'})
                continue
            license_relative = license_relative.relative_to(prefix)
            if not license_relative.parts or excluded(license_relative, spec):
                blocked.append({**item, 'reason': 'license-not-packaged'})
                continue
            license_path = root / license_relative
            if not license_path.resolve().is_relative_to(root) or not license_path.is_file():
                blocked.append({**item, 'reason': 'missing-license'})
                continue
            if file_digest(license_path) != entry['licenseSha256']:
                blocked.append({**item, 'reason': 'license-hash-mismatch'})
                continue
            checked.append(item)
    return {'version': 1, 'approved': checked, 'blocked': blocked}


def require_public_model_assets(roots, policy_path, report_path):
    report = audit_model_assets(roots, policy_path)
    report_path = Path(report_path)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', 'utf8')
    if report['blocked']:
        raise RuntimeError(f"模型分发检查未通过：{len(report['blocked'])} 个源目录/缓存条目缺少已核实记录或与记录不符，详见 {report_path}")
    return report
