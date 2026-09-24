"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { FileUploader } from "@/components/FileUploader"
import { AuthGate } from "@/components/AuthGate"
import { DocumentViewer } from "@/components/DocumentViewer"
import { DocumentLibrary } from "@/components/DocumentLibrary"
import { PlaybackControls } from "@/components/PlaybackControls"
import { SettingsPanel } from "@/components/SettingsPanel"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Headphones,
  SlidersHorizontal,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Maximize2,
  Minimize2,
  LogOut,
  Minus,
  Plus,
  Type,
  AlertCircle,
  X,
  FileText,
  RotateCcw,
} from "lucide-react"

import { extractSentencesFromHtml, markSentencesInHtml } from "@/lib/textProcessor"
import { usePlayback } from "@/lib/usePlayback"
import {
  AVAILABLE_TTS_STYLES,
  AVAILABLE_TTS_VOICES,
  DEFAULT_TTS_STYLE,
} from "@/lib/ttsOptions"
import type { Sentence } from "@/lib/types"
import { markdownToHtml } from "@/lib/markdown"
import { getDocument, saveReadingIndex, type StoredDocument } from "@/lib/documentStore"
import { uploadDocument } from "@/lib/uploadDocument"
import { browserDb } from "@/lib/supabase/client"
import dynamic from "next/dynamic"
import DOMPurify from "dompurify"
import { cn } from "@/lib/utils"

// Reading Paper Themes definitions
const PAPER_THEMES = [
  { id: "default", name: "经典", bg: "bg-background border-border", dot: "bg-slate-400" },
  { id: "sepia", name: "暖阳纸", bg: "bg-[#FAF6ED] border-[#E5DECD]", dot: "bg-amber-400" },
  { id: "eye-care", name: "护眼绿", bg: "bg-[#F0F5EC] border-[#DCE8D9]", dot: "bg-emerald-400" },
  { id: "midnight", name: "极夜黑", bg: "bg-[#090A0F] border-[#222530]", dot: "bg-indigo-500" },
]

const FONT_OPTIONS = [
  { id: "serif", name: "宋体" },
  { id: "sans", name: "黑体" },
  { id: "kaiti", name: "楷体" },
]

const TTSReader = () => {
  // Document and text states
  const [documentHtml, setDocumentHtml] = useState<string>("")
  const [sentences, setSentences] = useState<Sentence[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [currentDocument, setCurrentDocument] = useState<StoredDocument | null>(null)
  const [statusMessage, setStatusMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  // Reader typography & appearance preferences
  const [fontSize, setFontSize] = useState(110)
  const [followReading, setFollowReading] = useState(true)
  const [paperTheme, setPaperTheme] = useState("default")
  const [fontFamily, setFontFamily] = useState("serif")
  const [lineHeight, setLineHeight] = useState("cozy")
  const [readerWidth, setReaderWidth] = useState("normal")

  // Layout UI states
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [zenMode, setZenMode] = useState(false)

  // Voice and audio states
  const [selectedVoice, setSelectedVoice] = useState<string>(AVAILABLE_TTS_VOICES[0].id)
  const [selectedStyle, setSelectedStyle] = useState<string>(DEFAULT_TTS_STYLE)
  const [playbackRate, setPlaybackRate] = useState<number>(1.0)
  const [mounted, setMounted] = useState(false)

  const {
    isPlaying,
    isAudioLoading,
    currentSentenceIndex,
    setPosition,
    setPlayingState,
    stopPlaybackAndClearCache,
    handleTogglePlayback,
    handlePreviousSentence,
    handleNextSentence,
    handleProgressChange,
  } = usePlayback({
    sentences,
    documentId: currentDocument?.id || null,
    selectedVoice,
    selectedStyle,
    playbackRate,
    mounted,
    onError: setErrorMessage,
  })

  // Debounced reading index saving
  useEffect(() => {
    if (!currentDocument || sentences.length === 0) return
    const timeout = window.setTimeout(() => {
      saveReadingIndex(currentDocument.id, currentSentenceIndex).catch(console.error)
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [currentDocument, currentSentenceIndex, sentences.length])

  // Load preferences from localStorage & user settings
  useEffect(() => {
    setMounted(true)

    // Load reader preferences from local storage
    try {
      const savedPaper = localStorage.getItem("readflow_paper")
      if (savedPaper) setPaperTheme(savedPaper)
      const savedFont = localStorage.getItem("readflow_font")
      if (savedFont) setFontFamily(savedFont)
      const savedWidth = localStorage.getItem("readflow_width")
      if (savedWidth) setReaderWidth(savedWidth)
      const savedSize = localStorage.getItem("readflow_size")
      if (savedSize) setFontSize(Number(savedSize))
    } catch {
      // LocalStorage access might be restricted
    }

    // Load user settings from Supabase
    browserDb()
      .from("user_settings")
      .select("voice,style,playback_rate")
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        if (AVAILABLE_TTS_VOICES.some((voice) => voice.id === data.voice)) {
          setSelectedVoice(data.voice)
        }
        if (AVAILABLE_TTS_STYLES.some((style) => style.id === data.style)) {
          setSelectedStyle(data.style)
        }
        setPlaybackRate(Number(data.playback_rate))
      })
      .then(undefined, console.error)

    // Check URL parameters for document
    const documentId = new URLSearchParams(window.location.search).get("document")
    if (documentId) {
      getDocument(documentId)
        .then((doc) => {
          if (doc?.status === "ready") showDocument(doc)
        })
        .catch(console.error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save reader appearance changes to localStorage
  const handlePaperChange = (theme: string) => {
    setPaperTheme(theme)
    try {
      localStorage.setItem("readflow_paper", theme)
    } catch {}
  }

  const handleFontChange = (font: string) => {
    setFontFamily(font)
    try {
      localStorage.setItem("readflow_font", font)
    } catch {}
  }

  const handleWidthChange = (width: string) => {
    setReaderWidth(width)
    try {
      localStorage.setItem("readflow_width", width)
    } catch {}
  }

  const handleFontSizeChange = (size: number) => {
    setFontSize(size)
    try {
      localStorage.setItem("readflow_size", String(size))
    } catch {}
  }

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if focused in inputs or textareas
      const activeEl = document.activeElement
      if (activeEl && ["INPUT", "TEXTAREA"].includes(activeEl.tagName)) return

      if (e.code === "Space") {
        e.preventDefault()
        handleTogglePlayback()
      } else if (e.code === "ArrowLeft") {
        e.preventDefault()
        handlePreviousSentence()
      } else if (e.code === "ArrowRight") {
        e.preventDefault()
        handleNextSentence()
      } else if (e.code === "Escape" && zenMode) {
        setZenMode(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleTogglePlayback, handlePreviousSentence, handleNextSentence, zenMode])

  const deleteAudioForDocuments = async (documentIds: string[]) => {
    if (currentDocument && documentIds.includes(currentDocument.id)) {
      setPlayingState(false)
      stopPlaybackAndClearCache()
      setCurrentDocument(null)
      setDocumentHtml("")
      setSentences([])
      setPosition(0)
    }
  }

  const showDocument = (document: StoredDocument) => {
    if (currentDocument && sentences.length) {
      saveReadingIndex(currentDocument.id, currentSentenceIndex).catch(console.error)
    }
    setPlayingState(false)
    stopPlaybackAndClearCache()

    const assetUrls = new Map<string, string>()
    for (const asset of document.assets) {
      assetUrls.set(asset.path, asset.url)
      assetUrls.set(asset.path.split("/").slice(1).join("/"), asset.url)
      assetUrls.set(asset.path.split("/").pop() || asset.path, asset.url)
    }
    const html = DOMPurify.sanitize(
      document.html || markdownToHtml(document.markdown || "", assetUrls),
      {
        USE_PROFILES: { html: true },
        ADD_ATTR: ["class", "data-reader-sentence"],
      }
    )
    const sentenceArray = extractSentencesFromHtml(html)
    setCurrentDocument(document)
    setDocumentHtml(markSentencesInHtml(html, sentenceArray))
    setSentences(sentenceArray)
    let savedIndex = document.readingIndex
    savedIndex = Math.min(Math.max(0, savedIndex), Math.max(0, sentenceArray.length - 1))
    setPosition(savedIndex)
    setErrorMessage("")
    setStatusMessage("")
  }

  const handleFileUpload = async (selectedFile: File) => {
    if (selectedFile.size < 1 || selectedFile.size > 50 * 1024 * 1024) {
      setErrorMessage("文件不能为空或超过免费版 50 MB 限制。")
      return
    }
    setIsLoading(true)
    setErrorMessage("")
    setStatusMessage("正在创建文档记录…")
    try {
      const createResponse = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selectedFile.name, size: selectedFile.size }),
      })
      const created = await createResponse.json()
      if (!createResponse.ok) throw new Error(created.error || "创建文档失败")
      window.dispatchEvent(new Event("document-library-changed"))
      setStatusMessage("正在上传文件至私有云…")
      await uploadDocument(selectedFile, created.sourcePath, setStatusMessage)
      setStatusMessage("正在解析文档内容…")
      const processResponse = await fetch(`/api/documents/${created.id}/process`, { method: "POST" })
      const processResult = await processResponse.json()
      if (!processResponse.ok) throw new Error(processResult.error || "解析文档失败")
      window.dispatchEvent(new Event("document-library-changed"))
      if (processResult.status !== "ready") {
        const started = Date.now()
        while (Date.now() - started < 10 * 60_000) {
          await new Promise((resolve) => setTimeout(resolve, 4000))
          const response = await fetch(`/api/documents/${created.id}/refresh`, { method: "POST" })
          const result = await response.json()
          if (!response.ok) throw new Error(result.error || "查询解析任务失败")
          if (result.status === "failed") throw new Error("MinerU 解析失败，请在文档库中重试")
          if (result.status === "done") break
          setStatusMessage("MinerU 正在深度解析并持久化资产…")
        }
      }
      const document = await getDocument(created.id)
      if (!document || document.status !== "ready") {
        throw new Error("解析仍在进行中，可稍后在左侧文档库直接打开")
      }
      showDocument(document)
      window.dispatchEvent(new Event("document-library-changed"))
      window.history.replaceState(null, "", `/?document=${document.id}`)
    } catch (error) {
      console.error("解析文档失败:", error)
      setErrorMessage(error instanceof Error ? error.message : "解析文档失败")
    } finally {
      setIsLoading(false)
      setStatusMessage("")
    }
  }

  const resumeUpload = async (id: string, file: File) => {
    const { data: row, error } = await browserDb()
      .from("documents")
      .select("name,file_size,source_path")
      .eq("id", id)
      .maybeSingle()
    if (error || !row) throw new Error("文档不存在")
    if (row.name !== file.name || row.file_size !== file.size) {
      throw new Error("请选择与原文档名称和大小完全一致的文件")
    }
    let response = await fetch(`/api/documents/${id}/process`, { method: "POST" })
    if (response.status === 409) {
      await uploadDocument(file, row.source_path)
      response = await fetch(`/api/documents/${id}/process`, { method: "POST" })
    }
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      throw new Error(result.error || "继续上传失败")
    }
    window.dispatchEvent(new Event("document-library-changed"))
  }

  const saveSettings = async (voice: string, style: string, rate: number) => {
    const db = browserDb()
    const {
      data: { user },
    } = await db.auth.getUser()
    if (!user) return
    const { error } = await db.from("user_settings").upsert(
      {
        user_id: user.id,
        voice,
        style,
        playback_rate: rate,
      },
      { onConflict: "user_id" }
    )
    if (error) setErrorMessage("保存朗读偏好设置失败")
  }

  const handleVoiceChange = (voice: string) => {
    if (voice === selectedVoice) return
    setPlayingState(false)
    stopPlaybackAndClearCache()
    setSelectedVoice(voice)
    saveSettings(voice, selectedStyle, playbackRate).catch(console.error)
  }

  const handleStyleChange = (style: string) => {
    if (style === selectedStyle) return
    setPlayingState(false)
    stopPlaybackAndClearCache()
    setSelectedStyle(style)
    saveSettings(selectedVoice, style, playbackRate).catch(console.error)
  }

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate)
    saveSettings(selectedVoice, selectedStyle, rate).catch(console.error)
  }

  const handleClearCloudAudioCache = async () => {
    const response = await fetch("/api/audio-cache", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    if (response.ok) {
      stopPlaybackAndClearCache()
      setPlayingState(false)
      setStatusMessage("云端音频缓存已清空")
      setTimeout(() => setStatusMessage(""), 3000)
    } else {
      throw new Error("清理音频缓存失败")
    }
  }

  // Selected voice name for display
  const currentVoiceObj = AVAILABLE_TTS_VOICES.find((v) => v.id === selectedVoice)
  const voiceDisplayName = currentVoiceObj ? currentVoiceObj.name.split(" ")[0] : "晓晓"

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-xs text-muted-foreground animate-pulse">正在初始化阅读环境…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      {/* 1. Sleek Top Navigation Header */}
      {!zenMode && (
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b bg-background/85 px-3 backdrop-blur-md sm:px-5">
          {/* Left: Sidebar trigger, Brand & Document Breadcrumb */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Desktop Sidebar Toggle */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsSidebarOpen((prev) => !prev)}
                    className="hidden lg:flex h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground"
                    aria-label={isSidebarOpen ? "收起文档库" : "展开文档库"}
                  >
                    {isSidebarOpen ? (
                      <PanelLeftClose className="h-4 w-4" />
                    ) : (
                      <PanelLeftOpen className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>{isSidebarOpen ? "收起文档库 (⌘B)" : "展开文档库 (⌘B)"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Mobile Sidebar Trigger */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="flex lg:hidden h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground"
              aria-label="打开文档库"
            >
              <FileText className="h-4 w-4" />
            </Button>

            {/* Brand Logo & Title */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-blue-600 text-white shadow-sm shadow-primary/25">
                <Headphones className="h-4 w-4" />
              </div>
              <span className="font-bold text-base tracking-tight hidden sm:inline">言读</span>
            </div>

            <div className="h-4 w-px bg-border hidden sm:block" />

            {/* Current Active Document Title & Status */}
            {currentDocument ? (
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="truncate text-xs sm:text-sm font-medium text-foreground max-w-[130px] sm:max-w-xs md:max-w-sm"
                  title={currentDocument.name}
                >
                  {currentDocument.name}
                </span>
                <Badge
                  variant="secondary"
                  className="hidden md:inline-flex text-[10px] h-5 px-1.5 font-normal"
                >
                  {sentences.length > 0
                    ? `句 ${currentSentenceIndex + 1}/${sentences.length}`
                    : "已就绪"}
                </Badge>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                尚未选择文档
              </span>
            )}
          </div>

          {/* Right: Actions, Customizer, Settings, Theme, Logout */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Quick Upload Button */}
            <FileUploader
              isLoading={isLoading}
              onFileUpload={handleFileUpload}
              variant="compact"
            />

            {/* Reader Appearance Customizer Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground"
                  aria-label="阅读视图偏好"
                >
                  <Type className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-4 space-y-4 shadow-2xl">
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                    阅读视觉偏好
                  </h4>
                  <button
                    onClick={() => {
                      handleFontSizeChange(110)
                      handlePaperChange("default")
                      handleFontChange("serif")
                      handleWidthChange("normal")
                      setLineHeight("cozy")
                    }}
                    className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1"
                  >
                    <RotateCcw className="h-3 w-3" />
                    恢复默认
                  </button>
                </div>

                {/* Font Size Adjuster */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">字号大小</span>
                    <span className="font-semibold text-foreground">{fontSize}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-lg shrink-0"
                      onClick={() => handleFontSizeChange(Math.max(80, fontSize - 10))}
                      disabled={fontSize <= 80}
                      aria-label="缩小字号"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <div className="flex-1 text-center py-1 rounded-md bg-secondary text-xs font-medium">
                      Aa
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-lg shrink-0"
                      onClick={() => handleFontSizeChange(Math.min(180, fontSize + 10))}
                      disabled={fontSize >= 180}
                      aria-label="放大字号"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Reading Paper Theme */}
                <div className="space-y-2">
                  <span className="text-xs text-muted-foreground block">背景底色</span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {PAPER_THEMES.map((theme) => {
                      const isSelected = paperTheme === theme.id
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => handlePaperChange(theme.id)}
                          className={cn(
                            "flex flex-col items-center gap-1 rounded-xl border p-2 text-[11px] font-medium transition-all",
                            theme.bg,
                            isSelected
                              ? "ring-2 ring-primary ring-offset-1 shadow-sm text-foreground"
                              : "hover:opacity-80 text-muted-foreground"
                          )}
                        >
                          <span className={cn("h-3 w-3 rounded-full", theme.dot)} />
                          <span>{theme.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Font Family selector */}
                <div className="space-y-2">
                  <span className="text-xs text-muted-foreground block">文字字体</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {FONT_OPTIONS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => handleFontChange(f.id)}
                        className={cn(
                          "rounded-lg border py-1.5 text-xs font-medium transition-all text-center",
                          fontFamily === f.id
                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                            : "border-border/80 bg-background/60 hover:bg-accent text-muted-foreground"
                        )}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Width & Line Spacing */}
                <div className="grid grid-cols-2 gap-3 pt-1 border-t">
                  <div className="space-y-1.5">
                    <span className="text-[11px] text-muted-foreground">版芯宽度</span>
                    <div className="flex gap-1">
                      {[
                        { id: "narrow", label: "窄" },
                        { id: "normal", label: "适中" },
                        { id: "wide", label: "宽" },
                      ].map((w) => (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => handleWidthChange(w.id)}
                          className={cn(
                            "flex-1 py-1 rounded text-[11px] font-medium transition-colors",
                            readerWidth === w.id
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-secondary-foreground hover:bg-accent"
                          )}
                        >
                          {w.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[11px] text-muted-foreground">行间距</span>
                    <div className="flex gap-1">
                      {[
                        { id: "compact", label: "紧凑" },
                        { id: "cozy", label: "舒适" },
                        { id: "loose", label: "宽松" },
                      ].map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => setLineHeight(l.id)}
                          className={cn(
                            "flex-1 py-1 rounded text-[11px] font-medium transition-colors",
                            lineHeight === l.id
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-secondary-foreground hover:bg-accent"
                          )}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Follow Reading switch */}
                <div className="flex items-center justify-between pt-2 border-t text-xs">
                  <span className="text-muted-foreground">跟随朗读滚动</span>
                  <Switch checked={followReading} onCheckedChange={setFollowReading} />
                </div>
              </PopoverContent>
            </Popover>

            {/* TTS Voice Settings Sheet */}
            <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground"
                  aria-label="朗读设置"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[92vw] overflow-y-auto sm:max-w-md p-6">
                <SheetHeader className="mb-6 text-left">
                  <SheetTitle className="text-lg font-bold">语音合成与朗读设置</SheetTitle>
                  <SheetDescription className="text-xs">
                    调整发音人角色、情感风格与音频云端缓存策略。
                  </SheetDescription>
                </SheetHeader>
                <SettingsPanel
                  voices={AVAILABLE_TTS_VOICES}
                  styles={AVAILABLE_TTS_STYLES}
                  selectedVoice={selectedVoice}
                  selectedStyle={selectedStyle}
                  onVoiceChange={handleVoiceChange}
                  onStyleChange={handleStyleChange}
                  onClearCache={handleClearCloudAudioCache}
                />
              </SheetContent>
            </Sheet>

            {/* Zen Mode Toggle */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setZenMode(true)}
                    className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hidden sm:flex"
                    aria-label="全屏沉浸模式"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>沉浸阅读模式 (Esc 退出)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Dark / Light Theme Toggle */}
            <ThemeToggle />

            {/* Sign Out */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => browserDb().auth.signOut()}
                    className="h-9 w-9 rounded-xl text-muted-foreground hover:text-destructive"
                    aria-label="退出登录"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>退出登录</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </header>
      )}

      {/* Floating Status & Error Notifications */}
      {(statusMessage || errorMessage) && (
        <div className="relative z-40 px-4 py-2">
          <div
            className={cn(
              "mx-auto flex max-w-xl items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-xs font-medium shadow-lg animate-in slide-in-from-top-2 duration-300",
              errorMessage
                ? "border border-destructive/30 bg-destructive/15 text-destructive"
                : "border border-primary/30 bg-primary/10 text-primary"
            )}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage || statusMessage}</span>
            </div>
            <button
              onClick={() => {
                setErrorMessage("")
                setStatusMessage("")
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 2. Main Workspace Layout */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Document Library Sidebar */}
        {!zenMode && (
          <DocumentLibrary
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
            isMobileOpen={isMobileSidebarOpen}
            onMobileOpenChange={setIsMobileSidebarOpen}
            currentDocumentId={currentDocument?.id || null}
            onOpen={(doc) => {
              showDocument(doc)
              window.history.replaceState(null, "", `/?document=${doc.id}`)
            }}
            onDelete={deleteAudioForDocuments}
            onResumeUpload={resumeUpload}
            onTriggerUpload={() => {
              const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
              fileInput?.click()
            }}
          />
        )}

        {/* Center Stage: Document Viewer & Audio Dock */}
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Zen mode exit floating button */}
          {zenMode && (
            <div className="absolute right-4 top-4 z-40">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setZenMode(false)}
                className="gap-1.5 rounded-full bg-background/80 shadow-md backdrop-blur-md"
              >
                <Minimize2 className="h-3.5 w-3.5" />
                <span>退出沉浸 (Esc)</span>
              </Button>
            </div>
          )}

          {/* Reader Document Viewport */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <DocumentViewer
              isLoading={isLoading && !documentHtml}
              html={documentHtml}
              currentSentenceIndex={currentSentenceIndex}
              fontSize={fontSize}
              followReading={followReading}
              onSelectSentence={handleProgressChange}
              paperTheme={paperTheme}
              fontFamily={fontFamily}
              lineHeight={lineHeight}
              maxWidth={readerWidth}
              onUploadFile={handleFileUpload}
            />
          </div>

          {/* Bottom Dock Audio Player */}
          {sentences.length > 0 && (
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
              voiceName={voiceDisplayName}
              onOpenSettings={() => setIsSettingsOpen(true)}
              followReading={followReading}
              onToggleFollowReading={() => setFollowReading((prev) => !prev)}
            />
          )}
        </main>
      </div>
    </div>
  )
}

const ClientReader = dynamic(() => Promise.resolve(TTSReader), { ssr: false })

export default function Home() {
  return (
    <AuthGate>
      <ClientReader />
    </AuthGate>
  )
}
