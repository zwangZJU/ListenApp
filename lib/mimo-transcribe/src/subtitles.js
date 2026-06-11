/**
 * 字幕解析与格式化工具
 *
 * 将 ASR 识别结果转换为带时间戳的字幕段落，
 * 以及支持 SRT/VTT 等标准格式导出。
 */

/**
 * 将 ASR 纯文本解析为字幕段落
 *
 * @param {string} rawText - ASR 识别出的纯文本
 * @param {number} totalDuration - 音频总时长（秒）
 * @param {Object} [opts]
 * @param {number} [opts.maxCharsPerLine=80] - 每行最大字符数
 * @returns {Array<{id: number, start: number, end: number, text: string}>}
 */
function parseSubtitles(rawText, totalDuration, opts = {}) {
  const { maxCharsPerLine = 80 } = opts;

  if (!rawText || !rawText.trim()) return [];

  // 先按换行分句
  let lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // 如果没有换行，按句号/问号/感叹号分句
  if (lines.length <= 1 && rawText.length > maxCharsPerLine) {
    lines = splitByPunctuation(rawText);
  }

  // 如果还是太长，按字符数强制换行
  const expandedLines = [];
  for (const line of lines) {
    if (line.length > maxCharsPerLine) {
      const subLines = chunkString(line, maxCharsPerLine);
      expandedLines.push(...subLines);
    } else {
      expandedLines.push(line);
    }
  }

  if (expandedLines.length === 0) return [];

  // 均匀分配时间戳
  const segmentDuration = totalDuration / expandedLines.length;

  return expandedLines.map((text, i) => ({
    id: i,
    start: round2(i * segmentDuration),
    end: round2(Math.min((i + 1) * segmentDuration, totalDuration)),
    text: cleanLine(text),
  }));
}

/**
 * 按标点符号分句（中英文兼容）
 */
function splitByPunctuation(text) {
  // 匹配中英文句号、问号、感叹号、分号
  const sentences = text
    .split(/(?<=[.!?;。！？；])\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return sentences.length > 0 ? sentences : [text];
}

/**
 * 按字符数切分字符串（在空格处断开）
 */
function chunkString(str, maxLen) {
  const result = [];
  let remaining = str;

  while (remaining.length > maxLen) {
    // 在 maxLen 之前找最后一个空格
    let breakAt = remaining.lastIndexOf(' ', maxLen);
    if (breakAt <= 0) breakAt = maxLen;

    result.push(remaining.substring(0, breakAt));
    remaining = remaining.substring(breakAt).trim();
  }

  if (remaining) result.push(remaining);
  return result;
}

/**
 * 清理行文本
 */
function cleanLine(text) {
  return text
    .replace(/^\d+[.:)\s]+/, '') // 去除行首序号
    .replace(/\s+/g, ' ') // 合并多余空格
    .trim();
}

/**
 * 导出为 SRT 格式
 *
 * @param {Array} subtitles - 字幕段落数组
 * @returns {string} SRT 格式文本
 */
function toSRT(subtitles) {
  return subtitles
    .map(
      (s, i) =>
        `${i + 1}\n${formatSRTTime(s.start)} --> ${formatSRTTime(s.end)}\n${s.text}\n`
    )
    .join('\n');
}

/**
 * 导出为 WebVTT 格式
 *
 * @param {Array} subtitles - 字幕段落数组
 * @returns {string} VTT 格式文本
 */
function toVTT(subtitles) {
  const cues = subtitles
    .map(
      (s) =>
        `${formatVTTTime(s.start)} --> ${formatVTTTime(s.end)}\n${s.text}\n`
    )
    .join('\n');
  return `WEBVTT\n\n${cues}`;
}

/**
 * 格式化 SRT 时间 00:01:23,456
 */
function formatSRTTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms)}`;
}

/**
 * 格式化 VTT 时间 00:01:23.456
 */
function formatVTTTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad3(ms)}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}
function pad3(n) {
  return String(n).padStart(3, '0');
}
function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { parseSubtitles, toSRT, toVTT };
