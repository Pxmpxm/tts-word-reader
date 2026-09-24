"use client"

import { useEffect, useRef, useState } from "react"
import type { Sentence } from "@/lib/types"
import { splitTextIntoTTSChunks } from "@/lib/segmentText"
import { generateSpeechBlob } from "@/lib/ttsAPI"

type AudioCacheStatus = "loading" | "ready" | "error";

interface AudioChunk {
  sentenceIndex: number;
  chunkIndex: number;
  text: string;
  key: string;
}

interface AudioCacheItem {
  key: string;
  sentenceIndex: number;
  chunkIndex: number;
  text: string;
  status: AudioCacheStatus;
  promise?: Promise<HTMLAudioElement>;
  controller?: AbortController;
  url?: string;
  audio?: HTMLAudioElement;
  lastUsed: number;
}

interface PreloadQueueItem {
  chunk: AudioChunk;
  sessionId: number;
  priority: number;
}

const MIN_SPEAKABLE_TEXT_LENGTH = 1;
const PRELOAD_SENTENCE_COUNT = 8;
const CACHE_WINDOW_BEFORE = 5;
const MAX_AUDIO_CACHE_ITEMS = 64;
const MAX_PARALLEL_PRELOADS = 3;
const URGENT_CURRENT_CHUNK_COUNT = 2;
const PRELOAD_PRIORITY_CURRENT_CONTINUATION = 0;
const PRELOAD_PRIORITY_UPCOMING_FIRST_CHUNK = 20;
const PRELOAD_PRIORITY_CURRENT_REMAINDER = 50;
const PRELOAD_PRIORITY_UPCOMING_REMAINDER = 100;

export function usePlayback({ sentences, documentId, selectedVoice, selectedStyle, playbackRate, mounted, onError }: {
  sentences: Sentence[]
  documentId: string | null
  selectedVoice: string
  selectedStyle: string
  playbackRate: number
  mounted: boolean
  onError: (message: string) => void
}) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isAudioLoading, setIsAudioLoading] = useState(false)
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const currentIndexRef = useRef(0)
  const isPlayingRef = useRef(false)
  const playbackSessionRef = useRef(0)
  const activeRequestControllersRef = useRef<Set<AbortController>>(new Set())
  const audioCache = useRef<Map<string, AudioCacheItem>>(new Map())
  const preloadQueueRef = useRef<PreloadQueueItem[]>([])
  const activePreloadCountRef = useRef(0)
  const activeChunkKeyRef = useRef<string | null>(null)
  const activeChunkIndexRef = useRef(0)
  const playbackRateRef = useRef(1)
  const poolSize = PRELOAD_SENTENCE_COUNT
  const setErrorMessage = onError

  const setPlayingState = (playing: boolean) => {
    isPlayingRef.current = playing;
    setIsPlaying(playing);
  };

  const isAbortError = (error: unknown) => {
    return error instanceof DOMException && error.name === "AbortError";
  };

  const abortActiveRequests = () => {
    preloadQueueRef.current = [];
    activeRequestControllersRef.current.forEach((controller) => {
      controller.abort();
    });
    activeRequestControllersRef.current.clear();
  };

  const beginPlaybackSession = () => {
    preloadQueueRef.current = [];
    playbackSessionRef.current += 1;
    return playbackSessionRef.current;
  };

  const invalidatePlaybackSession = (abortRequests: boolean = true) => {
    if (abortRequests) {
      abortActiveRequests();
    } else {
      preloadQueueRef.current = [];
    }
    playbackSessionRef.current += 1;
  };

  const isPlaybackSessionActive = (sessionId: number) => {
    return playbackSessionRef.current === sessionId;
  };

  const resetAudioPosition = (audio: HTMLAudioElement) => {
    try {
      audio.currentTime = 0;
    } catch {
      // 某些浏览器在音频元数据未加载时不允许设置 currentTime。
    }
  };

  const stopCurrentAudio = (resetPosition: boolean = false) => {
    if (!audioRef.current) return;

    audioRef.current.pause();
    audioRef.current.onended = null;

    if (resetPosition) {
      resetAudioPosition(audioRef.current);
    }
  };

  const releaseAudio = (audio?: HTMLAudioElement, audioUrl?: string) => {
    if (!audio) return;

    const releasableUrl = audioUrl || audio.src;
    audio.pause();
    audio.onended = null;
    audio.onloadeddata = null;
    audio.oncanplaythrough = null;
    audio.onpause = null;
    audio.onerror = null;
    audio.src = "";

    if (releasableUrl.startsWith("blob:")) {
      URL.revokeObjectURL(releasableUrl);
    }
  };

  const clearAudioCache = () => {
    audioCache.current.forEach((item) => {
      releaseAudio(item.audio, item.url);
    });
    audioCache.current.clear();
  };

  const stopPlaybackAndClearCache = () => {
    invalidatePlaybackSession();
    stopCurrentAudio(true);
    audioRef.current = null;
    clearAudioCache();
    activeChunkKeyRef.current = null;
    activeChunkIndexRef.current = 0;
    setIsAudioLoading(false);
  };

  const applySavedPlaybackRate = (audio: HTMLAudioElement) => {
    audio.playbackRate = playbackRateRef.current;
  };

  // 同步currentSentenceIndex到ref
  useEffect(() => {
    currentIndexRef.current = currentSentenceIndex;
    
    // 只有在播放状态下才预加载后续句子
    if (mounted && sentences.length > 0 && isPlayingRef.current) {
      preloadSentences(currentSentenceIndex, playbackSessionRef.current);
      
      // 清理远离当前索引的缓存
      cleanupCache(currentSentenceIndex);
    }
  // 播放和缓存 helper 通过 ref 读取最新状态，避免异步任务被 render 闭包锁住。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSentenceIndex, sentences, mounted, isPlaying]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // 监听playbackRate的变化，实时应用到当前音频
  useEffect(() => {
    playbackRateRef.current = playbackRate
    
    // 应用到当前音频
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
    
    // 更新缓存中的所有音频播放速率
    if (mounted) {
      audioCache.current.forEach(item => {
        if (item.status === 'ready' && item.audio) {
          item.audio.playbackRate = playbackRate;
        }
      });
    }
  }, [playbackRate, mounted]);

  useEffect(() => () => {
    invalidatePlaybackSession()
    releaseAudio(audioRef.current || undefined)
    audioRef.current = null
    clearAudioCache()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const requestAudioBlob = (chunk: AudioChunk, controller: AbortController) => {
    return generateSpeechBlob(chunk.text, selectedVoice, {
      documentId: documentId || undefined,
      style: selectedStyle,
      signal: controller.signal,
    })
  }

  const makeAudioCacheKey = (sentenceIndex: number, chunkIndex: number, text: string) => {
    return [selectedVoice, selectedStyle, sentenceIndex, chunkIndex, text].join("::");
  };

  const getSentenceChunks = (sentenceIndex: number): AudioChunk[] => {
    const sentence = sentences[sentenceIndex];
    if (!sentence || sentence.text.trim().length < MIN_SPEAKABLE_TEXT_LENGTH) return [];

    return splitTextIntoTTSChunks(sentence.text).map((text, chunkIndex) => ({
      sentenceIndex,
      chunkIndex,
      text,
      key: makeAudioCacheKey(sentenceIndex, chunkIndex, text),
    }));
  };

  const createReadyAudio = (
    audioUrl: string,
    controller: AbortController
  ) => {
    return new Promise<HTMLAudioElement>((resolve, reject) => {
      const audio = new Audio();
      let settled = false;

      const cleanup = () => {
        audio.onloadeddata = null;
        audio.oncanplaythrough = null;
        audio.onerror = null;
        controller.signal.removeEventListener("abort", handleAbort);
      };

      const rejectWithRelease = (error: Error | DOMException) => {
        if (settled) return;
        settled = true;
        cleanup();
        releaseAudio(audio, audioUrl);
        reject(error);
      };

      const resolveReady = () => {
        if (settled) return;
        if (controller.signal.aborted) {
          rejectWithRelease(new DOMException("播放会话已失效", "AbortError"));
          return;
        }

        settled = true;
        cleanup();
        resolve(audio);
      };

      function handleAbort() {
        rejectWithRelease(new DOMException("播放会话已失效", "AbortError"));
      }

      audio.preload = "auto";
      audio.onloadeddata = resolveReady;
      audio.oncanplaythrough = resolveReady;
      audio.onerror = () => {
        rejectWithRelease(new Error("音频数据加载失败"));
      };
      controller.signal.addEventListener("abort", handleAbort, { once: true });
      audio.src = audioUrl;
      audio.load();
    });
  };

  const trimAudioCache = () => {
    if (audioCache.current.size <= MAX_AUDIO_CACHE_ITEMS) return;

    const evictableItems = [...audioCache.current.values()]
      .filter((item) => item.status !== "loading" && item.audio !== audioRef.current)
      .sort((a, b) => a.lastUsed - b.lastUsed);

    for (const item of evictableItems) {
      if (audioCache.current.size <= MAX_AUDIO_CACHE_ITEMS) break;
      releaseAudio(item.audio, item.url);
      audioCache.current.delete(item.key);
    }
  };

  const loadAudioChunk = async (chunk: AudioChunk, sessionId: number) => {
    const cachedItem = audioCache.current.get(chunk.key);
    if (cachedItem?.status === "ready" && cachedItem.audio) {
      cachedItem.lastUsed = Date.now();
      applySavedPlaybackRate(cachedItem.audio);
      return cachedItem.audio;
    }

    if (cachedItem?.status === "loading" && cachedItem.promise) {
      cachedItem.lastUsed = Date.now();
      return cachedItem.promise;
    }

    if (!isPlaybackSessionActive(sessionId)) {
      throw new DOMException("播放会话已失效", "AbortError");
    }

    const controller = new AbortController();
    activeRequestControllersRef.current.add(controller);

    const item: AudioCacheItem = {
      key: chunk.key,
      sentenceIndex: chunk.sentenceIndex,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      status: "loading",
      controller,
      lastUsed: Date.now(),
    };

    const promise = (async () => {
      let audioUrl = "";

      try {
        const audioBlob = await requestAudioBlob(chunk, controller);
        if (controller.signal.aborted) {
          throw new DOMException("播放会话已失效", "AbortError");
        }

        audioUrl = URL.createObjectURL(audioBlob);

        const audio = await createReadyAudio(audioUrl, controller);
        const currentItem = audioCache.current.get(chunk.key);
        if (currentItem !== item || controller.signal.aborted) {
          releaseAudio(audio, audioUrl);
          throw new DOMException("播放会话已失效", "AbortError");
        }

        applySavedPlaybackRate(audio);
        item.status = "ready";
        item.audio = audio;
        item.url = audioUrl;
        item.promise = undefined;
        item.controller = undefined;
        item.lastUsed = Date.now();
        trimAudioCache();
        return audio;
      } catch (error) {
        const currentItem = audioCache.current.get(chunk.key);
        if (currentItem === item) {
          if (isAbortError(error) || controller.signal.aborted) {
            audioCache.current.delete(chunk.key);
          } else {
            item.status = "error";
            item.promise = undefined;
            item.controller = undefined;
            item.lastUsed = Date.now();
          }
        }
        throw error;
      } finally {
        activeRequestControllersRef.current.delete(controller);
      }
    })();

    item.promise = promise;
    audioCache.current.set(chunk.key, item);
    return promise;
  };

  const isChunkAlreadyRequested = (chunk: AudioChunk) => {
    const cachedItem = audioCache.current.get(chunk.key);
    return cachedItem?.status === "ready" || cachedItem?.status === "loading";
  };

  const drainPreloadQueue = () => {
    if (!mounted || !isPlayingRef.current) return;

    while (activePreloadCountRef.current < MAX_PARALLEL_PRELOADS && preloadQueueRef.current.length > 0) {
      const queueItem = preloadQueueRef.current.shift();
      if (!queueItem) return;

      if (
        !isPlaybackSessionActive(queueItem.sessionId) ||
        !isPlayingRef.current ||
        isChunkAlreadyRequested(queueItem.chunk)
      ) {
        continue;
      }

      activePreloadCountRef.current += 1;
      loadAudioChunk(queueItem.chunk, queueItem.sessionId)
        .catch((error) => {
          if (!isAbortError(error) && isPlaybackSessionActive(queueItem.sessionId)) {
            console.error(`预加载句子${queueItem.chunk.sentenceIndex + 1}失败:`, error);
          }
        })
        .finally(() => {
          activePreloadCountRef.current = Math.max(0, activePreloadCountRef.current - 1);
          drainPreloadQueue();
        });
    }
  };

  const enqueuePreloadChunk = (chunk: AudioChunk, sessionId: number, priority: number) => {
    if (!isPlaybackSessionActive(sessionId) || isChunkAlreadyRequested(chunk)) return;
    const existingQueueItem = preloadQueueRef.current.find((item) => item.chunk.key === chunk.key);
    if (existingQueueItem) {
      existingQueueItem.priority = Math.min(existingQueueItem.priority, priority);
      preloadQueueRef.current.sort((a, b) => a.priority - b.priority);
      return;
    }

    preloadQueueRef.current.push({ chunk, sessionId, priority });
    preloadQueueRef.current.sort((a, b) => a.priority - b.priority);
    drainPreloadQueue();
  };

  const preloadPlaybackWindow = (
    sentenceIndex: number,
    sessionId: number = playbackSessionRef.current,
    currentChunkIndex: number = -1
  ) => {
    if (!sentences.length || !mounted || !isPlayingRef.current || !isPlaybackSessionActive(sessionId)) return;

    const currentSentenceChunks = getSentenceChunks(sentenceIndex);
    const currentContinuationChunks = currentSentenceChunks.slice(currentChunkIndex + 1);
    currentContinuationChunks.slice(0, URGENT_CURRENT_CHUNK_COUNT).forEach((chunk, index) => {
      enqueuePreloadChunk(chunk, sessionId, PRELOAD_PRIORITY_CURRENT_CONTINUATION + index);
    });

    const endIndex = Math.min(sentenceIndex + 1 + poolSize, sentences.length);
    const upcomingSentences: Array<{ distance: number; chunks: AudioChunk[] }> = [];
    for (let i = sentenceIndex + 1; i < endIndex; i++) {
      const chunks = getSentenceChunks(i);
      if (chunks.length > 0) {
        upcomingSentences.push({ distance: i - sentenceIndex, chunks });
      }
    }

    upcomingSentences.forEach(({ distance, chunks }) => {
      enqueuePreloadChunk(
        chunks[0],
        sessionId,
        PRELOAD_PRIORITY_UPCOMING_FIRST_CHUNK + distance
      );
    });

    currentContinuationChunks.slice(URGENT_CURRENT_CHUNK_COUNT).forEach((chunk, index) => {
      enqueuePreloadChunk(
        chunk,
        sessionId,
        PRELOAD_PRIORITY_CURRENT_REMAINDER + index
      );
    });

    let chunkIndex = 1;
    let queuedAny = true;
    while (queuedAny) {
      queuedAny = false;
      for (const { distance, chunks } of upcomingSentences) {
        const chunk = chunks[chunkIndex];
        if (chunk) {
          enqueuePreloadChunk(
            chunk,
            sessionId,
            PRELOAD_PRIORITY_UPCOMING_REMAINDER + chunkIndex * poolSize + distance
          );
          queuedAny = true;
        }
      }
      chunkIndex += 1;
    }
  };

  // 兼容现有调用名：从指定句开始填充预加载窗口。
  const preloadSentences = (startIndex: number, sessionId: number = playbackSessionRef.current) => {
    preloadPlaybackWindow(Math.max(0, startIndex), sessionId);
  };

  const waitForAudioEnd = (audio: HTMLAudioElement) => {
    return new Promise<boolean>((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        audio.removeEventListener("ended", handleEnded);
        audio.removeEventListener("pause", handlePause);
        audio.removeEventListener("error", handleError);
      };

      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };

      function handleEnded() {
        settle(true);
      }

      function handlePause() {
        if (!audio.ended) settle(false);
      }

      function handleError() {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("音频播放失败"));
      }

      audio.addEventListener("ended", handleEnded);
      audio.addEventListener("pause", handlePause);
      audio.addEventListener("error", handleError);
    });
  };

  const playChunk = async (chunk: AudioChunk, sessionId: number) => {
    setIsAudioLoading(true);

    const audioPromise = loadAudioChunk(chunk, sessionId);
    preloadPlaybackWindow(chunk.sentenceIndex, sessionId, chunk.chunkIndex);
    const audio = await audioPromise;
    if (!isPlaybackSessionActive(sessionId) || !isPlayingRef.current) {
      setIsAudioLoading(false);
      return false;
    }

    const shouldResume =
      activeChunkKeyRef.current === chunk.key &&
      audioRef.current === audio &&
      !audio.ended &&
      audio.currentTime > 0;
    if (!shouldResume) {
      stopCurrentAudio(false);
      audioRef.current = audio;
      resetAudioPosition(audio);
    }
    activeChunkKeyRef.current = chunk.key;
    activeChunkIndexRef.current = chunk.chunkIndex;
    applySavedPlaybackRate(audio);

    try {
      await audio.play();
      setIsAudioLoading(false);
      preloadPlaybackWindow(chunk.sentenceIndex, sessionId, chunk.chunkIndex);
      const ended = await waitForAudioEnd(audio);
      if (ended && activeChunkKeyRef.current === chunk.key) {
        activeChunkKeyRef.current = null;
        activeChunkIndexRef.current = chunk.chunkIndex + 1;
      }
      return ended && isPlaybackSessionActive(sessionId) && isPlayingRef.current;
    } catch (error) {
      const cachedItem = audioCache.current.get(chunk.key);
      if (cachedItem?.audio === audio) {
        releaseAudio(cachedItem.audio, cachedItem.url);
        audioCache.current.delete(chunk.key);
      }
      setIsAudioLoading(false);
      throw error;
    }
  };

  const playSentenceAtIndex = async (sentenceIndex: number, sessionId: number) => {
    const chunks = getSentenceChunks(sentenceIndex);
    if (chunks.length === 0) return true;

    const startChunk = currentIndexRef.current === sentenceIndex && activeChunkKeyRef.current
      ? Math.min(activeChunkIndexRef.current, chunks.length - 1)
      : 0;
    for (const chunk of chunks.slice(startChunk)) {
      if (!isPlaybackSessionActive(sessionId) || !isPlayingRef.current) return false;
      const completed = await playChunk(chunk, sessionId);
      if (!completed) return false;
    }

    return true;
  };

  // 清理缓存，在索引变化很大时调用
  const cleanupCache = (currentIndex: number) => {
    for (const [key, item] of audioCache.current.entries()) {
      const outOfWindow =
        item.sentenceIndex < currentIndex - CACHE_WINDOW_BEFORE ||
        item.sentenceIndex > currentIndex + poolSize;

      if (item.status === "error") {
        audioCache.current.delete(key);
        continue;
      }

      if (outOfWindow && item.audio !== audioRef.current) {
        item.controller?.abort();
        releaseAudio(item.audio, item.url);
        audioCache.current.delete(key);
      }
    }
  };
  
  // 切换播放/暂停
  const handleTogglePlayback = () => {
    // 使用本地变量记录新状态，以避免闭包中使用旧状态
    const newPlayingState = !isPlayingRef.current;
    
    // 设置播放状态
    setPlayingState(newPlayingState);
    
    if (newPlayingState) {
      setErrorMessage("")
      const sessionId = beginPlaybackSession();
      // 确保使用最新的速率设置
      
      // 如果切换到播放状态，使用playback机制播放当前句子
      playCurrentSentence(true, sessionId);
    } else {
      // 如果切换到停止状态，暂停当前播放的音频
      invalidatePlaybackSession(false);
      stopCurrentAudio(false);
      setIsAudioLoading(false);
    }
  };
  
  // 播放上一句
  const handlePreviousSentence = () => {
    if (currentSentenceIndex > 0) {
      // 计算新的索引
      const newIndex = currentSentenceIndex - 1;
      
      // 暂停当前音频
      const sessionId = beginPlaybackSession();
      stopCurrentAudio(true);
      activeChunkKeyRef.current = null;
      activeChunkIndexRef.current = 0;
      
      // 更新索引
      setCurrentSentenceIndex(newIndex);
      currentIndexRef.current = newIndex; // 同时更新ref
      setPlayingState(true);
      
      // 确保使用最新的速率设置
      
      
      // 延迟后播放
      setTimeout(() => {
        if (isPlaybackSessionActive(sessionId)) {
          playCurrentSentence(true, sessionId);
        }
      }, 50);
    }
  };
  
  // 播放下一句
  const handleNextSentence = () => {
    if (currentSentenceIndex < sentences.length - 1) {
      // 计算新的索引
      const newIndex = currentSentenceIndex + 1;
      
      // 暂停当前音频
      const sessionId = beginPlaybackSession();
      stopCurrentAudio(true);
      activeChunkKeyRef.current = null;
      activeChunkIndexRef.current = 0;
      
      // 更新索引
      setCurrentSentenceIndex(newIndex);
      currentIndexRef.current = newIndex; // 同时更新ref
      setPlayingState(true);
      
      // 确保使用最新的速率设置
      
      
      // 延迟后播放
      setTimeout(() => {
        if (isPlaybackSessionActive(sessionId)) {
          playCurrentSentence(true, sessionId);
        }
      }, 50);
    }
  };
  
  // 处理进度条变化
  const handleProgressChange = (newIndex: number) => {
    const shouldContinuePlaying = isPlayingRef.current;
    const sessionId = shouldContinuePlaying ? beginPlaybackSession() : playbackSessionRef.current;

    // 暂停当前音频
    stopCurrentAudio(true);
    activeChunkKeyRef.current = null;
    activeChunkIndexRef.current = 0;
    
    // 更新索引
    setCurrentSentenceIndex(newIndex);
    currentIndexRef.current = newIndex; // 同时更新ref
    
    // 确保使用最新的速率设置
    
    
    // 如果正在播放，则在新位置继续播放
    if (shouldContinuePlaying) {
      setTimeout(() => {
        if (isPlaybackSessionActive(sessionId)) {
          playCurrentSentence(true, sessionId);
        }
      }, 50);
    } else {
      // 如果不是播放状态，仅更新高亮，不加载音频

    }
  };
  
  // 播放当前句子
  const playCurrentSentence = async (
    forcePlay: boolean = false,
    sessionId: number = playbackSessionRef.current
  ) => {
    // 确保使用最新的速率设置
    

    if (!isPlaybackSessionActive(sessionId)) {
      return false;
    }
    
    // 如果没有句子或已暂停状态且没有强制播放，则返回
    if (sentences.length === 0) {
      return false;
    }
    
    if (!isPlayingRef.current && !forcePlay) {
      return false;
    }
    
    // 强制播放时，确保播放状态为true
    if (forcePlay && !isPlayingRef.current) {
      setPlayingState(true);
    }
    
    let sentenceIndex = currentIndexRef.current;
    if (sentenceIndex < 0 || sentenceIndex >= sentences.length) {
      return false;
    }

    try {
      while (sentenceIndex < sentences.length) {
        if (!isPlaybackSessionActive(sessionId) || !isPlayingRef.current) {
          setIsAudioLoading(false);
          return false;
        }

        setCurrentSentenceIndex(sentenceIndex);
        currentIndexRef.current = sentenceIndex;
        cleanupCache(sentenceIndex);

        const completed = await playSentenceAtIndex(sentenceIndex, sessionId);
        if (!completed) {
          setIsAudioLoading(false);
          return false;
        }

        sentenceIndex += 1;
        if (sentenceIndex < sentences.length) {
          setCurrentSentenceIndex(sentenceIndex);
          currentIndexRef.current = sentenceIndex;
          
          preloadSentences(sentenceIndex, sessionId);
        }
      }

      setPlayingState(false);
      setIsAudioLoading(false);
      return true;
    } catch (error) {
      if (isAbortError(error)) {
        setIsAudioLoading(false);
        return false;
      }

      console.error("TTS处理错误:", error);
      setErrorMessage(error instanceof Error ? error.message : "语音播放失败，请重试。")
      setIsAudioLoading(false);
      setPlayingState(false);
      return false;
    }
  };

  const setPosition = (index: number) => {
    setCurrentSentenceIndex(index)
    currentIndexRef.current = index
  }

  return {
    isPlaying, isAudioLoading, currentSentenceIndex, setPosition,
    setPlayingState, stopPlaybackAndClearCache,
    handleTogglePlayback, handlePreviousSentence, handleNextSentence, handleProgressChange,
  }
}
