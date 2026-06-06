"use client"

import { useState, useRef, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { FileUploader } from "@/components/FileUploader"
import { DocumentViewer } from "@/components/DocumentViewer"
import { PlaybackControls } from "@/components/PlaybackControls"
import { SettingsPanel } from "@/components/SettingsPanel"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { ScrollArea } from "@/components/ui/scroll-area"

import { extractSentencesFromHtml, highlightSentenceInHtml } from "@/lib/textProcessor"
import { generateSpeechBlob } from "@/lib/ttsAPI"
import {
  AVAILABLE_TTS_STYLES,
  AVAILABLE_TTS_VOICES,
  DEFAULT_TTS_API_ENDPOINT,
  DEFAULT_TTS_STYLE
} from "@/lib/ttsOptions"
import type { Sentence } from "@/lib/types"
import dynamic from "next/dynamic"

type AudioCacheStatus = "loading" | "ready" | "error";

interface AudioChunk {
  sentenceIndex: number;
  chunkIndex: number;
  text: string;
  key: string;
  persistentKey: string;
}

interface AudioCacheItem {
  key: string;
  sentenceIndex: number;
  chunkIndex: number;
  text: string;
  persistentKey: string;
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
}

interface PersistentAudioRecord {
  key: string;
  blob: Blob;
  byteSize: number;
  createdAt: number;
  lastUsed: number;
  apiEndpoint: string;
  voice: string;
  style: string;
  text: string;
}

const MAX_TTS_TEXT_LENGTH = 150;
const MIN_SPEAKABLE_TEXT_LENGTH = 6;
const PRELOAD_SENTENCE_COUNT = 5;
const CACHE_WINDOW_BEFORE = 5;
const MAX_AUDIO_CACHE_ITEMS = 64;
const MAX_PARALLEL_PRELOADS = 2;
const PERSISTENT_AUDIO_DB_NAME = "tts-word-reader-audio-cache";
const PERSISTENT_AUDIO_DB_VERSION = 1;
const PERSISTENT_AUDIO_STORE_NAME = "audio";
const PERSISTENT_AUDIO_CACHE_MAX_ITEMS = 500;
const PERSISTENT_AUDIO_CACHE_MAX_BYTES = 300 * 1024 * 1024;
const TTS_PUNCTUATION_REGEX = /[，。！？；：、,.!?;:]/g;

// 主组件 - 使用dynamic import强制客户端渲染
const TTSReader = () => {
  // 状态
  const [isPlaying, setIsPlaying] = useState(false)
  const [documentHtml, setDocumentHtml] = useState<string>("")
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0)
  const [sentences, setSentences] = useState<Sentence[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isAudioLoading, setIsAudioLoading] = useState(false)
  const fontSize = 100
  const [selectedVoice, setSelectedVoice] = useState<string>(AVAILABLE_TTS_VOICES[0].id)
  const [selectedStyle, setSelectedStyle] = useState<string>(DEFAULT_TTS_STYLE)
  const [apiEndpoint, setApiEndpoint] = useState<string>(DEFAULT_TTS_API_ENDPOINT)
  const [highlightedHtml, setHighlightedHtml] = useState<string>("")
  const [playbackRate, setPlaybackRate] = useState<number>(1.0) // 默认值，客户端加载后再更新
  
  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const mammothRef = useRef<typeof import("mammoth") | null>(null)
  const currentIndexRef = useRef<number>(0) // 添加索引的ref，确保始终使用最新值
  const isPlayingRef = useRef<boolean>(false)
  const playbackSessionRef = useRef<number>(0)
  const activeRequestControllersRef = useRef<Set<AbortController>>(new Set())
  const audioCache = useRef<Map<string, AudioCacheItem>>(new Map()) // 音频缓存
  const preloadQueueRef = useRef<PreloadQueueItem[]>([])
  const activePreloadCountRef = useRef(0)
  const persistentAudioDbPromiseRef = useRef<Promise<IDBDatabase | null> | null>(null)
  const persistentAudioBlobPromisesRef = useRef<Map<string, Promise<Blob>>>(new Map())
  const poolSize = PRELOAD_SENTENCE_COUNT // 预请求池大小
  
  // 浏览器环境检测 - 简化为单个mounted状态
  const [mounted, setMounted] = useState(false)
  const [mammothLoaded, setMammothLoaded] = useState(false)

  const setPlayingState = (playing: boolean) => {
    isPlayingRef.current = playing;
    setIsPlaying(playing);
  };

  const isAbortError = (error: unknown) => {
    return error instanceof DOMException && error.name === "AbortError";
  };

  const abortActiveRequests = () => {
    preloadQueueRef.current = [];
    persistentAudioBlobPromisesRef.current.clear();
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
    setIsAudioLoading(false);
  };

  const getSavedPlaybackRate = () => {
    if (typeof window === "undefined") return 1.0;

    const savedRate = localStorage.getItem("ttsPlaybackRate");
    if (!savedRate) return 1.0;

    const parsedRate = Number(savedRate);
    if (!Number.isFinite(parsedRate)) return 1.0;

    return parseFloat(parsedRate.toFixed(1));
  };

  const applySavedPlaybackRate = (audio: HTMLAudioElement) => {
    audio.playbackRate = getSavedPlaybackRate();
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
    // 将播放速率保存到localStorage
    if (mounted && typeof window !== 'undefined') {
      try {
        localStorage.setItem('ttsPlaybackRate', playbackRate.toString());
      } catch (error) {
        console.error("保存播放速率失败:", error);
      }
    }
    
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

  // 客户端初始化
  useEffect(() => {
    setMounted(true)
    
    // 加载用户常用语音、风格和速度
    try {
      const savedVoice = localStorage.getItem("ttsVoice");
      if (savedVoice && AVAILABLE_TTS_VOICES.some((voice) => voice.id === savedVoice)) {
        setSelectedVoice(savedVoice);
      }

      const savedStyle = localStorage.getItem("ttsStyle");
      if (savedStyle && AVAILABLE_TTS_STYLES.some((style) => style.id === savedStyle)) {
        setSelectedStyle(savedStyle);
      }

      setPlaybackRate(getSavedPlaybackRate());
    } catch (error) {
      console.error("加载TTS用户偏好失败:", error);
    }

    // 加载API端点
    try {
      const savedEndpoint = localStorage.getItem("ttsApiEndpoint");
      if (savedEndpoint) {
        setApiEndpoint(savedEndpoint);
      }
    } catch (error) {
      console.error("加载API端点设置失败:", error);
    }

    // 加载mammoth库
    const loadMammoth = async () => {
      try {
        const mammothModule = await import("mammoth")
        mammothRef.current = mammothModule
        setMammothLoaded(true)
      } catch (error) {
        console.error("加载mammoth库失败:", error)
      }
    }

    loadMammoth()
    
    // 清理函数
    return () => {
      invalidatePlaybackSession();
      releaseAudio(audioRef.current || undefined);
      audioRef.current = null;
      clearAudioCache();
      persistentAudioDbPromiseRef.current?.then((db) => db?.close());
    };
  // 这里只需要组件卸载清理当前 ref 持有的资源。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openPersistentAudioDb = () => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return Promise.resolve(null);
    }

    if (persistentAudioDbPromiseRef.current) {
      return persistentAudioDbPromiseRef.current;
    }

    persistentAudioDbPromiseRef.current = new Promise<IDBDatabase | null>((resolve) => {
      let request: IDBOpenDBRequest;
      try {
        request = window.indexedDB.open(PERSISTENT_AUDIO_DB_NAME, PERSISTENT_AUDIO_DB_VERSION);
      } catch (error) {
        console.error("打开 IndexedDB 音频缓存失败:", error);
        resolve(null);
        return;
      }

      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.objectStoreNames.contains(PERSISTENT_AUDIO_STORE_NAME)
          ? request.transaction?.objectStore(PERSISTENT_AUDIO_STORE_NAME)
          : db.createObjectStore(PERSISTENT_AUDIO_STORE_NAME, { keyPath: "key" });

        if (store && !store.indexNames.contains("lastUsed")) {
          store.createIndex("lastUsed", "lastUsed", { unique: false });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };

      request.onerror = () => {
        console.error("打开 IndexedDB 音频缓存失败:", request.error);
        resolve(null);
      };

      request.onblocked = () => {
        console.warn("IndexedDB 音频缓存升级被其他页面阻塞");
      };
    });

    return persistentAudioDbPromiseRef.current;
  };

  const readPersistentAudioBlob = async (key: string) => {
    const db = await openPersistentAudioDb();
    if (!db) return null;

    return new Promise<Blob | null>((resolve) => {
      const transaction = db.transaction(PERSISTENT_AUDIO_STORE_NAME, "readwrite");
      const store = transaction.objectStore(PERSISTENT_AUDIO_STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const record = request.result as PersistentAudioRecord | undefined;
        if (!record?.blob) {
          resolve(null);
          return;
        }

        record.lastUsed = Date.now();
        store.put(record);
        resolve(record.blob);
      };

      request.onerror = () => {
        console.error("读取 IndexedDB 音频缓存失败:", request.error);
        resolve(null);
      };

      transaction.onerror = () => {
        console.error("IndexedDB 音频缓存读取事务失败:", transaction.error);
        resolve(null);
      };
    });
  };

  const prunePersistentAudioCache = async () => {
    const db = await openPersistentAudioDb();
    if (!db) return;

    const records = await new Promise<PersistentAudioRecord[]>((resolve) => {
      const transaction = db.transaction(PERSISTENT_AUDIO_STORE_NAME, "readonly");
      const store = transaction.objectStore(PERSISTENT_AUDIO_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve((request.result as PersistentAudioRecord[]) || []);
      };

      request.onerror = () => {
        console.error("读取 IndexedDB 音频缓存列表失败:", request.error);
        resolve([]);
      };
    });

    let totalBytes = records.reduce((sum, record) => sum + (record.byteSize || record.blob?.size || 0), 0);
    let totalItems = records.length;
    if (totalItems <= PERSISTENT_AUDIO_CACHE_MAX_ITEMS && totalBytes <= PERSISTENT_AUDIO_CACHE_MAX_BYTES) {
      return;
    }

    const evictableRecords = [...records].sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0));

    await new Promise<void>((resolve) => {
      const transaction = db.transaction(PERSISTENT_AUDIO_STORE_NAME, "readwrite");
      const store = transaction.objectStore(PERSISTENT_AUDIO_STORE_NAME);

      for (const record of evictableRecords) {
        if (totalItems <= PERSISTENT_AUDIO_CACHE_MAX_ITEMS && totalBytes <= PERSISTENT_AUDIO_CACHE_MAX_BYTES) {
          break;
        }

        store.delete(record.key);
        totalItems -= 1;
        totalBytes -= record.byteSize || record.blob?.size || 0;
      }

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        console.error("清理 IndexedDB 音频缓存失败:", transaction.error);
        resolve();
      };
    });
  };

  const writePersistentAudioBlob = async (chunk: AudioChunk, blob: Blob) => {
    const db = await openPersistentAudioDb();
    if (!db) return;

    const now = Date.now();
    const record: PersistentAudioRecord = {
      key: chunk.persistentKey,
      blob,
      byteSize: blob.size,
      createdAt: now,
      lastUsed: now,
      apiEndpoint,
      voice: selectedVoice,
      style: selectedStyle,
      text: chunk.text,
    };

    await new Promise<void>((resolve) => {
      const transaction = db.transaction(PERSISTENT_AUDIO_STORE_NAME, "readwrite");
      const store = transaction.objectStore(PERSISTENT_AUDIO_STORE_NAME);

      store.put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        console.error("写入 IndexedDB 音频缓存失败:", transaction.error);
        resolve();
      };
    });

    prunePersistentAudioCache().catch((error) => {
      console.error("清理 IndexedDB 音频缓存失败:", error);
    });
  };

  const loadPersistentAudioBlob = (chunk: AudioChunk, controller: AbortController) => {
    const existingPromise = persistentAudioBlobPromisesRef.current.get(chunk.persistentKey);
    if (existingPromise) return existingPromise;

    const promise = (async () => {
      const persistentBlob = await readPersistentAudioBlob(chunk.persistentKey);
      if (persistentBlob) return persistentBlob;

      const requestText = chunk.text.slice(0, MAX_TTS_TEXT_LENGTH);
      const audioBlob = await generateSpeechBlob(requestText, selectedVoice, apiEndpoint, {
        speed: 1.0,
        pitch: "0",
        volume: "0",
        style: selectedStyle,
        signal: controller.signal,
      });

      if (!controller.signal.aborted) {
        writePersistentAudioBlob(chunk, audioBlob).catch((error) => {
          console.error("写入 IndexedDB 音频缓存失败:", error);
        });
      }

      return audioBlob;
    })().finally(() => {
      persistentAudioBlobPromisesRef.current.delete(chunk.persistentKey);
    });

    persistentAudioBlobPromisesRef.current.set(chunk.persistentKey, promise);
    return promise;
  };

  const splitTextIntoTTSChunks = (text: string) => {
    const normalizedText = text.replace(/\s+/g, " ").trim();
    if (!normalizedText) return [];
    if (normalizedText.length <= MAX_TTS_TEXT_LENGTH) return [normalizedText];

    const chunks: string[] = [];
    let currentChunk = "";
    let lastPosition = 0;
    const matches = [...normalizedText.matchAll(TTS_PUNCTUATION_REGEX)];

    const pushOversizedText = (value: string) => {
      for (let i = 0; i < value.length; i += MAX_TTS_TEXT_LENGTH) {
        const chunk = value.slice(i, i + MAX_TTS_TEXT_LENGTH).trim();
        if (chunk) chunks.push(chunk);
      }
    };

    const pushSegment = (segment: string) => {
      const normalizedSegment = currentChunk ? segment : segment.trimStart();
      if (!normalizedSegment.trim()) return;

      if (normalizedSegment.length > MAX_TTS_TEXT_LENGTH) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
          currentChunk = "";
        }
        pushOversizedText(normalizedSegment);
        return;
      }

      if (currentChunk.length + normalizedSegment.length <= MAX_TTS_TEXT_LENGTH) {
        currentChunk += normalizedSegment;
        return;
      }

      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = normalizedSegment.trimStart();
    };

    if (matches.length === 0) {
      pushOversizedText(normalizedText);
      return chunks;
    }

    for (const match of matches) {
      if (match.index === undefined) continue;
      const segment = normalizedText.slice(lastPosition, match.index + match[0].length);
      pushSegment(segment);
      lastPosition = match.index + match[0].length;
    }

    if (lastPosition < normalizedText.length) {
      pushSegment(normalizedText.slice(lastPosition));
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  };

  const makeAudioCacheKey = (sentenceIndex: number, chunkIndex: number, text: string) => {
    return [apiEndpoint, selectedVoice, selectedStyle, sentenceIndex, chunkIndex, text].join("::");
  };

  const makePersistentAudioCacheKey = (text: string) => {
    return ["tts-v1", apiEndpoint, selectedVoice, selectedStyle, text].join("::");
  };

  const getSentenceChunks = (sentenceIndex: number): AudioChunk[] => {
    const sentence = sentences[sentenceIndex];
    if (!sentence || sentence.text.trim().length < MIN_SPEAKABLE_TEXT_LENGTH) return [];

    return splitTextIntoTTSChunks(sentence.text).map((text, chunkIndex) => ({
      sentenceIndex,
      chunkIndex,
      text,
      key: makeAudioCacheKey(sentenceIndex, chunkIndex, text),
      persistentKey: makePersistentAudioCacheKey(text),
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
      persistentKey: chunk.persistentKey,
      status: "loading",
      controller,
      lastUsed: Date.now(),
    };

    const promise = (async () => {
      let audioUrl = "";

      try {
        const audioBlob = await loadPersistentAudioBlob(chunk, controller);
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

  const enqueuePreloadChunk = (chunk: AudioChunk, sessionId: number) => {
    if (!isPlaybackSessionActive(sessionId) || isChunkAlreadyRequested(chunk)) return;
    if (preloadQueueRef.current.some((item) => item.chunk.key === chunk.key)) return;

    preloadQueueRef.current.push({ chunk, sessionId });
    drainPreloadQueue();
  };

  const preloadPlaybackWindow = (
    sentenceIndex: number,
    sessionId: number = playbackSessionRef.current,
    currentChunkIndex: number = -1
  ) => {
    if (!sentences.length || !mounted || !isPlayingRef.current || !isPlaybackSessionActive(sessionId)) return;

    const currentSentenceChunks = getSentenceChunks(sentenceIndex);
    for (const chunk of currentSentenceChunks.slice(currentChunkIndex + 1)) {
      enqueuePreloadChunk(chunk, sessionId);
    }

    const endIndex = Math.min(sentenceIndex + 1 + poolSize, sentences.length);
    const upcomingSentences: AudioChunk[][] = [];
    for (let i = sentenceIndex + 1; i < endIndex; i++) {
      const chunks = getSentenceChunks(i);
      if (chunks.length > 0) upcomingSentences.push(chunks);
    }

    let chunkIndex = 0;
    let queuedAny = true;
    while (queuedAny) {
      queuedAny = false;
      for (const chunks of upcomingSentences) {
        const chunk = chunks[chunkIndex];
        if (chunk) {
          enqueuePreloadChunk(chunk, sessionId);
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

    const audio = await loadAudioChunk(chunk, sessionId);
    if (!isPlaybackSessionActive(sessionId) || !isPlayingRef.current) {
      setIsAudioLoading(false);
      return false;
    }

    stopCurrentAudio(false);
    audioRef.current = audio;
    resetAudioPosition(audio);
    applySavedPlaybackRate(audio);

    try {
      await audio.play();
      setIsAudioLoading(false);
      preloadPlaybackWindow(chunk.sentenceIndex, sessionId, chunk.chunkIndex);
      const ended = await waitForAudioEnd(audio);
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

    for (const chunk of chunks) {
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
  
  // 当文档加载或当前句子索引变化时，更新高亮显示
  useEffect(() => {
    if (!mounted) return

    if (documentHtml && sentences.length > 0) {
      updateHighlightedHtml()
    }
  // updateHighlightedHtml 只依赖上面的状态，单独列函数会让 effect 每次 render 都触发。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentHtml, sentences, currentSentenceIndex, mounted])

  // 高亮显示当前朗读的句子
  const updateHighlightedHtml = () => {
    if (!mounted || !documentHtml || sentences.length === 0 || currentSentenceIndex < 0) {
      setHighlightedHtml(documentHtml)
      return
    }

    const currentSentence = sentences[currentSentenceIndex]
    if (!currentSentence) {
      setHighlightedHtml(documentHtml)
      return
    }

    // 高亮当前句子
    const highlightedContent = highlightSentenceInHtml(
      documentHtml, 
      currentSentence
    )
    
    setHighlightedHtml(highlightedContent)
  }
  
  // 处理文件上传
  const handleFileUpload = async (selectedFile: File) => {
    if (!mounted || !mammothLoaded || !mammothRef.current) return

    setIsLoading(true)
    
    // 重置播放状态
    setPlayingState(false)
    setCurrentSentenceIndex(0)
    currentIndexRef.current = 0 // 同时更新ref
    stopPlaybackAndClearCache();

    try {
      // 使用mammoth.js解析Word文档
      const arrayBuffer = await selectedFile.arrayBuffer()
      const result = await mammothRef.current.convertToHtml({ arrayBuffer })

      // 获取HTML内容
      const html = result.value
      setDocumentHtml(html)

      // 将文档分割成句子以便朗读
      const sentenceArray = extractSentencesFromHtml(html)
      
      // 保存句子数组
      setSentences(sentenceArray)

      // 重置当前朗读位置到第一句
      setCurrentSentenceIndex(0)
      currentIndexRef.current = 0 // 同时更新ref
      
      // 文档加载完成后不自动预加载，等待用户点击播放
      // 移除之前的自动预加载代码
    } catch (error) {
      console.error("解析Word文档时出错:", error)
      alert("解析文档失败，请检查文件格式。")
    } finally {
      setIsLoading(false)
    }
  }
  
  // 处理API端点变更
  const handleApiEndpointChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEndpoint = e.target.value;
    if (newEndpoint !== apiEndpoint) {
      setPlayingState(false);
      stopPlaybackAndClearCache();
    }
    setApiEndpoint(newEndpoint);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem("ttsApiEndpoint", newEndpoint);
      } catch (error) {
        console.error("保存API端点失败:", error);
      }
    }
  };

  const handleVoiceChange = (voice: string) => {
    if (voice !== selectedVoice) {
      setPlayingState(false);
      stopPlaybackAndClearCache();
      setSelectedVoice(voice);
      try {
        localStorage.setItem("ttsVoice", voice);
      } catch (error) {
        console.error("保存语音设置失败:", error);
      }
    }
  };

  const handleStyleChange = (style: string) => {
    if (style !== selectedStyle) {
      setPlayingState(false);
      stopPlaybackAndClearCache();
      setSelectedStyle(style);
      try {
        localStorage.setItem("ttsStyle", style);
      } catch (error) {
        console.error("保存语音风格设置失败:", error);
      }
    }
  };

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
  };
  
  // 切换播放/暂停
  const handleTogglePlayback = () => {
    // 使用本地变量记录新状态，以避免闭包中使用旧状态
    const newPlayingState = !isPlayingRef.current;
    
    // 设置播放状态
    setPlayingState(newPlayingState);
    
    if (newPlayingState) {
      const sessionId = beginPlaybackSession();
      // 确保使用最新的速率设置
      syncPlaybackRateFromLocalStorage();
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
      
      // 更新索引
      setCurrentSentenceIndex(newIndex);
      currentIndexRef.current = newIndex; // 同时更新ref
      setPlayingState(true);
      
      // 确保使用最新的速率设置
      syncPlaybackRateFromLocalStorage();
      
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
      
      // 更新索引
      setCurrentSentenceIndex(newIndex);
      currentIndexRef.current = newIndex; // 同时更新ref
      setPlayingState(true);
      
      // 确保使用最新的速率设置
      syncPlaybackRateFromLocalStorage();
      
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
    
    // 更新索引
    setCurrentSentenceIndex(newIndex);
    currentIndexRef.current = newIndex; // 同时更新ref
    
    // 确保使用最新的速率设置
    syncPlaybackRateFromLocalStorage();
    
    // 如果正在播放，则在新位置继续播放
    if (shouldContinuePlaying) {
      setTimeout(() => {
        if (isPlaybackSessionActive(sessionId)) {
          playCurrentSentence(true, sessionId);
        }
      }, 50);
    } else {
      // 如果不是播放状态，仅更新高亮，不加载音频
      updateHighlightedHtml();
    }
  };
  
  // 从localStorage同步播放速率
  const syncPlaybackRateFromLocalStorage = () => {
    if (typeof window !== 'undefined') {
      try {
        const newRate = getSavedPlaybackRate();
        if (newRate !== playbackRate) {
          setPlaybackRate(newRate);
        }
      } catch (error) {
        console.error("读取播放速率设置失败:", error);
      }
    }
  };
  
  // 播放当前句子
  const playCurrentSentence = async (
    forcePlay: boolean = false,
    sessionId: number = playbackSessionRef.current
  ) => {
    // 确保使用最新的速率设置
    syncPlaybackRateFromLocalStorage();

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
          syncPlaybackRateFromLocalStorage();
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
      setIsAudioLoading(false);
      setPlayingState(false);
      return false;
    }
  };

  // 如果组件未挂载，返回Loading状态或空内容
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 py-3 sm:py-4 md:py-6 lg:py-8 overflow-hidden">
      <div className="container mx-auto px-2 sm:px-4 md:px-6 h-full flex flex-col">
        <header className="flex justify-between items-center mb-2 md:mb-4 lg:mb-6">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
            文档朗读系统
          </h1>
          <ThemeToggle />
        </header>

        {/* 移动端布局：使用纵向排列 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3 md:gap-5 lg:gap-8 flex-grow overflow-hidden">
          {/* 左侧面板：上传和设置 */}
          <div className="flex flex-col overflow-hidden">
            <div className="md:hidden flex space-x-2">
              <div className="w-1/2">
                {/* 文件上传组件 - 移动端 */}
            <FileUploader 
              isLoading={isLoading} 
              mammothLoaded={mammothLoaded} 
              onFileUpload={handleFileUpload} 
            />
              </div>
              <div className="w-1/2">
                {/* 设置组件 - 移动端 */}
                  <SettingsPanel 
                    voices={AVAILABLE_TTS_VOICES}
                    styles={AVAILABLE_TTS_STYLES}
                    selectedVoice={selectedVoice}
                    selectedStyle={selectedStyle}
                    onVoiceChange={handleVoiceChange}
                    onStyleChange={handleStyleChange}
                  />
              </div>
            </div>
            
            {/* 桌面端显示 */}
            <div className="hidden md:flex md:flex-col md:gap-4 lg:gap-8 h-full">
              <div className="flex-1">
                {/* 文件上传组件 - 桌面端 */}
                <FileUploader 
                  isLoading={isLoading} 
                  mammothLoaded={mammothLoaded} 
                  onFileUpload={handleFileUpload} 
                />
              </div>

              <div className="flex-1">
                {/* 设置组件 - 桌面端 */}
                <SettingsPanel 
                  voices={AVAILABLE_TTS_VOICES}
                  styles={AVAILABLE_TTS_STYLES}
                  selectedVoice={selectedVoice}
                  selectedStyle={selectedStyle}
                  onVoiceChange={handleVoiceChange}
                  onStyleChange={handleStyleChange}
                />
              </div>
            </div>
          </div>

          {/* 中间和右侧：文档预览和控制 */}
          <div className="md:col-span-2 overflow-hidden flex flex-col">
            {/* 文档内容和播放控制 */}
            <Card className="shadow-lg md:shadow-xl border border-gray-100 dark:border-gray-800 h-full overflow-hidden flex flex-col">
              <Tabs defaultValue="preview" className="flex flex-col h-full overflow-hidden">
                <div className="px-2 sm:px-4 md:px-6 pt-2 md:pt-4 pb-0">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="preview">文档预览</TabsTrigger>
                    <TabsTrigger value="settings">高级设置</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="preview" className="flex-1 px-2 sm:px-4 md:px-6 pb-1 md:pb-2 overflow-hidden  mb-3 ">
                  {/* 文档预览组件 */}
                  <DocumentViewer 
                    isLoading={isLoading}
                    html={highlightedHtml}
                    fontSize={fontSize}
                  />
                </TabsContent>

                <TabsContent value="settings" className="flex-1 px-2 sm:px-4 md:px-6 pb-1 md:pb-2">
                  <div className="mt-1 sm:mt-2 border rounded-lg bg-white dark:bg-gray-900 shadow-inner h-full">
                    <ScrollArea className="h-[calc(100vh-200px)] sm:h-[calc(100vh-220px)] w-full p-2 sm:p-4">
                      <div className="space-y-3 md:space-y-5 lg:space-y-6">
                        <div className="space-y-1 md:space-y-2">
                          <label className="text-sm md:text-base font-medium">TTS API 端点</label>
                          <input
                          type="text"
                            className="w-full p-1.5 md:p-2 lg:p-3 border rounded-md text-sm md:text-base bg-gray-50 dark:bg-gray-800"
                          placeholder={DEFAULT_TTS_API_ENDPOINT}
                          value={apiEndpoint}
                          onChange={handleApiEndpointChange}
                        />
                          <p className="text-xs md:text-sm text-muted-foreground mt-1 md:mt-2">
                            使用兼容 OpenAI TTS 的 /v1/audio/speech 端点，设置将自动保存
                          </p>
                      </div>
                      
                        {/* <div className="space-y-1 md:space-y-2">
                          <label className="text-sm md:text-base font-medium">TTS API 高级设置</label>
                          <p className="text-xs md:text-sm text-muted-foreground">
                          在这里可以添加更多高级设置选项，如语速、音量等控制。
                        </p>
                      </div>
                      
                        <div className="space-y-1 md:space-y-2">
                          <label className="text-sm md:text-base font-medium">预加载设置</label>
                          <p className="text-xs md:text-sm text-muted-foreground">
                          系统会自动预加载后续{poolSize}个句子，以保证朗读连贯性。
                        </p>
                        </div> */}
                      </div>
                    </ScrollArea>
                  </div>
                </TabsContent>

                {/* 播放控制组件 */}
                <div className="border-t border-gray-100 dark:border-gray-800 mt-auto">
                <PlaybackControls 
                  isPlaying={isPlaying}
                  isLoading={isAudioLoading}
                  currentIndex={currentSentenceIndex}
                  totalCount={sentences.length}
                  playbackRate={playbackRate}
                  hasPrevious={currentSentenceIndex > 0}
                  hasNext={currentSentenceIndex < sentences.length - 1}
                  onTogglePlay={handleTogglePlayback}
                  onPrevious={handlePreviousSentence}
                  onNext={handleNextSentence}
                  onPlaybackRateChange={handlePlaybackRateChange}
                  onProgressChange={handleProgressChange}
                />
                </div>
              </Tabs>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

// 导出无SSR的组件
export default dynamic(() => Promise.resolve(TTSReader), { ssr: false });
