"use client"

import DOMPurify from "dompurify"
import { useRef, useEffect, useMemo } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileUploader } from "@/components/FileUploader"
import { Loader2, BookOpen, Volume2, MousePointerClick, Keyboard } from "lucide-react"
import { cn } from "@/lib/utils"

interface DocumentViewerProps {
  isLoading: boolean
  html: string
  currentSentenceIndex: number
  fontSize: number
  followReading: boolean
  onSelectSentence?: (index: number) => void
  paperTheme?: string // "default" | "sepia" | "eye-care" | "midnight"
  fontFamily?: string // "serif" | "sans" | "kaiti"
  lineHeight?: string // "compact" | "cozy" | "loose"
  maxWidth?: string // "narrow" | "normal" | "wide"
  onUploadFile?: (file: File) => void
}

const FONT_FAMILY_CLASSES: Record<string, string> = {
  serif: "font-serif-reading",
  sans: "font-sans-reading",
  kaiti: "font-kaiti-reading",
}

const LINE_HEIGHT_CLASSES: Record<string, string> = {
  compact: "leading-[1.65]",
  cozy: "leading-[1.85]",
  loose: "leading-[2.15]",
}

const MAX_WIDTH_CLASSES: Record<string, string> = {
  narrow: "max-w-2xl",
  normal: "max-w-3xl",
  wide: "max-w-4xl",
}

export function DocumentViewer({
  isLoading,
  html,
  currentSentenceIndex,
  fontSize,
  followReading,
  onSelectSentence,
  paperTheme = "default",
  fontFamily = "serif",
  lineHeight = "cozy",
  maxWidth = "normal",
  onUploadFile,
}: DocumentViewerProps) {
  const documentRef = useRef<HTMLDivElement>(null)

  const sanitizedHtml = useMemo(() => {
    if (!html) return ""
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ["class", "data-reader-sentence"],
    })
  }, [html])

  // Update sentence highlighting and auto-scroll
  useEffect(() => {
    const root = documentRef.current
    if (!root) return

    // Remove active highlight from previously active elements
    root.querySelectorAll(".current-reading").forEach((node) => node.classList.remove("current-reading"))

    // Highlight active sentence elements
    const current = root.querySelectorAll(`[data-reader-sentence="${currentSentenceIndex}"]`)
    current.forEach((node) => node.classList.add("current-reading"))

    // Smooth auto-scroll
    if (followReading && current[0]) {
      current[0].scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" })
    }
  }, [sanitizedHtml, currentSentenceIndex, followReading])

  // Click-to-read handler
  const handleContainerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onSelectSentence) return
    const target = event.target as HTMLElement
    const sentenceEl = target.closest("[data-reader-sentence]") as HTMLElement | null
    if (sentenceEl && sentenceEl.dataset.readerSentence !== undefined) {
      const sentenceIndex = parseInt(sentenceEl.dataset.readerSentence, 10)
      if (!isNaN(sentenceIndex)) {
        onSelectSentence(sentenceIndex)
      }
    }
  }

  return (
    <div
      data-paper={paperTheme}
      className={cn(
        "h-full w-full min-h-0 overflow-hidden transition-colors duration-300",
        paperTheme === "sepia" && "bg-[#FAF6ED] text-[#3D3226]",
        paperTheme === "eye-care" && "bg-[#F0F5EC] text-[#1C3022]",
        paperTheme === "midnight" && "bg-[#090A0F] text-[#E2E6EB]",
        paperTheme === "default" && "bg-card text-card-foreground"
      )}
    >
      <ScrollArea className="h-full w-full px-4 sm:px-8 lg:px-12">
        {isLoading ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center space-y-4 py-16 animate-pulse">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Loader2 className="h-8 w-8 animate-spin" />
              <div className="absolute -inset-1 rounded-2xl bg-primary/20 blur-md -z-10" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-base font-medium text-foreground">正在解析文档内容与切分段落…</p>
              <p className="text-xs text-muted-foreground">如使用 MinerU 深度 OCR 解析，可能需要 15~30 秒，请稍候</p>
            </div>
          </div>
        ) : sanitizedHtml ? (
          <div className="mx-auto py-8 sm:py-12 pb-44">
            <div
              ref={documentRef}
              onClick={handleContainerClick}
              className={cn(
                "document-content mx-auto animate-in fade-in duration-300",
                FONT_FAMILY_CLASSES[fontFamily] || FONT_FAMILY_CLASSES.serif,
                LINE_HEIGHT_CLASSES[lineHeight] || LINE_HEIGHT_CLASSES.cozy,
                MAX_WIDTH_CLASSES[maxWidth] || MAX_WIDTH_CLASSES.normal
              )}
              style={{ fontSize: `${fontSize}%` }}
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          </div>
        ) : (
          /* Empty reading welcome state */
          <div className="mx-auto max-w-2xl py-12 sm:py-20 px-2 space-y-10 animate-in fade-in zoom-in-95 duration-400">
            <div className="text-center space-y-3">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary shadow-inner">
                <BookOpen className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  开启您的文档沉浸伴读
                </h2>
                <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground">
                  从左侧文档库挑选文档，或直接上传本地 Word、PDF、Markdown 资料
                </p>
              </div>
            </div>

            {/* Quick Upload Dropzone */}
            {onUploadFile && (
              <FileUploader
                isLoading={isLoading}
                onFileUpload={onUploadFile}
                variant="dropzone"
                className="bg-background/50 shadow-sm"
              />
            )}

            {/* Reading Tips & Shortcuts */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="flex flex-col items-start gap-2 rounded-xl border bg-muted/30 p-3.5 text-left">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <MousePointerClick className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-foreground">点句即读</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    在阅读区域点击任意一句话，朗读焦点将立刻跳转并播放
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-start gap-2 rounded-xl border bg-muted/30 p-3.5 text-left">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Volume2 className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-foreground">流式多发音人</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    提供多款高保真男声、女声与风格，随心调节播放倍速
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-start gap-2 rounded-xl border bg-muted/30 p-3.5 text-left">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Keyboard className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-foreground">高效快捷键</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    空格键播放/暂停，方向左右键切换上一句与下一句
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
