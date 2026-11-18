"""Reproduce the public MI-GAN 512 ONNX from the original Python export and checkpoint."""
import argparse
from collections import Counter
import hashlib
import importlib.util
import io
import json
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper
import torch


ARCHITECTURE_SHA = '1e35a181e516742ae32af935848e6a9a4382f528ea7096db6658f14cd8b9ace0'


def require_digest(file, expected):
    if hashlib.sha256(file.read_bytes()).hexdigest() != expected:
        raise ValueError(f'Unrecognized source: {file.name}')


def generator(architecture, checkpoint):
    spec = importlib.util.spec_from_file_location('public_migan_inference', architecture)
    source = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(source)
    model = source.Generator(resolution=512).eval()
    weights = torch.load(checkpoint, weights_only=True, map_location='cpu', mmap=True)
    if not isinstance(weights, dict) or not weights or not all(isinstance(item, torch.Tensor) for item in weights.values()):
        raise ValueError('Invalid MI-GAN checkpoint')
    model.load_state_dict(weights, strict=True)
    return model


def compact_weights(document):
    graph = document.graph
    retained = []
    restoring = []
    users = Counter(node_input for node in graph.node for node_input in node.input)
    weights = {node.input[1] for node in graph.node if node.op_type == 'Conv'}
    for initializer in graph.initializer:
        name = initializer.name
        if (name not in weights or users[name] != 1 or initializer.data_type != TensorProto.FLOAT
                or np.prod(initializer.dims) < 4096):
            retained.append(initializer)
            continue
        abbreviated = name + '.storage_float16'
        values = numpy_helper.to_array(initializer).astype(np.float16)
        if not np.isfinite(values).all():
            raise ValueError(f'Unrepresentable weight: {name}')
        retained.append(numpy_helper.from_array(values, abbreviated))
        restoring.append(helper.make_node('Cast', [abbreviated], [name], to=TensorProto.FLOAT))
    operations = restoring + list(graph.node)
    del graph.node[:]
    del graph.initializer[:]
    graph.node.extend(operations)
    graph.initializer.extend(retained)
    return document


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('architecture', type=Path)
    parser.add_argument('checkpoint', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    manifest = Path(__file__).resolve().parents[1] / 'inference/public-inpaint/model.json'
    record = json.loads(manifest.read_text('utf8'))
    require_digest(args.architecture, ARCHITECTURE_SHA)
    require_digest(args.checkpoint, record['sourceSha256'])
    torch.set_num_threads(6)
    instance = generator(args.architecture, args.checkpoint)
    buffer = io.BytesIO()
    with torch.no_grad():
        torch.onnx.export(instance, torch.zeros(1, 4, 512, 512), buffer, opset_version=17, dynamo=False,
                          input_names=['source'], output_names=['repaired'])
    document = compact_weights(onnx.load_model_from_string(buffer.getvalue()))
    onnx.checker.check_model(document, full_check=True)
    binary = document.SerializeToString()
    digest = hashlib.sha256(binary).hexdigest()
    if digest != record['sha256']:
        raise ValueError(f'Converted model SHA-256 mismatch: {digest}')
    with args.output.open('xb') as file:
        file.write(binary)
    print(digest)


if __name__ == '__main__':
    main()
