"""Reproduce the Apache-licensed DETR weights shipped with Guangyu Retouch.

Run with NumPy 2.1.3 and ONNX 1.18.0. The source is the original export named
in inference/public-sky/model.json; no conversion is needed at runtime.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper


def compact_weights(model):
    graph = model.graph
    parameters = []
    restore_weights = []
    group_size = 32
    for weight in graph.initializer:
        if (weight.data_type != TensorProto.FLOAT16 or len(weight.dims) < 2 or np.prod(weight.dims) < 4096
                or np.prod(weight.dims[1:]) % group_size):
            parameters.append(weight)
            continue
        expanded = numpy_helper.to_array(weight).astype(np.float32).reshape(weight.dims[0], -1, group_size)
        peaks = np.max(np.abs(expanded), axis=-1, keepdims=True)
        if not np.isfinite(peaks).all():
            raise ValueError(f'Invalid tensor: {weight.name}')
        scales = np.where(peaks > 0, peaks / 127, 1).astype(np.float32)
        compact = np.clip(np.rint(expanded / scales), -127, 127).astype(np.int8)
        name = weight.name + '.storage_int8'
        scale = weight.name + '.storage_scale'
        float_values = name + '.float'
        scaled = name + '.scaled'
        shape = weight.name + '.restore_shape'
        restored = scaled + '.reshaped'
        parameters.extend([numpy_helper.from_array(compact, name), numpy_helper.from_array(scales, scale),
                           numpy_helper.from_array(np.array(weight.dims, dtype=np.int64), shape)])
        restore_weights.extend([
            helper.make_node('Cast', [name], [float_values], to=TensorProto.FLOAT),
            helper.make_node('Mul', [float_values, scale], [scaled]),
            helper.make_node('Reshape', [scaled, shape], [restored]),
            helper.make_node('Cast', [restored], [weight.name], to=TensorProto.FLOAT16),
        ])

    original_nodes = list(graph.node)
    del graph.node[:]
    del graph.initializer[:]
    graph.node.extend(restore_weights)
    graph.node.extend(original_nodes)
    graph.initializer.extend(parameters)
    return model


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    manifest = Path(__file__).resolve().parents[1] / 'inference/public-sky/model.json'
    record = json.loads(manifest.read_text('utf8'))
    source = args.source.read_bytes()
    if hashlib.sha256(source).hexdigest() != record['sourceSha256']:
        raise ValueError('Source DETR model SHA-256 mismatch')
    model = compact_weights(onnx.load_model_from_string(source))
    onnx.checker.check_model(model)
    output = model.SerializeToString()
    digest = hashlib.sha256(output).hexdigest()
    if digest != record['sha256']:
        raise ValueError(f'Converted DETR model SHA-256 mismatch: {digest}')
    with args.output.open('xb') as file:
        file.write(output)
    print(digest)


if __name__ == '__main__':
    main()
