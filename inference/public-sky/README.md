# 公开天空选区

模型来自 [Meta DETR ResNet-50 Panoptic](https://huggingface.co/facebook/detr-resnet-50-panoptic)（Apache 2.0）。使用 [Xenova 固定提交中的 ONNX 导出](https://huggingface.co/Xenova/detr-resnet-50-panoptic/blob/ea24b2d4e0bfae31f0a1299ba3fb892a2df064de/onnx/model_fp16.onnx)，按 32 个权重一组量化存储，在图中恢复为 float16。原始与转换后的 SHA-256 位于 `model.json`，转换复现命令见源码中的 `tools/compact_public_sky.py`。

本地服务将输入从 EXIF 方向转换到显示方向，按比例缩到最长边 800，使用现有 ONNX Runtime CPU。COCO Panoptic 的天空类别 187 与建筑、人物等检测结果按像素竞争。输出是工作画布坐标的软蒙版，覆盖源照片无像素的区域时置零。无天空返回空蒙版，解码或推理失败返回错误。

栏杆间和细树枝周围的天空可能需要在工作台补选或擦除。

复现时，在已安装 NumPy 2.1.3 和 ONNX 1.18.0 的环境中运行：

```text
python tools/compact_public_sky.py model_fp16.onnx detr-panoptic-weight-int8-g32.onnx
```
