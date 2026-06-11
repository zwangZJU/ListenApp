/**
 * difficulty.js
 *
 * Sentence-level difficulty estimator for English listening practice.
 * Returns a 1-5 score based on: word count, avg word length, speech density,
 * presence of complex words, and punctuation complexity.
 */

const BASIC_WORDS = new Set([
  'i','me','my','you','your','he','she','it','we','they','him','her','us','them',
  'is','am','are','was','were','be','been','being','have','has','had','do','does','did',
  'will','would','shall','should','can','could','may','might','must','need',
  'a','an','the','this','that','these','those','some','any','no','every','each','all',
  'and','but','or','so','if','then','than','because','as','while','when','where','how',
  'what','which','who','whom','whose','why','not','very','just','also','too','only',
  'in','on','at','to','for','of','with','by','from','up','about','into','over','after',
  'before','between','under','through','during','without','against','among',
  'go','come','get','make','take','give','say','tell','know','think','see','want',
  'use','find','look','ask','work','seem','feel','try','leave','call','put','keep',
  'let','begin','help','show','hear','play','run','move','live','believe','happen',
  'good','new','first','last','long','great','little','own','other','old','right',
  'big','high','different','small','large','next','early','young','important','few',
  'bad','same','able','one','two','three','four','five','six','seven','eight','nine','ten',
  'time','year','people','way','day','man','woman','child','world','life','hand',
  'part','place','case','week','company','system','program','question',
  'number','night','point','home','water','room','mother','area',
  'money','story','fact','month','lot','study','book','eye','job',
  'business','issue','side','kind','head','house','service','friend','father',
  'power','hour','game','line','end','member','law','car','city','community',
  'name','team','minute','idea','body','back','parent','face','others',
  'level','office','door','health','person','art','war','history','party','result',
  'change','morning','reason','research','girl','guy','moment','air','teacher',
  'force','education','talk','really','well','thing','much','today','still',
  'become','country','student','state','never','family','leave','provide','hold',
  'mean','offer','already','create','public','local','social','include',
  'read','second','rate','learn','follow','continue','stop','watch',
  'report','develop','lead','receive','produce','run','grow','sell',
  'close','open','build','die','sit','meet','send','remain',
]);

function estimateDifficulty(text, opts = {}) {
  if (!text || !text.trim()) {
    return { score: 1, label: 'Beginner', details: {} };
  }

  const clean = text.replace(/[^a-zA-Z'\s-]/g, ' ').trim();
  const words = clean.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;

  if (wordCount === 0) {
    return { score: 1, label: 'Beginner', details: {} };
  }

  const wcScore = wordCount <= 6 ? 0 : wordCount <= 12 ? 1 : wordCount <= 20 ? 2 : wordCount <= 30 ? 3 : 4;

  const avgWordLen = words.reduce((sum, w) => sum + w.length, 0) / wordCount;
  const wlScore = avgWordLen <= 3.5 ? 0 : avgWordLen <= 4.5 ? 1 : avgWordLen <= 5.5 ? 2 : avgWordLen <= 6.5 ? 3 : 4;

  const complexWords = words.filter((w) => !BASIC_WORDS.has(w.toLowerCase()));
  const complexRatio = complexWords.length / wordCount;
  const crScore = complexRatio <= 0.15 ? 0 : complexRatio <= 0.3 ? 1 : complexRatio <= 0.5 ? 2 : complexRatio <= 0.7 ? 3 : 4;

  let srScore = 2;
  if (opts.duration && opts.duration > 0) {
    const wpm = (wordCount / opts.duration) * 60;
    srScore = wpm <= 100 ? 0 : wpm <= 130 ? 1 : wpm <= 160 ? 2 : wpm <= 190 ? 3 : 4;
  }

  const commas = (text.match(/[,;:]/g) || []).length;
  const pScore = commas === 0 ? 0 : commas <= 1 ? 1 : commas <= 2 ? 2 : 3;

  const raw = (wcScore * 0.15) + (wlScore * 0.2) + (crScore * 0.3) + (srScore * 0.2) + (pScore * 0.15);
  const score = Math.max(1, Math.min(5, Math.round(raw) + 1));

  const labels = ['', 'Beginner', 'Elementary', 'Intermediate', 'Upper-Intermediate', 'Advanced'];
  return {
    score,
    label: labels[score],
    details: {
      wordCount,
      avgWordLen: Math.round(avgWordLen * 10) / 10,
      complexRatio: Math.round(complexRatio * 100) / 100,
      wpm: opts.duration ? Math.round((wordCount / opts.duration) * 60) : null,
    },
  };
}

function estimateLessonDifficulty(subtitles) {
  if (!subtitles || subtitles.length === 0) {
    return { overall: 1, label: 'Beginner', subtitles: [] };
  }

  const annotated = subtitles.map((sub, i) => {
    const nextStart = subtitles[i + 1]?.start ?? sub.end;
    const duration = Math.max(0.5, nextStart - sub.start);
    const { score, label, details } = estimateDifficulty(sub.text, { duration });
    return { ...sub, sentenceDifficulty: score, difficultyLabel: label, difficultyDetails: details };
  });

  const avgScore = annotated.reduce((sum, s) => sum + s.sentenceDifficulty, 0) / annotated.length;
  const overall = Math.max(1, Math.min(5, Math.round(avgScore)));
  const labels = ['', 'Beginner', 'Elementary', 'Intermediate', 'Upper-Intermediate', 'Advanced'];
  return { overall, label: labels[overall], subtitles: annotated };
}

module.exports = { estimateDifficulty, estimateLessonDifficulty };
