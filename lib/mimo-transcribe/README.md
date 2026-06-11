# mimo-transcribe

视频语音转文字库 — 基于 FFmpegKit + MiMo-V2.5-ASR

## 功能

- 🎬 从 YouTube 视频提取音频
- 🔄 FFmpegKit 转码为 WAV
- 🎙️ MiMo ASR 语音识别
- 📝 自动生成带时间戳的字幕
- 📤 支持导出 SRT / VTT 格式

## 安装

```bash
# 1. 复制整个 lib/mimo-transcribe 目录到你的项目

# 2. 安装 peer dependencies
npx expo install ffmpeg-kit-react-native
npm install react-native-fs

# 3. 需要 dev build（不支持 Expo Go）
npx expo prebuild
npx expo run:android  # 或 run:ios
```

## 使用

### 一键转录（推荐）

```js
import { transcribeVideo, STAGE } from './lib/mimo-transcribe';

const result = await transcribeVideo({
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  apiKey: 'your-mimo-api-key',
  language: 'en', // 'auto' | 'en' | 'zh'
  onProgress: (stage, detail) => {
    switch (stage) {
      case STAGE.EXTRACTING_URL: console.log('提取链接中...'); break;
      case STAGE.DOWNLOADING:    console.log('下载音频中...'); break;
      case STAGE.CONVERTING:     console.log('转码中...'); break;
      case STAGE.TRANSCRIBING:   console.log('识别中...', detail); break;
      case STAGE.DONE:           console.log('完成！'); break;
    }
  },
});

console.log(result.title);      // 视频标题
console.log(result.subtitles);  // [{id, start, end, text}, ...]
console.log(result.rawText);    // 完整文字
console.log(result.srt);        // SRT 格式
console.log(result.duration);   // 时长（秒）
```

### 底层 API

```js
import {
  createMiMoASR,
  extractAudio,
  getYouTubeAudioInfo,
  parseSubtitles,
  toSRT,
} from './lib/mimo-transcribe';

// 1. 获取 YouTube 音频链接
const info = await getYouTubeAudioInfo('dQw4w9WgXcQ');

// 2. 下载 + 转码
const { base64, duration } = await extractAudio(info.audioUrl);

// 3. 识别
const asr = createMiMoASR({ apiKey: 'xxx' });
const text = await asr.transcribe(base64);

// 4. 生成字幕
const subtitles = parseSubtitles(text, duration);
const srt = toSRT(subtitles);
```

## API

### `transcribeVideo(opts)`

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | ✅ | 视频链接 |
| apiKey | string | ✅ | MiMo API Key |
| model | string | ❌ | ASR 模型，默认 mimo-v2.5-asr |
| language | string | ❌ | 语言：auto/en/zh |
| onProgress | function | ❌ | 进度回调 (stage, detail) |

返回: `{ subtitles, rawText, srt, vtt, title, duration }`

### `STAGE` 常量

| 值 | 说明 |
|------|------|
| EXTRACTING_URL | 提取音频链接 |
| DOWNLOADING | 下载音频 |
| CONVERTING | FFmpeg 转码 |
| ENCODING | Base64 编码 |
| TRANSCRIBING | MiMo ASR 识别 |
| DONE | 完成 |

## 定价参考

MiMo ASR: ¥0.5/小时（10分钟视频约 ¥0.08）

## 依赖

- ffmpeg-kit-react-native
- react-native-fs

## License

MIT
