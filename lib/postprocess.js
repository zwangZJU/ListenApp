/**
 * postprocess.js
 *
 * Post-processes raw ASR subtitles into enriched, sentence-level segments
 * suitable for the ListenApp practice engine.
 */

/**
 * Clean and normalize a subtitle text line.
 */
function cleanText(text) {
  return text
    .replace(/^\d+[.:)\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split long subtitle segments into sentence-level chunks.
 * Keeps segments under maxChars while respecting sentence boundaries.
 */
function splitToSentences(text, maxChars = 120) {
  const cleaned = cleanText(text);
  if (cleaned.length <= maxChars) return [cleaned];

  const sentences = cleaned
    .split(/(?<=[.!?;。！？；])\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length <= 1) {
    const result = [];
    let remaining = cleaned;
    while (remaining.length > maxChars) {
      let breakAt = remaining.lastIndexOf(' ', maxChars);
      if (breakAt <= 0) breakAt = maxChars;
      result.push(remaining.substring(0, breakAt).trim());
      remaining = remaining.substring(breakAt).trim();
    }
    if (remaining) result.push(remaining);
    return result;
  }

  return sentences;
}

/**
 * Remove duplicate subtitles (same text within 1s window).
 */
function deduplicate(subtitles) {
  const result = [];
  for (const sub of subtitles) {
    const prev = result[result.length - 1];
    if (prev && prev.text === sub.text && Math.abs(sub.start - prev.start) < 1.0) {
      continue;
    }
    result.push(sub);
  }
  return result;
}

/**
 * Merge consecutive short segments (< 1.5s) that form a single sentence.
 */
function mergeShortSegments(subtitles, minDuration = 1.5) {
  if (subtitles.length === 0) return [];

  const result = [];
  let buffer = { ...subtitles[0] };

  for (let i = 1; i < subtitles.length; i++) {
    const cur = subtitles[i];
    const bufferDuration = buffer.end - buffer.start;

    if (bufferDuration < minDuration && !(/[.!?]$/.test(buffer.text))) {
      buffer.text = buffer.text + ' ' + cur.text;
      buffer.end = cur.end;
    } else {
      result.push(buffer);
      buffer = { ...cur };
    }
  }
  result.push(buffer);
  return result;
}

/**
 * Redistribute time stamps evenly across segments based on word count.
 * Useful when ASR gives uniform segments but speech rate varies.
 */
function redistributeTiming(subtitles, totalDuration) {
  if (subtitles.length === 0 || !totalDuration) return subtitles;

  const wordCounts = subtitles.map((s) => s.text.split(/\s+/).length);
  const totalWords = wordCounts.reduce((a, b) => a + b, 0);
  if (totalWords === 0) return subtitles;

  let elapsed = 0;
  return subtitles.map((sub, i) => {
    const proportion = wordCounts[i] / totalWords;
    const duration = proportion * totalDuration;
    const start = elapsed;
    elapsed += duration;
    return { ...sub, start: round2(start), end: round2(elapsed) };
  });
}

/**
 * Full postprocessing pipeline: deduplicate -> merge -> redistribute -> re-index.
 * Returns subtitles compatible with {id, start, end, text} while keeping
 * additional fields if present.
 */
function postprocessSubtitles(subtitles, totalDuration) {
  let result = deduplicate(subtitles);
  result = mergeShortSegments(result);
  result = redistributeTiming(result, totalDuration);
  result = result.map((sub, idx) => ({ ...sub, id: idx }));
  return result;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { postprocessSubtitles, splitToSentences, deduplicate, mergeShortSegments, redistributeTiming };
