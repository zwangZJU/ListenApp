import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, TextInput, ScrollView, Alert, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getProgress, getLast7Days, getSettings, updateSettings, getLessons, getReviewQueue } from '../lib/learning-store';
import { getQueueStats } from '../lib/review-queue';
import { useTheme, THEMES, THEME_KEYS } from '../lib/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BAR_MAX_WIDTH = SCREEN_WIDTH - 80;

export default function ProfileScreen() {
  const { theme, themeKey, setThemeKey } = useTheme();
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
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
        <View style={styles.centerContent}><Text style={[styles.loadingText, { color: theme.textMuted }]}>Loading...</Text></View>
      </SafeAreaView>
    );
  }

  const maxMinutes = Math.max(1, ...dailyData.map((d) => d.minutes));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Profile</Text>
        </View>

        {/* Streak & Stats */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: theme.card }]}>
            <Text style={styles.statEmoji}>🔥</Text>
            <Text style={[styles.statNumber, { color: theme.cardText }]}>{progress?.streakDays || 0}</Text>
            <Text style={[styles.statLabel, { color: theme.cardSubText }]}>Day Streak</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.card }]}>
            <Text style={styles.statEmoji}>⏱</Text>
            <Text style={[styles.statNumber, { color: theme.cardText }]}>{Math.round(progress?.totalMinutes || 0)}</Text>
            <Text style={[styles.statLabel, { color: theme.cardSubText }]}>Minutes</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.card }]}>
            <Text style={styles.statEmoji}>📚</Text>
            <Text style={[styles.statNumber, { color: theme.cardText }]}>{lessons.length}</Text>
            <Text style={[styles.statLabel, { color: theme.cardSubText }]}>Lessons</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.card }]}>
            <Text style={styles.statEmoji}>🔄</Text>
            <Text style={[styles.statNumber, { color: theme.cardText }]}>{queueStats.total}</Text>
            <Text style={[styles.statLabel, { color: theme.cardSubText }]}>Review Items</Text>
          </View>
        </View>

        {/* Weekly Activity Chart */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>This Week</Text>
          <View style={[styles.chartContainer, { backgroundColor: theme.card }]}>
            {dailyData.map((day, idx) => {
              const barHeight = maxMinutes > 0 ? (day.minutes / maxMinutes) * 100 : 0;
              const isToday = idx === dailyData.length - 1;
              return (
                <View key={day.date} style={styles.barColumn}>
                  <Text style={[styles.barMinutes, { color: theme.cardSubText }]}>{day.minutes > 0 ? Math.round(day.minutes) : ''}</Text>
                  <View style={[styles.barTrack, { backgroundColor: theme.inputBg }]}>
                    <View style={[styles.barFill, { height: `${Math.max(barHeight, 2)}%`, backgroundColor: isToday ? theme.barToday : theme.barOther }]} />
                  </View>
                  <Text style={[styles.barDayLabel, isToday && { color: theme.accent, fontWeight: '700' }]}>
                    {new Date(day.date).toLocaleDateString('en', { weekday: 'short' }).slice(0, 2)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Goals */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Daily Goals</Text>
          <View style={[styles.goalRow, { backgroundColor: theme.card }]}>
            <Text style={[styles.goalLabel, { color: theme.cardText }]}>Minutes/day</Text>
            <TextInput
              style={[styles.goalInput, { backgroundColor: theme.inputBg, color: theme.inputText }]}
              keyboardType="number-pad"
              defaultValue={String(settings.dailyGoalMinutes)}
              onEndEditing={(e) => handleUpdateGoal('dailyGoalMinutes', e.nativeEvent.text)}
            />
          </View>
          <View style={[styles.goalRow, { backgroundColor: theme.card }]}>
            <Text style={[styles.goalLabel, { color: theme.cardText }]}>Sentences/day</Text>
            <TextInput
              style={[styles.goalInput, { backgroundColor: theme.inputBg, color: theme.inputText }]}
              keyboardType="number-pad"
              defaultValue={String(settings.dailyGoalSentences)}
              onEndEditing={(e) => handleUpdateGoal('dailyGoalSentences', e.nativeEvent.text)}
            />
          </View>
        </View>

        {/* Theme */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Theme</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.themeScroll}>
            {THEME_KEYS.map((key) => {
              const t = THEMES[key];
              const isActive = themeKey === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.themeCard, { backgroundColor: t.bg, borderColor: isActive ? t.accent : 'rgba(255,255,255,0.1)' }, isActive && styles.themeCardActive]}
                  onPress={() => setThemeKey(key)}
                  activeOpacity={0.7}
                >
                  <View style={styles.themePreview}>
                    <View style={[styles.themeSwatch, { backgroundColor: t.accent }]} />
                    <View style={[styles.themeSwatchSmall, { backgroundColor: t.text }]} />
                  </View>
                  <Text style={[styles.themeName, { color: t.text }]}>{t.name}</Text>
                  {isActive && <View style={[styles.themeCheck, { backgroundColor: t.accent }]}><Text style={styles.themeCheckText}>✓</Text></View>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* API Key */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>MiMo API Key</Text>
          {editingKey ? (
            <View style={styles.apiKeyEditRow}>
              <TextInput style={[styles.apiKeyInput, { backgroundColor: theme.card, color: theme.cardText, borderColor: theme.border }]}
                value={tempApiKey} onChangeText={setTempApiKey}
                placeholder="Enter your API key" placeholderTextColor={theme.textDim} autoCapitalize="none" autoCorrect={false} />
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.accent }]} onPress={handleSaveApiKey}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setEditingKey(false); setTempApiKey(settings.apiKey || ''); }}>
                <Text style={[styles.cancelBtnText, { color: theme.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[styles.apiKeyDisplay, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => setEditingKey(true)}>
              <Text style={[styles.apiKeyText, { color: theme.cardText }]}>{settings.apiKey ? `${settings.apiKey.slice(0, 8)}...${settings.apiKey.slice(-4)}` : 'Not set - tap to add'}</Text>
              <Text style={[styles.editHint, { color: theme.accent }]}>Edit</Text>
            </TouchableOpacity>
          )}
          <Text style={[styles.apiKeyHint, { color: theme.textDim }]}>Required for AI transcription. Get yours at mimo.com</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  headerTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 15 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10 },
  statCard: { width: (SCREEN_WIDTH - 42) / 2, borderRadius: 12, padding: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  statEmoji: { fontSize: 28, marginBottom: 4 },
  statNumber: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 13, marginTop: 2 },
  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  chartContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 140, borderRadius: 12, padding: 16 },
  barColumn: { alignItems: 'center', flex: 1 },
  barMinutes: { fontSize: 10, marginBottom: 4, minHeight: 14 },
  barTrack: { width: 20, height: 100, borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 4 },
  barDayLabel: { fontSize: 11, color: '#94A3B8', marginTop: 6 },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 10, padding: 14, marginBottom: 8 },
  goalLabel: { fontSize: 15 },
  goalInput: { width: 60, height: 36, borderRadius: 8, textAlign: 'center', fontSize: 16, fontWeight: '600' },
  themeScroll: { gap: 12 },
  themeCard: { width: 110, height: 100, borderRadius: 14, padding: 12, borderWidth: 2, justifyContent: 'space-between' },
  themeCardActive: { borderWidth: 2 },
  themePreview: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  themeSwatch: { width: 20, height: 20, borderRadius: 10 },
  themeSwatchSmall: { width: 14, height: 14, borderRadius: 7, opacity: 0.6 },
  themeName: { fontSize: 13, fontWeight: '700' },
  themeCheck: { position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  themeCheckText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  apiKeyEditRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  apiKeyInput: { flex: 1, height: 40, borderRadius: 8, paddingHorizontal: 12, fontSize: 14, borderWidth: 1 },
  saveBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  saveBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  cancelBtn: { paddingHorizontal: 10, paddingVertical: 10 },
  cancelBtnText: { fontSize: 14 },
  apiKeyDisplay: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 10, padding: 14, borderWidth: 1 },
  apiKeyText: { fontSize: 14, fontFamily: 'monospace' },
  editHint: { fontSize: 13, fontWeight: '600' },
  apiKeyHint: { fontSize: 12, marginTop: 8 },
});
