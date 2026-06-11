import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Dimensions,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { transcribeVideo, STAGE } from '../lib/mimo-transcribe';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MARGIN = 10;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_MARGIN * 3) / 2;
const CARD_HEIGHT = 200;

const TED_GRAPHQL = 'https://www.ted.com/graphql';


const VIDEOS_QUERY = `{
  videos(first: 100) {
    edges {
      node {
        id
        title
        slug
        description
        duration
        presenterDisplayName
        primaryImageSet {
          url
        }
      }
    }
  }
}`;

function formatDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ⚠️ 替换为你的 MiMo API Key
const MIMO_API_KEY = 'YOUR_MIMO_API_KEY';

// 进度阶段中文映射
const STAGE_TEXT = {
  [STAGE.EXTRACTING_URL]: '正在提取音频链接...',
  [STAGE.DOWNLOADING]: '正在下载音频...',
  [STAGE.CONVERTING]: '正在转码...',
  [STAGE.ENCODING]: '正在编码...',
  [STAGE.TRANSCRIBING]: '正在语音识别...',
  [STAGE.DONE]: '转录完成！',
};

/**
 * 检测输入是否是视频链接
 */
function detectVideoUrl(text) {
  const t = text.trim();
  if (/^https?:\/\//i.test(t)) {
    // YouTube
    if (/youtube\.com\/watch|youtu\.be\//.test(t)) {
      return { platform: 'youtube', url: t };
    }
    // TED
    if (/ted\.com\/talks/.test(t)) {
      return { platform: 'ted', url: t };
    }
    // Generic video URL
    return { platform: 'unknown', url: t };
  }
  return null;
}

const SOURCE_TABS = [
  { key: 'ted', label: '🎬 TED' },
  { key: 'youtube', label: '▶️ YouTube' },
];

export default function VideoLibrary({ navigation }) {
  const [source, setSource] = useState('ted');
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeProgress, setTranscribeProgress] = useState('');

  // TED: 缓存已加载的视频
  const tedVideosRef = useRef([]);
  const ytVideosRef = useRef([]);
  const ytSearchCacheRef = useRef({});

  // 切换源时加载数据
  useEffect(() => {
    // Clear videos to prevent stale content from the other source flashing
    setVideos([]);

    if (source === 'ted') {
      if (tedVideosRef.current.length > 0) {
        setVideos(tedVideosRef.current);
        setLoading(false);
      } else {
        fetchTedVideos();
      }
    } else if (source === 'youtube') {
      if (!searchText.trim() && ytVideosRef.current.length > 0) {
        setVideos(ytVideosRef.current);
        setLoading(false);
      } else if (searchText.trim()) {
        fetchYouTubeSearch(searchText.trim());
      } else {
        fetchYouTubeTrending();
      }
    }
  }, [source]);

  const fetchTedVideos = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(TED_GRAPHQL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: VIDEOS_QUERY }),
      });
      const json = await response.json();
      const edges = json?.data?.videos?.edges || [];
      const videoList = edges.map((edge) => ({
        id: edge.node.id,
        title: edge.node.title,
        slug: edge.node.slug,
        description: edge.node.description,
        duration: edge.node.duration,
        presenter: edge.node.presenterDisplayName,
        thumbnail: edge.node.primaryImageSet?.[0]?.url || null,
        source: 'ted',
      }));
      tedVideosRef.current = videoList;
      setVideos(videoList);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchYouTubeTrending = async () => {
    try {
      setLoading(true);
      setError(null);

      // YouTube trending page requires login, use search for popular videos instead
      const searchUrl = 'https://www.youtube.com/results?search_query=trending+today+popular';
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      const html = await response.text();

      // Extract from ytInitialData
      const match = html.match(/var ytInitialData = ({.*?});/);
      if (!match) throw new Error('无法解析热门视频');

      const data = JSON.parse(match[1]);
      const contents =
        data.contents?.twoColumnSearchResultsRenderer?.primaryContents
          ?.sectionListRenderer?.contents || [];

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
          const duration =
            parts.length === 3
              ? parts[0] * 3600 + parts[1] * 60 + parts[2]
              : parts.length === 2
                ? parts[0] * 60 + parts[1]
                : 0;

          results.push({
            id: vid,
            title,
            presenter: author,
            duration,
            thumbnail: thumb || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
            source: 'youtube',
            videoId: vid,
          });
        }
      }

      if (results.length === 0) throw new Error('未找到热门视频');
      ytVideosRef.current = results;
      setVideos(results);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchYouTubeSearch = async (query) => {
    // Check cache first
    if (ytSearchCacheRef.current[query]) {
      setVideos(ytSearchCacheRef.current[query]);
      return;
    }

    try {
      setSearchLoading(true);
      setError(null);

      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      const html = await response.text();

      // Extract video data from ytInitialData
      const match = html.match(/var ytInitialData = ({.*?});/);
      if (!match) throw new Error('无法解析搜索结果');

      const data = JSON.parse(match[1]);
      const contents =
        data.contents?.twoColumnSearchResultsRenderer?.primaryContents
          ?.sectionListRenderer?.contents || [];

      const results = [];
      for (const section of contents) {
        const items = section.itemSectionRenderer?.contents || [];
        for (const item of items) {
          const video = item.videoRenderer;
          if (!video) continue;

          const vid = video.videoId;
          const title = video.title?.runs?.[0]?.text || '';
          const author = video.ownerText?.runs?.[0]?.text || '';
          const thumb =
            video.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';
          const durationText = video.lengthText?.simpleText || '0:00';

          // Parse duration: "19:19" or "1:02:30" -> seconds
          const parts = durationText.split(':').map(Number);
          const duration =
            parts.length === 3
              ? parts[0] * 3600 + parts[1] * 60 + parts[2]
              : parts.length === 2
                ? parts[0] * 60 + parts[1]
                : 0;

          results.push({
            id: vid,
            title,
            presenter: author,
            duration,
            thumbnail:
              thumb || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
            source: 'youtube',
            videoId: vid,
          });
        }
      }

      ytSearchCacheRef.current[query] = results;
      setVideos(results);
    } catch (e) {
      setError(e.message);
    } finally {
      setSearchLoading(false);
    }
  };

  // 搜索逻辑
  const searchTimerRef = useRef(null);

  // ====== 视频链接转录功能 ======
  const handleTranscribe = useCallback(async (videoUrl) => {
    try {
      setTranscribing(true);
      setTranscribeProgress(STAGE_TEXT[STAGE.EXTRACTING_URL]);
      setError(null);

      console.log('[App] Starting transcription for:', videoUrl);

      const result = await transcribeVideo({
        url: videoUrl,
        apiKey: MIMO_API_KEY,
        language: 'auto',
        onProgress: (stage, detail) => {
          const text = STAGE_TEXT[stage] || stage;
          setTranscribeProgress(detail ? `${text} ${detail}` : text);
        },
      });

      console.log(`[App] Transcription done: ${result.subtitles?.length || 0} segments`);

      // Navigate to Player with transcription results
      navigation.navigate('Player', {
        videoId: extractVideoIdFromUrl(videoUrl),
        title: result.title || '转录视频',
        source: 'youtube',
        asrSubtitles: result.subtitles,
        asrRawText: result.rawText,
      });
    } catch (e) {
      console.error('[App] Transcribe error:', e);
      setError(`转录失败: ${e.message}`);
    } finally {
      setTranscribing(false);
      setTranscribeProgress('');
    }
  }, [navigation]);

  // Extract video ID from URL for navigation
  function extractVideoIdFromUrl(url) {
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?#]+)/);
    if (ytMatch) return ytMatch[1];
    const tedMatch = url.match(/ted\.com\/talks\/([^/?#]+)/);
    if (tedMatch) return tedMatch[1];
    return url;
  }

  const onSearchTextChange = useCallback(
    (text) => {
      setSearchText(text);

      // 如果是视频链接，不触发搜索
      if (detectVideoUrl(text)) {
        return;
      }

      if (source === 'ted') {
        // TED 搜索是本地过滤，不需要请求
        return;
      }

      // YouTube 搜索防抖
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (!text.trim()) {
        // 恢复热门列表
        if (ytVideosRef.current.length > 0) {
          setVideos(ytVideosRef.current);
        } else {
          fetchYouTubeTrending();
        }
        return;
      }
      searchTimerRef.current = setTimeout(() => {
        fetchYouTubeSearch(text.trim());
      }, 500);
    },
    [source]
  );

  const filteredVideos = useMemo(() => {
    if (source === 'youtube') {
      // YouTube 已通过 API 搜索
      return videos;
    }
    // TED: 本地过滤
    if (!searchText.trim()) return videos;
    const q = searchText.toLowerCase();
    return videos.filter(
      (v) =>
        v.title?.toLowerCase().includes(q) ||
        v.presenter?.toLowerCase().includes(q) ||
        v.slug?.toLowerCase().includes(q)
    );
  }, [videos, searchText, source]);

  const onPressVideo = useCallback(
    (item) => {
      if (item.source === 'youtube') {
        navigation.navigate('Player', {
          videoId: item.videoId,
          title: item.title,
          source: 'youtube',
        });
      } else {
        navigation.navigate('Player', {
          slug: item.slug,
          videoId: item.id,
          title: item.title,
          source: 'ted',
        });
      }
    },
    [navigation]
  );

  const renderCard = useCallback(
    ({ item }) => (
      <TouchableOpacity
        style={styles.card}
        onPress={() => onPressVideo(item)}
        activeOpacity={0.85}
      >
        <View style={styles.thumbnailContainer}>
          {item.thumbnail ? (
            <Image
              source={{ uri: item.thumbnail }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
              <Text style={styles.placeholderIcon}>▶</Text>
            </View>
          )}
          {item.duration > 0 && (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>
                {formatDuration(item.duration)}
              </Text>
            </View>
          )}
          {item.source === 'youtube' && (
            <View style={styles.sourceBadge}>
              <Text style={styles.sourceBadgeText}>YT</Text>
            </View>
          )}
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.cardPresenter} numberOfLines={1}>
            {item.presenter}
          </Text>
          {item.source === 'youtube' && item.viewCount > 0 && (
            <Text style={styles.cardMeta}>
              {(item.viewCount / 1000000).toFixed(1)}M views
              {item.publishedText ? ` · ${item.publishedText}` : ''}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    ),
    [onPressVideo]
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>Video Library</Text>

      {/* 视频源切换标签 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sourceTabs}
      >
        {SOURCE_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.sourceTab,
              source === tab.key && styles.sourceTabActive,
            ]}
            onPress={() => {
              setSource(tab.key);
              setSearchText('');
              setError(null);
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.sourceTabText,
                source === tab.key && styles.sourceTabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.searchContainer}>
        <View style={styles.searchIconContainer}>
          <View style={styles.searchIconCircle} />
          <View style={styles.searchIconHandle} />
        </View>
        <TextInput
          style={styles.searchInput}
          placeholder={source === 'ted' ? '搜索 TED 视频或粘贴链接' : '搜索 YouTube 或粘贴视频链接'}
          placeholderTextColor="rgba(255,255,255,0.5)"
          value={searchText}
          onChangeText={onSearchTextChange}
          returnKeyType="search"
        />
        {searchText.length > 0 && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => onSearchTextChange('')}
          >
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 链接转录按钮 */}
      {detectVideoUrl(searchText) && !transcribing && (
        <TouchableOpacity
          style={styles.transcribeBtn}
          onPress={() => handleTranscribe(detectVideoUrl(searchText).url)}
          activeOpacity={0.8}
        >
          <Text style={styles.transcribeBtnText}>🎙️ AI 语音转文字</Text>
        </TouchableOpacity>
      )}

      {/* 转录进度 */}
      {transcribing && (
        <View style={styles.transcribeProgress}>
          <ActivityIndicator size="small" color="#10B981" />
          <Text style={styles.transcribeProgressText}>
            {transcribeProgress || '处理中...'}
          </Text>
        </View>
      )}
      {searchText.trim() ? (
        <Text style={styles.resultCount}>
          找到 {filteredVideos.length} 个结果
          {searchLoading ? ' (搜索中...)' : ''}
        </Text>
      ) : null}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderHeader()}
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#E62B1E" />
          <Text style={styles.loadingText}>
            {source === 'ted' ? '加载 TED 视频中...' : '加载 YouTube 视频中...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderHeader()}
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>加载失败</Text>
          <Text style={styles.errorDetail}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => {
              if (source === 'ted') fetchTedVideos();
              else if (searchText.trim()) fetchYouTubeSearch(searchText.trim());
              else fetchYouTubeTrending();
            }}
          >
            <Text style={styles.retryText}>重试</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {renderHeader()}
      <FlatList
        data={filteredVideos}
        renderItem={renderCard}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !searchLoading && filteredVideos.length === 0 ? (
            <View style={styles.centerContent}>
              <Text style={styles.emptyText}>
                {searchText.trim() ? '没有找到相关视频' : '暂无视频'}
              </Text>
            </View>
          ) : searchLoading && filteredVideos.length === 0 ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color="#E62B1E" />
              <Text style={styles.emptyText}>搜索中...</Text>
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  // ---- 视频源标签 ----
  sourceTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  sourceTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  sourceTabActive: {
    backgroundColor: '#E62B1E',
  },
  sourceTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  sourceTabTextActive: {
    color: '#FFFFFF',
  },
  // ---- 搜索框 ----
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    paddingHorizontal: 14,
    height: 40,
  },
  searchIconContainer: {
    width: 18,
    height: 18,
    marginRight: 8,
    position: 'relative',
  },
  searchIconCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.8,
    borderColor: 'rgba(255,255,255,0.5)',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  searchIconHandle: {
    width: 7,
    height: 1.8,
    backgroundColor: 'rgba(255,255,255,0.5)',
    position: 'absolute',
    bottom: 2,
    right: 0,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    paddingVertical: 0,
    ...Platform.select({
      android: { paddingVertical: 0 },
    }),
  },
  clearBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  clearBtnText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 12,
  },
  resultCount: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 10,
  },
  // ---- 转录按钮 ----
  transcribeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 10,
  },
  transcribeBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  transcribeProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    gap: 8,
  },
  transcribeProgressText: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '600',
  },
  row: {
    justifyContent: 'space-between',
    paddingHorizontal: CARD_MARGIN,
  },
  listContent: {
    paddingBottom: 20,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: CARD_MARGIN,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  thumbnailContainer: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 0.56,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    backgroundColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: {
    fontSize: 30,
    color: '#FFFFFF',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  sourceBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(255,0,0,0.85)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  sourceBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  cardInfo: {
    padding: 10,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    lineHeight: 20,
  },
  cardPresenter: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  cardMeta: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#EF4444',
  },
  errorDetail: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#E62B1E',
    borderRadius: 8,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.4)',
  },
});
