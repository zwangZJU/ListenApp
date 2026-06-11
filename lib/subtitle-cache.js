// 字幕缓存服务
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'subtitle_cache_';
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7天过期

/**
 * 生成缓存键
 * @param {string} videoId - 视频ID
 * @param {string} source - 视频来源 (ted/youtube)
 * @returns {string} - 缓存键
 */
function getCacheKey(videoId, source) {
  return `${CACHE_PREFIX}${source}_${videoId}`;
}

/**
 * 获取缓存的字幕
 * @param {string} videoId - 视频ID
 * @param {string} source - 视频来源
 * @returns {Promise<Object|null>} - 缓存的字幕数据
 */
export async function getCachedSubtitles(videoId, source) {
  try {
    const key = getCacheKey(videoId, source);
    const cached = await AsyncStorage.getItem(key);
    
    if (cached) {
      const data = JSON.parse(cached);
      // 检查是否过期
      if (data.timestamp && Date.now() - data.timestamp < CACHE_EXPIRY) {
        console.log('[Cache] Found cached subtitles for:', key);
        return data.subtitles;
      } else {
        // 过期了，删除缓存
        console.log('[Cache] Cache expired for:', key);
        await AsyncStorage.removeItem(key);
      }
    }
    return null;
  } catch (error) {
    console.error('[Cache] Error reading cache:', error);
    return null;
  }
}

/**
 * 缓存字幕
 * @param {string} videoId - 视频ID
 * @param {string} source - 视频来源
 * @param {Array} subtitles - 字幕数组
 */
export async function cacheSubtitles(videoId, source, subtitles) {
  try {
    const key = getCacheKey(videoId, source);
    const data = {
      subtitles,
      timestamp: Date.now(),
    };
    await AsyncStorage.setItem(key, JSON.stringify(data));
    console.log('[Cache] Cached subtitles for:', key);
  } catch (error) {
    console.error('[Cache] Error caching subtitles:', error);
  }
}

/**
 * 更新缓存中的字幕（用于翻译更新）
 * @param {string} videoId - 视频ID
 * @param {string} source - 视频来源
 * @param {Array} subtitles - 更新后的字幕数组
 */
export async function updateCachedSubtitles(videoId, source, subtitles) {
  try {
    const key = getCacheKey(videoId, source);
    const cached = await AsyncStorage.getItem(key);
    
    if (cached) {
      const data = JSON.parse(cached);
      // 保留原有时间戳
      data.subtitles = subtitles;
      await AsyncStorage.setItem(key, JSON.stringify(data));
      console.log('[Cache] Updated cached subtitles for:', key);
    }
  } catch (error) {
    console.error('[Cache] Error updating cache:', error);
  }
}

/**
 * 清除所有字幕缓存
 */
export async function clearAllCache() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
      console.log('[Cache] Cleared all subtitle cache');
    }
  } catch (error) {
    console.error('[Cache] Error clearing cache:', error);
  }
}
