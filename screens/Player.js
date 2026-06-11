import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Dimensions,
  PanResponder,
  FlatList,
  Animated,
  ActivityIndicator,
  TextInput,
  ScrollView,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { buildDictationItems } from '../lib/ai-coach';
import { addToQueue, removeFromQueue } from '../lib/review-queue';
import { getReviewQueue, saveReviewQueue, logSession, getLessonById, saveLesson } from '../lib/learning-store';
import { estimateLessonDifficulty } from '../lib/difficulty';
import { translateSubtitles, cancelTranslation, resetTranslationCancel } from '../lib/translate';
import { getCachedSubtitles, cacheSubtitles, updateCachedSubtitles } from '../lib/subtitle-cache';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const VIDEO_HEIGHT = SCREEN_WIDTH * 9 / 16; // 16:9 aspect ratio based on width
const SUBTITLE_AREA_HEIGHT = SCREEN_HEIGHT - VIDEO_HEIGHT - 200;
const ITEM_HEIGHT = 72;
const CENTER_OFFSET = (SUBTITLE_AREA_HEIGHT / 2) - (ITEM_HEIGHT / 2);
const SLIDER_PADDING = 16;
const SLIDER_WIDTH = SCREEN_WIDTH - SLIDER_PADDING * 2;
const OFFSET_MIN = -10;
const OFFSET_MAX = 10;
const OFFSET_RANGE = OFFSET_MAX - OFFSET_MIN;

const TED_GRAPHQL = 'https://www.ted.com/graphql';

// ====== 配色方案 ======
const THEMES = {
  ocean: {
    name: '🌊 海洋', bg: '#F0F7FF', videoBg: '#0D1B2A',
    subtitleBg: '#FFFFFF', activeBg: '#DBEAFE', activeBorder: '#3B82F6', highlightBg: 'rgba(59,130,246,0.15)',
    timeText: '#94A3B8', subtitleText: '#475569', subtitleTextActive: '#1E3A5F',
    zhText: '#64748B', zhTextActive: '#3B5998',
    controlBg: 'rgba(13,27,42,0.95)',
    sliderTrack: 'rgba(255,255,255,0.3)', sliderFill: '#FFFFFF',
    tabBar: '#FFFFFF', tabActive: '#3B82F6', tabInactive: '#94A3B8',
    headerBg: '#E8F4FD', headerText: '#5B8FB9',
  },
  forest: {
    name: '🌲 森林', bg: '#F0F9F0', videoBg: '#1A2F1A',
    subtitleBg: '#FFFFFF', activeBg: '#D4EDDA', activeBorder: '#28A745', highlightBg: 'rgba(40,167,69,0.15)',
    timeText: '#8FBC8F', subtitleText: '#4A6741', subtitleTextActive: '#2D5A27',
    zhText: '#6B8E6B', zhTextActive: '#3A7D3A',
    controlBg: 'rgba(26,47,26,0.95)',
    sliderTrack: 'rgba(255,255,255,0.3)', sliderFill: '#FFFFFF',
    tabBar: '#FFFFFF', tabActive: '#28A745', tabInactive: '#8FBC8F',
    headerBg: '#E8F5E8', headerText: '#5B8F5B',
  },
  sunset: {
    name: '🌅 日落', bg: '#FFF8F0', videoBg: '#2D1B0E',
    subtitleBg: '#FFFFFF', activeBg: '#FDE8D0', activeBorder: '#F59E0B', highlightBg: 'rgba(245,158,11,0.15)',
    timeText: '#D4A574', subtitleText: '#6B5B4E', subtitleTextActive: '#5C3D1E',
    zhText: '#B8956B', zhTextActive: '#C4783E',
    controlBg: 'rgba(45,27,14,0.95)',
    sliderTrack: 'rgba(255,255,255,0.3)', sliderFill: '#FFFFFF',
    tabBar: '#FFFFFF', tabActive: '#F59E0B', tabInactive: '#D4A574',
    headerBg: '#FFF0E0', headerText: '#C4783E',
  },
  midnight: {
    name: '🌙 午夜', bg: '#0F0F1A', videoBg: '#000000',
    subtitleBg: '#1A1A2E', activeBg: '#1E2A4A', activeBorder: '#7C3AED', highlightBg: 'rgba(124,58,237,0.2)',
    timeText: '#6B7280', subtitleText: '#9CA3AF', subtitleTextActive: '#E5E7EB',
    zhText: '#6B7280', zhTextActive: '#A78BFA',
    controlBg: 'rgba(0,0,0,0.95)',
    sliderTrack: 'rgba(255,255,255,0.3)', sliderFill: '#FFFFFF',
    tabBar: '#1A1A2E', tabActive: '#7C3AED', tabInactive: '#4B5563',
    headerBg: '#16213E', headerText: '#7F8CAA',
  },
};

function formatTime(seconds) {
  if (!seconds || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// 解析 VTT/SRT 格式字幕
function parseCaptionText(text) {
  const lines = text.split('\n');
  const captions = [];
  let idx = 0;
  let i = 0;

  // 跳过 WEBVTT 头
  while (i < lines.length && !lines[i].includes('-->')) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i];
    if (line.includes('-->')) {
      const timeMatch = line.match(
        /(\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{3})/
      );
      if (timeMatch) {
        const startH = timeMatch[1] ? parseInt(timeMatch[1]) : 0;
        const startM = parseInt(timeMatch[2]);
        const startS = parseInt(timeMatch[3]);
        const startMs = parseInt(timeMatch[4]);
        const startTime = startH * 3600 + startM * 60 + startS + startMs / 1000;

        const endH = timeMatch[5] ? parseInt(timeMatch[5]) : 0;
        const endM = parseInt(timeMatch[6]);
        const endS = parseInt(timeMatch[7]);
        const endMs = parseInt(timeMatch[8]);
        const endTime = endH * 3600 + endM * 60 + endS + endMs / 1000;

        // 收集字幕文本
        i++;
        const textLines = [];
        while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
          textLines.push(lines[i].trim());
          i++;
        }

        if (textLines.length > 0) {
          captions.push({
            id: idx++,
            start: startTime,
            end: endTime,
            text: textLines.join(' '),
            zh: null,
          });
        }
        continue;
      }
    }
    i++;
  }

  return captions;
}

// ====== 字幕组件 ======

const SubtitleItem = React.memo(({ item, isActive, theme, onPress, practiceMode }) => {
  const T = theme;
  return (
    <TouchableOpacity
      style={[
        styles.subtitleItem,
        isActive && { borderLeftColor: T.activeBorder },
      ]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.subtitleContent}>
        {practiceMode === 'listen-only' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false} contentContainerStyle={styles.scrollContent}>
            <Text style={[styles.subtitleTextEn, { color: isActive ? T.subtitleTextActive : T.subtitleText }, isActive && styles.subtitleTextActive]}>
              {'• • •'}
            </Text>
          </ScrollView>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false} contentContainerStyle={styles.scrollContent}>
            <Text style={[styles.subtitleTextEn, { color: isActive ? T.subtitleTextActive : T.subtitleText }, isActive && styles.subtitleTextActive]}>
              {item.text.replace(/\n/g, ' ')}
            </Text>
          </ScrollView>
        )}
        {item.zh && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false} contentContainerStyle={styles.scrollContent}>
            <Text
              style={[
                styles.subtitleTextZh,
                { color: isActive ? T.zhTextActive : T.zhText },
              ]}
            >
              {item.zh.replace(/\n/g, ' ')}
            </Text>
          </ScrollView>
        )}
      </View>
      <Text style={[styles.subtitleTime, { color: T.timeText }]}>
        {formatTime(item.start)}
      </Text>
    </TouchableOpacity>
  );
});

// ====== 主播放器页面 ======
export default function Player({ route }) {
  const { videoId, slug, title, source: videoSource = 'ted', channelName, channelAvatar, asrSubtitles, asrRawText } = route.params || {};

  // 状态
  const [subtitles, setSubtitles] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [videoUrl, setVideoUrl] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [themeKey, setThemeKey] = useState('ocean');
  const [showThemeBar, setShowThemeBar] = useState(false);
  const [showSubtitleSettings, setShowSubtitleSettings] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [lineHeight, setLineHeight] = useState(24);
  const [isDragging, setIsDragging] = useState(false);
  const [seekPreview, setSeekPreview] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [offsetValue, setOffsetValue] = useState(0);
  const [showSubtitleArea, setShowSubtitleArea] = useState(true);
  const [subtitle, setSubtitle] = useState('');
  const [zhSubtitle, setZhSubtitle] = useState('');
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [practiceMode, setPracticeMode] = useState('normal');
  const [dictationItems, setDictationItems] = useState([]);
  const [dictationInputs, setDictationInputs] = useState({});
  const [showDictationResult, setShowDictationResult] = useState(false);
  const [sentenceRepeats, setSentenceRepeats] = useState(0);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [markedHard, setMarkedHard] = useState(new Set());
  const [markedMastered, setMarkedMastered] = useState(new Set());
  const sessionStartRef = useRef(Date.now());

  // Refs
  const flatListRef = useRef(null);
  const programmaticScroll = useRef(false);
  const programmaticTimer = useRef(null);
  const lastScrollTime = useRef(0);
  const isDraggingRef = useRef(false);
  const seekPreviewRef = useRef(null);
  const offsetTimer = useRef(null);
  const offsetDragging = useRef(false);
  const scrollTimeout = useRef(null);
  const snappingRef = useRef(false);
  const scrollYRef = useRef(0);
  const userScrollTimeout = useRef(null);

  // 标记程序滚动
  const markProgrammatic = useCallback(() => {
    programmaticScroll.current = true;
    if (programmaticTimer.current) clearTimeout(programmaticTimer.current);
    programmaticTimer.current = setTimeout(() => {
      programmaticScroll.current = false;
    }, 500);
  }, []);

  // 创建播放器 - 使用空字符串而不是 null
  console.log('[Player] Creating player with videoUrl:', videoUrl);
  const player = useVideoPlayer(videoUrl ? { uri: videoUrl } : '', (p) => {
    p.loop = false;
    console.log('[Player] Player setup callback called');
  });

  // videoUrl 变更时手动 replaceAsync + play
  useEffect(() => {
    if (!player || !videoUrl) {
      console.log('[Player] useEffect skipped - player:', !!player, 'videoUrl:', videoUrl);
      return;
    }

    console.log('[Player] videoUrl changed to:', videoUrl);
    
    const loadVideo = async () => {
      try {
        console.log('[Player] Calling replaceAsync()...');
        await player.replaceAsync({ uri: videoUrl });
        console.log('[Player] replaceAsync() completed, calling play()...');
        player.play();
        console.log('[Player] play() called');
      } catch (e) {
        console.error('[Player] replaceAsync/play failed:', e.message);
        // 尝试用 replace 作为备选
        try {
          console.log('[Player] Trying replace() as fallback...');
          player.replace({ uri: videoUrl });
          player.play();
        } catch (e2) {
          console.error('[Player] replace fallback also failed:', e2.message);
        }
      }
    };

    loadVideo();
  }, [player, videoUrl]);

  // statusChange 监听
  useEffect(() => {
    if (!player) return;
    console.log('[Player] Attaching statusChange listener');

    const sub = player.addListener('statusChange', ({ status }) => {
      console.log('[Player] statusChange:', status);
      if (status === 'readyToPlay') {
        console.log('[Player] readyToPlay → calling play()');
        player.play();
      } else if (status === 'error') {
        console.error('[Player] Player error occurred');
      }
    });

    // 添加 playingChange 监听
    const playingSub = player.addListener('playingChange', ({ isPlaying }) => {
      console.log('[Player] playingChange:', isPlaying);
      setIsPlaying(isPlaying);
    });

    return () => {
      console.log('[Player] Removing listeners');
      sub.remove();
      playingSub.remove();
    };
  }, [player]);

  // 同步 ref
 useEffect(() => { playerRef.current = player; }, [player]);
  useEffect(() => { practiceModeRef.current = practiceMode; }, [practiceMode]);

 const playerRef = useRef(null);
 const durationRef = useRef(0);
 const currentTimeRef = useRef(0);
  const practiceModeRef = useRef('normal');
  const lastTimeUpdateRef = useRef(0);
  const subtitlesRef = useRef([]);
  const currentIndexRef = useRef(0);
  const offsetValueRef = useRef(0);

  // 同步 subtitles 到 ref
  useEffect(() => { subtitlesRef.current = subtitles; }, [subtitles]);

  // 同步 offsetValue 到 ref
  useEffect(() => { offsetValueRef.current = offsetValue; }, [offsetValue]);

  // 二分搜索：找到当前时间对应的字幕索引
  const findSubtitleIndex = useCallback((time, offset) => {
    const adjustedTime = time + (offset || 0);
    const subs = subtitlesRef.current;
    let lo = 0, hi = subs.length - 1, result = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (subs[mid].start <= adjustedTime) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return result;
  }, []);

  const T = THEMES[themeKey];

  // 从 API 获取视频 URL 和字幕
  useEffect(() => {
    let cancelled = false;

    const fetchTedData = async () => {
      try {
        setLoadingData(true);
        setLoadError(null);

        console.log('[Player] Fetching TED video with id:', videoId, 'slug:', slug);

        // Fetch subtitles and video URL in parallel
        console.log('[Player] Starting parallel fetch for subtitles and video URL...');
        const [subResult, videoResult] = await Promise.allSettled([
          // Subtitles
          (async () => {
            console.log('[Player] Fetching subtitles from:', `https://www.ted.com/talks/subtitles/id/${videoId}/lang/en`);
            const res = await fetch(`https://www.ted.com/talks/subtitles/id/${videoId}/lang/en`);
            console.log('[Player] Subtitle HTTP status:', res.status);
            const json = await res.json();
            console.log('[Player] Subtitle API captions count:', json?.captions?.length);
            const captions = json?.captions || [];
            const converted = captions.map((cap, idx) => ({
              id: idx,
              start: cap.startTime / 1000,
              end: (cap.startTime + cap.duration) / 1000,
              text: cap.content,
              zh: null,
            }));
            console.log('[Player] Converted subtitles:', converted.length);
            return converted;
          })(),
          // Video URL
          (async () => {
            console.log('[Player] Fetching video URL via GraphQL...');
            const res = await fetch(TED_GRAPHQL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: `{ video(id: ${videoId}) { id title hlsUrl fallbackUrl } }`,
              }),
            });
            const json = await res.json();
            console.log('[Player] GraphQL response:', JSON.stringify(json).substring(0, 200));
            const videoNode = json?.data?.video;
            return videoNode?.hlsUrl || videoNode?.fallbackUrl || null;
          })(),
        ]);

        if (cancelled) return;

        // 尝试从缓存获取字幕
        const cachedSubtitles = await getCachedSubtitles(videoId, videoSource);
        
        if (cachedSubtitles && cachedSubtitles.length > 0) {
          console.log('[Player] Using cached subtitles:', cachedSubtitles.length);
          setSubtitles(cachedSubtitles);
        } else if (subResult.status === 'fulfilled' && subResult.value.length > 0) {
          console.log('[Player] Setting', subResult.value.length, 'subtitles');
          // 先设置英文字幕，立即显示
          setSubtitles(subResult.value);
          
          // 缓存英文字幕
          await cacheSubtitles(videoId, videoSource, subResult.value);
          
          // 异步翻译，翻译完一条立即更新
          console.log('[Player] Starting background translation...');
          
          translateSubtitles(
            subResult.value,
            // 翻译完一条的回调
            (index, zh) => {
              console.log('[Player] Subtitle translated:', index, zh);
              setSubtitles(prev => {
                const updated = [...prev];
                updated[index] = { ...updated[index], zh };
                return updated;
              });
            },
            // 进度回调（仅日志）
            (current, total) => {
              if (current % 10 === 0 || current === total) {
                console.log(`[Translate] Progress: ${current}/${total}`);
              }
            }
          ).then((translatedSubs) => {
            console.log('[Player] Translation completed');
            // 更新缓存
            updateCachedSubtitles(videoId, videoSource, translatedSubs);
          }).catch((error) => {
            console.error('[Player] Translation failed:', error);
          });
        } else {
          console.error('[Player] Subtitle fetch failed:', subResult.status === 'rejected' ? subResult.reason?.message : 'empty captions');
        }

        if (videoResult.status === 'fulfilled' && videoResult.value) {
          console.log('[Player] Setting video URL:', videoResult.value);
          setVideoUrl(videoResult.value);
        } else {
          console.warn('[Player] Video URL fetch failed:', videoResult.status === 'rejected' ? videoResult.reason?.message : 'no URL');
        }
      } catch (e) {
        if (!cancelled) setLoadError(e.message);
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    };

    const fetchYouTubeData = async () => {
      // YouTube plays via WebView embed — no need to extract video URL
      // Just finish loading immediately
      console.log('[Player] YouTube video — will use WebView embed');
      setLoadingData(false);
    };

    // 如果有 ASR 字幕（从语音转文字过来），直接使用
    if (asrSubtitles && asrSubtitles.length > 0) {
      console.log(`[Player] Using ASR subtitles: ${asrSubtitles.length} segments`);
      setSubtitles(asrSubtitles);
      setLoadingData(false);
    } else if (videoSource === 'youtube') {
      fetchYouTubeData();
    } else {
      fetchTedData();
    }

    return () => { 
      cancelled = true;
      cancelTranslation();
    };
  }, [slug, videoId, videoSource, asrSubtitles]);

  // 偏移量滑动条 PanResponder
  const offsetAnim = useRef(new Animated.Value(0)).current;
  const offsetTrackWidth = useRef(200);
  const offsetTrackAbsX = useRef(0);
  const isOffsetDragging = useRef(false);
  const [offsetDisplayVal, setOffsetDisplayVal] = useState(null);
  const offsetDisplayFrameRef = useRef(null);
  const pendingOffsetDisplayRef = useRef(null);

  const clampOffsetX = useCallback((x) => {
    return Math.max(0, Math.min(x, offsetTrackWidth.current));
  }, []);

  const offsetToX = useCallback((value) => {
    return ((value - OFFSET_MIN) / OFFSET_RANGE) * offsetTrackWidth.current;
  }, []);

  // 同步 offsetAnim 到 offsetValue（非拖拽时）
  useEffect(() => {
    if (!isOffsetDragging.current && offsetTrackWidth.current > 0) {
      offsetAnim.setValue(offsetToX(offsetValue));
    }
  }, [offsetValue, offsetToX, offsetAnim]);

  const xToOffset = useCallback((x) => {
    const pct = clampOffsetX(x) / offsetTrackWidth.current;
    const raw = OFFSET_MIN + pct * OFFSET_RANGE;
    return Math.max(OFFSET_MIN, Math.min(OFFSET_MAX, Math.round(raw * 10) / 10));
  }, [clampOffsetX]);

  const scheduleOffsetDisplay = useCallback((value) => {
    pendingOffsetDisplayRef.current = value;
    if (offsetDisplayFrameRef.current !== null) return;
    offsetDisplayFrameRef.current = requestAnimationFrame(() => {
      offsetDisplayFrameRef.current = null;
      const v = pendingOffsetDisplayRef.current;
      if (v !== null) setOffsetDisplayVal(v);
    });
  }, []);

  const offsetStartX = useRef(0);
  const offsetStartValue = useRef(0);

  const onOffsetGrant = useCallback((e) => {
    isOffsetDragging.current = true;
    offsetTrackAbsX.current = e.nativeEvent.pageX - (e.nativeEvent.locationX || 0);
    offsetStartX.current = e.nativeEvent.pageX;
    offsetStartValue.current = offsetValueRef.current;
    // 不移动滑块，从当前值开始拖拽
    scheduleOffsetDisplay(offsetStartValue.current);
  }, [scheduleOffsetDisplay]);

  const onOffsetMove = useCallback((e) => {
    if (!isOffsetDragging.current) return;
    const dx = e.nativeEvent.pageX - offsetStartX.current;
    const startX = offsetToX(offsetStartValue.current);
    const x = clampOffsetX(startX + dx);
    const v = xToOffset(x);
    offsetAnim.setValue(x);
    scheduleOffsetDisplay(v);
  }, [offsetToX, clampOffsetX, xToOffset, offsetAnim, scheduleOffsetDisplay]);

  const onOffsetRelease = useCallback(() => {
    isOffsetDragging.current = false;
    const v = pendingOffsetDisplayRef.current;
    if (v !== null) setOffsetValue(v);
    setOffsetDisplayVal(null);
  }, []);

  const offsetPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: onOffsetGrant,
      onPanResponderMove: onOffsetMove,
      onPanResponderRelease: onOffsetRelease,
      onPanResponderTerminate: onOffsetRelease,
    })
  ).current;

  // 进度条 PanResponder
  const trackWidth = useRef(SLIDER_WIDTH);
  const trackAbsX = useRef(0);
  const animVal = useRef(new Animated.Value(0)).current;
  const seekToRef = useRef(null);

  const clampX = useCallback((x) => {
    return Math.max(0, Math.min(x, trackWidth.current));
  }, []);

  const timeToX = useCallback((time) => {
    if (!durationRef.current) return 0;
    return (time / durationRef.current) * trackWidth.current;
  }, []);

  const xToTime = useCallback((x) => {
    if (!durationRef.current) return 0;
    return (clampX(x) / trackWidth.current) * durationRef.current;
  }, [clampX]);

  const updateVisual = useCallback((x) => {
    const clampedX = clampX(x);
    animVal.setValue(clampedX);
    return clampedX;
  }, [clampX, animVal]);

  const scheduleSeekPreview = useCallback((time) => {
    seekPreviewRef.current = time;
    if (!isDraggingRef.current) return;
    requestAnimationFrame(() => {
      const t = seekPreviewRef.current;
      if (t !== null) setSeekPreview(t);
    });
  }, []);

  const onGrant = useCallback((e) => {
    isDraggingRef.current = true;
    setIsDragging(true);
    trackAbsX.current = e.nativeEvent.pageX - (e.nativeEvent.locationX || 0);
    const x = e.nativeEvent.pageX - trackAbsX.current;
    const t = xToTime(x);
    updateVisual(x);
    scheduleSeekPreview(t);
  }, [xToTime, updateVisual, scheduleSeekPreview]);

  const onMove = useCallback((e) => {
    if (!isDraggingRef.current) return;
    const x = e.nativeEvent.pageX - trackAbsX.current;
    const t = xToTime(x);
    updateVisual(x);
    scheduleSeekPreview(t);
  }, [xToTime, updateVisual, scheduleSeekPreview]);

  const onRelease = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
    const t = seekPreviewRef.current;
    if (t !== null) {
      playerRef.current?.seekBy(t - currentTimeRef.current);
      seekToRef.current = null;
    }
    setSeekPreview(null);
  }, []);

  const progressPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: onGrant,
      onPanResponderMove: onMove,
      onPanResponderRelease: onRelease,
      onPanResponderTerminate: onRelease,
    })
  ).current;

  // 时间更新：轮询播放器 currentTime（比 timeUpdate 事件更可靠）
  useEffect(() => {
    if (!player) return;

    const timer = setInterval(() => {
      if (isDraggingRef.current) return;

      const ct = player.currentTime;
      const dur = player.duration;
      if (ct == null || dur == null) return;

      currentTimeRef.current = ct;
      durationRef.current = dur;
      setCurrentTime(ct);
      setDuration(dur);

      const x = timeToX(ct);
      animVal.setValue(x);

      // 更新字幕索引（应用偏移量）
     const idx = findSubtitleIndex(ct, offsetValueRef.current);
     if (idx !== currentIndexRef.current) {
        // Sentence mode: auto-pause when moving to next subtitle
       if (practiceModeRef.current === 'sentence' && player.playing) {
          const prevSub = subtitlesRef.current[currentIndexRef.current];
          if (prevSub && ct >= prevSub.end - 0.1) {
            player.pause();
            // Auto-replay after 1s pause
            setTimeout(() => {
              if (practiceModeRef.current === 'sentence') {
                player.currentTime = prevSub.start;
                player.play();
              }
            }, 1000);
          }
        }
        currentIndexRef.current = idx;
        setCurrentIndex(idx);
      }
    }, 200);

    return () => clearInterval(timer);
  }, [player, timeToX, findSubtitleIndex]);

  // 字幕点击跳转
  const onSubtitlePress = useCallback((item) => {
    if (!player) return;
    const idx = item.id;
    // 滚动到点击的字幕
    const scrollY = idx < 2 ? 0 : (idx - 2) * ITEM_HEIGHT;
    markProgrammatic();
    flatListRef.current?.scrollToOffset({ offset: scrollY, animated: true });
    setCurrentIndex(idx);
    currentIndexRef.current = idx;
    // 减去偏移量，确保播放的是点击的那条字幕
    const offset = offsetValueRef.current || 0;
    player.currentTime = item.start - offset;
    player.play();
    setIsUserScrolling(false);
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
  }, [player, markProgrammatic]);

  // 用户手动滚动处理
  const onScrollBeginDrag = useCallback(() => {
    if (programmaticScroll.current) return;
    setIsUserScrolling(true);
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    if (snappingRef.current) return;
    if (player?.playing) player.pause();
  }, [player]);

  const onScroll = useCallback((e) => {
    scrollYRef.current = e.nativeEvent.contentOffset.y;
  }, []);

  const snapToNearest = useCallback(() => {
    if (snappingRef.current) return;
    snappingRef.current = true;

    // 磁吸：基于高亮条的视觉位置，找到最近的字幕索引
    const curIdx = currentIndexRef.current;
    const barVisualY = curIdx < 2
      ? 8 + curIdx * ITEM_HEIGHT
      : 8 + 2 * ITEM_HEIGHT;
    const snapIndex = Math.round((barVisualY + scrollYRef.current - 8) / ITEM_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(subtitles.length - 1, snapIndex));

    // 滚动到吸附位置
    markProgrammatic();
    if (clampedIndex < 2) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    } else {
      // 使用 scrollToOffset 确保滚动距离是 ITEM_HEIGHT 的整数倍
      const offset = Math.max(0, (clampedIndex - 2) * ITEM_HEIGHT);
      flatListRef.current?.scrollToOffset({ offset, animated: true });
    }

    // 更新高亮索引，恢复自动滚动
    setCurrentIndex(clampedIndex);
    currentIndexRef.current = clampedIndex;
    
    // 让播放器从磁吸到的字幕开始播放
    if (player && subtitles[clampedIndex]) {
      // 减去偏移量，确保播放的是滑到的那条字幕
      const offset = offsetValueRef.current || 0;
      player.currentTime = subtitles[clampedIndex].start - offset;
      player.play();
    }
    
    setTimeout(() => {
      snappingRef.current = false;
      setIsUserScrolling(false);
    }, 300);
  }, [subtitles, markProgrammatic]);

  const onScrollEndDrag = useCallback(() => {
    if (programmaticScroll.current) return;
    scrollTimeout.current = setTimeout(() => {
      snapToNearest();
    }, 100);
    // 安全兜底：若 momentumScrollEnd 未触发，3秒后恢复自动滚动
    if (userScrollTimeout.current) clearTimeout(userScrollTimeout.current);
    userScrollTimeout.current = setTimeout(() => {
      setIsUserScrolling(false);
    }, 3000);
  }, [snapToNearest]);

  const onMomentumScrollBegin = useCallback(() => {
    if (programmaticScroll.current) return;
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
  }, []);

  const onMomentumScrollEnd = useCallback(() => {
    if (programmaticScroll.current) return;
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    snapToNearest();
  }, [snapToNearest]);

  // 字幕切换时自动滚动：前两条高亮块移动，第三条起列表滚动
  useEffect(() => {
    if (isUserScrolling || snappingRef.current || subtitles.length === 0) return;
    const idx = currentIndexRef.current;
    if (idx < 2) return; // 前两条不需要滚动列表

    markProgrammatic();
    // 使用 scrollToOffset 确保滚动距离是 ITEM_HEIGHT 的整数倍
    const offset = Math.max(0, (idx - 2) * ITEM_HEIGHT);
    flatListRef.current?.scrollToOffset({ offset, animated: false });
  }, [currentIndex, isUserScrolling, markProgrammatic, subtitles.length]);

  // Load review queue on mount
  useEffect(() => {
    (async () => {
      try { const q = await getReviewQueue(); setReviewQueue(q || []); } catch {}
    })();
  }, []);

  // Generate dictation items when practice mode changes to 'dictation'
  useEffect(() => {
    if (practiceMode === 'dictation' && subtitles.length > 0) {
      const items = buildDictationItems(subtitles, 2, 2);
      setDictationItems(items);
      setDictationInputs({});
      setShowDictationResult(false);
    }
  }, [practiceMode, subtitles]);

  // Session logging on unmount
  useEffect(() => {
    return () => {
      const durationMin = (Date.now() - sessionStartRef.current) / 60000;
      if (durationMin > 0.5) {
        logSession(Math.round(durationMin), subtitles.length).catch(() => {});
      }
    };
  }, [subtitles.length]);

  // Mark sentence as hard (add to review queue)
  const markAsHard = useCallback(async (subtitleItem) => {
    const lessonId = route.params?.lessonId || 'unknown';
    const updatedQueue = addToQueue(reviewQueue, subtitleItem.id, lessonId);
    setReviewQueue(updatedQueue);
    await saveReviewQueue(updatedQueue);
    setMarkedHard((prev) => new Set([...prev, subtitleItem.id]));
  }, [reviewQueue, route.params]);

  // Mark sentence as mastered (remove from review queue)
  const markAsMastered = useCallback(async (subtitleItem) => {
    const lessonId = route.params?.lessonId || 'unknown';
    const updatedQueue = removeFromQueue(reviewQueue, subtitleItem.id, lessonId);
    setReviewQueue(updatedQueue);
    await saveReviewQueue(updatedQueue);
    setMarkedMastered((prev) => new Set([...prev, subtitleItem.id]));
  }, [reviewQueue, route.params]);

  // Check dictation answer
  const checkDictation = useCallback(() => {
    setShowDictationResult(true);
  }, []);

  // 加载中
  if (loadingData) {
    return (
      <View style={[styles.container, { backgroundColor: T.bg, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={T.tabActive} />
        <Text style={{ marginTop: 16, color: T.subtitleText }}>加载中...</Text>
      </View>
    );
  }

  // 错误
  if (loadError) {
    return (
      <View style={[styles.container, { backgroundColor: T.bg, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#EF4444', fontSize: 16 }}>加载失败</Text>
        <Text style={{ color: T.subtitleText, marginTop: 8 }}>{loadError}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: T.bg }]}>
      {/* 视频区域 */}
      <View style={[styles.videoContainer, { backgroundColor: T.videoBg }]}>
        {videoSource === 'youtube' ? (
          <WebView
            style={styles.video}
            source={{ uri: `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0` }}
            allowsFullscreenVideo
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
          />
        ) : (
          <>
            <VideoView
              style={styles.video}
              player={player}
              allowsFullscreen
              allowsPictureInPicture
            />
          </>
        )}
      </View>

      {/* 控制栏 — 仅 TED 视频显示（YouTube 使用内置控件） */}
      {videoSource !== 'youtube' && (
      <View style={[styles.controlBar, { backgroundColor: T.controlBg }]}>
        {/* 偏移量控制 */}
        <View style={styles.offsetContainer}>
          <Text style={[styles.offsetLabel, { color: T.timeText }]}>字幕偏移</Text>
          <View
            style={[styles.offsetTrack, { backgroundColor: T.sliderTrack }]}
            {...offsetPanResponder.panHandlers}
            onLayout={(e) => {
              offsetTrackWidth.current = e.nativeEvent.layout.width;
              // 首次测量时同步滑块位置
              if (!isOffsetDragging.current) {
                offsetAnim.setValue(offsetToX(offsetValueRef.current));
              }
            }}
          >
            <Animated.View
              style={[
                styles.offsetThumb,
                {
                  backgroundColor: T.sliderFill,
                  transform: [{ translateX: offsetAnim }],
                },
              ]}
            />
          </View>
          <Text style={[styles.offsetValue, { color: T.timeText }]}>
            {offsetDisplayVal !== null ? `${offsetDisplayVal}s` : `${offsetValue}s`}
          </Text>
        </View>

        {/* 功能按钮 */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.funcButton, showSubtitleArea && { backgroundColor: T.activeBg }]}
            onPress={() => setShowSubtitleArea(!showSubtitleArea)}
          >
            <Text style={[styles.funcButtonText, { color: T.subtitleText }]}>📝 字幕</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.funcButton}
            onPress={() => setShowThemeBar(!showThemeBar)}
          >
            <Text style={[styles.funcButtonText, { color: T.subtitleText }]}>🎨 主题</Text>
          </TouchableOpacity>
        </View>
      </View>
      )}

      {/* Practice Mode Selector */}
      <View style={[styles.practiceBar, { backgroundColor: T.tabBar }]}>
        {[
          { key: 'normal', label: 'Normal', icon: 'book-outline' },
          { key: 'listen-only', label: 'Listen', icon: 'headset-outline' },
          { key: 'sentence', label: 'Sentence', icon: 'repeat-outline' },
          { key: 'dictation', label: 'Dictation', icon: 'create-outline' },
        ].map((mode) => (
          <TouchableOpacity
            key={mode.key}
            style={[styles.practiceBtn, practiceMode === mode.key && { backgroundColor: T.activeBg }]}
            onPress={() => setPracticeMode(mode.key)}
          >
            <Ionicons name={mode.icon} size={18} color={practiceMode === mode.key ? T.subtitleTextActive : T.timeText} />
            <Text style={[styles.practiceBtnLabel, { color: practiceMode === mode.key ? T.subtitleTextActive : T.timeText }]}>
              {mode.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Mark Hard / Mastered floating bar */}
      {practiceMode !== 'normal' && subtitles.length > 0 && (
        <View style={[styles.markBar, { backgroundColor: T.controlBg }]}>
          <TouchableOpacity style={[styles.markBtn, { backgroundColor: markedHard.has(subtitles[currentIndex]?.id) ? '#EF4444' : 'rgba(239,68,68,0.2)' }]}
            onPress={() => subtitles[currentIndex] && markAsHard(subtitles[currentIndex])}>
            <Text style={[styles.markBtnText, { color: markedHard.has(subtitles[currentIndex]?.id) ? '#FFF' : '#EF4444' }]}>Hard</Text>
          </TouchableOpacity>
          <Text style={[styles.markLabel, { color: T.timeText }]}>
            {currentIndex + 1} / {subtitles.length}
          </Text>
          <TouchableOpacity style={[styles.markBtn, { backgroundColor: markedMastered.has(subtitles[currentIndex]?.id) ? '#10B981' : 'rgba(16,185,129,0.2)' }]}
            onPress={() => subtitles[currentIndex] && markAsMastered(subtitles[currentIndex])}>
            <Text style={[styles.markBtnText, { color: markedMastered.has(subtitles[currentIndex]?.id) ? '#FFF' : '#10B981' }]}>Mastered</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 主题选择 */}
      {showThemeBar && (
        <View style={[styles.themeBar, { backgroundColor: T.tabBar }]}>
          {Object.entries(THEMES).map(([key, theme]) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.themeButton,
                themeKey === key && { backgroundColor: theme.activeBg },
              ]}
              onPress={() => setThemeKey(key)}
            >
              <Text style={styles.themeButtonText}>{theme.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* 字幕区域 */}
      {showSubtitleArea && (
        <View style={[styles.subtitleArea, { backgroundColor: T.subtitleBg }]}>
          {/* 高亮指示条：前两条跟随字幕移动，第三条起固定 */}
          <View
            style={[
              styles.highlightBar,
              { backgroundColor: T.highlightBg, borderColor: T.activeBorder },
              { transform: [{ translateY: (currentIndex < 2 ? currentIndex : 2) * ITEM_HEIGHT }] },
            ]}
            pointerEvents="none"
          />
          <FlatList
            ref={flatListRef}
            data={subtitles}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <SubtitleItem
                item={item}
                isActive={item.id === subtitles[currentIndex]?.id}
                theme={T}
                onPress={onSubtitlePress}
                practiceMode={practiceMode}
              />
            )}
            getItemLayout={(_, index) => ({
              length: ITEM_HEIGHT,
              offset: ITEM_HEIGHT * index,
              index,
            })}
            onScrollToIndexFailed={({ index }) => {
              flatListRef.current?.scrollToOffset({ offset: index * ITEM_HEIGHT, animated: false });
            }}
            onScrollBeginDrag={onScrollBeginDrag}
            onScrollEndDrag={onScrollEndDrag}
            onMomentumScrollBegin={onMomentumScrollBegin}
            onMomentumScrollEnd={onMomentumScrollEnd}
            onScroll={onScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={<View style={{ height: 8 }} />}
            ListFooterComponent={<View style={{ height: 400 }} />}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  videoContainer: {
    width: '100%',
    height: VIDEO_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  controlBar: {
    padding: 12,
  },
  offsetContainer: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  offsetLabel: {
    fontSize: 12,
    marginRight: 8,
  },
  offsetTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    justifyContent: 'center',
  },
  offsetThumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 2,
    marginLeft: -7,
    top: -5,
  },
  offsetValue: {
    fontSize: 12,
    marginLeft: 8,
    minWidth: 30,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  funcButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  funcButtonText: {
    fontSize: 13,
  },
  themeBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  themeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  themeButtonText: {
    fontSize: 13,
  },
  subtitleArea: {
    flex: 1,
    marginTop: 8,
    position: 'relative',
  },
  highlightBar: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    height: ITEM_HEIGHT,
    borderRadius: 8,
    borderWidth: 1,
    zIndex: 1,
  },
  subtitleItem: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    minHeight: ITEM_HEIGHT,
    zIndex: 2,
    backgroundColor: 'transparent',
  },
  subtitleContent: {
    flex: 1,
    marginRight: 12,
  },
  scrollContent: {
    minWidth: '100%',
  },
  subtitleTextEn: {
    fontSize: 16,
    lineHeight: 24,
  },
  subtitleTextZh: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  subtitleTextActive: {
    fontWeight: '600',
  },
  subtitleTime: {
    fontSize: 12,
    marginTop: 2,
  },
  practiceBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  practiceBtn: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
  },
  practiceBtnLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  markBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  markBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  markBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  markLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
