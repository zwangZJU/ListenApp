/**
 * ai-coach.js
 *
 * Client-side AI coaching heuristics for ListenApp.
 * Provides dictation item generation, key vocab extraction,
 * sentence explanation, and lesson summarization.
 *
 * Phase 1: all logic is client-side heuristics (no external API calls).
 * Phase 2+: can be upgraded to call LLM APIs for richer output.
 */

// Top 300 high-frequency English words to exclude from "key vocab"
const STOP_WORDS = new Set([
  'the','be','to','of','and','a','in','that','have','i','it','for','not','on','with',
  'he','as','you','do','at','this','but','his','by','from','they','we','say','her','she',
  'or','an','will','my','one','all','would','there','their','what','so','up','out','if',
  'about','who','get','which','go','me','when','make','can','like','time','no','just',
  'him','know','take','people','into','year','your','good','some','could','them','see',
  'other','than','then','now','look','only','come','its','over','think','also','back',
  'after','use','two','how','our','work','first','well','way','even','new','want',
  'because','any','these','give','day','most','us','is','am','are','was','were','been',
  'being','has','had','did','does','done','shall','should','may','might','must','need',
  'very','much','really','still','too','very','never','always','often','here','where',
  'when','why','how','each','every','both','few','more','most','own','same','last',
  'long','great','little','old','right','big','high','different','small','large','next',
  'early','young','important','bad','able','much','many','such','those','before','after',
  'above','below','between','through','during','without','against','among','around',
  'just','also','however','although','because','since','while','where','when','if','then',
  'else','than','rather','quite','enough','already','still','yet','again','once','ago',
  'let','make','keep','go','come','get','give','take','put','set','run','say','tell',
  'ask','work','seem','feel','try','leave','call','find','look','use','move','live',
  'believe','happen','include','continue','change','lead','understand','watch','follow',
  'stop','create','begin','open','close','play','read','learn','teach','study',
]);

/**
 * Extract key vocabulary from a text.
 * Returns an array of { word, count } sorted by frequency.
 */
function extractKeyVocab(text, maxItems = 10) {
  if (!text) return [];

  const words = text
    .toLowerCase()
    .replace(/[^a-z'\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  const freq = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxItems)
    .map(([word, count]) => ({ word, count }));
}

/**
 * Build dictation items from subtitles.
 * Selects words to blank out based on difficulty level.
 *
 * @param {Array} subtitles - [{id, text, ...}]
 * @param {number} level - 1-5 difficulty
 * @param {number} blanksPerSentence - max blanks per sentence (default 2)
 * @returns {Array} [{id, original, masked, blanks: [{index, word}]}]
 */
function buildDictationItems(subtitles, level = 2, blanksPerSentence = 2) {
  return subtitles.map((sub) => {
    const words = sub.text.split(/\s+/);
    if (words.length < 3) {
      return { id: sub.id, original: sub.text, masked: sub.text, blanks: [] };
    }

    // Select candidates: longer, non-stop words are better candidates
    const candidates = words
      .map((w, idx) => ({ word: w, idx, clean: w.replace(/[^a-zA-Z']/g, '').toLowerCase() }))
      .filter((c) => c.clean.length >= 3 + level && !STOP_WORDS.has(c.clean));

    // Shuffle and pick blanksPerSentence
    const shuffled = candidates.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(blanksPerSentence, Math.max(1, Math.floor(words.length / (5 - level + 1)))));

    const blankIndices = new Set(selected.map((s) => s.idx));
    const masked = words.map((w, i) => (blankIndices.has(i) ? '___' : w)).join(' ');

    return {
      id: sub.id,
      original: sub.text,
      masked,
      blanks: selected.map((s) => ({ index: s.idx, word: s.word })),
    };
  });
}

/**
 * Generate a simple lesson summary from subtitles text.
 * Client-side heuristic: extracts first/last sentences and word count.
 */
function generateLessonSummary(subtitles) {
  if (!subtitles || subtitles.length === 0) {
    return { summary: '', keyPoints: [], wordCount: 0 };
  }

  const allText = subtitles.map((s) => s.text).join(' ');
  const words = allText.split(/\s+/);
  const vocab = extractKeyVocab(allText, 8);

  const sentences = subtitles.map((s) => s.text);
  const keyPoints = sentences.slice(0, 3);

  return {
    summary: `This lesson has ${subtitles.length} segments (${words.length} words). Key topics: ${vocab.slice(0, 5).map((v) => v.word).join(', ')}.`,
    keyPoints,
    wordCount: words.length,
    vocab,
  };
}

/**
 * Generate a simple explanation for a sentence (client-side heuristic).
 * Highlights structure and key words.
 */
function explainSentence(sentence) {
  if (!sentence) return { explanation: '', grammar: [], vocab: [] };

  const words = sentence.split(/\s+/);
  const vocab = extractKeyVocab(sentence, 5);

  const grammarNotes = [];
  if (/\b(is|am|are|was|were)\b.*\b(to|for|with|about)\b/i.test(sentence)) {
    grammarNotes.push('Uses linking verb + preposition structure');
  }
  if (/\b(have|has|had)\b.*\b(ed|en)\b/i.test(sentence)) {
    grammarNotes.push('Contains present/past perfect tense');
  }
  if (/\b(will|would|shall|should|can|could|may|might|must)\b/i.test(sentence)) {
    grammarNotes.push('Contains modal verb');
  }
  if (/\b(that|which|who|whom|whose)\b/i.test(sentence)) {
    grammarNotes.push('Contains relative clause');
  }

  return {
    explanation: `This sentence has ${words.length} words.`,
    grammar: grammarNotes,
    vocab,
  };
}

module.exports = {
  extractKeyVocab,
  buildDictationItems,
  generateLessonSummary,
  explainSentence,
};
