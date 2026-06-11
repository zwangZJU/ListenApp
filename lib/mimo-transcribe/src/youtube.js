/**
 * YouTube 音频流提取
 *
 * 从 YouTube 视频页面提取可直接下载的音频流 URL。
 * 不依赖第三方 API，直接解析 YouTube 页面数据。
 */

const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';

const UA_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * 从 YouTube 链接提取视频 ID
 *
 * @param {string} url
 * @returns {string|null}
 */
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?#]+)/,
    /youtube\.com\/shorts\/([^&?#]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/**
 * 从 YouTube 页面获取音频流信息
 *
 * @param {string} videoId
 * @returns {Promise<{audioUrl: string, title: string, duration: number}>}
 */
async function getYouTubeAudioInfo(videoId) {
  const url = `https://m.youtube.com/watch?v=${videoId}`;

  // Step 1: 获取页面
  const pageRes = await fetch(url, {
    headers: { 'User-Agent': UA_ANDROID },
  });
  const html = await pageRes.text();

  // Step 2: 提取 ytInitialPlayerResponse
  let playerResponse = null;

  // 多种正则尝试
  const patterns = [
    /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var|<\/script>)/s,
    /var ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s,
    /ytInitialPlayerResponse\s*=\s*(\{.*?\});/s,
  ];

  for (const p of patterns) {
    const m = html.match(p);
    if (m) {
      try {
        playerResponse = JSON.parse(m[1]);
        break;
      } catch {
        continue;
      }
    }
  }

  if (!playerResponse) {
    throw new Error('无法解析 YouTube 视频数据');
  }

  // Step 3: 提取视频信息
  const videoDetails = playerResponse.videoDetails || {};
  const title = videoDetails.title || 'Unknown';
  const duration = parseInt(videoDetails.lengthSeconds) || 0;

  // Step 4: 提取音频流
  const streamingData = playerResponse.streamingData || {};

  // 优先找 adaptiveFormats 中的纯音频流（体积小，下载快）
  const adaptiveFormats = streamingData.adaptiveFormats || [];
  const audioStreams = adaptiveFormats.filter(
    (f) => f.mimeType?.startsWith('audio/') && (f.url || f.signatureCipher)
  );

  if (audioStreams.length === 0) {
    // 退而求其次，用 formats 中的（包含视频，但有音频）
    const formats = streamingData.formats || [];
    const withUrl = formats.filter((f) => f.url);
    const withCipher = formats.filter((f) => f.signatureCipher);

    if (withUrl.length > 0) {
      // 有直接 URL
      withUrl.sort((a, b) => (b.width || 0) - (a.width || 0));
      return {
        audioUrl: withUrl[0].url,
        title,
        duration,
        hasAudio: true,
        hasVideo: true,
      };
    }

    if (withCipher.length > 0) {
      // 有 signatureCipher — 需要解密（暂不支持）
      throw new Error(
        'YouTube 视频需要签名解密，暂时不支持此视频。请尝试其他视频。'
      );
    }

    throw new Error('未找到可用的音频流');
  }

  // 按码率排序，选最高质量的音频
  audioStreams.sort((a, b) => (b.averageBitrate || b.bitrate || 0) - (a.averageBitrate || a.bitrate || 0));

  const bestAudio = audioStreams[0];

  if (!bestAudio.url) {
    throw new Error(
      'YouTube 音频流需要签名解密，暂时不支持此视频。请尝试其他视频。'
    );
  }

  // 推断文件扩展名
  const mime = bestAudio.mimeType || '';
  let ext = 'mp4';
  if (mime.includes('webm')) ext = 'webm';
  else if (mime.includes('mp4')) ext = 'mp4';
  else if (mime.includes('ogg')) ext = 'ogg';

  return {
    audioUrl: bestAudio.url,
    title,
    duration,
    ext,
    hasAudio: true,
    hasVideo: false,
    bitrate: bestAudio.averageBitrate || bestAudio.bitrate || 0,
    mimeType: mime,
  };
}

/**
 * 判断 URL 是否是 YouTube 链接
 */
function isYouTubeUrl(url) {
  return /youtube\.com|youtu\.be/i.test(url);
}

module.exports = {
  extractVideoId,
  getYouTubeAudioInfo,
  isYouTubeUrl,
};
