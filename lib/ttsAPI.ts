import { TTSResponse } from './types';

/**
 * 调用TTS API生成语音
 * @param text 要转换为语音的文本
 * @param voice 使用的语音ID
 * @param apiEndpoint API端点URL
 * @returns 音频URL
 */
export async function generateSpeech(text: string, voice: string, apiEndpoint: string): Promise<string> {
  // 确保只在客户端运行
  if (typeof window === 'undefined') {
    throw new Error('TTS API只能在客户端环境调用');
  }
  
  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: text,
      voice: voice,
      rate: "0%",
      pitch: "0Hz",
      volume: "0%"
    }),
  });
  
  if (!response.ok) {
    throw new Error(`TTS API调用失败: ${response.status}`);
  }
  
  // 解析响应
  const data = await response.json() as TTSResponse;
  
  if (!data.success || !data.data || !data.data.audio) {
    throw new Error('获取音频URL失败');
  }
  
  // 构建完整的音频URL
  const apiUrl = new URL(apiEndpoint);
  const baseServerUrl = `${apiUrl.protocol}//${apiUrl.host}`;
  const audioPath = data.data.audio;
  const formattedPath = audioPath.startsWith('/') ? audioPath : `/${audioPath}`;
  return `${baseServerUrl}${formattedPath}`;
}

/**
 * 创建并配置音频元素
 * @param audioUrl 音频URL
 * @param playbackRate 播放速率
 * @returns 配置好的Audio元素
 */
export function createAudioElement(audioUrl: string, playbackRate: number): HTMLAudioElement {
  // 确保只在客户端运行
  if (typeof window === 'undefined') {
    throw new Error('Audio相关功能只能在客户端环境使用');
  }
  
  // 从localStorage获取最新的播放速率（如果有）
  let currentRate = playbackRate;
  try {
    const savedRate = localStorage.getItem('ttsPlaybackRate');
    if (savedRate) {
      currentRate = parseFloat(parseFloat(savedRate).toFixed(1));
    }
  } catch (error) {
    console.error("读取播放速率设置失败:", error);
  }
  
  const audio = new Audio(audioUrl);
  
  // 应用音频设置 (音量固定为100%)
  audio.volume = 1.0;
  audio.playbackRate = currentRate;
  
  return audio;
} 