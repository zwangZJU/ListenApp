/**
 * MiMo ASR API 客户端
 *
 * 封装小米 MiMo-V2.5-ASR 语音识别 API 的调用逻辑。
 * 支持非流式和流式识别，自动处理 Base64 编码和分块。
 */

const MIMO_API_URL = 'https://api.xiaomimimo.com/v1/chat/completions';
const MIMO_MODEL = 'mimo-v2.5-asr';

// MiMo ASR Base64 上限 10MB，留余量给编码开销
const MAX_RAW_AUDIO_BYTES = 7 * 1024 * 1024; // ~7MB raw ≈ 9.3MB base64

/**
 * 创建 MiMo ASR 客户端
 *
 * @param {Object} opts
 * @param {string} opts.apiKey - MiMo API Key
 * @param {string} [opts.model] - 模型名，默认 mimo-v2.5-asr
 * @param {string} [opts.language] - 语言提示，默认 'auto'（自动检测）
 * @param {string} [opts.baseUrl] - API 地址（可选，用于代理）
 */
function createMiMoASR(opts = {}) {
  const {
    apiKey,
    model = MIMO_MODEL,
    language = 'auto',
    baseUrl = MIMO_API_URL,
  } = opts;

  if (!apiKey) {
    throw new Error('[MiMoASR] apiKey is required');
  }

  /**
   * 识别单段音频
   *
   * @param {string} audioBase64 - Base64 编码的音频数据
   * @param {string} [mimeType='audio/wav'] - 音频 MIME 类型
   * @returns {Promise<string>} 识别出的文字
   */
  async function transcribeChunk(audioBase64, mimeType = 'audio/wav') {
    const langHint =
      language === 'auto'
        ? '请识别这段音频的完整内容，逐句输出。如果是英文请保留英文原文，如果是中文输出中文。'
        : language === 'en'
          ? 'Please transcribe this audio in English, output each sentence on a new line.'
          : '请识别这段音频的完整内容，逐句输出中文。';

    const body = {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: langHint },
            {
              type: 'audio_url',
              audio_url: {
                url: `data:${mimeType};base64,${audioBase64}`,
              },
            },
          ],
        },
      ],
    };

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`MiMo ASR API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  /**
   * 识别音频文件（自动分块处理长音频）
   *
   * @param {string} audioBase64 - Base64 编码的音频
   * @param {Object} [opts]
   * @param {string} [opts.mimeType='audio/wav']
   * @param {function} [opts.onProgress] - 进度回调 (current, total)
   * @returns {Promise<string>} 完整识别文字
   */
  async function transcribe(audioBase64, opts = {}) {
    const { mimeType = 'audio/wav', onProgress } = opts;

    const rawSize = Math.ceil((audioBase64.length * 3) / 4);

    if (rawSize <= MAX_RAW_AUDIO_BYTES) {
      // 单块直接识别
      onProgress?.(1, 1);
      return await transcribeChunk(audioBase64, mimeType);
    }

    // 需要分块 — 按 base64 字符数切分（近似）
    const chunkSize = Math.floor(MAX_RAW_AUDIO_BYTES * 4 / 3); // base64 chars
    const chunks = [];
    for (let i = 0; i < audioBase64.length; i += chunkSize) {
      chunks.push(audioBase64.substring(i, i + chunkSize));
    }

    const total = chunks.length;
    const results = [];

    for (let i = 0; i < chunks.length; i++) {
      onProgress?.(i + 1, total);
      const text = await transcribeChunk(chunks[i], mimeType);
      results.push(text);
    }

    return results.join('\n');
  }

  return { transcribe, transcribeChunk };
}

module.exports = { createMiMoASR };
