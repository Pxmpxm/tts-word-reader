import { Sentence } from './types';
import { generateSpeech, createAudioElement } from './ttsAPI';

/**
 * 播放指定句子
 * @param sentence 要播放的句子
 * @param sentenceIndex 句子索引
 * @param totalCount 总句子数
 * @param voice 语音ID
 * @param apiEndpoint API端点
 * @param playbackRate 播放速率
 * @param playNextSentence 播放下一句的回调函数
 * @param onStartLoading 开始加载时的回调
 * @param onFinishLoading 结束加载时的回调
 * @param onError 错误处理回调
 * @returns 音频元素和播放Promise
 */
export async function playSentence(
  sentence: Sentence,
  sentenceIndex: number,
  totalCount: number,
  voice: string,
  apiEndpoint: string,
  playbackRate: number,
  playNextSentence: (nextIndex: number) => void,
  onStartLoading: () => void,
  onFinishLoading: () => void,
  onError: (error: Error) => void
): Promise<{audio: HTMLAudioElement, playPromise: Promise<void>}> {
  // 检查是否在客户端环境
  if (typeof window === 'undefined') {
    return {
      audio: {} as HTMLAudioElement,
      playPromise: Promise.resolve()
    };
  }
  
  // 检查文本长度，如果小于6个字符则跳过
  if (sentence.text.length < 6) {
    console.log("文本过短，跳过TTS请求:", sentence.text);
    // 自动播放下一句
    if (sentenceIndex < totalCount - 1) {
      playNextSentence(sentenceIndex + 1);
    }
    // 返回一个空的音频元素和已解决的Promise
    const emptyAudio = new Audio();
    return {
      audio: emptyAudio,
      playPromise: Promise.resolve()
    };
  }
  
  onStartLoading();
  
  try {
    // 生成语音URL
    const audioUrl = await generateSpeech(sentence.text, voice, apiEndpoint);
    console.log(`播放第 ${sentenceIndex + 1}/${totalCount} 句:`, 
      sentence.text.substring(0, 30) + (sentence.text.length > 30 ? '...' : ''));
    
    // 创建音频元素
    const audio = createAudioElement(audioUrl, playbackRate);
    
    // 设置加载完成事件
    audio.onloadeddata = () => {
      console.log("音频已加载完成");
      onFinishLoading();
      
      // 确保加载完成后再次应用播放速率设置
      audio.playbackRate = playbackRate;
    };
    
    // 播放音频
    const playPromise = audio.play();
    
    // 返回音频元素和播放Promise
    return { audio, playPromise };
  } catch (error) {
    console.error("播放出错:", error);
    onFinishLoading();
    onError(error instanceof Error ? error : new Error(String(error)));
    
    // 返回一个空的音频元素和已拒绝的Promise
    const emptyAudio = new Audio();
    return {
      audio: emptyAudio,
      playPromise: Promise.reject(error)
    };
  }
}

/**
 * 从localStorage加载播放速率
 * @returns 播放速率
 */
export function loadPlaybackRate(): number {
  if (typeof window === 'undefined') {
    return 1.0; // 服务端返回默认值
  }
  
  try {
    const savedRate = localStorage.getItem('ttsPlaybackRate');
    if (savedRate) {
      return parseFloat(parseFloat(savedRate).toFixed(1));
    }
  } catch (error) {
    console.error("读取播放速率设置失败:", error);
  }
  
  return 1.0; // 默认速率1.0
}

/**
 * 保存播放速率到localStorage
 * @param rate 播放速率
 */
export function savePlaybackRate(rate: number): void {
  if (typeof window === 'undefined') return;
  
  try {
    // 确保速率是一位小数
    const formattedRate = parseFloat(rate.toFixed(1));
    localStorage.setItem('ttsPlaybackRate', formattedRate.toString());
    console.log("保存播放速率到localStorage:", formattedRate);
  } catch (error) {
    console.error("保存播放速率设置失败:", error);
  }
} 