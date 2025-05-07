"use client"

import { useState, useRef, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { FileUploader } from "@/components/FileUploader"
import { DocumentViewer } from "@/components/DocumentViewer"
import { PlaybackControls } from "@/components/PlaybackControls"
import { SettingsPanel } from "@/components/SettingsPanel"

import { extractSentencesFromHtml, highlightSentenceInHtml } from "@/lib/textProcessor"
import { loadPlaybackRate } from "@/lib/playbackController"
import { Voice, Sentence } from "@/lib/types"
import { loadFromLocalStorage, delay, isClient } from "@/lib/utils"
import dynamic from "next/dynamic"

// 音频缓存项类型
interface AudioCacheItem {
  index: number;
  url?: string;
  audio?: HTMLAudioElement;
  status: 'pending' | 'loading' | 'ready' | 'error';
}

// 主组件 - 使用dynamic import强制客户端渲染
const TTSReader = () => {
  // 可用语音列表
  const AVAILABLE_VOICES: Voice[] = [
    { id: "zh-CN-YunjianNeural", name: "zh-CN-云健" },
  ];
  
  // 状态
  const [file, setFile] = useState<File | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [documentHtml, setDocumentHtml] = useState<string>("")
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0)
  const [sentences, setSentences] = useState<Sentence[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isAudioLoading, setIsAudioLoading] = useState(false)
  const [fontSize, setFontSize] = useState(100)
  const [selectedVoice, setSelectedVoice] = useState<string>(AVAILABLE_VOICES[0].id)
  const [apiEndpoint, setApiEndpoint] = useState<string>("http://193.112.190.60:4399/api/v1/tts/generate")
  const [highlightedHtml, setHighlightedHtml] = useState<string>("")
  const [playbackRate, setPlaybackRate] = useState<number>(1.0) // 默认值，客户端加载后再更新
  
  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const textNodesRef = useRef<Node[]>([])
  const mammothRef = useRef<any>(null)
  const currentIndexRef = useRef<number>(0) // 添加索引的ref，确保始终使用最新值
  const audioCache = useRef<Map<number, AudioCacheItem>>(new Map()) // 音频缓存
  const poolSize = 5 // 预请求池大小
  
  // 浏览器环境检测 - 简化为单个mounted状态
  const [mounted, setMounted] = useState(false)
  const [mammothLoaded, setMammothLoaded] = useState(false)

  // 同步currentSentenceIndex到ref
  useEffect(() => {
    currentIndexRef.current = currentSentenceIndex;
    
    // 每当索引变化时，预加载后续句子
    if (mounted && sentences.length > 0) {
      preloadSentences(currentSentenceIndex);
      
      // 清理远离当前索引的缓存
      cleanupCache(currentSentenceIndex);
    }
  }, [currentSentenceIndex, sentences, mounted]);

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
    
    // 加载播放速率
    try {
      const savedRate = localStorage.getItem('ttsPlaybackRate');
      if (savedRate) {
        setPlaybackRate(parseFloat(parseFloat(savedRate).toFixed(1)));
      }
    } catch (error) {
      console.error("加载播放速率失败:", error);
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
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      
      // 清理所有缓存的音频
      audioCache.current.forEach(item => {
        if (item.audio) {
          item.audio.pause();
          item.audio.src = '';
        }
      });
      audioCache.current.clear();
    };
  }, [])

  // 预请求函数 - 预加载多个句子
  const preloadSentences = async (startIndex: number) => {
    if (!sentences.length || !mounted) return;
    
    // 确保不超出边界
    const endIndex = Math.min(startIndex + poolSize, sentences.length);
    
    for (let i = startIndex; i < endIndex; i++) {
      // 如果已在缓存中且状态不是错误，跳过
      if (audioCache.current.has(i) && audioCache.current.get(i)?.status !== 'error') continue;
      
      const sentence = sentences[i];
      if (!sentence || sentence.text.length < 6) continue;
      
      // 标记为加载中
      audioCache.current.set(i, { 
        index: i, 
        status: 'loading' 
      });
      
      // 使用Promise不等待，异步处理
      fetchTTSAudio(sentence.text, i).catch(err => {
        console.error(`预加载句子${i}失败:`, err);
      });
    }
  };
  
  // 获取TTS音频
  const fetchTTSAudio = async (text: string, index: number): Promise<string> => {
    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          voice: selectedVoice,
          rate: "0%",
          pitch: "0Hz",
          volume: "0%"
        }),
      });
      
      if (!response.ok) throw new Error(`TTS API调用失败: ${response.status}`);
      
      const data = await response.json();
      if (!data.success || !data.data || !data.data.audio) {
        throw new Error('获取音频URL失败');
      }
      
      // 构建音频URL
      const apiUrl = new URL(apiEndpoint);
      const baseServerUrl = `${apiUrl.protocol}//${apiUrl.host}`;
      const audioPath = data.data.audio;
      const formattedPath = audioPath.startsWith('/') ? audioPath : `/${audioPath}`;
      const audioUrl = `${baseServerUrl}${formattedPath}`;
      
      // 创建音频对象
      const audio = new Audio();
      
      // 设置加载完成回调
      audio.onloadeddata = () => {
        // 应用播放速率
        try {
          const savedRate = localStorage.getItem('ttsPlaybackRate');
          if (savedRate) {
            audio.playbackRate = parseFloat(parseFloat(savedRate).toFixed(1));
          } else {
            audio.playbackRate = playbackRate;
          }
        } catch (error) {
          audio.playbackRate = playbackRate;
        }
        
        // 更新缓存状态为就绪
        audioCache.current.set(index, { 
          index, 
          url: audioUrl, 
          audio, 
          status: 'ready' 
        });
      };
      
      // 设置加载错误回调
      audio.onerror = () => {
        audioCache.current.set(index, { index, status: 'error' });
      };
      
      // 设置音频源并加载
      audio.src = audioUrl;
      audio.load();
      
      return audioUrl;
    } catch (error) {
      audioCache.current.set(index, { index, status: 'error' });
      throw error;
    }
  };
  
  // 设置音频结束事件
  const setupAudioEndEvent = (audio: HTMLAudioElement, index: number) => {
    const handleEnded = () => {
      // 确保我们仍然处理的是当前句子
      if (index === currentIndexRef.current) {
        // 如果有下一句，自动播放
        if (index < sentences.length - 1) {
          // 更新索引
          const nextIndex = index + 1;
          setCurrentSentenceIndex(nextIndex);
          currentIndexRef.current = nextIndex; // 同时更新ref
          
          // 确保使用最新的速率设置
          syncPlaybackRateFromLocalStorage();
          
          // 确保播放状态正确
          if (!isPlaying) {
            setIsPlaying(true);
          }
          
          // 延迟播放下一句
          setTimeout(() => {
            playCurrentSentence(true);
          }, 50);
        } else {
          // 已播放完所有句子，停止播放
          setIsPlaying(false);
        }
      }
      
      // 移除监听器，避免内存泄漏
      audio.removeEventListener('ended', handleEnded);
    };
    
    // 添加播放结束事件监听
    audio.addEventListener('ended', handleEnded);
  };
  
  // 清理缓存，在索引变化很大时调用
  const cleanupCache = (currentIndex: number) => {
    for (const [index, item] of audioCache.current.entries()) {
      if (index < currentIndex - 5 || index > currentIndex + poolSize) {
        if (item.audio) {
          item.audio.pause();
          item.audio.src = '';
        }
        audioCache.current.delete(index);
      }
    }
  };
  
  // 处理文件上传
  const handleFileUpload = async (selectedFile: File) => {
    if (!mounted || !mammothLoaded || !mammothRef.current) return

    setFile(selectedFile)
    setIsLoading(true)
    
    // 重置播放状态
    setIsPlaying(false)
    setCurrentSentenceIndex(0)
    currentIndexRef.current = 0 // 同时更新ref
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    
    // 清理所有缓存的音频
    audioCache.current.forEach(item => {
      if (item.audio) {
        item.audio.pause();
        item.audio.src = '';
      }
    });
    audioCache.current.clear();

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
      
      // 文档加载完成后预加载初始句子
      setTimeout(() => {
        preloadSentences(0);
      }, 500);
    } catch (error) {
      console.error("解析Word文档时出错:", error)
      alert("解析文档失败，请检查文件格式。")
    } finally {
      setIsLoading(false)
    }
  }

  // 当文档加载或当前句子索引变化时，更新高亮显示
  useEffect(() => {
    if (!mounted) return

    if (documentHtml && sentences.length > 0) {
      updateHighlightedHtml()
    }
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
      currentSentence, 
      textNodesRef.current
    )
    
    setHighlightedHtml(highlightedContent)
  }
  
  // 处理API端点变更
  const handleApiEndpointChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEndpoint = e.target.value;
    setApiEndpoint(newEndpoint);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem("ttsApiEndpoint", newEndpoint);
      } catch (error) {
        console.error("保存API端点失败:", error);
      }
    }
  };
  
  // 切换播放/暂停
  const handleTogglePlayback = () => {
    // 使用本地变量记录新状态，以避免闭包中使用旧状态
    const newPlayingState = !isPlaying;
    
    // 设置播放状态
    setIsPlaying(newPlayingState);
    
    if (newPlayingState) {
      // 确保使用最新的速率设置
      syncPlaybackRateFromLocalStorage();
      // 如果切换到播放状态，使用playback机制播放当前句子
      playCurrentSentence(true);
    } else {
      // 如果切换到停止状态，暂停当前播放的音频
      if (audioRef.current) {
        audioRef.current.pause();
      }
    }
  };
  
  // 播放上一句
  const handlePreviousSentence = () => {
    if (currentSentenceIndex > 0) {
      // 计算新的索引
      const newIndex = currentSentenceIndex - 1;
      
      // 暂停当前音频
      if (audioRef.current) {
        audioRef.current.pause();
      }
      
      // 更新索引
      setCurrentSentenceIndex(newIndex);
      currentIndexRef.current = newIndex; // 同时更新ref
      
      // 确保使用最新的速率设置
      syncPlaybackRateFromLocalStorage();
      
      // 延迟后播放
      setTimeout(() => {
        playCurrentSentence(true);
      }, 50);
    }
  };
  
  // 播放下一句
  const handleNextSentence = () => {
    if (currentSentenceIndex < sentences.length - 1) {
      // 计算新的索引
      const newIndex = currentSentenceIndex + 1;
      
      // 暂停当前音频
      if (audioRef.current) {
        audioRef.current.pause();
      }
      
      // 更新索引
      setCurrentSentenceIndex(newIndex);
      currentIndexRef.current = newIndex; // 同时更新ref
      
      // 确保使用最新的速率设置
      syncPlaybackRateFromLocalStorage();
      
      // 延迟后播放
      setTimeout(() => {
        playCurrentSentence(true);
      }, 50);
    }
  };
  
  // 处理进度条变化
  const handleProgressChange = (newIndex: number) => {
    // 暂停当前音频
    if (audioRef.current) {
      audioRef.current.pause();
    }
    
    // 更新索引
    setCurrentSentenceIndex(newIndex);
    currentIndexRef.current = newIndex; // 同时更新ref
    
    // 确保使用最新的速率设置
    syncPlaybackRateFromLocalStorage();
    
    // 如果正在播放，则在新位置继续播放
    if (isPlaying) {
      setTimeout(() => {
        playCurrentSentence(true);
      }, 50);
    }
  };
  
  // 从localStorage同步播放速率
  const syncPlaybackRateFromLocalStorage = () => {
    if (typeof window !== 'undefined') {
      try {
        const savedRate = localStorage.getItem('ttsPlaybackRate');
        if (savedRate) {
          const newRate = parseFloat(parseFloat(savedRate).toFixed(1));
          if (newRate !== playbackRate) {
            setPlaybackRate(newRate);
          }
        }
      } catch (error) {
        console.error("读取播放速率设置失败:", error);
      }
    }
  };
  
  // 播放当前句子
  const playCurrentSentence = async (forcePlay: boolean = false) => {
    // 确保使用最新的速率设置
    syncPlaybackRateFromLocalStorage();
    
    // 如果没有句子或已暂停状态且没有强制播放，则返回
    if (sentences.length === 0) {
      return false;
    }
    
    if (!isPlaying && !forcePlay) {
      return false;
    }
    
    // 强制播放时，确保播放状态为true
    if (forcePlay && !isPlaying) {
      setIsPlaying(true);
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
        if (!isPlaying) {
          setIsPlaying(true);
        }
        
        // 延迟播放下一句
        setTimeout(() => {
          playCurrentSentence(true);
        }, 50);
      } else {
        // 已到最后一句，停止播放
        setIsPlaying(false);
      }
      
      return true;
    }
    
    // 触发预加载
    preloadSentences(sentenceIndex);
    
    // 查看缓存中是否有当前句子的音频
    const cachedItem = audioCache.current.get(sentenceIndex);
    
    if (cachedItem && cachedItem.status === 'ready' && cachedItem.audio) {
      // 使用缓存的音频，无需加载
      if (audioRef.current) {
        audioRef.current.pause();
      }
      
      // 更新引用并设置播放速率
      audioRef.current = cachedItem.audio;
      
      // 确保应用正确的播放速率
      try {
        const savedRate = localStorage.getItem('ttsPlaybackRate');
        if (savedRate) {
          audioRef.current.playbackRate = parseFloat(parseFloat(savedRate).toFixed(1));
        } else {
          audioRef.current.playbackRate = playbackRate;
        }
      } catch (error) {
        audioRef.current.playbackRate = playbackRate;
      }
      
      // 设置播放结束事件
      setupAudioEndEvent(audioRef.current, sentenceIndex);
      
      // 播放音频
      try {
        await audioRef.current.play();
        return true;
      } catch (error) {
        console.error("播放缓存音频失败:", error);
        // 如果缓存音频播放失败，尝试重新获取
        audioCache.current.delete(sentenceIndex);
        // 继续执行下面的获取逻辑
      }
    }
    
    // 如果缓存中没有或播放失败，则重新获取
    setIsAudioLoading(true);
    
    try {
      // 获取音频URL
      const audioUrl = await fetchTTSAudio(currentSentence.text, sentenceIndex);
      
      // 等待缓存项准备好
      let attempts = 0;
      while (attempts < 10) {
        const item = audioCache.current.get(sentenceIndex);
        if (item && item.status === 'ready' && item.audio) {
          if (audioRef.current) {
            audioRef.current.pause();
          }
          
          audioRef.current = item.audio;
          
          // 设置播放结束事件
          setupAudioEndEvent(audioRef.current, sentenceIndex);
          
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
      if (audioRef.current) {
        audioRef.current.pause();
      }
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      // 设置播放速率
      try {
        const savedRate = localStorage.getItem('ttsPlaybackRate');
        if (savedRate) {
          audio.playbackRate = parseFloat(parseFloat(savedRate).toFixed(1));
        } else {
          audio.playbackRate = playbackRate;
        }
      } catch (error) {
        audio.playbackRate = playbackRate;
      }
      
      // 设置播放结束事件
      setupAudioEndEvent(audio, sentenceIndex);
      
      // 加载完成事件
      audio.onloadeddata = () => {
        setIsAudioLoading(false);
      };
      
      // 播放音频
      await audio.play();
      
      return true;
    } catch (error) {
      console.error('TTS处理错误:', error);
      setIsAudioLoading(false);
      setIsPlaying(false);
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
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 py-4">
      <div className="container mx-auto px-4">
        <header className="flex justify-between items-center mb-2">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
            文档朗读系统
          </h1>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 左侧面板：上传和设置 */}
          <div className="space-y-6">
            {/* 文件上传组件 */}
            <FileUploader 
              isLoading={isLoading} 
              mammothLoaded={mammothLoaded} 
              onFileUpload={handleFileUpload} 
            />

            {/* 设置组件 */}
            <SettingsPanel 
              voices={AVAILABLE_VOICES}
              selectedVoice={selectedVoice}
              onVoiceChange={setSelectedVoice}
            />
          </div>

          {/* 中间和右侧：文档预览和控制 */}
          <div className="md:col-span-2">
            {/* 文档内容和播放控制 */}
            <Card className="shadow-lg h-full">
              <Tabs defaultValue="preview" className="flex flex-col h-full">
                <div className="px-6 pt-6">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="preview">文档预览</TabsTrigger>
                    <TabsTrigger value="settings">高级设置</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="preview" className="flex-1 px-6">
                  {/* 文档预览组件 */}
                  <DocumentViewer 
                    isLoading={isLoading}
                    html={highlightedHtml}
                    fontSize={fontSize}
                  />
                </TabsContent>

                <TabsContent value="settings" className="px-6">
                  <div className="mt-4 space-y-4 h-[calc(100vh-350px)] overflow-y-auto bg-white dark:bg-gray-900 p-4 rounded-md shadow-inner">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">TTS API 端点</label>
                        <input
                          type="text"
                          className="w-full p-2 border rounded-md text-sm bg-gray-50 dark:bg-gray-800"
                          placeholder="https://your-tts-api.com/synthesize"
                          value={apiEndpoint}
                          onChange={handleApiEndpointChange}
                        />
                        <p className="text-xs text-muted-foreground mt-1">设置将自动保存</p>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium">TTS API 高级设置</label>
                        <p className="text-xs text-muted-foreground">
                          在这里可以添加更多高级设置选项，如语速、音量等控制。
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium">预加载设置</label>
                        <p className="text-xs text-muted-foreground">
                          系统会自动预加载后续{poolSize}个句子，以保证朗读连贯性。
                        </p>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* 播放控制组件 */}
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
                  onPlaybackRateChange={setPlaybackRate}
                  onProgressChange={handleProgressChange}
                />
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
