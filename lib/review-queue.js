/**
 * review-queue.js
 *
 * Spaced-repetition review queue for weak sentences.
 * Uses a simplified SM-2 algorithm with intervals: 1d, 3d, 7d, 14d, 30d.
 */

const INTERVALS_MS = [
  0,              // level 0: just added
  1 * 86400000,   // level 1: 1 day
  3 * 86400000,   // level 2: 3 days
  7 * 86400000,   // level 3: 7 days
  14 * 86400000,  // level 4: 14 days
  30 * 86400000,  // level 5: 30 days
];

/**
 * Create a new review item for a sentence.
 */
function createReviewItem(subtitleId, lessonId) {
  return {
    subtitleId,
    lessonId,
    level: 0,
    nextReviewAt: Date.now(),
    failCount: 0,
    lastReviewedAt: null,
    createdAt: Date.now(),
  };
}

/**
 * Record a successful review: advance to next level.
 */
function recordSuccess(item) {
  const newLevel = Math.min(item.level + 1, INTERVALS_MS.length - 1);
  return {
    ...item,
    level: newLevel,
    nextReviewAt: Date.now() + INTERVALS_MS[newLevel],
    lastReviewedAt: Date.now(),
  };
}

/**
 * Record a failed review: drop back one level, increase fail count.
 */
function recordFailure(item) {
  const newLevel = Math.max(0, item.level - 1);
  return {
    ...item,
    level: newLevel,
    nextReviewAt: Date.now() + INTERVALS_MS[newLevel],
    failCount: item.failCount + 1,
    lastReviewedAt: Date.now(),
  };
}

/**
 * Get all items due for review (nextReviewAt <= now).
 */
function getDueItems(queue, now = Date.now()) {
  return queue.filter((item) => item.nextReviewAt <= now);
}

/**
 * Add an item to the queue if it doesn't already exist.
 */
function addToQueue(queue, subtitleId, lessonId) {
  const exists = queue.some(
    (item) => item.subtitleId === subtitleId && item.lessonId === lessonId
  );
  if (exists) return queue;
  return [...queue, createReviewItem(subtitleId, lessonId)];
}

/**
 * Remove an item from the queue.
 */
function removeFromQueue(queue, subtitleId, lessonId) {
  return queue.filter(
    (item) => !(item.subtitleId === subtitleId && item.lessonId === lessonId)
  );
}

/**
 * Get summary stats of the queue.
 */
function getQueueStats(queue, now = Date.now()) {
  const due = queue.filter((item) => item.nextReviewAt <= now);
  const upcoming = queue.filter((item) => item.nextReviewAt > now);
  return {
    total: queue.length,
    due: due.length,
    upcoming: upcoming.length,
    mastered: queue.filter((item) => item.level >= 4).length,
  };
}

module.exports = {
  createReviewItem,
  recordSuccess,
  recordFailure,
  getDueItems,
  addToQueue,
  removeFromQueue,
  getQueueStats,
  INTERVALS_MS,
};
