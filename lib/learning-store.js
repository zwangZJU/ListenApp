/**
 * learning-store.js
 *
 * Persistent learning data store using expo-file-system.
 * Stores lessons, progress, review queue, and daily stats as JSON files.
 */

import * as FileSystem from 'expo-file-system/legacy';

const DATA_DIR = `${FileSystem.documentDirectory}listenapp/`;

const FILES = {
  lessons: `${DATA_DIR}lessons.json`,
  progress: `${DATA_DIR}progress.json`,
  reviewQueue: `${DATA_DIR}review_queue.json`,
  dailyLog: `${DATA_DIR}daily_log.json`,
  settings: `${DATA_DIR}settings.json`,
};

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(DATA_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DATA_DIR, { intermediates: true });
  }
}

async function readJSON(filePath, defaultValue) {
  try {
    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists) return defaultValue;
    const content = await FileSystem.readAsStringAsync(filePath);
    return JSON.parse(content);
  } catch {
    return defaultValue;
  }
}

async function writeJSON(filePath, data) {
  await ensureDir();
  await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data));
}

// ====== Lesson Store ======

async function getLessons() {
  return readJSON(FILES.lessons, []);
}

async function saveLesson(lesson) {
  const lessons = await getLessons();
  const idx = lessons.findIndex((l) => l.id === lesson.id);
  if (idx >= 0) {
    lessons[idx] = { ...lessons[idx], ...lesson, updatedAt: Date.now() };
  } else {
    lessons.unshift({ ...lesson, createdAt: Date.now(), updatedAt: Date.now() });
  }
  await writeJSON(FILES.lessons, lessons);
  return lessons;
}

async function getLessonById(id) {
  const lessons = await getLessons();
  return lessons.find((l) => l.id === id) || null;
}

async function deleteLesson(id) {
  const lessons = await getLessons();
  const filtered = lessons.filter((l) => l.id !== id);
  await writeJSON(FILES.lessons, filtered);
  return filtered;
}

// ====== Progress Store ======

const DEFAULT_PROGRESS = {
  totalMinutes: 0,
  totalSessions: 0,
  masteredSentences: 0,
  weakSentences: 0,
  streakDays: 0,
  lastActiveDate: null,
  dailyGoalMinutes: 15,
  dailyGoalSentences: 20,
};

async function getProgress() {
  return readJSON(FILES.progress, { ...DEFAULT_PROGRESS });
}

async function updateProgress(patch) {
  const progress = await getProgress();
  const updated = { ...progress, ...patch };
  await writeJSON(FILES.progress, updated);
  return updated;
}

/**
 * Log a learning session and update streak.
 */
async function logSession(durationMinutes, sentencesCompleted) {
  const progress = await getProgress();
  const today = new Date().toISOString().slice(0, 10);

  let streakDays = progress.streakDays;
  if (progress.lastActiveDate) {
    const lastDate = new Date(progress.lastActiveDate);
    const diffDays = Math.floor((Date.now() - lastDate.getTime()) / 86400000);
    if (diffDays === 1) {
      streakDays += 1;
    } else if (diffDays > 1) {
      streakDays = 1;
    }
  } else {
    streakDays = 1;
  }

  const updated = {
    ...progress,
    totalMinutes: progress.totalMinutes + durationMinutes,
    totalSessions: progress.totalSessions + 1,
    streakDays,
    lastActiveDate: today,
  };

  await writeJSON(FILES.progress, updated);

  // Also log daily
  await logDaily(durationMinutes, sentencesCompleted);

  return updated;
}

// ====== Daily Log ======

async function getDailyLog() {
  return readJSON(FILES.dailyLog, {});
}

async function logDaily(minutes, sentences) {
  const log = await getDailyLog();
  const today = new Date().toISOString().slice(0, 10);
  const entry = log[today] || { minutes: 0, sentences: 0, sessions: 0 };
  log[today] = {
    minutes: entry.minutes + minutes,
    sentences: entry.sentences + sentences,
    sessions: entry.sessions + 1,
  };
  await writeJSON(FILES.dailyLog, log);
  return log;
}

async function getLast7Days() {
  const log = await getDailyLog();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, ...(log[key] || { minutes: 0, sentences: 0, sessions: 0 }) });
  }
  return days;
}

// ====== Review Queue Store ======

async function getReviewQueue() {
  return readJSON(FILES.reviewQueue, []);
}

async function saveReviewQueue(queue) {
  await writeJSON(FILES.reviewQueue, queue);
}

// ====== Settings ======

const DEFAULT_SETTINGS = {
  apiKey: '',
  language: 'auto',
  dailyGoalMinutes: 15,
  dailyGoalSentences: 20,
  defaultSpeed: 1.0,
  autoTranslate: false,
  theme: 'midnight',
};

async function getSettings() {
  return readJSON(FILES.settings, { ...DEFAULT_SETTINGS });
}

async function updateSettings(patch) {
  const settings = await getSettings();
  const updated = { ...settings, ...patch };
  await writeJSON(FILES.settings, updated);
  return updated;
}

module.exports = {
  getLessons,
  saveLesson,
  getLessonById,
  deleteLesson,
  getProgress,
  updateProgress,
  logSession,
  getDailyLog,
  getLast7Days,
  getReviewQueue,
  saveReviewQueue,
  getSettings,
  updateSettings,
};
