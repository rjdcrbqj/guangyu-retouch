# 光屿修图

Windows 本地修图工作台。照片在本机处理，目前正在持续补齐功能。

## 下载

- [最新安装包](https://github.com/rjdcrbqj/guangyu-retouch/releases/latest/download/GuangyuRetouchSetup.exe)
- [全部版本与更新记录](https://github.com/rjdcrbqj/guangyu-retouch/releases)

适用于 Windows 10/11 64 位。安装包自带运行环境、离线模型与图像处理依赖。

## 更新

从 0.8.0 起，软件启动后及运行期间会检查 GitHub 的正式发行版。发现新版后显示更新内容，由使用者选择是否下载、是否安装并重启。也可以使用窗口右上角的“检查更新”。

安装前请保存工程。更新覆盖原安装目录，保留本机快捷键和用户数据。0.7.x 首次升级需下载安装 0.8.0 或更高版本，此后即可使用内置更新。

## 使用

- Ctrl＋鼠标滚轮：在照片上放大、缩小。
- 0：适应窗口；1：100% 查看。
- 顶部“快捷键设置”：修改、清除或恢复功能快捷键。

## 源码与构建

主要入口为 `main.cjs`、`preload.cjs` 和 `src/app.js`；图像处理实现位于 `inference/`。`updates.cjs` 负责检查公开发行版和校验下载。

运行与打包需要离线资源：`runtime/`、`inference/node_modules/` 和 `inference/assets/`。它们随完整安装包提供，不放进 Git 提交。开发时可从已安装软件复制对应运行库和资源到本项目。运行 `runtime/electron.exe .` 启动。

本机照片、个人特征缓存、研究资料、登录凭据不进入仓库或公开安装包。

## 发布新版本

在同一项目中修改代码，执行一次：

```powershell
python tools/release.py publish --version 0.8.1 --notes "填写本次更新内容"
```

脚本更新版本号、检查代码、生成安装包、提交源码并创建 GitHub Release。每次发布保留旧版本；重复版本号会拒绝发布。本机输出一直复用 `dist/GuangyuRetouchSetup.exe` 和 `dist/update.json`，不再创建按日期区分的新发布目录。

仅构建、不上传：

```powershell
python tools/release.py build
```

需要 Python、Node.js、Git、已登录的 GitHub CLI 和 NSIS。可用环境变量 `NODE_EXE`、`GH_EXE`、`MAKENSIS` 指定程序路径。

核心更新与交互测试：

```powershell
node --test tests/updates.test.cjs tests/shortcuts.test.mjs tests/view-zoom.test.mjs
```
