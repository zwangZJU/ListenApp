// 翻译服务 - 使用 MyMemory API（免费，国内可访问）

const MYMEMORY_API = 'https://api.mymemory.translated.net/get';

// 翻译取消标志
let translationCancelled = false;

/**
 * 取消正在进行的翻译
 */
export function cancelTranslation() {
  translationCancelled = true;
}

/**
 * 重置翻译取消标志
 */
export function resetTranslationCancel() {
  translationCancelled = false;
}

/**
 * 翻译英文文本到中文
 * @param {string} text - 要翻译的英文文本
 * @returns {Promise<string>} - 翻译后的中文文本
 */
export async function translateToChinese(text) {
  try {
    const url = `${MYMEMORY_API}?q=${encodeURIComponent(text)}&langpair=en|zh-CN`;
    console.log('[Translate] Translating:', text.substring(0, 50) + '...');
    const response = await fetch(url);
    const data = await response.json();
    
    // MyMemory API 返回格式: {responseData: {translatedText: "..."}, ...}
    if (data && data.responseData && data.responseData.translatedText) {
      const translated = data.responseData.translatedText;
      // 检查是否翻译成功（如果返回原文，说明翻译失败）
      if (translated && translated !== text && !translated.includes('MYMEMORY')) {
        console.log('[Translate] Success:', translated.substring(0, 50) + '...');
        return translated;
      } else {
        console.log('[Translate] Failed: returned same text or MYMEMORY error');
      }
    } else {
      console.log('[Translate] Failed: invalid response format', data);
    }
    return null;
  } catch (error) {
    console.error('[Translate] Error translating text:', error);
    return null;
  }
}

/**
 * 逐条翻译字幕，翻译完一条立即回调
 * @param {Array} subtitles - 字幕数组
 * @param {Function} onTranslated - 翻译完一条的回调 (index, zh)
 * @param {Function} onProgress - 进度回调 (current, total)
 * @returns {Promise<Array>} - 翻译后的字幕数组
 */
export async function translateSubtitles(subtitles, onTranslated, onProgress) {
  translationCancelled = false;
  const translated = subtitles.map(sub => ({ ...sub }));
  const total = subtitles.length;
  
  // 逐条翻译，每条间隔 500ms
  for (let i = 0; i < total; i++) {
    // 检查是否被取消
    if (translationCancelled) {
      console.log('[Translate] Translation cancelled');
      break;
    }
    
    const sub = translated[i];
    if (sub.text) {
      const zh = await translateToChinese(sub.text);
      if (zh) {
        translated[i] = { ...translated[i], zh };
        // 翻译完一条立即回调
        if (onTranslated && !translationCancelled) {
          onTranslated(i, zh);
        }
      }
    }
    
    // 报告进度
    if (onProgress && !translationCancelled) {
      onProgress(i + 1, total);
    }
    
    // 等待一下再翻译下一条
    if (i < total - 1 && !translationCancelled) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return translated;
}
