/**
 * 音频提取器 — 基于 FFmpegKit
 *
 * 从视频文件/URL 提取音频并转码为 WAV。
 * 依赖 ffmpeg-kit-react-native 和 react-native-fs。
 */

let FFmpegKit;
let RNFS;

try {
  FFmpegKit = require('ffmpeg-kit-react-native').FFmpegKit;
} catch {
  throw new Error(
    '[AudioExtractor] ffmpeg-kit-react-native not found. Install: npx expo install ffmpeg-kit-react-native'
  );
}

try {
  RNFS = require('react-native-fs');
} catch {
  throw new Error(
    '[AudioExtractor] react-native-fs not found. Install: npm install react-native-fs'
  );
}

/**
 * 生成临时文件路径
 */
function tempPath(ext) {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 8);
  return `${RNFS.CachesDirectoryPath}/mimo_transcribe_${ts}_${rand}.${ext}`;
}

/**
 * 下载远程文件到本地
 *
 * @param {string} url - 远程 URL
 * @param {string} destPath - 本地目标路径
 * @param {Object} [opts]
 * @param {Object} [opts.headers] - 自定义请求头
 * @param {function} [opts.onProgress] - 进度回调 (bytesWritten, contentLength)
 * @returns {Promise<string>} 本地文件路径
 */
async function downloadFile(url, destPath, opts = {}) {
  const { headers = {}, onProgress } = opts;

  const downloadOpts = {
    fromUrl: url,
    toFile: destPath,
    headers,
    progress: onProgress
      ? (res) => onProgress(res.bytesWritten, res.contentLength)
      : undefined,
    progressDivider: 10,
  };

  const result = await RNFS.downloadFile(downloadOpts).promise;

  if (result.statusCode !== 200) {
    throw new Error(`下载失败: HTTP ${result.statusCode}`);
  }

  return destPath;
}

/**
 * 用 FFmpegKit 将音频/视频文件转为 WAV
 *
 * @param {string} inputPath - 输入文件路径
 * @param {Object} [opts]
 * @param {number} [opts.sampleRate=16000] - 采样率
 * @param {number} [opts.channels=1] - 声道数
 * @param {string} [opts.outputPath] - 输出路径（自动生成）
 * @returns {Promise<{outputPath: string, duration: number}>}
 */
async function convertToWav(inputPath, opts = {}) {
  const { sampleRate = 16000, channels = 1, outputPath } = opts;
  const outPath = outputPath || tempPath('wav');

  const cmd = `-i "${inputPath}" -ar ${sampleRate} -ac ${channels} -acodec pcm_s16le -y "${outPath}"`;

  console.log('[AudioExtractor] Running FFmpeg:', cmd);

  const session = await FFmpegKit.execute(cmd);
  const returnCode = await session.getReturnCode();

  // FFmpegKit: ReturnCode.isSuccess() checks if return code is 0
  if (returnCode.isValueSuccess && !returnCode.isValueSuccess()) {
    const logs = await session.getAllLogsAsString();
    throw new Error(`FFmpeg 转码失败 (code: ${returnCode}): ${logs}`);
  }

  // 获取时长
  const duration = await getAudioDuration(outPath);

  return { outputPath: outPath, duration };
}

/**
 * 获取音频文件时长（秒）
 */
async function getAudioDuration(filePath) {
  try {
    const cmd = `-i "${filePath}" -f null -`;
    const session = await FFmpegKit.execute(cmd);
    const logs = await session.getAllLogsAsString();

    // 从日志中提取 Duration: 00:01:23.45
    const m = logs.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
    if (m) {
      const h = parseInt(m[1]);
      const min = parseInt(m[2]);
      const s = parseInt(m[3]);
      const ms = parseInt(m[4]);
      return h * 3600 + min * 60 + s + ms / 100;
    }
  } catch (e) {
    console.warn('[AudioExtractor] Failed to get duration:', e.message);
  }
  return 0;
}

/**
 * 将文件转为 Base64 字符串
 *
 * @param {string} filePath - 文件路径
 * @returns {Promise<string>} Base64 字符串
 */
async function fileToBase64(filePath) {
  return await RNFS.readFile(filePath, 'base64');
}

/**
 * 删除临时文件（静默失败）
 */
async function cleanup(...paths) {
  for (const p of paths) {
    try {
      const exists = await RNFS.exists(p);
      if (exists) await RNFS.unlink(p);
    } catch {}
  }
}

/**
 * 完整流程：从 URL 提取音频并转为 Base64 WAV
 *
 * @param {string} audioUrl - 音频/视频 URL
 * @param {Object} [opts]
 * @param {Object} [opts.headers] - 下载请求头
 * @param {function} [opts.onProgress] - 进度回调
 * @param {number} [opts.sampleRate=16000]
 * @param {number} [opts.channels=1]
 * @returns {Promise<{base64: string, duration: number, mimeType: string}>}
 */
async function extractAudio(audioUrl, opts = {}) {
  const { headers = {}, onProgress, sampleRate = 16000, channels = 1 } = opts;

  const downloadedPath = tempPath('bin');
  const wavPath = tempPath('wav');

  try {
    // Step 1: 下载
    onProgress?.('downloading');
    await downloadFile(audioUrl, downloadedPath, { headers });

    // Step 2: 转码
    onProgress?.('converting');
    const { duration } = await convertToWav(downloadedPath, {
      sampleRate,
      channels,
      outputPath: wavPath,
    });

    // Step 3: Base64 编码
    onProgress?.('encoding');
    const base64 = await fileToBase64(wavPath);

    return { base64, duration, mimeType: 'audio/wav' };
  } finally {
    // 清理临时文件
    await cleanup(downloadedPath, wavPath);
  }
}

module.exports = {
  downloadFile,
  convertToWav,
  fileToBase64,
  getAudioDuration,
  extractAudio,
  cleanup,
};
