# 完整源码与模型

发行版中的 `GuangyuRetouchSource.zip` 是完整源码归档，包含五项已核实公开许可的模型与各自的许可文件。安装包也自带这些离线资源。

GitHub 网页上传单文件上限为 25 MB，因此代码分支不重复保存模型二进制。通过 Git 或页面的 Code 下载获得代码时，请从同版本 `GuangyuRetouchSource.zip` 合入以下文件，再按 README 安装依赖：

- `inference/public-yunet/face_detection_yunet_2023mar.onnx`
- `inference/public-landmarks/face_landmarker.task`
- `inference/public-segmentation/selfie_multiclass_256x256.tflite`
- `inference/public-face66/lm_model3_opt.onnx`
- `inference/public-selection/interactive_segmentation.task`

每项模型的原始公开地址、许可与 SHA-256 记录位于 `tools/model-distribution.json`；各模型目录中的 `model.json` 也包含运行时校验信息。这里不包含或执行原软件的私有权重。
