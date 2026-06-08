import { StatusBar } from 'expo-status-bar';
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Dimensions,
  Pressable,
  PanResponder,
  FlatList,
  Animated,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { SafeAreaView } from 'react-native-safe-area-context';
import subtitleData from './assets/data/subtitles_clip.json';

// 支持两种格式：带元数据的 {videoOffset, subtitles} 或纯数组
const subtitles = Array.isArray(subtitleData) ? subtitleData : subtitleData.subtitles;
const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const VIDEO_HEIGHT = SCREEN_HEIGHT * 0.35;
const SUBTITLE_AREA_HEIGHT = SCREEN_HEIGHT - VIDEO_HEIGHT - 200; // 字幕区域高度
// 实际行高：paddingVertical(10*2) + marginVertical(3*2) + 内容
const ITEM_HEIGHT = 72; // 精确高度：与样式中 height: 72 一致
const CENTER_OFFSET = (SUBTITLE_AREA_HEIGHT / 2) - (ITEM_HEIGHT / 2); // 居中偏移
const SLIDER_PADDING = 16;
const SLIDER_WIDTH = SCREEN_WIDTH - SLIDER_PADDING * 2;
const OFFSET_MIN = -10;
const OFFSET_MAX = 10;
const OFFSET_RANGE = OFFSET_MAX - OFFSET_MIN;

// ====== 配色方案 ======
const THEMES = {
  ocean: {
    name: '🌊 海洋', bg: '#F0F7FF', videoBg: '#0D1B2A',
    subtitleBg: '#FFFFFF', activeBg: '#DBEAFE', activeBorder: '#3B82F6',
    timeText: '#94A3B8', subtitleText: '#475569', subtitleTextActive: '#1E3A5F',
    zhText: '#64748B', zhTextActive: '#3B5998',
    controlBg: 'rgba(13,27,42,0.95)',
    sliderTrack: 'rgba(255,255,255,0.3)', sliderFill: '#FFFFFF',
    tabBar: '#FFFFFF', tabActive: '#3B82F6', tabInactive: '#94A3B8',
    headerBg: '#E8F4FD', headerText: '#5B8FB9',
  },
  forest: {
    name: '🌲 森林', bg: '#F0F9F0', videoBg: '#1A2F1A',
    subtitleBg: '#FFFFFF', activeBg: '#D4EDDA', activeBorder: '#28A745',
    timeText: '#8FBC8F', subtitleText: '#4A6741', subtitleTextActive: '#2D5A27',
    zhText: '#6B8E6B', zhTextActive: '#3A7D3A',
    controlBg: 'rgba(26,47,26,0.95)',
    sliderTrack: 'rgba(255,255,255,0.3)', sliderFill: '#FFFFFF',
    tabBar: '#FFFFFF', tabActive: '#28A745', tabInactive: '#8FBC8F',
    headerBg: '#E8F5E8', headerText: '#5B8F5B',
  },
  sunset: {
    name: '🌅 日落', bg: '#FFF8F0', videoBg: '#2D1B0E',
    subtitleBg: '#FFFFFF', activeBg: '#FDE8D0', activeBorder: '#F59E0B',
    timeText: '#D4A574', subtitleText: '#6B5B4E', subtitleTextActive: '#5C3D1E',
    zhText: '#B8956B', zhTextActive: '#C4783E',
    controlBg: 'rgba(45,27,14,0.95)',
    sliderTrack: 'rgba(255,255,255,0.3)', sliderFill: '#FFFFFF',
    tabBar: '#FFFFFF', tabActive: '#F59E0B', tabInactive: '#D4A574',
    headerBg: '#FFF0E0', headerText: '#C4783E',
  },
  midnight: {
    name: '🌙 午夜', bg: '#0F0F1A', videoBg: '#000000',
    subtitleBg: '#1A1A2E', activeBg: '#1E2A4A', activeBorder: '#7C3AED',
    timeText: '#6B7280', subtitleText: '#9CA3AF', subtitleTextActive: '#E5E7EB',
    zhText: '#6B7280', zhTextActive: '#A78BFA',
    controlBg: 'rgba(0,0,0,0.95)',
    sliderTrack: 'rgba(255,255,255,0.3)', sliderFill: '#FFFFFF',
    tabBar: '#1A1A2E', tabActive: '#7C3AED', tabInactive: '#4B5563',
    headerBg: '#16213E', headerText: '#7F8CAA',
  },
};

export default function App() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [themeKey, setThemeKey] = useState('ocean');
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const scrollTimeout = useRef(null);
  const rafRef = useRef(null);
  const scrollYRef = useRef(0);
  const snapTimerRef = useRef(null);
  const snappingRef = useRef(false);
  const programmaticScroll = useRef(false);
  const programmaticTimer = useRef(null);
  
  // 滑块状态
  const sliderAnim = useRef(new Animated.Value(0)).current;
  const sliderLayoutX = useRef(SLIDER_PADDING);
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);

  // 拖拽时用 RAF 更新时间显示（代替 setTimeout 80ms 节流）
  const dragTimeRafRef = useRef(null);
  const pendingDragValue = useRef(0);
  useEffect(() => {
    const id = sliderAnim.addListener(({ value }) => {
      pendingDragValue.current = value;
      if (isDraggingRef.current && !dragTimeRafRef.current) {
        dragTimeRafRef.current = requestAnimationFrame(() => {
          dragTimeRafRef.current = null;
          const dur = durationRef.current;
          setDragTime(dur > 0 ? (pendingDragValue.current / SLIDER_WIDTH) * dur : 0);
        });
      }
    });
    return () => {
      sliderAnim.removeListener(id);
      if (dragTimeRafRef.current) cancelAnimationFrame(dragTimeRafRef.current);
    };
  }, []);

  const getSliderX = (pageX) => {
    return Math.max(0, Math.min(pageX - sliderLayoutX.current, SLIDER_WIDTH));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        isDraggingRef.current = true;
        setIsDragging(true);
        const x = getSliderX(e.nativeEvent.pageX);
        sliderAnim.setValue(x);
        const dur = durationRef.current;
        setDragTime(dur > 0 ? (x / SLIDER_WIDTH) * dur : 0);
      },
      onPanResponderMove: (e) => {
        const x = getSliderX(e.nativeEvent.pageX);
        sliderAnim.setValue(x);
        // 不 setState，由 listener 节流更新时间
      },
      onPanResponderRelease: (e) => {
        const x = getSliderX(e.nativeEvent.pageX);
        const dur = durationRef.current;
        const time = dur > 0 ? (x / SLIDER_WIDTH) * dur : 0;
        sliderAnim.setValue(x);
        if (playerRef.current) {
          playerRef.current.currentTime = time;
        }
        isDraggingRef.current = false;
        setIsDragging(false);
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        setIsDragging(false);
      },
    })
  ).current;

  // 用 ref 存最新值
  const playerRef = useRef(null);
  const durationRef = useRef(0);
  const currentTimeRef = useRef(0); // 用于降低 currentTime setState 频率
  const lastTimeUpdateRef = useRef(0); // 上次更新 currentTime 的时间戳

  // 二分搜索：找到当前时间对应的字幕索引
  const findSubtitleIndex = useCallback((time) => {
    let lo = 0, hi = subtitles.length - 1, result = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (subtitles[mid].start <= time) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return result;
  }, []);

  const T = THEMES[themeKey];

  // 标记程序滚动（500ms 后自动清除）
  const markProgrammatic = useCallback(() => {
    programmaticScroll.current = true;
    if (programmaticTimer.current) clearTimeout(programmaticTimer.current);
    programmaticTimer.current = setTimeout(() => {
      programmaticScroll.current = false;
    }, 500);
  }, []);

  const player = useVideoPlayer(require('./assets/listen_assets/ted_full.mp4'), (p) => {
    p.loop = false;
    p.play();
  });

  // 同步 ref
  useEffect(() => { playerRef.current = player; }, [player]);
  useEffect(() => { durationRef.current = duration; }, [duration]);

  // 偏移量滑动条 PanResponder
  const offsetAnim = useRef(new Animated.Value(100)).current;
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

  const xToOffset = useCallback((x) => {
    const pct = clampOffsetX(x) / offsetTrackWidth.current;
    const raw = OFFSET_MIN + pct * OFFSET_RANGE;
    return Math.max(OFFSET_MIN, Math.min(OFFSET_MAX, Math.round(raw * 10) / 10));
  }, [clampOffsetX]);

  const updateOffsetVisual = useCallback((x) => {
    const clampedX = clampOffsetX(x);
    offsetAnim.setValue(clampedX);
    return clampedX;
  }, [clampOffsetX, offsetAnim]);

  const scheduleOffsetDisplay = useCallback((value) => {
    pendingOffsetDisplayRef.current = value;
    if (offsetDisplayFrameRef.current !== null) return;
    offsetDisplayFrameRef.current = requestAnimationFrame(() => {
      offsetDisplayFrameRef.current = null;
      setOffsetDisplayVal(pendingOffsetDisplayRef.current);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (offsetDisplayFrameRef.current !== null) {
        cancelAnimationFrame(offsetDisplayFrameRef.current);
      }
    };
  }, []);

  const offsetPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        isOffsetDragging.current = true;
        offsetTrackAbsX.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
        const relX = updateOffsetVisual(e.nativeEvent.locationX);
        setOffsetDisplayVal(xToOffset(relX));
      },
      onPanResponderMove: (e) => {
        const relX = updateOffsetVisual(e.nativeEvent.pageX - offsetTrackAbsX.current);
        scheduleOffsetDisplay(xToOffset(relX));
        // 不 setState，由 listener 节流更新文字
      },
      onPanResponderRelease: (e) => {
        const relX = updateOffsetVisual(e.nativeEvent.pageX - offsetTrackAbsX.current);
        setSubtitleOffset(xToOffset(relX));
        isOffsetDragging.current = false;
        setOffsetDisplayVal(null);
      },
      onPanResponderTerminate: () => {
        isOffsetDragging.current = false;
        setOffsetDisplayVal(null);
      },
    })
  ).current;

  // 同步播放进度
  useEffect(() => {
    let running = true;
    let prevTime = -1;
    let prevPlaying = -1;
    let prevDur = -1;
    let prevIdx = -1;

    const tick = () => {
      if (!running || !player) return;
      const curTime = player.currentTime;
      const dur = player.duration;
      const playing = player.playing ? 1 : 0;

      // 拖拽中跳过 slider 和 time 的更新，避免冲突
      if (!isDraggingRef.current) {
        if (curTime !== prevTime) {
          prevTime = curTime;
          if (dur > 0) {
            sliderAnim.setValue((curTime / dur) * SLIDER_WIDTH);
          }
          // 降低 currentTime setState 频率：每 200ms 更新一次
          const now = performance.now();
          if (now - lastTimeUpdateRef.current >= 200) {
            lastTimeUpdateRef.current = now;
            setCurrentTime(curTime);
          }
        }
      }

      if (dur !== prevDur && dur > 0) {
        prevDur = dur;
        setDuration(dur);
      }
      if (playing !== prevPlaying) {
        prevPlaying = playing;
        setIsPlaying(!!playing);
      }

      // 二分搜索找当前字幕（替代线性遍历）
      const pos = curTime - subtitleOffset;
      const idx = findSubtitleIndex(pos);
      if (idx !== prevIdx) {
        prevIdx = idx;
        setCurrentIndex(idx);
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [player, subtitleOffset, findSubtitleIndex]);

  // subtitleOffset 变化时同步滑块位置
  useEffect(() => {
    if (!isOffsetDragging.current) {
      offsetAnim.setValue(offsetToX(subtitleOffset));
    }
  }, [offsetToX, offsetAnim, subtitleOffset]);

  // 字幕切换时自动滚动（独立于 raf 循环）
  useEffect(() => {
    if (isUserScrolling || snappingRef.current) return;
    const scrollY = currentIndex < 2 ? 0 : (currentIndex - 2) * ITEM_HEIGHT;
    markProgrammatic();
    flatListRef.current?.scrollToOffset({ offset: scrollY, animated: true });
  }, [currentIndex, isUserScrolling]);


  const onSubtitlePress = useCallback((item) => {
    if (!player) return;
    // 点击的字幕滑入高亮区
    const idx = item.id;
    const scrollY = idx < 2 ? 0 : (idx - 2) * ITEM_HEIGHT;
    markProgrammatic();
    flatListRef.current?.scrollToOffset({ offset: scrollY, animated: true });
    setCurrentIndex(idx);
    player.currentTime = item.start + subtitleOffset;
    player.play();
    setIsPlaying(true); // 乐观更新
    setIsUserScrolling(false);
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
  }, [player, subtitleOffset]);

  const onScrollBeginDrag = useCallback(() => {
    // 程序触发的滚动，跳过但不重置标记（等 End 事件重置）
    if (programmaticScroll.current) return;
    setIsUserScrolling(true);
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    if (player?.playing) player.pause();
  }, [player]);

  const onScroll = useCallback((e) => {
    scrollYRef.current = e.nativeEvent.contentOffset.y;
  }, []);

  const snapToNearest = useCallback(() => {
    if (snappingRef.current) return;
    snappingRef.current = true;

    // 磁吸：计算高亮条位置对应的最近字幕
    const barTop = 8 + 2 * ITEM_HEIGHT;
    const snapIndex = Math.round((scrollYRef.current + barTop - 8) / ITEM_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(subtitles.length - 1, snapIndex));

    // 滚动到精确位置
    const snapScrollY = clampedIndex < 2 ? 0 : (clampedIndex - 2) * ITEM_HEIGHT;
    markProgrammatic();
    flatListRef.current?.scrollToOffset({ offset: snapScrollY, animated: true });

    // 更新高亮和视频位置
    setCurrentIndex(clampedIndex);
    if (player) {
      player.currentTime = subtitles[clampedIndex].start + subtitleOffset;
      player.play();
    }

    setIsUserScrolling(false);
    // 300ms 后解锁，防止动画期间重复触发
    setTimeout(() => { snappingRef.current = false; }, 300);
  }, [player, subtitleOffset]);

  const onScrollEndDrag = useCallback(() => {
    // 程序触发的滚动不处理
    if (programmaticScroll.current) return;
    // 延迟磁吸：如果有惯性会被 onMomentumScrollBegin 取消
    snapTimerRef.current = setTimeout(() => {
      snapToNearest();
    }, 100);
  }, [snapToNearest]);

  const onMomentumScrollBegin = useCallback(() => {
    if (programmaticScroll.current) return;
    // 惯性开始，取消 onScrollEndDrag 的延时磁吸
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
  }, []);

  const onMomentumScrollEnd = useCallback(() => {
    if (programmaticScroll.current) return;
    // 惯性结束，执行磁吸
    snapToNearest();
  }, [snapToNearest]);

  const togglePlay = useCallback(() => {
    if (!player) return;
    // 立即乐观更新 UI 状态，不等 RAF 轮询
    const willPlay = !player.playing;
    setIsPlaying(willPlay);
    willPlay ? player.play() : player.pause();
  }, [player]);

  const formatTime = (seconds) => {
    if (!seconds || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const renderSubtitle = useCallback(({ item }) => {
    const isActive = item.id === currentIndex;
    return (
      <TouchableOpacity
        style={styles.subtitleItem}
        onPress={() => onSubtitlePress(item)}
        activeOpacity={0.7}
      >
        <Text style={[styles.subtitleTime, { color: T.timeText }]}>
          {formatTime(item.start)}
        </Text>
        <View style={styles.subtitleTextBox}>
          <Text
            style={[
              styles.subtitleText,
              { color: T.subtitleText },
              isActive && { color: T.subtitleTextActive, fontWeight: '600' },
            ]}
          >
            {item.text}
          </Text>
          {item.zh ? (
            <Text
              style={[
                styles.zhText,
                { color: T.zhText },
                isActive && { color: T.zhTextActive, fontWeight: '500' },
              ]}
            >
              {item.zh}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  }, [currentIndex, onSubtitlePress, T]);

  // FlatList ref & helpers
  const flatListRef = useRef(null);
  const getItemLayout = useCallback((_, index) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  }), []);

  // FlatList 初始可见索引
  const initialScrollIndex = useMemo(() => Math.max(0, currentIndex - 2), []);

  const themeKeys = Object.keys(THEMES);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: T.bg }]} edges={['top']}>
      <StatusBar style={themeKey === 'midnight' ? 'light' : 'dark'} />

      {/* ====== 视频区域 ====== */}
      <View style={[styles.videoContainer, { backgroundColor: T.videoBg }]}>
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          allowsFullscreen={false}
          nativeControls={false}
        />

        {/* 拖拽时显示时间预览（居中） */}
        {isDragging && (
          <View style={styles.dragPreview}>
            <Text style={styles.dragPreviewText}>
              {formatTime(dragTime)} / {formatTime(duration)}
            </Text>
          </View>
        )}

        {/* 底部控制栏 */}
        <View style={[styles.controls, { backgroundColor: T.controlBg }]}>
          {/* 纯白播放按钮（View绘制，不用emoji） */}
          <TouchableOpacity onPress={togglePlay} style={styles.playButton}>
            {isPlaying ? (
              // 暂停：两个白色竖条
              <View style={styles.pauseIcon}>
                <View style={styles.pauseBar} />
                <View style={styles.pauseBar} />
              </View>
            ) : (
              // 播放：白色三角形
              <View style={styles.playTriangle} />
            )}
          </TouchableOpacity>
          
          {/* 时间 */}
          <Text style={styles.timeText}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </Text>

          {/* 进度条 */}
          <View
            style={styles.sliderContainer}
            onLayout={(e) => {
              sliderLayoutX.current = e.nativeEvent.layout.x;
            }}
            {...panResponder.panHandlers}
          >
            <View style={[styles.sliderTrack, { backgroundColor: T.sliderTrack }]}>
              <Animated.View style={[styles.sliderFill, { backgroundColor: T.sliderFill, width: sliderAnim }]} />
            </View>
            <Animated.View style={[styles.sliderThumb, { left: Animated.subtract(sliderAnim, 12) }]} />
          </View>
        </View>
      </View>

      {/* ====== 偏移量控制 ====== */}
      <View style={[styles.offsetContainer, { backgroundColor: T.headerBg }]}>
        <View style={styles.offsetHeader}>
          <Text style={[styles.offsetLabel, { color: T.headerText }]}>字幕偏移</Text>
          <Text style={[styles.offsetValue, { color: T.subtitleTextActive }]}>
            {(() => {
              const val = offsetDisplayVal !== null ? offsetDisplayVal : subtitleOffset;
              return `${val >= 0 ? '+' : ''}${val.toFixed(1)}s`;
            })()}
          </Text>
          {subtitleOffset !== 0 && (
            <TouchableOpacity
              style={[styles.offsetReset, { borderColor: T.tabActive }]}
              onPress={() => setSubtitleOffset(0)}
            >
              <Text style={[styles.offsetResetText, { color: T.tabActive }]}>重置</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.sliderRow}>
          <Text style={[styles.sliderBound, { color: T.timeText }]}>-10</Text>
          <View
            style={[styles.offsetTrack, { backgroundColor: T.tabInactive + '30' }]}
            onLayout={(e) => {
              offsetTrackWidth.current = e.nativeEvent.layout.width;
              if (!isOffsetDragging.current) {
                offsetAnim.setValue(offsetToX(subtitleOffset));
              }
            }}
            {...offsetPan.panHandlers}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.offsetFill,
                {
                  backgroundColor: T.tabActive,
                  width: offsetAnim,
                },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.offsetThumb,
                {
                  transform: [{ translateX: offsetAnim }],
                  backgroundColor: T.tabActive,
                },
              ]}
            />
          </View>
          <Text style={[styles.sliderBound, { color: T.timeText }]}>+10</Text>
        </View>
      </View>

      {/* ====== 配色切换栏 ====== */}
      <View style={[styles.themeBar, { backgroundColor: T.tabBar }]}>
        {themeKeys.map((key) => (
          <Pressable
            key={key}
            onPress={() => setThemeKey(key)}
            style={[
              styles.themeTab,
              themeKey === key && {
                borderBottomColor: T.tabActive,
                borderBottomWidth: 2,
              },
            ]}
          >
            <Text
              style={[
                styles.themeTabText,
                { color: themeKey === key ? T.tabActive : T.tabInactive },
              ]}
            >
              {THEMES[key].name}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ====== 字幕区域 ====== */}
      <View style={[styles.subtitleContainer, { backgroundColor: T.subtitleBg }]}>
        {/* 固定高亮指示条：前3条跟随字幕，第4条起锁死 */}
        <View
          style={[
            styles.highlightBar,
            { backgroundColor: T.activeBg, borderColor: T.activeBorder },
            { top: currentIndex < 2 ? 8 + currentIndex * ITEM_HEIGHT : 8 + 2 * ITEM_HEIGHT },
          ]}
          pointerEvents="none"
        />
        <FlatList
          ref={flatListRef}
          data={subtitles}
          renderItem={renderSubtitle}
          keyExtractor={(item) => String(item.id)}
          getItemLayout={getItemLayout}
          initialScrollIndex={initialScrollIndex}
          onScrollBeginDrag={onScrollBeginDrag}
          onScrollEndDrag={onScrollEndDrag}
          onMomentumScrollBegin={onMomentumScrollBegin}
          onMomentumScrollEnd={onMomentumScrollEnd}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.subtitleList}
          style={styles.subtitleFlatList}
          ListHeaderComponent={<View style={{ height: 8 }} />}
          ListFooterComponent={<View style={{ height: 400 }} />}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={11}
          initialNumToRender={15}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  videoContainer: {
    height: VIDEO_HEIGHT,
    position: 'relative',
  },
  video: {
    flex: 1,
  },
  // ---- 拖拽预览（视频中间） ----
  dragPreview: {
    position: 'absolute',
    top: '40%',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
  },
  dragPreviewText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  // ---- 控制栏 ----
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SLIDER_PADDING,
    paddingVertical: 14,
  },
  playButton: {
    marginRight: 10,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 播放三角形（纯白）
  playTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 12,
    borderRightWidth: 0,
    borderBottomWidth: 7,
    borderTopWidth: 7,
    borderLeftColor: '#FFFFFF',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    borderTopColor: 'transparent',
    marginLeft: 2,
  },
  // 暂停双竖条（纯白）
  pauseIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  pauseBar: {
    width: 3,
    height: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },
  timeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    width: 90,
    letterSpacing: 0.5,
  },
  // ---- 进度条 ----
  sliderContainer: {
    flex: 1,
    height: 26,
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 3,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  sliderFill: {
    height: 3,
    borderRadius: 1.5,
  },
  sliderThumb: {
    position: 'absolute',
    top: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
    elevation: 4,
  },
  // ---- 偏移量 ----
  offsetContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  offsetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  offsetLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  offsetValue: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 10,
    minWidth: 50,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  offsetReset: {
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  offsetResetText: {
    fontSize: 12,
    fontWeight: '500',
  },
  offsetTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    marginHorizontal: 6,
    position: 'relative',
  },
  offsetFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 6,
    borderRadius: 3,
  },
  offsetThumb: {
    position: 'absolute',
    top: -7,
    left: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: -10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sliderBound: {
    fontSize: 11,
    width: 28,
    textAlign: 'center',
  },
  // ---- 配色切换 ----
  themeBar: {
    flexDirection: 'row',
    paddingVertical: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  themeTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 0,
  },
  themeTabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  // ---- 字幕 ----
  subtitleContainer: {
    flex: 1,
  },
  highlightBar: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: ITEM_HEIGHT,
    borderRadius: 10,
    borderWidth: 2,
    opacity: 0.4,
    zIndex: 10,
  },
  subtitleList: {
  },
  subtitleFlatList: {
    flex: 1,
  },
  subtitleItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 13, // 增加 padding，去掉 margin
    marginHorizontal: 10,
    marginVertical: 0, // margin 设为 0，避免重叠
    borderRadius: 10,
    backgroundColor: 'transparent',
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    height: 72, // 固定高度
  },
  subtitleTime: {
    fontSize: 11,
    width: 38,
    marginRight: 10,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  subtitleTextBox: {
    flex: 1,
  },
  subtitleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  zhText: {
    fontSize: 13,
    lineHeight: 20,
    marginTop: 2,
  },
});
