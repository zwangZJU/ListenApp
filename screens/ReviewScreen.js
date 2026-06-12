import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet, Text, View, FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getReviewQueue, saveReviewQueue, getLessons } from '../lib/learning-store';
import { getDueItems, recordSuccess, recordFailure, getQueueStats } from '../lib/review-queue';
import { useTheme } from '../lib/theme';

export default function ReviewScreen({ navigation }) {
  const { theme } = useTheme();
  const [queue, setQueue] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('due');

  useEffect(() => {
    (async () => {
      const [q, l] = await Promise.all([getReviewQueue(), getLessons()]);
      setQueue(q);
      setLessons(l);
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => getQueueStats(queue), [queue]);
  const dueItems = useMemo(() => getDueItems(queue), [queue]);

  const findSubtitleForItem = useCallback((item) => {
    const lesson = lessons.find((l) => l.id === item.lessonId);
    if (!lesson || !lesson.subtitles) return null;
    const sub = lesson.subtitles.find((s) => s.id === item.subtitleId);
    return sub ? { ...sub, lessonTitle: lesson.title, lessonId: lesson.id } : null;
  }, [lessons]);

  const handleReview = useCallback(async (item, correct) => {
    let updatedQueue;
    if (correct) {
      updatedQueue = queue.map((q) => q.subtitleId === item.subtitleId && q.lessonId === item.lessonId ? recordSuccess(q) : q);
    } else {
      updatedQueue = queue.map((q) => q.subtitleId === item.subtitleId && q.lessonId === item.lessonId ? recordFailure(q) : q);
    }
    setQueue(updatedQueue);
    await saveReviewQueue(updatedQueue);
  }, [queue]);

  const navigateToLesson = useCallback((item) => {
    const lesson = lessons.find((l) => l.id === item.lessonId);
    if (lesson) {
      navigation.navigate('Player', {
        lessonId: lesson.id, videoId: lesson.videoId, title: lesson.title,
        source: lesson.videoSource || 'youtube', asrSubtitles: lesson.subtitles,
        asrRawText: lesson.rawText, difficulty: lesson.difficulty,
        difficultyLabel: lesson.difficultyLabel,
        focusSubtitleId: item.subtitleId,
      });
    }
  }, [navigation, lessons]);

  const renderDueItem = useCallback(({ item }) => {
    const sub = findSubtitleForItem(item);
    if (!sub) return null;

    return (
      <View style={[styles.reviewCard, { backgroundColor: theme.card }]}>
        <TouchableOpacity onPress={() => navigateToLesson(item)} activeOpacity={0.7}>
          <Text style={[styles.lessonRef, { color: theme.accent }]}>{sub.lessonTitle}</Text>
          <Text style={[styles.sentenceText, { color: theme.cardText }]}>{sub.text}</Text>
          {sub.zh && <Text style={[styles.translationText, { color: theme.cardSubText }]}>{sub.zh}</Text>}
        </TouchableOpacity>
        <View style={styles.reviewActions}>
          <TouchableOpacity style={[styles.actionBtn, styles.hardBtn]} onPress={() => handleReview(item, false)}>
            <Text style={styles.hardBtnText}>Hard</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.easyBtn]} onPress={() => handleReview(item, true)}>
            <Text style={styles.easyBtnText}>Easy</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [findSubtitleForItem, handleReview, navigateToLesson, theme]);

  const renderQueueItem = useCallback(({ item }) => {
    const sub = findSubtitleForItem(item);
    if (!sub) return null;

    const levelLabels = ['New', '1d', '3d', '7d', '14d', '30d'];
    const levelColors = ['#94A3B8', '#EF4444', '#F59E0B', '#3B82F6', '#10B981', '#059669'];

    return (
      <TouchableOpacity style={[styles.queueCard, { backgroundColor: theme.card }]} onPress={() => navigateToLesson(item)} activeOpacity={0.7}>
        <View style={styles.queueCardHeader}>
          <Text style={[styles.queueSentence, { color: theme.cardText }]} numberOfLines={2}>{sub.text}</Text>
          <View style={[styles.levelBadge, { backgroundColor: levelColors[item.level] || '#94A3B8' }]}>
            <Text style={styles.levelBadgeText}>{levelLabels[item.level] || 'New'}</Text>
          </View>
        </View>
        <Text style={[styles.queueLessonRef, { color: theme.textDim }]}>{sub.lessonTitle}</Text>
      </TouchableOpacity>
    );
  }, [findSubtitleForItem, navigateToLesson, theme]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.textMuted }]}>Loading review queue...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const displayItems = activeTab === 'due' ? dueItems : queue;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <Text style={[styles.headerTitle, { color: theme.cardText }]}>Review</Text>
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.inputBg }]}>
            <Text style={[styles.statNumber, { color: theme.cardText }]}>{stats.due}</Text>
            <Text style={[styles.statLabel, { color: theme.cardSubText }]}>Due</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.inputBg }]}>
            <Text style={[styles.statNumber, { color: theme.cardText }]}>{stats.total}</Text>
            <Text style={[styles.statLabel, { color: theme.cardSubText }]}>Total</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.inputBg }]}>
            <Text style={[styles.statNumber, { color: theme.cardText }]}>{stats.mastered}</Text>
            <Text style={[styles.statLabel, { color: theme.cardSubText }]}>Mastered</Text>
          </View>
        </View>
      </View>

      <View style={[styles.tabRow, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity style={[styles.tabBtn, { backgroundColor: activeTab === 'due' ? theme.accent : theme.inputBg }]}
          onPress={() => setActiveTab('due')}>
          <Text style={[styles.tabBtnText, { color: activeTab === 'due' ? '#FFFFFF' : theme.cardSubText }]}>Due ({dueItems.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, { backgroundColor: activeTab === 'all' ? theme.accent : theme.inputBg }]}
          onPress={() => setActiveTab('all')}>
          <Text style={[styles.tabBtnText, { color: activeTab === 'all' ? '#FFFFFF' : theme.cardSubText }]}>All ({queue.length})</Text>
        </TouchableOpacity>
      </View>

      {displayItems.length === 0 ? (
        <View style={styles.centerContent}>
          <Text style={styles.emptyIcon}>🎉</Text>
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>
            {activeTab === 'due' ? 'All caught up!' : 'No review items yet'}
          </Text>
          <Text style={[styles.emptySubtext, { color: theme.textDim }]}>
            {activeTab === 'due' ? 'Mark sentences as "Hard" during practice to add them here.' : 'Start practicing to build your review queue.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayItems}
          renderItem={activeTab === 'due' ? renderDueItem : renderQueueItem}
          keyExtractor={(item, idx) => `${item.lessonId}_${item.subtitleId}_${idx}`}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  statCard: { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
  statNumber: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: 12, marginTop: 2 },
  tabRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  tabBtnText: { fontSize: 14, fontWeight: '600' },
  listContent: { padding: 16 },
  reviewCard: { borderRadius: 10, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  lessonRef: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  sentenceText: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  translationText: { fontSize: 14, marginTop: 6, lineHeight: 20 },
  reviewActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  hardBtn: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  hardBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 14 },
  easyBtn: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0' },
  easyBtnText: { color: '#16A34A', fontWeight: '700', fontSize: 14 },
  queueCard: { borderRadius: 10, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  queueCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  queueSentence: { flex: 1, fontSize: 14, lineHeight: 20, marginRight: 8 },
  levelBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  levelBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  queueLessonRef: { fontSize: 12, marginTop: 6 },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  loadingText: { marginTop: 12, fontSize: 15 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '500' },
  emptySubtext: { fontSize: 13, marginTop: 4, textAlign: 'center', paddingHorizontal: 40 },
});
