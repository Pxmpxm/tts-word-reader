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
import { generateSpeech } from "@/lib/ttsAPI"
import {
  AVAILABLE_TTS_STYLES,
  AVAILABLE_TTS_VOICES,
  DEFAULT_TTS_API_ENDPOINT,
  DEFAULT_TTS_STYLE
} from "@/lib/ttsOptions"
import type { Sentence } from "@/lib/types"
import dynamic from "next/dynamic"

type AudioCacheKey = number | string;

// 音频缓存项类型
interface AudioCacheItem {
  index: number;
  url?: string;
  audio?: HTMLAudioElement;
  status: 'pending' | 'loading' | 'ready' | 'error';
  textChunks?: string[];
  currentChunkIndex?: number;
}

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
  const audioCache = useRef<Map<AudioCacheKey, AudioCacheItem>>(new Map()) // 音频缓存
  const poolSize = 5 // 预请求池大小
  
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
    activeRequestControllersRef.current.forEach((controller) => {
      controller.abort();
    });
    activeRequestControllersRef.current.clear();
  };

  const beginPlaybackSession = () => {
    abortActiveRequests();
    playbackSessionRef.current += 1;
    return playbackSessionRef.current;
  };

  const invalidatePlaybackSession = () => {
    abortActiveRequests();
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
    };
  // 这里只需要组件卸载清理当前 ref 持有的资源。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 预请求函数 - 预加载多个句子
  const preloadSentences = async (startIndex: number, sessionId: number = playbackSessionRef.current) => {
    if (!sentences.length || !mounted || !isPlayingRef.current || !isPlaybackSessionActive(sessionId)) return;
    
    // 确保不超出边界
    const endIndex = Math.min(startIndex + poolSize, sentences.length);
    
    for (let i = startIndex; i < endIndex; i++) {
      // 如果已在缓存中且状态不是错误，跳过（包括pending和loading状态）
      if (audioCache.current.has(i) && 
          (audioCache.current.get(i)?.status === 'ready' || 
           audioCache.current.get(i)?.status === 'loading' ||
           audioCache.current.get(i)?.status === 'pending')) continue;
      
      const sentence = sentences[i];
      if (!sentence || sentence.text.length < 6) continue;
      
      // 按顺序预加载，一次只请求一个
      // 先标记为pending状态，避免重复请求
      audioCache.current.set(i, { 
        index: i, 
        status: 'pending' 
      });
      
      try {
        await fetchTTSAudio(sentence.text, i, undefined, sessionId);
        // 如果用户暂停了播放，停止预加载
        if (!isPlayingRef.current || !isPlaybackSessionActive(sessionId)) break;
      } catch (err) {
        if (!isAbortError(err)) {
          console.error(`预加载句子${i}失败:`, err);
        }
        if (!isPlayingRef.current || !isPlaybackSessionActive(sessionId)) break;
      }
    }
  };
  
  // 获取TTS音频
  const fetchTTSAudio = async (
    text: string,
    index: number,
    chunkIndex?: number,
    sessionId: number = playbackSessionRef.current
  ): Promise<string> => {
    const controller = new AbortController();
    activeRequestControllersRef.current.add(controller);

    try {
      if (!isPlaybackSessionActive(sessionId)) {
        throw new DOMException("播放会话已失效", "AbortError");
      }

      // 确保文本不超过150字符
      if (text.length > 150) {
        console.warn(`文本长度超过150字符，已截断: ${text.length}字符`);
        text = text.substring(0, 150);
      }
      
      // 更新状态为loading - 如果有chunkIndex，状态保持在original状态
      if (chunkIndex === undefined) {
        audioCache.current.set(index, { 
          index, 
          status: 'loading' 
        });
      }
      
      const audioUrl = await generateSpeech(text, selectedVoice, apiEndpoint, {
        speed: 1.0,
        pitch: "0",
        volume: "0",
        style: selectedStyle,
        signal: controller.signal,
      });

      if (!isPlaybackSessionActive(sessionId) || controller.signal.aborted) {
        if (audioUrl.startsWith("blob:")) {
          URL.revokeObjectURL(audioUrl);
        }
        throw new DOMException("播放会话已失效", "AbortError");
      }
      
      // 创建音频对象
      const audio = new Audio();
      
      // 设置加载完成回调
      audio.onloadeddata = () => {
        if (!isPlaybackSessionActive(sessionId) || controller.signal.aborted) {
          releaseAudio(audio, audioUrl);
          return;
        }

        applySavedPlaybackRate(audio);
        
        // 如果是分块的一部分
        if (chunkIndex !== undefined) {
          // 获取当前缓存项
          const cachedItem = audioCache.current.get(index);
          if (cachedItem && cachedItem.textChunks && cachedItem.textChunks.length > 0) {
            // 如果是第一个块，更新主音频
            if (chunkIndex === 0) {
              audioCache.current.set(index, { 
                ...cachedItem,
                url: audioUrl, 
                audio, 
                status: 'ready',
                currentChunkIndex: 0
              });
            } else {
              // 为后续块创建新的缓存项（使用子索引）
              const chunkCacheKey = `${index}_chunk_${chunkIndex}`;
              audioCache.current.set(chunkCacheKey, {
                index,
                url: audioUrl,
                audio,
                status: 'ready',
              });
            }
          } else {
            releaseAudio(audio, audioUrl);
          }
        } else {
          // 正常单块处理
          audioCache.current.set(index, { 
            index, 
            url: audioUrl, 
            audio, 
            status: 'ready' 
          });
        }
      };
      
      // 设置加载错误回调
      audio.onerror = () => {
        releaseAudio(audio, audioUrl);

        if (!isPlaybackSessionActive(sessionId) || controller.signal.aborted) {
          return;
        }

        if (chunkIndex !== undefined) {
          // 如果是分块的一部分，只标记该块为错误
          const chunkCacheKey = `${index}_chunk_${chunkIndex}`;
          audioCache.current.set(chunkCacheKey, {
            index,
            status: 'error',
          });
        } else {
          // 正常单块处理
          audioCache.current.set(index, { index, status: 'error' });
        }
      };
      
      // 设置音频源并加载
      audio.src = audioUrl;
      audio.load();
      
      return audioUrl;
    } catch (error) {
      if (isAbortError(error) || !isPlaybackSessionActive(sessionId)) {
        throw error;
      }

      if (chunkIndex !== undefined) {
        // 如果是分块的一部分，只标记该块为错误
        const chunkCacheKey = `${index}_chunk_${chunkIndex}`;
        audioCache.current.set(chunkCacheKey, {
          index,
          status: 'error',
        });
      } else {
        // 正常单块处理
        audioCache.current.set(index, { index, status: 'error' });
      }
      throw error;
    } finally {
      activeRequestControllersRef.current.delete(controller);
    }
  };
  
  // 设置音频结束事件 - 修改以支持多块播放
  const setupAudioEndEvent = (
    audio: HTMLAudioElement,
    index: number,
    isTextChunk: boolean = false,
    sessionId: number = playbackSessionRef.current
  ) => {
    audio.onended = () => {
      if (!isPlaybackSessionActive(sessionId)) {
        return;
      }

      // 如果是文本块的一部分
      if (isTextChunk) {
        const cachedItem = audioCache.current.get(index);
        
        if (cachedItem && 
            cachedItem.textChunks && 
            cachedItem.textChunks.length > 0 && 
            cachedItem.currentChunkIndex !== undefined) {
          
          // 是否还有下一块
          const nextChunkIndex = cachedItem.currentChunkIndex + 1;
          
          if (nextChunkIndex < cachedItem.textChunks.length) {
            // 播放下一个文本块
            playNextTextChunk(index, nextChunkIndex, sessionId);
            return;
          }
        }
      }
      
      // 如果不是文本块或已经是最后一块，则处理常规的句子结束逻辑
      if (index === currentIndexRef.current && isPlayingRef.current) {
        // 如果有下一句，自动播放
        if (index < sentences.length - 1) {
          // 更新索引
          const nextIndex = index + 1;
          setCurrentSentenceIndex(nextIndex);
          currentIndexRef.current = nextIndex; // 同时更新ref
          
          // 确保使用最新的速率设置
          syncPlaybackRateFromLocalStorage();
          
          // 确保播放状态正确
          if (!isPlayingRef.current) {
            setPlayingState(true);
          }
          
          // 延迟播放下一句
          setTimeout(() => {
            if (isPlaybackSessionActive(sessionId)) {
              playCurrentSentence(true, sessionId);
            }
          }, 50);
        } else {
          // 已播放完所有句子，停止播放
          setPlayingState(false);
          setIsAudioLoading(false);
        }
      }
    };
  };
  
  // 播放下一个文本块
  const playNextTextChunk = async (sentenceIndex: number, chunkIndex: number, sessionId: number) => {
    if (!isPlaybackSessionActive(sessionId) || !isPlayingRef.current) {
      return false;
    }

    const cachedItem = audioCache.current.get(sentenceIndex);
    
    if (!cachedItem || !cachedItem.textChunks || chunkIndex >= cachedItem.textChunks.length) {
      console.error('无法播放下一个文本块：数据不完整');
      return false;
    }
    
    // 更新当前块索引
    audioCache.current.set(sentenceIndex, {
      ...cachedItem,
      currentChunkIndex: chunkIndex
    });
    
    // 检查这个块是否已经缓存
    const chunkCacheKey = `${sentenceIndex}_chunk_${chunkIndex}`;
    const chunkCachedItem = audioCache.current.get(chunkCacheKey);
    
    if (chunkCachedItem && chunkCachedItem.status === 'ready' && chunkCachedItem.audio) {
      // 已有缓存，直接播放
      stopCurrentAudio(false);
      
      audioRef.current = chunkCachedItem.audio;
      resetAudioPosition(audioRef.current);
      
      // 确保应用正确的播放速率
      applySavedPlaybackRate(audioRef.current);
      
      // 设置播放结束事件 - 标记为文本块
      setupAudioEndEvent(audioRef.current, sentenceIndex, true, sessionId);
      
      // 播放音频
      try {
        if (!isPlaybackSessionActive(sessionId) || !isPlayingRef.current) return false;
        await audioRef.current.play();
        setIsAudioLoading(false);
        return true;
      } catch (error) {
        console.error("播放缓存的块音频失败:", error);
        // 尝试重新获取
        audioCache.current.delete(chunkCacheKey);
      }
    }
    
    // 如果没有缓存或播放失败，获取新的音频
    try {
      // 从文本块数组获取当前块的文本
      const chunkText = cachedItem.textChunks[chunkIndex];
      
      // 生成音频
      await fetchTTSAudio(chunkText, sentenceIndex, chunkIndex, sessionId);
      
      // 等待缓存项准备好
      let attempts = 0;
      while (attempts < 20) {
        if (!isPlaybackSessionActive(sessionId) || !isPlayingRef.current) {
          return false;
        }

        const item = audioCache.current.get(chunkCacheKey);
        
        if (item && item.status === 'ready' && item.audio) {
          stopCurrentAudio(false);
          
          audioRef.current = item.audio;
          resetAudioPosition(audioRef.current);
          
          // 设置播放结束事件 - 标记为文本块
          setupAudioEndEvent(audioRef.current, sentenceIndex, true, sessionId);
          
          // 播放音频
          await audioRef.current.play();
          setIsAudioLoading(false);
          return true;
        }
        
        // 等待50ms后重试
        await new Promise(resolve => setTimeout(resolve, 50));
        attempts++;
      }
      
      // 如果尝试超过次数限制，返回失败
      return false;
    } catch (error) {
      if (!isAbortError(error)) {
        console.error("获取块音频失败:", error);
      }
      return false;
    }
  };
  
  // 清理缓存，在索引变化很大时调用
  const cleanupCache = (currentIndex: number) => {
    for (const [index, item] of audioCache.current.entries()) {
      // 如果是数字索引（非块缓存），且超出缓存范围
      if (typeof index === 'number' && (index < currentIndex - 5 || index > currentIndex + poolSize)) {
        releaseAudio(item.audio, item.url);
        audioCache.current.delete(index);
      }
      
      // 清理块缓存
      if (typeof index === 'string' && index.includes('_chunk_')) {
        // 提取出句子索引
        const sentenceIndex = parseInt(index.split('_chunk_')[0]);
        // 如果超出缓存范围
        if (sentenceIndex < currentIndex - 5 || sentenceIndex > currentIndex + poolSize) {
          releaseAudio(item.audio, item.url);
          audioCache.current.delete(index);
        }
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
      invalidatePlaybackSession();
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
    
    // 使用ref中的索引确保获取最新值
    const sentenceIndex = currentIndexRef.current;
    
    if (sentenceIndex < 0 || sentenceIndex >= sentences.length) {
      return false;
    }
    
    const currentSentence = sentences[sentenceIndex];
    
    // 检查文本长度，如果小于6个字符则跳过
    if (currentSentence.text.length < 6) {
      // 检查是否应自动播放下一句
      if (sentenceIndex < sentences.length - 1) {
        // 更新索引并播放下一句
        const nextIndex = sentenceIndex + 1;
        setCurrentSentenceIndex(nextIndex);
        currentIndexRef.current = nextIndex; // 同时更新ref
        
        // 确保播放状态正确
        if (!isPlayingRef.current) {
          setPlayingState(true);
        }
        
        // 延迟播放下一句
        setTimeout(() => {
          if (isPlaybackSessionActive(sessionId)) {
            playCurrentSentence(true, sessionId);
          }
        }, 50);
      } else {
        // 已到最后一句，停止播放
        setPlayingState(false);
      }
      
      return true;
    }
    
    // 检查文本长度是否超过150字，如果超过则拆分处理
    if (currentSentence.text.length > 150) {
      // 将长句拆分成较短的段落
      const textChunks: string[] = [];
      const fullText = currentSentence.text;
      
      // 优化的分段逻辑：先尝试按标点符号分割，再按需按字符数分割
      // 支持更多的中英文标点符号
      const punctuationRegex = /[，。！？；：、,.!?;:|，。！？；：、,.!?;:|""''""''【】\[\]()（）]/g;
      const matches = [...fullText.matchAll(punctuationRegex)];
      
      // 确保标点位置按索引排序
      matches.sort((a, b) => (a.index || 0) - (b.index || 0));
      
      if (matches.length > 0) {
        // 有标点符号，按标点分割
        let lastPos = 0;
        let currentChunk = "";
        
        for (let i = 0; i < matches.length; i++) {
          const match = matches[i];
          if (!match || match.index === undefined) continue;
          
          // 当前的标点符号位置
          const punctPos = match.index;
          
          // 如果标点符号超出范围或已处理过，跳过
          if (punctPos < lastPos) continue;
          
          // 添加到当前块（包括标点）
          const segment = fullText.substring(lastPos, punctPos + 1);
          
          // 检查当前块加上新片段是否会超过150字
          if (currentChunk.length + segment.length <= 150) {
            // 不超过，直接添加
            currentChunk += segment;
          } else {
            // 超过了，需要处理
            
            // 1. 如果当前块为空但片段本身超过150，需要强制分割片段
            if (currentChunk.length === 0) {
              // 强制按字符数切割this片段
              let segmentPos = 0;
              while (segmentPos < segment.length) {
                const chunkSize = Math.min(150, segment.length - segmentPos);
                textChunks.push(segment.substring(segmentPos, segmentPos + chunkSize));
                segmentPos += chunkSize;
              }
              currentChunk = ""; // 保持为空
            } else {
              // 2. 当前块有内容，保存当前块并开始新块
              textChunks.push(currentChunk);
              
              // 检查segment是否本身也超过150
              if (segment.length > 150) {
                // 分割segment
                let segmentPos = 0;
                while (segmentPos < segment.length) {
                  const chunkSize = Math.min(150, segment.length - segmentPos);
                  textChunks.push(segment.substring(segmentPos, segmentPos + chunkSize));
                  segmentPos += chunkSize;
                }
                currentChunk = ""; // 重置为空
              } else {
                // segment不超过150，作为新块的开始
                currentChunk = segment;
              }
            }
          }
          
          // 更新上次处理的位置
          lastPos = punctPos + 1;
        }
        
        // 处理剩余部分
        if (lastPos < fullText.length) {
          const remainingText = fullText.substring(lastPos);
          
          // 检查剩余文本加上当前块是否超过150
          if (currentChunk.length + remainingText.length <= 150) {
            currentChunk += remainingText;
          } else {
            // 超过了，先保存当前块
            if (currentChunk.length > 0) {
              textChunks.push(currentChunk);
              currentChunk = "";
            }
            
            // 分割剩余文本
            let pos = 0;
            while (pos < remainingText.length) {
              textChunks.push(remainingText.substring(pos, Math.min(pos + 150, remainingText.length)));
              pos += 150;
            }
          }
        }
        
        // 添加最后一个块，如果有内容的话
        if (currentChunk.length > 0) {
          textChunks.push(currentChunk);
        }
      } else {
        // 没有标点符号，按固定字符数分割
        for (let i = 0; i < fullText.length; i += 150) {
          textChunks.push(fullText.substring(i, Math.min(i + 150, fullText.length)));
        }
      }
      
      // 确保所有块都不超过150字符
      const finalChunks = textChunks.map(chunk => {
        if (chunk.length > 150) {
          console.warn(`分段后文本块仍超过150字符(${chunk.length})，强制截断`);
          return chunk.substring(0, 150);
        }
        return chunk;
      });
      
      // 处理所有文本块
      if (finalChunks.length > 0) {
        try {
          // 更新缓存状态，包含所有文本块信息
          audioCache.current.set(sentenceIndex, { 
            index: sentenceIndex, 
            status: 'pending',
            textChunks: finalChunks,
            currentChunkIndex: 0
          });
          
          // 开始加载第一个文本块
          await fetchTTSAudio(finalChunks[0], sentenceIndex, 0, sessionId);
          
          // 预加载所有后续文本块（而不只是第二块）
          if (finalChunks.length > 1 && (isPlayingRef.current || forcePlay)) {
            // 使用Promise.all并行加载所有后续块，提高加载效率
            const preloadPromises = finalChunks.slice(1).map((chunk, index) => {
              // 使用setTimeout引入轻微延迟，避免同时发起太多请求
              return new Promise<void>(resolve => {
                setTimeout(async () => {
                  try {
                    if (!isPlaybackSessionActive(sessionId)) {
                      resolve();
                      return;
                    }
                    const chunkIndex = index + 1; // 因为我们从第二块开始（索引1）
                    await fetchTTSAudio(chunk, sentenceIndex, chunkIndex, sessionId);
                    resolve();
                  } catch (err) {
                    if (!isAbortError(err)) {
                      console.error(`预加载文本块${index + 1}失败:`, err);
                    }
                    resolve(); // 即使失败也resolve，避免阻塞其他请求
                  }
                }, index * 50); // 每个请求间隔50ms，避免同时发起太多请求
              });
            });
            
            // 不等待预加载完成，让它在后台异步进行
            Promise.all(preloadPromises).catch(err => {
              console.error("预加载文本块时出错:", err);
            });
          }
          
          // 等待第一个块准备好并播放
          let attempts = 0;
          
          while (attempts < 20) {
            if (!isPlaybackSessionActive(sessionId) || !isPlayingRef.current) {
              return false;
            }

            // 检查主缓存项
            const cachedItem = audioCache.current.get(sentenceIndex);
            if (cachedItem && cachedItem.status === 'ready' && cachedItem.audio) {
              stopCurrentAudio(false);
              
              audioRef.current = cachedItem.audio;
              resetAudioPosition(audioRef.current);
              
              // 确保应用正确的播放速率
              applySavedPlaybackRate(audioRef.current);
              
              // 设置播放结束事件 - 标记为文本块
              setupAudioEndEvent(audioRef.current, sentenceIndex, true, sessionId);
              
              // 播放音频
              await audioRef.current.play();
              setIsAudioLoading(false);
              return true;
            }
            
            // 等待50ms后重试
            await new Promise(resolve => setTimeout(resolve, 50));
            attempts++;
          }
          
          // 如果第一个块加载失败，回退到普通处理方式
          console.warn("分块处理失败，回退到普通处理");
          audioCache.current.delete(sentenceIndex);
          // 继续执行下面的正常处理代码
        } catch (err) {
          if (isAbortError(err)) {
            return false;
          }

          console.error(`处理分段句子失败:`, err);
          // 回退到普通处理
          audioCache.current.delete(sentenceIndex);
        }
      }
    }
    
    // 正常处理（非分段或分段失败后的回退）
    // 只有在真正播放时才触发预加载
    if (isPlayingRef.current || forcePlay) {
      // 预加载当前句子
      const cachedItem = audioCache.current.get(sentenceIndex);
      
      // 如果缓存中没有，则请求当前句子
      if (!cachedItem || cachedItem.status === 'error') {
        // 先标记为pending状态，避免重复请求
        audioCache.current.set(sentenceIndex, { 
          index: sentenceIndex, 
          status: 'pending' 
        });
        
        try {
          // 确保文本不超过150字符
          const text = currentSentence.text.length > 150 
            ? currentSentence.text.substring(0, 150) 
            : currentSentence.text;
          
          await fetchTTSAudio(text, sentenceIndex, undefined, sessionId);
        } catch (err) {
          if (isAbortError(err)) {
            return false;
          }
          console.error(`加载当前句子失败:`, err);
        }
      }
      
      // 预加载后续句子（只在播放状态下）
      if (isPlayingRef.current) {
        preloadSentences(sentenceIndex + 1, sessionId);
      }
    }
    
    // 查看缓存中是否有当前句子的音频
    const cachedItem = audioCache.current.get(sentenceIndex);
    
    // 如果有缓存项并且是就绪状态
    if (cachedItem && cachedItem.status === 'ready' && cachedItem.audio) {
      // 使用缓存的音频，无需加载
      stopCurrentAudio(false);
      
      // 更新引用并设置播放速率
      audioRef.current = cachedItem.audio;
      resetAudioPosition(audioRef.current);
      
      // 确保应用正确的播放速率
      applySavedPlaybackRate(audioRef.current);
      
      // 设置播放结束事件
      setupAudioEndEvent(audioRef.current, sentenceIndex, false, sessionId);
      
      // 播放音频
      try {
        if (!isPlaybackSessionActive(sessionId) || !isPlayingRef.current) return false;
        await audioRef.current.play();
        setIsAudioLoading(false);
        return true;
      } catch (error) {
        console.error("播放缓存音频失败:", error);
        // 如果缓存音频播放失败，尝试重新获取
        audioCache.current.delete(sentenceIndex);
        // 继续执行下面的获取逻辑
      }
    }
    // 如果音频正在加载中，显示加载状态并等待
    else if (cachedItem && (cachedItem.status === 'loading' || cachedItem.status === 'pending')) {
      setIsAudioLoading(true);
      
      // 等待缓存项准备好
      let attempts = 0;
      while (attempts < 20) { // 增加等待尝试次数
        if (!isPlaybackSessionActive(sessionId) || !isPlayingRef.current) {
          setIsAudioLoading(false);
          return false;
        }

        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
        
        const item = audioCache.current.get(sentenceIndex);
        if (item && item.status === 'ready' && item.audio) {
          stopCurrentAudio(false);
          
          audioRef.current = item.audio;
          resetAudioPosition(audioRef.current);
          
          // 设置播放结束事件
          setupAudioEndEvent(audioRef.current, sentenceIndex, false, sessionId);
          
          // 播放音频
          try {
            if (!isPlaybackSessionActive(sessionId) || !isPlayingRef.current) return false;
            await audioRef.current.play();
            setIsAudioLoading(false);
            return true;
          } catch (error) {
            console.error("播放缓存音频失败:", error);
            break; // 跳出循环，尝试重新获取
          }
        }
        
        // 如果状态变为error，跳出循环
        if (item && item.status === 'error') {
          break;
        }
      }
      
      // 如果等待超时或出错，重置缓存并重新获取
      audioCache.current.delete(sentenceIndex);
    }
    
    // 如果缓存中没有或播放失败，则重新获取
    setIsAudioLoading(true);
    
    try {
      // 获取音频URL
      const audioUrl = await fetchTTSAudio(currentSentence.text, sentenceIndex, undefined, sessionId);
      
      // 等待缓存项准备好
      let attempts = 0;
      while (attempts < 10) {
        if (!isPlaybackSessionActive(sessionId) || !isPlayingRef.current) {
          setIsAudioLoading(false);
          return false;
        }

        const item = audioCache.current.get(sentenceIndex);
        if (item && item.status === 'ready' && item.audio) {
          stopCurrentAudio(false);
          
          audioRef.current = item.audio;
          resetAudioPosition(audioRef.current);
          
          // 设置播放结束事件
          setupAudioEndEvent(audioRef.current, sentenceIndex, false, sessionId);
          
          // 播放音频
          await audioRef.current.play();
          
          setIsAudioLoading(false);
          return true;
        }
        
        // 等待100ms后重试
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      // 如果缓存项未准备好，则创建新的音频对象
      stopCurrentAudio(false);
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      // 设置播放速率
      applySavedPlaybackRate(audio);
      
      // 设置播放结束事件
      setupAudioEndEvent(audio, sentenceIndex, false, sessionId);
      
      // 加载完成事件
      audio.onloadeddata = () => {
        if (!isPlaybackSessionActive(sessionId)) {
          releaseAudio(audio);
          return;
        }
        setIsAudioLoading(false);
      };
      
      // 播放音频
      if (!isPlaybackSessionActive(sessionId) || !isPlayingRef.current) return false;
      await audio.play();
      
      return true;
    } catch (error) {
      if (isAbortError(error)) {
        setIsAudioLoading(false);
        return false;
      }
      console.error('TTS处理错误:', error);
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
