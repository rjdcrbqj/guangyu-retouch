# 完整源码与模型

发行版中的 `GuangyuRetouchSource.zip` 是完整源码归档，包含已核实公开许可的模型与各自的许可文件。安装包也自带这些离线资源。

通过 Git 或页面的 Code 下载获得代码时，请从同版本 `GuangyuRetouchSource.zip` 合入模型与包括 WebAssembly 在内的 OpenCV 运行文件，再按 README 安装依赖。

- `inference/public-yunet/face_detection_yunet_2023mar.onnx`
- `inference/public-landmarks/face_landmarker.task`
- `inference/public-segmentation/selfie_multiclass_256x256.tflite`
- `inference/public-face66/lm_model3_opt.onnx`
- `inference/public-selection/interactive_segmentation.task`
- `inference/public-sky/detr-panoptic-weight-int8-g32.onnx`
- `inference/public-inpaint/migan-places2-512-storage-fp16.onnx`
- `inference/assets/opencv/opencv.cjs`

公开资源的原始地址、许可与 SHA-256 记录位于 `tools/model-distribution.json`。各模型目录中的 `model.json` 也包含运行时校验信息。
