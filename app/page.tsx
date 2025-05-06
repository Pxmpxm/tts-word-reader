"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Upload, FileText, Play, Pause, Volume2, SkipBack, SkipForward, Settings, Gauge } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

// 定义句子类型，包含文本内容和在文档中的位置信息
interface Sentence {
  text: string
  nodeIndex: number // 文本节点在文档中的索引
  startOffset: number // 句子在文本节点中的起始位置
  endOffset: number // 句子在文本节点中的结束位置
}

// 客户端组件
const TTSReader = () => {
  // 可用语音列表
  const AVAILABLE_VOICES = [
    { id: "zh-CN-XiaochenNeural", name: "zh-CN-晓辰" },
    { id: "zh-CN-XiaoyiNeural", name: "zh-CN-晓伊" },
    { id: "zh-CN-YunjianNeural", name: "zh-CN-云健" },
    { id: "zh-CN-YunxiNeural", name: "zh-CN-云希" },
    { id: "zh-CN-YunxiaNeural", name: "zh-CN-云夏" },
    { id: "zh-CN-YunyangNeural", name: "zh-CN-云扬" },
    { id: "zh-CN-liaoning-XiaobeiNeural", name: "zh-CN-辽宁-晓北" },
    { id: "zh-CN-shaanxi-XiaoniNeural", name: "zh-CN-陕西-晓妮" },
  ];
  
  const [file, setFile] = useState<File | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [documentHtml, setDocumentHtml] = useState<string>("")
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0)
  const [sentences, setSentences] = useState<Sentence[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [fontSize, setFontSize] = useState(100) // 字体大小百分比
  const [selectedVoice, setSelectedVoice] = useState<string>(AVAILABLE_VOICES[0].id) // 默认选择第一个语音
  const [apiEndpoint, setApiEndpoint] = useState<string>("https://api.example.com/tts") // TTS API端点
  const [volume, setVolume] = useState<number>(80) // 音量设置，0-100
  const [playbackRate, setPlaybackRate] = useState<number>(1) // 播放速率，默认1.0
  const documentRef = useRef<HTMLDivElement>(null)
  const [highlightedHtml, setHighlightedHtml] = useState<string>("")
  const textNodesRef = useRef<Node[]>([]) // 保存文档中的所有文本节点
  const [isBrowser, setIsBrowser] = useState(false)
  const [mammothLoaded, setMammothLoaded] = useState(false)
  const mammothRef = useRef<any>(null)

  // 检测是否在浏览器环境并加载mammoth
  useEffect(() => {
    setIsBrowser(true)

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
  }, [])

  // 从localStorage加载API端点设置
  useEffect(() => {
    if (isBrowser) {
      const savedEndpoint = localStorage.getItem("ttsApiEndpoint")
      if (savedEndpoint) {
        setApiEndpoint(savedEndpoint)
      }
    }
  }, [isBrowser])

  // 保存API端点到localStorage
  const handleApiEndpointChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEndpoint = e.target.value
    setApiEndpoint(newEndpoint)
    localStorage.setItem("ttsApiEndpoint", newEndpoint)
  }

  // 处理文件上传
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isBrowser || !mammothLoaded || !mammothRef.current) return

    const selectedFile = e.target.files?.[0]
    if (
      selectedFile &&
      selectedFile.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      setFile(selectedFile)
      setIsLoading(true)

      try {
        // 使用mammoth.js解析Word文档
        const arrayBuffer = await selectedFile.arrayBuffer()
        // 使用正确的方式访问mammoth库
        const result = await mammothRef.current.convertToHtml({ arrayBuffer })

        // 获取HTML内容
        const html = result.value
        setDocumentHtml(html)

        // 将文档分割成句子以便朗读
        const sentenceArray = extractSentencesFromHtml(html)
        setSentences(sentenceArray)

        // 重置当前朗读位置到第一句
        setCurrentSentenceIndex(0)
      } catch (error) {
        console.error("解析Word文档时出错:", error)
        alert("解析文档失败，请检查文件格式。")
      } finally {
        setIsLoading(false)
      }
    }
  }

  // 从HTML中提取句子，保留原始HTML结构和位置信息
  const extractSentencesFromHtml = (html: string): Sentence[] => {
    if (!isBrowser) return []

    // 创建一个临时的DOM元素来解析HTML
    const tempDiv = document.createElement("div")
    tempDiv.innerHTML = html

    // 获取所有文本节点
    const textNodes: Node[] = []
    const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        // 过滤掉空白文本节点
        if (node.textContent && node.textContent.trim().length > 0) {
          return NodeFilter.FILTER_ACCEPT
        }
        return NodeFilter.FILTER_REJECT
      },
    })

    let node
    while ((node = walker.nextNode())) {
      textNodes.push(node)
    }

    // 保存文本节点引用，以便后续高亮处理
    textNodesRef.current = textNodes

    // 从文本节点中提取句子，并记录位置信息
    const sentences: Sentence[] = []
    const sentenceEndRegex = /[.!?。！？；;]/

    for (let nodeIndex = 0; nodeIndex < textNodes.length; nodeIndex++) {
      const textNode = textNodes[nodeIndex]
      const text = textNode.textContent || ""
      let startOffset = 0

      // 查找句子结束标记
      for (let i = 0; i < text.length; i++) {
        if (
          sentenceEndRegex.test(text[i]) &&
          (i === text.length - 1 || /\s/.test(text[i + 1]) || i + 1 === text.length)
        ) {
          // 找到一个句子结束标记
          const sentenceText = text.substring(startOffset, i + 1).trim()
          if (sentenceText.length > 0) {
            sentences.push({
              text: sentenceText,
              nodeIndex,
              startOffset,
              endOffset: i + 1,
            })
          }
          startOffset = i + 1
        }
      }

      // 处理剩余的文本（如果没有以句子结束标记结尾）
      const remainingText = text.substring(startOffset).trim()
      if (remainingText.length > 0) {
        sentences.push({
          text: remainingText,
          nodeIndex,
          startOffset,
          endOffset: text.length,
        })
      }
    }

    // 过滤掉空句子并返回
    return sentences.filter((sentence) => sentence.text.trim().length > 0)
  }

  // 切换播放/暂停
  const togglePlayback = async () => {
    if (!isPlaying) {
      // 开始播放
      setIsPlaying(true)
      
      // 获取当前句子
      const currentSentence = sentences[currentSentenceIndex]
      
      // 实际项目中这里应调用TTS API
      console.log(`使用API ${apiEndpoint} 和语音 ${selectedVoice} 朗读: ${currentSentence.text}`)
      // 音量和播放速率只用于本地播放音频，不作为API参数
      console.log(`本地播放参数 - 音量: ${volume}%, 播放速率: ${playbackRate}x`)
      
      // 模拟朗读时间，实际应用中应替换为实际API调用
      /* 
      实际API调用示例:
      try {
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: currentSentence.text,
            voice: selectedVoice,
            // 不将音量和播放速率作为API参数，这些参数仅用于本地音频播放
          }),
        });
        
        if (!response.ok) {
          throw new Error('TTS API调用失败');
        }
        
        // 处理音频播放
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        
        // 设置音频参数 - 这些参数只用于本地播放
        audio.volume = volume / 100; // 转换为0-1范围
        audio.playbackRate = playbackRate; // 设置播放速率
        
        audio.onended = () => {
          // 播放下一句
          if (currentSentenceIndex < sentences.length - 1) {
            setCurrentSentenceIndex(prev => prev + 1);
          } else {
            setIsPlaying(false);
          }
        };
        
        audio.play();
      } catch (error) {
        console.error('TTS处理错误:', error);
        setIsPlaying(false);
      }
      */
    } else {
      // 暂停播放
      setIsPlaying(false)
    }
  }

  // 上一句
  const previousSentence = () => {
    setCurrentSentenceIndex((prev) => Math.max(0, prev - 1))
  }

  // 下一句
  const nextSentence = () => {
    setCurrentSentenceIndex((prev) => Math.min(sentences.length - 1, prev + 1))
  }

  // 模拟TTS朗读效果，实际应用中会替换为真实的TTS API调用
  useEffect(() => {
    if (!isBrowser) return

    let timer: NodeJS.Timeout

    if (isPlaying && sentences.length > 0) {
      // 模拟朗读过程，每3秒朗读一个句子
      timer = setTimeout(() => {
        if (currentSentenceIndex < sentences.length - 1) {
          setCurrentSentenceIndex((prev) => prev + 1)
        } else {
          setIsPlaying(false) // 朗读完毕
        }
      }, 3000)
    }

    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [isPlaying, currentSentenceIndex, sentences, isBrowser])

  // 当文档加载或当前句子索引变化时，更新高亮显示
  useEffect(() => {
    if (!isBrowser) return

    if (documentHtml && sentences.length > 0) {
      updateHighlightedHtml()
    }
  }, [documentHtml, sentences, currentSentenceIndex, isBrowser])

  // 高亮显示当前朗读的句子
  useEffect(() => {
    if (!isBrowser) return

    if (documentRef.current && sentences.length > 0) {
      // 滚动到当前朗读位置
      setTimeout(() => {
        const highlightElement = documentRef.current?.querySelector(".current-reading")
        if (highlightElement) {
          highlightElement.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "nearest",
          })
        }
      }, 100) // 短暂延迟确保DOM已更新
    }
  }, [highlightedHtml, isBrowser])

  // 更新高亮HTML
  const updateHighlightedHtml = () => {
    if (!isBrowser || !documentHtml || sentences.length === 0 || currentSentenceIndex < 0) {
      setHighlightedHtml(documentHtml)
      return
    }

    try {
      const currentSentence = sentences[currentSentenceIndex]
      if (!currentSentence) {
        setHighlightedHtml(documentHtml)
        return
      }

      // 创建一个临时的DOM元素来处理HTML
      const tempDiv = document.createElement("div")
      tempDiv.innerHTML = documentHtml

      // 获取所有文本节点，以便我们可以找到与原始提取时相同位置的节点
      const textNodes: Node[] = []
      const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          if (node.textContent && node.textContent.trim().length > 0) {
            return NodeFilter.FILTER_ACCEPT
          }
          return NodeFilter.FILTER_REJECT
        },
      })

      let node
      while ((node = walker.nextNode())) {
        textNodes.push(node)
      }

      // 使用存储的位置信息找到正确的文本节点和位置
      if (textNodes.length > currentSentence.nodeIndex) {
        const textNode = textNodes[currentSentence.nodeIndex]
        const text = textNode.textContent || ""

        // 确保位置信息在有效范围内
        const startOffset = Math.min(currentSentence.startOffset, text.length)
        const endOffset = Math.min(currentSentence.endOffset, text.length)

        if (startOffset < endOffset) {
          // 分割文本节点
          const before = text.substring(0, startOffset)
          const middle = text.substring(startOffset, endOffset)
          const after = text.substring(endOffset)

          // 创建高亮元素
          const span = document.createElement("span")
          span.className = "current-reading bg-yellow-200"
          span.textContent = middle

          // 替换原始文本节点
          const fragment = document.createDocumentFragment()
          if (before) {
            fragment.appendChild(document.createTextNode(before))
          }
          fragment.appendChild(span)
          if (after) {
            fragment.appendChild(document.createTextNode(after))
          }

          textNode.parentNode?.replaceChild(fragment, textNode)
        }
      }

      setHighlightedHtml(tempDiv.innerHTML)
    } catch (error) {
      console.error("高亮句子时出错:", error)
      setHighlightedHtml(documentHtml)
    }
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
            {/* 文件上传卡片 */}
            <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 h-[calc(50%-12px)]">
              <CardContent className="pt-6 flex flex-col h-full">
                <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 transition-colors duration-200 hover:border-blue-400 dark:hover:border-blue-600 flex-grow">
                  <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900 mb-3">
                    <Upload className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">上传Word文档</p>
                  <input type="file" id="file-upload" className="hidden" accept=".docx" onChange={handleFileUpload} />
                  <Button
                    className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white"
                    asChild
                    disabled={isLoading || !mammothLoaded}
                  >
                    <label htmlFor="file-upload">
                      {isLoading ? "处理中..." : !mammothLoaded ? "加载中..." : "选择文件"}
                    </label>
                  </Button>
                  {file && (
                    <div className="mt-4 flex items-center p-2 bg-blue-50 dark:bg-blue-900/30 rounded-md">
                      <FileText className="h-4 w-4 mr-2 text-blue-500" />
                      <span className="text-sm truncate max-w-[200px]">{file.name}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* TTS设置卡片 */}
            <Card className="shadow-md h-[calc(50%-12px)]">
              <CardContent className="pt-6 h-full flex flex-col">
                <div className="flex items-center mb-4">
                  <Settings className="h-5 w-5 mr-2 text-blue-500" />
                  <h3 className="font-medium">TTS设置</h3>
                </div>

                <div className="space-y-5 flex-grow">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <label className="text-sm font-medium">语音</label>
                    </div>
                    <Select 
                      defaultValue={AVAILABLE_VOICES[0].id}
                      onValueChange={(value) => setSelectedVoice(value)}
                    >
                      <SelectTrigger className="border-gray-300 dark:border-gray-700">
                        <SelectValue placeholder="选择语音" />
                      </SelectTrigger>
                      <SelectContent>
                        {AVAILABLE_VOICES.map((voice) => (
                          <SelectItem key={voice.id} value={voice.id}>
                            {voice.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
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
                  {/* 固定高度的滚动区域，确保不会溢出 */}
                  <div className="mt-4 border rounded-md bg-white dark:bg-gray-900 shadow-inner">
                    <ScrollArea className="h-[calc(100vh-350px)] w-full p-4">
                      {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-32 space-y-4">
                          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                          <p>正在处理文档，请稍候...</p>
                        </div>
                      ) : highlightedHtml ? (
                        <div
                          ref={documentRef}
                          className="document-content"
                          style={{ fontSize: `${fontSize}%` }}
                          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground space-y-2">
                          <FileText className="h-12 w-12 text-gray-300 dark:text-gray-600" />
                          <p>上传Word文档以查看内容</p>
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                </TabsContent>

                <TabsContent value="settings" className="px-6">
                  <div className="mt-4 space-y-4 h-[calc(100vh-350px)] overflow-y-auto bg-white dark:bg-gray-900 p-4 rounded-md shadow-inner">
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
                  </div>
                </TabsContent>

                {/* 播放控制区域 - 固定在底部 */}
                <div className="p-6 border-t mt-4 bg-gray-50 dark:bg-gray-800 rounded-b-lg">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    {/* 播放控制按钮组 */}
                    <div className="flex items-center space-x-3">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={previousSentence}
                              disabled={!file || currentSentenceIndex <= 0}
                              className="border-gray-300 dark:border-gray-700"
                            >
                              <SkipBack className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>上一句</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              onClick={togglePlayback}
                              disabled={!file || sentences.length === 0}
                              className={`bg-gradient-to-r ${
                                isPlaying
                                  ? "from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600"
                                  : "from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600"
                              } text-white`}
                            >
                              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{isPlaying ? "暂停" : "播放"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={nextSentence}
                              disabled={!file || currentSentenceIndex >= sentences.length - 1}
                              className="border-gray-300 dark:border-gray-700"
                            >
                              <SkipForward className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>下一句</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>

                    {/* 音量和播放速率控制 */}
                    <div className="flex items-center gap-4 flex-1 max-w-xl">
                      <div className="flex items-center gap-2 flex-1">
                        <Volume2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <Slider 
                          value={[volume]} 
                          max={100} 
                          step={1} 
                          className="flex-1 cursor-pointer"
                          onValueChange={(value) => setVolume(value[0])} 
                        />
                        <span className="text-xs text-muted-foreground w-9 text-right">{volume}%</span>
                      </div>
                      
                      <div className="flex items-center gap-2 flex-1">
                        <Gauge className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <Slider 
                          value={[playbackRate * 10]} 
                          min={5} 
                          max={20} 
                          step={1} 
                          className="flex-1 cursor-pointer"
                          onValueChange={(value) => setPlaybackRate(value[0] / 10)}
                        />
                        <span className="text-xs text-muted-foreground w-9 text-right">{playbackRate.toFixed(1)}x</span>
                      </div>
                    </div>

                    {/* 进度指示器 */}
                    <div className="text-sm font-medium bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full shrink-0">
                      {file && sentences.length > 0 ? `${currentSentenceIndex + 1} / ${sentences.length}` : "0 / 0"}
                    </div>
                  </div>

                  <div className="mt-4">
                    <Slider
                      value={[Math.max(0, (currentSentenceIndex / Math.max(1, sentences.length - 1)) * 100)]}
                      disabled={!file || sentences.length <= 1}
                      onValueChange={(value) => {
                        const newIndex = Math.round((value[0] / 100) * (sentences.length - 1))
                        setCurrentSentenceIndex(newIndex)
                      }}
                      className="cursor-pointer"
                    />
                  </div>
                </div>
              </Tabs>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

// 导出组件
export default TTSReader
