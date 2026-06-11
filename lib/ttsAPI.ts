import { DEFAULT_TTS_STYLE } from './ttsOptions';
import type { TTSRequestOptions } from './types';

/**
 * 调用TTS API生成语音
 * @param text 要转换为语音的文本
 * @param voice 使用的语音ID
 * @param apiEndpoint API端点URL
 * @param options 新TTS接口参数
 * @returns 浏览器可播放的音频URL
 */
export async function generateSpeech(
  text: string,
  voice: string,
  apiEndpoint: string,
  options: TTSRequestOptions = {}
): Promise<string> {
  const audioBlob = await generateSpeechBlob(text, voice, apiEndpoint, options);
  return URL.createObjectURL(audioBlob);
}

export async function generateSpeechBlob(
  text: string,
  voice: string,
  apiEndpoint: string,
  options: TTSRequestOptions = {}
): Promise<Blob> {
  // 确保只在客户端运行
  if (typeof window === 'undefined') {
    throw new Error('TTS API只能在客户端环境调用');
  }

  const {
    speed = 1.0,
    pitch = "0",
    volume = "0",
    style = DEFAULT_TTS_STYLE,
    signal,
    timeoutMs,
  } = options;

  const timeoutController = typeof timeoutMs === "number" && timeoutMs > 0
    ? new AbortController()
    : null;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  if (timeoutController) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
    }, timeoutMs);
  }

  const fetchSignal = timeoutController
    ? mergeAbortSignals(signal, timeoutController.signal)
    : signal;
  
  try {
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: text,
        voice,
        speed,
        pitch,
        style,
        volume,
      }),
      signal: fetchSignal,
    });

    if (!response.ok) {
      let message = `TTS API调用失败: ${response.status}`;
      try {
        const errorData = await response.json();
        message = errorData?.error?.message || message;
      } catch {
        // 错误响应不一定是JSON。
      }
      throw new Error(message);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      throw new Error(data?.error?.message || 'TTS API未返回音频数据');
    }

    const audioBlob = await response.blob();
    if (audioBlob.size === 0) {
      throw new Error('TTS API返回了空音频');
    }

    return audioBlob;
  } catch (error) {
    if (timedOut) {
      throw new Error(`TTS API请求超时（${Math.round((timeoutMs || 0) / 1000)}秒）`);
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function mergeAbortSignals(...signals: Array<AbortSignal | undefined>) {
  const activeSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (activeSignals.length === 0) return undefined;
  if (activeSignals.length === 1) return activeSignals[0];

  const controller = new AbortController();
  const abort = () => controller.abort();

  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", abort, { once: true });
  }

  return controller.signal;
}
