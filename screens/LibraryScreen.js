import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet, Text, View, FlatList, TouchableOpacity, TextInput,
  Image, ActivityIndicator, Dimensions, Platform, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { transcribeVideo, STAGE } from '../lib/mimo-transcribe';
import { estimateLessonDifficulty } from '../lib/difficulty';
import { postprocessSubtitles } from '../lib/postprocess';
import { getLessons, saveLesson, getSettings } from '../lib/learning-store';
import { useTheme } from '../lib/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MARGIN = 10;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_MARGIN * 3) / 2;

const TED_GRAPHQL = 'https://www.ted.com/graphql';
const VIDEOS_QUERY = `{
  videos(first: 50) {
    edges {
      node {
        id title slug description duration presenterDisplayName
        primaryImageSet { url }
      }
    }
  }
}`;

const STAGE_TEXT = {
  [STAGE.EXTRACTING_URL]: 'Extracting audio link...',
  [STAGE.DOWNLOADING]: 'Downloading audio...',
  [STAGE.CONVERTING]: 'Converting...',
  [STAGE.ENCODING]: 'Encoding...',
  [STAGE.TRANSCRIBING]: 'Transcribing speech...',
  [STAGE.DONE]: 'Done!',
};

function formatDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function detectVideoUrl(text) {
  const t = text.trim();
  if (/^https?:\/\//i.test(t)) {
    if (/youtube\.com\/watch|youtu\.be\//.test(t)) return { platform: 'youtube', url: t };
    if (/ted\.com\/talks/.test(t)) return { platform: 'ted', url: t };
    return { platform: 'unknown', url: t };
  }
  return null;
}

function extractVideoIdFromUrl(url) {
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?#]+)/);
  if (ytMatch) return ytMatch[1];
  const tedMatch = url.match(/ted\.com\/talks\/([^/?#]+)/);
  if (tedMatch) return tedMatch[1];
  return url;
}

const DIFFICULTY_COLORS = ['', '#10B981', '#3B82F6', '#F59E0B', '#F97316', '#EF4444'];

const SOURCE_TABS = [
  { key: 'ted', label: 'TED' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'history', label: 'My Lessons' },
];

export default function LibraryScreen({ navigation }) {
  const { theme } = useTheme();
  const [source, setSource] = useState('ted');
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeProgress, setTranscribeProgress] = useState('');
  const [lessons, setLessons] = useState([]);
  const [apiKey, setApiKey] = useState('');

  const tedVideosRef = useRef([]);
  const ytVideosRef = useRef([]);
  const ytSearchCacheRef = useRef({});
  const searchTimerRef = useRef(null);

  useEffect(() => {
    (async () => {
      const settings = await getSettings();
      setApiKey(settings.apiKey || '');
      const saved = await getLessons();
      setLessons(saved);
    })();
  }, []);

  useEffect(() => {
    setVideos([]);
    if (source === 'ted') {
      if (tedVideosRef.current.length > 0) { setVideos(tedVideosRef.current); setLoading(false); }
      else fetchTedVideos();
    } else if (source === 'youtube') {
      if (!searchText.trim() && ytVideosRef.current.length > 0) { setVideos(ytVideosRef.current); setLoading(false); }
      else if (searchText.trim()) fetchYouTubeSearch(searchText.trim());
      else fetchYouTubeTrending();
    } else {
      setLoading(false);
    }
  }, [source]);

  const fetchTedVideos = async () => {
    try {
      setLoading(true); setError(null);
      const response = await fetch(TED_GRAPHQL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: VIDEOS_QUERY }),
      });
      const json = await response.json();
      const edges = json?.data?.videos?.edges || [];
      const videoList = edges.map((edge) => ({
        id: edge.node.id, title: edge.node.title, slug: edge.node.slug,
        description: edge.node.description, duration: edge.node.duration,
        presenter: edge.node.presenterDisplayName,
        thumbnail: edge.node.primaryImageSet?.[0]?.url || null,
        source: 'ted',
      }));
      tedVideosRef.current = videoList;
      setVideos(videoList);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const fetchYouTubeTrending = async () => {
    try {
      setLoading(true); setError(null);
      const searchUrl = 'https://www.youtube.com/results?search_query=trending+today+popular';
      const response = await fetch(searchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      const html = await response.text();
      const match = html.match(/var ytInitialData = ({.*?});/);
      if (!match) throw new Error('Cannot parse trending videos');
      const data = JSON.parse(match[1]);
      const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
      const results = [];
      for (const section of contents) {
        const items = section.itemSectionRenderer?.contents || [];
        for (const item of items) {
          const video = item.videoRenderer;
          if (!video) continue;
          const vid = video.videoId;
          const title = video.title?.runs?.[0]?.text || '';
          const author = video.ownerText?.runs?.[0]?.text || '';
          const thumb = video.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';
          const durationText = video.lengthText?.simpleText || '0:00';
          const parts = durationText.split(':').map(Number);
          const duration = parts.length === 3 ? parts[0]*3600+parts[1]*60+parts[2] : parts.length === 2 ? parts[0]*60+parts[1] : 0;
          results.push({ id: vid, title, presenter: author, duration, thumbnail: thumb || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`, source: 'youtube', videoId: vid });
        }
      }
      if (results.length === 0) throw new Error('No trending videos found');
      ytVideosRef.current = results;
      setVideos(results);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const fetchYouTubeSearch = async (query) => {
    if (ytSearchCacheRef.current[query]) { setVideos(ytSearchCacheRef.current[query]); return; }
    try {
      setSearchLoading(true); setError(null);
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
      const html = await response.text();
      const match = html.match(/var ytInitialData = ({.*?});/);
      if (!match) throw new Error('Cannot parse search results');
      const data = JSON.parse(match[1]);
      const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
      const results = [];
      for (const section of contents) {
        const items = section.itemSectionRenderer?.contents || [];
        for (const item of items) {
          const video = item.videoRenderer;
          if (!video) continue;
          const vid = video.videoId;
          const title = video.title?.runs?.[0]?.text || '';
          const author = video.ownerText?.runs?.[0]?.text || '';
          const thumb = video.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';
          const durationText = video.lengthText?.simpleText || '0:00';
          const parts = durationText.split(':').map(Number);
          const duration = parts.length === 3 ? parts[0]*3600+parts[1]*60+parts[2] : parts.length === 2 ? parts[0]*60+parts[1] : 0;
          results.push({ id: vid, title, presenter: author, duration, thumbnail: thumb || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`, source: 'youtube', videoId: vid });
        }
      }
      ytSearchCacheRef.current[query] = results;
      setVideos(results);
    } catch (e) { setError(e.message); }
    finally { setSearchLoading(false); }
  };

  const handleTranscribe = useCallback(async (videoUrl) => {
    const key = apiKey;
    if (!key) {
      Alert.alert('API Key Required', 'Please set your MiMo API Key in Settings (Profile tab) first.');
      return;
    }
    try {
      setTranscribing(true);
      setTranscribeProgress(STAGE_TEXT[STAGE.EXTRACTING_URL]);
      setError(null);
      const result = await transcribeVideo({
        url: videoUrl, apiKey: key, language: 'auto',
        onProgress: (stage, detail) => {
          const text = STAGE_TEXT[stage] || stage;
          setTranscribeProgress(detail ? `${text} ${detail}` : text);
        },
      });
      const processed = postprocessSubtitles(result.subtitles, result.duration);
      const { overall, label } = estimateLessonDifficulty(processed);
      const lessonId = `lesson_${Date.now()}`;
      const lesson = {
        id: lessonId,
        sourceType: 'transcribed',
        title: result.title || 'Transcribed Video',
        duration: result.duration,
        language: 'auto',
        difficulty: overall,
        difficultyLabel: label,
        subtitles: processed,
        videoId: extractVideoIdFromUrl(videoUrl),
        videoSource: 'youtube',
        rawText: result.rawText,
        srt: result.srt,
      };
      await saveLesson(lesson);
      setLessons((prev) => [lesson, ...prev]);
      navigation.navigate('Player', {
        lessonId, videoId: lesson.videoId, title: lesson.title,
        source: 'youtube', asrSubtitles: processed, asrRawText: result.rawText,
        difficulty: overall, difficultyLabel: label,
      });
    } catch (e) {
      setError(`Transcription failed: ${e.message}`);
    } finally {
      setTranscribing(false);
      setTranscribeProgress('');
    }
  }, [navigation, apiKey]);

  const onSearchTextChange = useCallback((text) => {
    setSearchText(text);
    if (detectVideoUrl(text)) return;
    if (source === 'ted') return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!text.trim()) {
      if (ytVideosRef.current.length > 0) setVideos(ytVideosRef.current);
      else fetchYouTubeTrending();
      return;
    }
    searchTimerRef.current = setTimeout(() => fetchYouTubeSearch(text.trim()), 500);
  }, [source]);

  const filteredVideos = useMemo(() => {
    if (source === 'youtube') return videos;
    if (source === 'history') return [];
    if (!searchText.trim()) return videos;
    const q = searchText.toLowerCase();
    return videos.filter((v) => v.title?.toLowerCase().includes(q) || v.presenter?.toLowerCase().includes(q));
  }, [videos, searchText, source]);

  const onPressVideo = useCallback((item) => {
    const existingLesson = lessons.find((l) => l.videoId === item.videoId || l.videoId === item.id);
    if (existingLesson) {
      navigation.navigate('Player', {
        lessonId: existingLesson.id, videoId: item.videoId || item.id,
        title: existingLesson.title || item.title, source: item.source,
        asrSubtitles: existingLesson.subtitles, asrRawText: existingLesson.rawText,
        difficulty: existingLesson.difficulty, difficultyLabel: existingLesson.difficultyLabel,
      });
    } else {
      if (item.source === 'youtube') {
        navigation.navigate('Player', { videoId: item.videoId, title: item.title, source: 'youtube' });
      } else {
        navigation.navigate('Player', { slug: item.slug, videoId: item.id, title: item.title, source: 'ted' });
      }
    }
  }, [navigation, lessons]);

  const renderLessonCard = useCallback(({ item }) => (
    <TouchableOpacity style={styles.lessonCard} onPress={() => {
      navigation.navigate('Player', {
        lessonId: item.id, videoId: item.videoId, title: item.title,
        source: item.videoSource || 'youtube', asrSubtitles: item.subtitles,
        asrRawText: item.rawText, difficulty: item.difficulty, difficultyLabel: item.difficultyLabel,
      });
    }} activeOpacity={0.85}>
      <View style={styles.lessonCardHeader}>
        <Text style={styles.lessonCardTitle} numberOfLines={2}>{item.title}</Text>
        <View style={[styles.diffBadge, { backgroundColor: DIFFICULTY_COLORS[item.difficulty] || '#94A3B8' }]}>
          <Text style={styles.diffBadgeText}>{item.difficultyLabel || 'N/A'}</Text>
        </View>
      </View>
      <View style={styles.lessonCardMeta}>
        <Text style={styles.metaText}>{formatDuration(item.duration)}</Text>
        <Text style={styles.metaText}>{item.subtitles?.length || 0} sentences</Text>
      </View>
    </TouchableOpacity>
  ), [navigation]);

  const renderVideoCard = useCallback(({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => onPressVideo(item)} activeOpacity={0.85}>
      <View style={styles.thumbnailContainer}>
        {item.thumbnail ? (
          <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} resizeMode="cover" />
        ) : (
          <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}><Text style={styles.placeholderIcon}>▶</Text></View>
        )}
        {item.duration > 0 && (
          <View style={styles.durationBadge}><Text style={styles.durationText}>{formatDuration(item.duration)}</Text></View>
        )}
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.cardPresenter} numberOfLines={1}>{item.presenter}</Text>
      </View>
    </TouchableOpacity>
  ), [onPressVideo]);

  const renderHeader = () => (
    <View style={[styles.header, { backgroundColor: theme.headerBg }]}>
      {source !== 'history' && (
        <View style={[styles.searchContainer, { backgroundColor: theme.searchBg }]}>
          <TextInput style={[styles.searchInput, { color: theme.text }]}
            placeholder={source === 'ted' ? 'Search TED or paste link' : 'Search YouTube or paste link'}
            placeholderTextColor={theme.textMuted} value={searchText} onChangeText={onSearchTextChange} returnKeyType="search" />
          {searchText.length > 0 && (
            <TouchableOpacity style={styles.clearBtn} onPress={() => onSearchTextChange('')}>
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sourceTabs}>
        {SOURCE_TABS.map((tab) => (
          <TouchableOpacity key={tab.key} style={[styles.sourceTab, { backgroundColor: source === tab.key ? theme.pillActiveBg : theme.pillBg }]}
            onPress={() => { setSource(tab.key); setSearchText(''); setError(null); }} activeOpacity={0.7}>
            <Text style={[styles.sourceTabText, { color: source === tab.key ? theme.text : theme.textMuted }]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {detectVideoUrl(searchText) && !transcribing && (
        <TouchableOpacity style={styles.transcribeBtn} onPress={() => handleTranscribe(detectVideoUrl(searchText).url)} activeOpacity={0.8}>
          <Text style={styles.transcribeBtnText}>🎙️ Transcribe with AI</Text>
        </TouchableOpacity>
      )}
      {transcribing && (
        <View style={styles.transcribeProgress}>
          <ActivityIndicator size="small" color="#10B981" />
          <Text style={styles.transcribeProgressText}>{transcribeProgress || 'Processing...'}</Text>
        </View>
      )}
    </View>
  );

  if (source === 'history') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
        {renderHeader()}
        {lessons.length === 0 ? (
          <View style={styles.centerContent}>
            <Text style={styles.emptyIcon}>📚</Text>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No lessons yet</Text>
            <Text style={[styles.emptySubtext, { color: theme.textDim }]}>Paste a video link or browse to start learning</Text>
          </View>
        ) : (
          <FlatList data={lessons} renderItem={renderLessonCard} keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} />
        )}
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
        {renderHeader()}
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
        {renderHeader()}
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>Load failed</Text>
          <Text style={[styles.errorDetail, { color: theme.textMuted }]}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => {
            if (source === 'ted') fetchTedVideos();
            else if (searchText.trim()) fetchYouTubeSearch(searchText.trim());
            else fetchYouTubeTrending();
          }}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
      {renderHeader()}
      <FlatList data={filteredVideos} renderItem={renderVideoCard} keyExtractor={(item) => String(item.id)}
        numColumns={2} columnWrapperStyle={styles.row} contentContainerStyle={styles.listContent}
        ListEmptyComponent={!searchLoading ? (
          <View style={styles.centerContent}><Text style={[styles.emptyText, { color: theme.textMuted }]}>{searchText.trim() ? 'No results' : 'No videos'}</Text></View>
        ) : null}
        showsVerticalScrollIndicator={false} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  sourceTabs: { flexDirection: 'row', gap: 8, marginTop: 12 },
  sourceTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  sourceTabText: { fontSize: 14, fontWeight: '600' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 14, height: 40 },
  searchInput: { flex: 1, fontSize: 15 },
  clearBtn: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  clearBtnText: { fontSize: 10, color: 'rgba(255,255,255,0.7)' },
  transcribeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#10B981', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20, marginTop: 10 },
  transcribeBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  transcribeProgress: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10, gap: 8 },
  transcribeProgressText: { color: '#10B981', fontSize: 14, fontWeight: '600' },
  row: { justifyContent: 'space-between', paddingHorizontal: CARD_MARGIN },
  listContent: { paddingTop: 8, paddingBottom: 20 },
  card: { width: CARD_WIDTH, backgroundColor: '#FFFFFF', borderRadius: 10, marginBottom: CARD_MARGIN, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  thumbnailContainer: { width: CARD_WIDTH, height: CARD_WIDTH * 0.56, position: 'relative' },
  thumbnail: { width: '100%', height: '100%' },
  thumbnailPlaceholder: { backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' },
  placeholderIcon: { fontSize: 30, color: '#FFFFFF' },
  durationBadge: { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  durationText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  cardInfo: { padding: 10 },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#1F2937', lineHeight: 18 },
  cardPresenter: { fontSize: 12, color: '#6B7280', marginTop: 3 },
  lessonCard: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 16, marginHorizontal: 16, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  lessonCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  lessonCardTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1F2937', marginRight: 8 },
  diffBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  diffBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  lessonCardMeta: { flexDirection: 'row', gap: 16, marginTop: 8 },
  metaText: { fontSize: 12, color: '#6B7280' },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  loadingText: { marginTop: 12, fontSize: 15, color: '#6B7280' },
  errorText: { fontSize: 18, fontWeight: '600', color: '#EF4444' },
  errorDetail: { fontSize: 13, color: '#6B7280', marginTop: 8, textAlign: 'center', paddingHorizontal: 40 },
  retryBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#3B82F6', borderRadius: 8 },
  retryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#6B7280', fontWeight: '500' },
  emptySubtext: { fontSize: 13, color: '#94A3B8', marginTop: 4 },
});
