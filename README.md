<p align="center">
  <img src="https://img.shields.io/badge/React_Native-0.85-blue?logo=react" />
  <img src="https://img.shields.io/badge/Expo-56-black?logo=expo" />
  <img src="https://img.shields.io/badge/Platform-Android-green?logo=android" />
  <img src="https://img.shields.io/badge/License-MIT-yellow" />
</p>

# ListenApp

英语听力学习应用 — 通过 TED 演讲和 YouTube 视频沉浸式学习英语，支持 AI 语音转文字生成字幕。

## ✨ 核心功能

| 功能 | 说明 |
|------|------|
| 🎬 **TED 演讲** | 内置 TED 视频库，专业英文字幕同步高亮 |
| ▶️ **YouTube 视频** | 搜索 YouTube，在线播放 |
| 🎙️ **AI 语音转文字** | 粘贴视频链接，FFmpegKit 提取音频 → MiMo ASR 自动生成字幕 |
| 📝 **字幕同步** | 实时高亮当前句子，支持二分搜索 O(log n) |
| 🎨 **多主题** | 深色/浅色/护眼等多种配色方案 |
| ⏩ **播放控制** | 进度条拖动、倍速播放、偏移量调整 |

## 📁 项目结构

```
ListenApp/
├── App.js                          # 导航入口
├── screens/
│   ├── VideoLibrary.js             # 视频库（TED/YouTube 双源 + 搜索 + 转录）
│   └── Player.js                   # 播放器（字幕同步 + 主题切换）
├── lib/
│   └── mimo-transcribe/            # 📦 独立可复用的语音转文字库
│       ├── README.md
│       ├── package.json
│       └── src/
│           ├── index.js            # 主入口：transcribeVideo()
│           ├── mimo-asr.js         # MiMo ASR API 客户端
│           ├── audio-extractor.js  # FFmpegKit 音频提取 + 转码
│           ├── youtube.js          # YouTube 音频流提取
│           └── subtitles.js        # 字幕解析 + SRT/VTT 导出
├── android/                        # 原生 Android 工程
└── package.json
```

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- Android Studio（含 Android SDK）
- 手机开启 **USB 调试**

### 安装依赖

```bash
git clone https://github.com/zwangZJU/ListenApp.git
cd ListenApp
npm install
```

### 首次构建（需要原生编译）

```bash
# 生成原生工程
npx expo prebuild

# 编译并安装到手机（首次约 10 分钟）
npx expo run:android
```

### 日常开发调试

```bash
# 启动 Metro 开发服务器
npx expo start --dev-client
```

然后：

1. 手机上打开 **ListenApp** 图标
2. 修改 JS/JSX 代码 → **自动热更新**（秒级，不需要重新构建）
3. 只有安装新的原生库才需要重新 `npx expo run:android`

### 调试工具

| 工具 | 方法 | 用途 |
|------|------|------|
| **Dev Menu** | 摇晃手机 | 启用 Fast Refresh / Debug |
| **Metro 日志** | 终端直接看 | JS 报错、console.log |
| **Chrome DevTools** | `chrome://inspect` | JS 断点调试 |
| **Logcat** | `adb logcat \| grep -iE "mimo\|transcribe\|ffmpeg"` | 原生日志 |

## 🎙️ AI 语音转文字

### 配置 API Key

编辑 `screens/VideoLibrary.js`，替换你的 MiMo API Key：

```js
const MIMO_API_KEY = '你的-MiMo-API-Key';
```

获取地址：https://platform.xiaomimimo.com

### 使用方法

1. 在搜索栏粘贴 YouTube 视频链接
2. 出现绿色 **🎙️ AI 语音转文字** 按钮
3. 点击后等待处理（下载 → 转码 → 识别）
4. 完成后自动跳转播放器，显示生成的字幕

### 定价

MiMo ASR：**¥0.5/小时**（10 分钟视频约 ¥0.08）

## 📦 mimo-transcribe 库

本项目内置了一个独立的语音转文字库，可复用到其他项目。

### 复制到其他项目

```bash
cp -r lib/mimo-transcribe /path/to/your-project/lib/
```

### 使用

```js
import { transcribeVideo, STAGE } from './lib/mimo-transcribe';

const result = await transcribeVideo({
  url: 'https://www.youtube.com/watch?v=xxx',
  apiKey: 'your-mimo-api-key',
  language: 'en',
  onProgress: (stage, detail) => {
    console.log(stage, detail);
  },
});

console.log(result.subtitles); // [{id, start, end, text}, ...]
console.log(result.rawText);   // 完整识别文字
console.log(result.srt);       // SRT 格式字幕
console.log(result.vtt);       // WebVTT 格式字幕
```

### 底层 API

```js
import {
  createMiMoASR,      // MiMo ASR 客户端
  extractAudio,        // FFmpegKit 音频提取
  getYouTubeAudioInfo, // YouTube 音频流解析
  parseSubtitles,      // 文本 → 字幕段落
  toSRT, toVTT,        // 格式导出
} from './lib/mimo-transcribe';
```

### 依赖

- `ffmpeg-kit-react-native` — 音频提取与转码
- `react-native-fs` — 文件读写

## 🔧 常见问题

### Expo Go 能用吗？

不能。因为使用了 `ffmpeg-kit-react-native`（原生模块），必须用 dev build：

```bash
npx expo start --dev-client
```

### 构建失败：TLS handshake error

Gradle 下载依赖超时。已配置阿里云镜像（`android/build.gradle` + `~/.gradle/init.gradle`），如仍有问题检查网络。

### 闪退怎么排查？

```bash
# 查看崩溃日志
adb logcat -d | grep -A 20 "FATAL EXCEPTION"

# 查看 React Native 日志
adb logcat -s ReactNativeJS
```

### YouTube 视频无法播放？

YouTube 使用签名加密保护视频流，播放器通过 WebView 嵌入 YouTube 官方播放器，需要网络访问 youtube.com。

## 🛠️ 技术栈

| 技术 | 用途 |
|------|------|
| React Native 0.85 | 跨平台框架 |
| Expo 56 | 开发工具链 |
| expo-video | 视频播放 |
| react-native-webview | YouTube 嵌入播放 |
| ffmpeg-kit-react-native | 音频提取与转码 |
| MiMo-V2.5-ASR | 语音识别 |
| React Navigation | 页面导航 |

## 📄 License

MIT
