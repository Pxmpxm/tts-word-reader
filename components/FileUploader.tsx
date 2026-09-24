"use client"

import { useId, useRef, useState, type DragEvent } from "react"
import { Button } from "@/components/ui/button"
import { Upload, FileUp, Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

interface FileUploaderProps {
  isLoading: boolean
  onFileUpload: (file: File) => void
  variant?: "button" | "dropzone" | "compact"
  className?: string
}

const ACCEPTED_EXTENSIONS = ".doc,.docx,.pdf,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.jp2,.webp,.gif,.bmp,.txt,.md,.markdown"

export function FileUploader({
  isLoading,
  onFileUpload,
  variant = "button",
  className,
}: FileUploaderProps) {
  const fileInputId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    onFileUpload(file)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isLoading) setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (isLoading) return
    const file = e.dataTransfer.files?.[0]
    if (file) {
      onFileUpload(file)
    }
  }

  if (variant === "dropzone") {
    return (
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isLoading && fileInputRef.current?.click()}
        className={cn(
          "group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all cursor-pointer",
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border/80 hover:border-primary/50 hover:bg-muted/40",
          isLoading && "pointer-events-none opacity-60",
          className
        )}
      >
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          className="hidden"
          accept={ACCEPTED_EXTENSIONS}
          disabled={isLoading}
          onChange={handleFileChange}
        />

        <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground shadow-sm">
          {isLoading ? (
            <Loader2 className="h-8 w-8 animate-spin" />
          ) : (
            <FileUp className="h-8 w-8" />
          )}
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-amber-950 text-[10px] font-bold">
            <Sparkles className="h-3 w-3" />
          </span>
        </div>

        <h3 className="text-base font-semibold text-foreground mb-1">
          {isLoading ? "正在处理文档，请稍候…" : "拖拽文件到此处，或点击上传"}
        </h3>
        <p className="text-xs text-muted-foreground max-w-sm mb-4">
          支持 Word (.docx)、PDF、Markdown (.md)、TXT 文本、PPT 以及各类图片识别
        </p>

        <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-muted-foreground/80">
          <span className="rounded-md bg-secondary px-2 py-0.5 font-medium">DOCX</span>
          <span className="rounded-md bg-secondary px-2 py-0.5 font-medium">PDF</span>
          <span className="rounded-md bg-secondary px-2 py-0.5 font-medium">Markdown</span>
          <span className="rounded-md bg-secondary px-2 py-0.5 font-medium">TXT</span>
          <span className="rounded-md bg-secondary px-2 py-0.5 font-medium">Images</span>
          <span className="rounded-md bg-secondary px-2 py-0.5 text-muted-foreground">≤ 50MB</span>
        </div>
      </div>
    )
  }

  return (
    <>
      <input
        ref={fileInputRef}
        id={fileInputId}
        type="file"
        className="hidden"
        accept={ACCEPTED_EXTENSIONS}
        disabled={isLoading}
        onChange={handleFileChange}
      />
      <Button
        type="button"
        disabled={isLoading}
        onClick={() => fileInputRef.current?.click()}
        size={variant === "compact" ? "sm" : "default"}
        className={cn(
          "gap-2 rounded-xl font-medium shadow-sm transition-all",
          variant !== "compact" && "shadow-primary/20 hover:shadow-primary/30",
          className
        )}
        aria-label={isLoading ? "正在处理文档" : "上传文档"}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        <span className={variant === "compact" ? "inline" : "hidden sm:inline"}>
          {isLoading ? "处理中…" : "上传文档"}
        </span>
      </Button>
    </>
  )
}
