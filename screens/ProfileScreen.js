import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, TextInput, ScrollView, Alert, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getProgress, getLast7Days, getSettings, updateSettings, getLessons, getReviewQueue } from '../lib/learning-store';
import { getQueueStats } from '../lib/review-queue';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BAR_MAX_WIDTH = SCREEN_WIDTH - 80;

export default function ProfileScreen() {
  const [progress, setProgress] = useState(null);
  const [dailyData, setDailyData] = useState([]);
  const [settings, setSettings] = useState({ apiKey: '', dailyGoalMinutes: 15, dailyGoalSentences: 20 });
  const [lessons, setLessons] = useState([]);
  const [queueStats, setQueueStats] = useState({ total: 0, due: 0, mastered: 0 });
  const [editingKey, setEditingKey] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [p, d, s, l, q] = await Promise.all([
        getProgress(), getLast7Days(), getSettings(), getLessons(), getReviewQueue(),
      ]);
      setProgress(p);
      setDailyData(d);
      setSettings(s);
      setLessons(l);
      setQueueStats(getQueueStats(q));
      setTempApiKey(s.apiKey || '');
      setLoading(false);
    })();
  }, []);

  const handleSaveApiKey = useCallback(async () => {
    await updateSettings({ apiKey: tempApiKey.trim() });
    setSettings((prev) => ({ ...prev, apiKey: tempApiKey.trim() }));
    setEditingKey(false);
    Alert.alert('Saved', 'API Key has been saved.');
  }, [tempApiKey]);

  const handleUpdateGoal = useCallback(async (field, value) => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1) return;
    await updateSettings({ [field]: num });
    setSettings((prev) => ({ ...prev, [field]: num }));
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerContent}><Text style={styles.loadingText}>Loading...</Text></View>
      </SafeAreaView>
    );
  }

  const maxMinutes = Math.max(1, ...dailyData.map((d) => d.minutes));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>

        {/* Streak & Stats */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statEmoji}>🔥</Text>
            <Text style={styles.statNumber}>{progress?.streakDays || 0}</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statEmoji}>⏱</Text>
            <Text style={styles.statNumber}>{Math.round(progress?.totalMinutes || 0)}</Text>
            <Text style={styles.statLabel}>Minutes</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statEmoji}>📚</Text>
            <Text style={styles.statNumber}>{lessons.length}</Text>
            <Text style={styles.statLabel}>Lessons</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statEmoji}>🔄</Text>
            <Text style={styles.statNumber}>{queueStats.total}</Text>
            <Text style={styles.statLabel}>Review Items</Text>
          </View>
        </View>

        {/* Weekly Activity Chart */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>This Week</Text>
          <View style={styles.chartContainer}>
            {dailyData.map((day, idx) => {
              const barHeight = maxMinutes > 0 ? (day.minutes / maxMinutes) * 100 : 0;
              const isToday = idx === dailyData.length - 1;
              return (
                <View key={day.date} style={styles.barColumn}>
                  <Text style={styles.barMinutes}>{day.minutes > 0 ? Math.round(day.minutes) : ''}</Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { height: `${Math.max(barHeight, 2)}%`, backgroundColor: isToday ? '#3B82F6' : '#CBD5E1' }]} />
                  </View>
                  <Text style={[styles.barDayLabel, isToday && styles.barDayLabelToday]}>
                    {new Date(day.date).toLocaleDateString('en', { weekday: 'short' }).slice(0, 2)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Goals */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily Goals</Text>
          <View style={styles.goalRow}>
            <Text style={styles.goalLabel}>Minutes/day</Text>
            <TextInput
              style={styles.goalInput}
              keyboardType="number-pad"
              defaultValue={String(settings.dailyGoalMinutes)}
              onEndEditing={(e) => handleUpdateGoal('dailyGoalMinutes', e.nativeEvent.text)}
            />
          </View>
          <View style={styles.goalRow}>
            <Text style={styles.goalLabel}>Sentences/day</Text>
            <TextInput
              style={styles.goalInput}
              keyboardType="number-pad"
              defaultValue={String(settings.dailyGoalSentences)}
              onEndEditing={(e) => handleUpdateGoal('dailyGoalSentences', e.nativeEvent.text)}
            />
          </View>
        </View>

        {/* API Key */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MiMo API Key</Text>
          {editingKey ? (
            <View style={styles.apiKeyEditRow}>
              <TextInput style={styles.apiKeyInput} value={tempApiKey} onChangeText={setTempApiKey}
                placeholder="Enter your API key" placeholderTextColor="#94A3B8" autoCapitalize="none" autoCorrect={false} />
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveApiKey}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setEditingKey(false); setTempApiKey(settings.apiKey || ''); }}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.apiKeyDisplay} onPress={() => setEditingKey(true)}>
              <Text style={styles.apiKeyText}>{settings.apiKey ? `${settings.apiKey.slice(0, 8)}...${settings.apiKey.slice(-4)}` : 'Not set - tap to add'}</Text>
              <Text style={styles.editHint}>Edit</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.apiKeyHint}>Required for AI transcription. Get yours at mimo.com</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#1E293B', letterSpacing: -0.5 },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 15, color: '#6B7280' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10 },
  statCard: { width: (SCREEN_WIDTH - 42) / 2, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  statEmoji: { fontSize: 28, marginBottom: 4 },
  statNumber: { fontSize: 28, fontWeight: '800', color: '#1E293B' },
  statLabel: { fontSize: 13, color: '#64748B', marginTop: 2 },
  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 12 },
  chartContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 140, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16 },
  barColumn: { alignItems: 'center', flex: 1 },
  barMinutes: { fontSize: 10, color: '#64748B', marginBottom: 4, minHeight: 14 },
  barTrack: { width: 20, height: 100, backgroundColor: '#F1F5F9', borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 4 },
  barDayLabel: { fontSize: 11, color: '#94A3B8', marginTop: 6 },
  barDayLabelToday: { color: '#3B82F6', fontWeight: '700' },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, padding: 14, marginBottom: 8 },
  goalLabel: { fontSize: 15, color: '#334155' },
  goalInput: { width: 60, height: 36, backgroundColor: '#F1F5F9', borderRadius: 8, textAlign: 'center', fontSize: 16, fontWeight: '600', color: '#1E293B' },
  apiKeyEditRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  apiKeyInput: { flex: 1, height: 40, backgroundColor: '#FFFFFF', borderRadius: 8, paddingHorizontal: 12, fontSize: 14, color: '#1E293B', borderWidth: 1, borderColor: '#E2E8F0' },
  saveBtn: { backgroundColor: '#3B82F6', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  saveBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  cancelBtn: { paddingHorizontal: 10, paddingVertical: 10 },
  cancelBtnText: { color: '#64748B', fontSize: 14 },
  apiKeyDisplay: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  apiKeyText: { fontSize: 14, color: '#334155', fontFamily: 'monospace' },
  editHint: { fontSize: 13, color: '#3B82F6', fontWeight: '600' },
  apiKeyHint: { fontSize: 12, color: '#94A3B8', marginTop: 8 },
});
