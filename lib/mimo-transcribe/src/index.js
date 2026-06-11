/**
 * mimo-transcribe
 *
 * 视频语音转文字库 — 基于 FFmpegKit + MiMo ASR
 *
 * 使用方式:
 *   import { transcribeVideo, createMiMoASR } from 'mimo-transcribe';
 *
 *   const result = await transcribeVideo({
 *     url: 'https://youtube.com/watch?v=xxx',
 *     apiKey: 'your-mimo-api-key',
 *     onProgress: (stage, detail) => console.log(stage, detail),
 *   });
 *
 *   console.log(result.subtitles); // [{id, start, end, text}, ...]
 *   console.log(result.rawText);   // 完整识别文字
 *   console.log(result.srt);       // SRT 格式字幕
 */

const { createMiMoASR } = require('./mimo-asr');
const { parseSubtitles, toSRT, toVTT } = require('./subtitles');
const {
  extractVideoId,
  getYouTubeAudioInfo,
  isYouTubeUrl,
} = require('./youtube');
const { extractAudio } = require('./audio-extractor');

/**
 * 进度阶段常量
 */
const STAGE = {
  EXTRACTING_URL: 'extracting_url',     // 正在提取音频链接...
  DOWNLOADING: 'downloading',            // 正在下载音频...
  CONVERTING: 'converting',              // 正在转码...
  ENCODING: 'encoding',                  // 正在编码...
  TRANSCRIBING: 'transcribing',          // 正在语音识别...
  DONE: 'done',                          // 完成
};

/**
 * 一键视频转文字
 *
 * @param {Object} opts
 * @param {string} opts.url - 视频链接（支持 YouTube 等）
 * @param {string} opts.apiKey - MiMo API Key
 * @param {string} [opts.model] - ASR 模型名
 * @param {string} [opts.language='auto'] - 语言 ('auto'|'en'|'zh')
 * @param {function} [opts.onProgress] - 进度回调 (stage, detail)
 * @returns {Promise<{subtitles, rawText, srt, vtt, title, duration}>}
 */
async function transcribeVideo(opts = {}) {
  const {
    url,
    apiKey,
    model,
    language = 'auto',
    onProgress,
  } = opts;

  if (!url) throw new Error('请提供视频链接 (url)');
  if (!apiKey) throw new Error('请提供 MiMo API Key (apiKey)');

  const report = (stage, detail) => {
    console.log(`[Transcribe] ${stage}: ${detail || ''}`);
    onProgress?.(stage, detail);
  };

  let audioUrl;
  let title = 'Unknown';
  let estimatedDuration = 0;
  let downloadHeaders = {};

  // ====== Step 1: 提取音频链接 ======
  report(STAGE.EXTRACTING_URL);

  if (isYouTubeUrl(url)) {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error('无法解析 YouTube 视频 ID');

    const info = await getYouTubeAudioInfo(videoId);
    audioUrl = info.audioUrl;
    title = info.title;
    estimatedDuration = info.duration;
    downloadHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/125.0.0.0 Mobile Safari/537.36',
    };
    report(STAGE.EXTRACTING_URL, `${title} (${estimatedDuration}s)`);
  } else {
    // 通用 URL — 直接作为音频源
    audioUrl = url;
  }

  // ====== Step 2-4: 下载 + 转码 + 编码 ======
  const { base64, duration, mimeType } = await extractAudio(audioUrl, {
    headers: downloadHeaders,
    onProgress: (stage) => report(stage),
  });

  const actualDuration = duration || estimatedDuration;

  // ====== Step 5: 语音识别 ======
  report(STAGE.TRANSCRIBING);

  const asr = createMiMoASR({ apiKey, model, language });
  const rawText = await asr.transcribe(base64, {
    mimeType,
    onProgress: (current, total) => {
      report(STAGE.TRANSCRIBING, `${current}/${total}`);
    },
  });

  // ====== Step 6: 生成字幕 ======
  report(STAGE.DONE);

  const subtitles = parseSubtitles(rawText, actualDuration);
  const srt = toSRT(subtitles);
  const vtt = toVTT(subtitles);

  return {
    subtitles,
    rawText,
    srt,
    vtt,
    title,
    duration: actualDuration,
  };
}

// ====== 导出 ======

module.exports = {
  // 一键转录（高级 API）
  transcribeVideo,

  // 进度阶段常量
  STAGE,

  // 底层模块（高级用法）
  createMiMoASR,
  parseSubtitles,
  toSRT,
  toVTT,
  extractAudio,
  extractVideoId,
  getYouTubeAudioInfo,
  isYouTubeUrl,
};
