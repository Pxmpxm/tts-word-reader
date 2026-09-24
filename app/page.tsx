"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileUploader } from "@/components/FileUploader"
import { AuthGate } from "@/components/AuthGate"
import { DocumentViewer } from "@/components/DocumentViewer"
import { DocumentLibrary } from "@/components/DocumentLibrary"
import { PlaybackControls } from "@/components/PlaybackControls"
import { SettingsPanel } from "@/components/SettingsPanel"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { Switch } from "@/components/ui/switch"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { LocateFixed, LogOut, Minus, Plus, Settings } from "lucide-react"

import { extractSentencesFromHtml, markSentencesInHtml } from "@/lib/textProcessor"
import { usePlayback } from "@/lib/usePlayback"
import {
  AVAILABLE_TTS_STYLES,
  AVAILABLE_TTS_VOICES,
  DEFAULT_TTS_STYLE
} from "@/lib/ttsOptions"
import type { Sentence } from "@/lib/types"
import { markdownToHtml } from "@/lib/markdown"
import { getDocument, saveReadingIndex, type StoredDocument } from "@/lib/documentStore"
import { uploadDocument } from "@/lib/uploadDocument"
import { browserDb } from "@/lib/supabase/client"
import dynamic from "next/dynamic"
import DOMPurify from "dompurify"

// 主组件 - 使用dynamic import强制客户端渲染
const TTSReader = () => {
  // 状态
  const [documentHtml, setDocumentHtml] = useState<string>("")
  const [sentences, setSentences] = useState<Sentence[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [fontSize, setFontSize] = useState(110)
  const [followReading, setFollowReading] = useState(true)
  const [currentDocument, setCurrentDocument] = useState<StoredDocument | null>(null)
  const [statusMessage, setStatusMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [selectedVoice, setSelectedVoice] = useState<string>(AVAILABLE_TTS_VOICES[0].id)
  const [selectedStyle, setSelectedStyle] = useState<string>(DEFAULT_TTS_STYLE)
  const [playbackRate, setPlaybackRate] = useState<number>(1.0) // 默认值，客户端加载后再更新
  
  const [mounted, setMounted] = useState(false)
  const { isPlaying, isAudioLoading, currentSentenceIndex, setPosition,
    setPlayingState, stopPlaybackAndClearCache, handleTogglePlayback,
    handlePreviousSentence, handleNextSentence, handleProgressChange } = usePlayback({
    sentences, documentId: currentDocument?.id || null,
    selectedVoice, selectedStyle, playbackRate, mounted, onError: setErrorMessage,
  })

  useEffect(() => {
    if (!currentDocument || sentences.length === 0) return
    const timeout = window.setTimeout(() => {
      saveReadingIndex(currentDocument.id, currentSentenceIndex).catch(console.error)
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [currentDocument, currentSentenceIndex, sentences.length])

  // 客户端初始化
  useEffect(() => {
    setMounted(true)
    browserDb().from("user_settings").select("voice,style,playback_rate").maybeSingle()
      .then(({ data }) => {
        if (!data) return
        if (AVAILABLE_TTS_VOICES.some((voice) => voice.id === data.voice)) setSelectedVoice(data.voice)
        if (AVAILABLE_TTS_STYLES.some((style) => style.id === data.style)) setSelectedStyle(data.style)
        setPlaybackRate(Number(data.playback_rate))
      }).then(undefined, console.error)
    const documentId = new URLSearchParams(window.location.search).get("document")
    if (documentId) getDocument(documentId).then((document) => {
      if (document?.status === "ready") showDocument(document)
    }).catch(console.error)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    const html = DOMPurify.sanitize(document.html || markdownToHtml(document.markdown || "", assetUrls), {
      USE_PROFILES: { html: true }, ADD_ATTR: ["class"],
    })
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
    setStatusMessage("正在创建文档…")
    try {
      const createResponse = await fetch("/api/documents", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selectedFile.name, size: selectedFile.size }),
      })
      const created = await createResponse.json()
      if (!createResponse.ok) throw new Error(created.error || "创建文档失败")
      window.dispatchEvent(new Event("document-library-changed"))
      setStatusMessage("正在上传文件…")
      await uploadDocument(selectedFile, created.sourcePath, setStatusMessage)
      setStatusMessage("正在解析文档…")
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
          setStatusMessage("MinerU 正在解析并保存结果…")
        }
      }
      const document = await getDocument(created.id)
      if (!document || document.status !== "ready") {
        throw new Error("解析仍在进行，可稍后从文档库打开")
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
    const { data: row, error } = await browserDb().from("documents")
      .select("name,file_size,source_path").eq("id", id).maybeSingle()
    if (error || !row) throw new Error("文档不存在")
    if (row.name !== file.name || row.file_size !== file.size) {
      throw new Error("请选择与原文档名称和大小一致的文件")
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
    const { data: { user } } = await db.auth.getUser()
    if (!user) return
    const { error } = await db.from("user_settings").upsert({
      user_id: user.id, voice, style, playback_rate: rate,
    }, { onConflict: "user_id" })
    if (error) setErrorMessage("保存朗读设置失败")
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

  // 如果组件未挂载，返回Loading状态或空内容
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-gray-100 dark:bg-gray-950">
      <header className="flex flex-wrap items-center gap-2 border-b bg-background px-3 py-2 sm:px-5">
        <h1 className="mr-auto text-lg font-bold sm:text-2xl">文档朗读</h1>
        <FileUploader isLoading={isLoading} onFileUpload={handleFileUpload} />
        <DocumentLibrary onOpen={(document) => {
          showDocument(document)
          window.history.replaceState(null, "", `/?document=${document.id}`)
        }} onDelete={deleteAudioForDocuments} onResumeUpload={resumeUpload} />
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" aria-label="朗读设置">
              <Settings className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[92vw] overflow-y-auto sm:max-w-md">
            <SheetHeader className="mb-5">
              <SheetTitle>朗读设置</SheetTitle>
              <SheetDescription>语音设置和已生成音频保存在你的账号中。</SheetDescription>
            </SheetHeader>
            <div className="space-y-5">
              <SettingsPanel
                voices={AVAILABLE_TTS_VOICES}
                styles={AVAILABLE_TTS_STYLES}
                selectedVoice={selectedVoice}
                selectedStyle={selectedStyle}
                onVoiceChange={handleVoiceChange}
                onStyleChange={handleStyleChange}
              />
              <Button variant="outline" onClick={async () => {
                const response = await fetch("/api/audio-cache", { method: "DELETE",
                  headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
                if (response.ok) {
                  stopPlaybackAndClearCache()
                  setPlayingState(false)
                  setStatusMessage("云端音频缓存已清空")
                } else setErrorMessage("清理音频缓存失败")
              }}>清空云端音频缓存</Button>
            </div>
          </SheetContent>
        </Sheet>
        <ThemeToggle />
        <Button variant="ghost" size="icon" aria-label="退出登录" onClick={() => browserDb().auth.signOut()}>
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex items-center gap-2 border-b bg-background px-3 py-2 sm:px-5">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {currentDocument?.name || "尚未打开文档"}
        </span>
        <Button variant="ghost" size="icon" onClick={() => setFontSize((size) => Math.max(80, size - 10))} aria-label="缩小字号">
          <Minus className="h-4 w-4" />
        </Button>
        <span className="w-10 text-center text-xs text-muted-foreground">{fontSize}%</span>
        <Button variant="ghost" size="icon" onClick={() => setFontSize((size) => Math.min(180, size + 10))} aria-label="放大字号">
          <Plus className="h-4 w-4" />
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <LocateFixed className="h-4 w-4" />
          <span className="hidden sm:inline">跟随朗读</span>
          <Switch checked={followReading} onCheckedChange={setFollowReading} />
        </label>
      </div>

      {(statusMessage || errorMessage) ? (
        <div className={`px-4 py-2 text-center text-sm ${errorMessage ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"}`}>
          {errorMessage || statusMessage}
        </div>
      ) : null}

      <main className="min-h-0 min-w-0 flex-1 p-2 sm:p-4 lg:ml-72">
        <Card className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden border-0 shadow-lg">
          <div className="min-h-0 flex-1">
            <DocumentViewer
              isLoading={isLoading && !documentHtml}
              html={documentHtml}
              currentSentenceIndex={currentSentenceIndex}
              fontSize={fontSize}
              followReading={followReading}
            />
          </div>
          <div className="shrink-0 border-t">
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
        </Card>
      </main>
    </div>
  )
}

// 导出无SSR的组件
const ClientReader = dynamic(() => Promise.resolve(TTSReader), { ssr: false })

export default function Home() {
  return <AuthGate><ClientReader /></AuthGate>
}
