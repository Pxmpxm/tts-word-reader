"use client"

import { useCallback, useEffect, useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import {
  BookOpen,
  FileText,
  FileType,
  FileCode,
  Image as ImageIcon,
  Presentation,
  RefreshCw,
  Trash2,
  Search,
  AlertCircle,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react"
import {
  deleteDocuments,
  getDocument,
  listDocuments,
  type StoredDocument,
  type StoredDocumentSummary,
} from "@/lib/documentStore"
import { cn } from "@/lib/utils"

interface DocumentLibraryProps {
  onOpen: (document: StoredDocument) => void
  onDelete: (ids: string[]) => Promise<void>
  onResumeUpload: (id: string, file: File) => Promise<void>
  currentDocumentId?: string | null
  isOpen?: boolean
  onClose?: () => void
  isMobileOpen?: boolean
  onMobileOpenChange?: (open: boolean) => void
  onTriggerUpload?: () => void
}

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`

const statusConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "info" }
> = {
  uploading: { label: "等待上传", variant: "warning" },
  queued: { label: "等待解析", variant: "info" },
  processing: { label: "正在解析", variant: "info" },
  saving: { label: "正在保存", variant: "info" },
  failed: { label: "解析失败", variant: "destructive" },
  ready: { label: "就绪", variant: "success" },
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || ""
  if (["pdf"].includes(ext)) {
    return <FileType className="h-4 w-4 text-rose-500 shrink-0" />
  }
  if (["doc", "docx"].includes(ext)) {
    return <FileText className="h-4 w-4 text-blue-500 shrink-0" />
  }
  if (["md", "markdown", "txt"].includes(ext)) {
    return <FileCode className="h-4 w-4 text-teal-500 shrink-0" />
  }
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(ext)) {
    return <ImageIcon className="h-4 w-4 text-purple-500 shrink-0" />
  }
  if (["ppt", "pptx"].includes(ext)) {
    return <Presentation className="h-4 w-4 text-orange-500 shrink-0" />
  }
  return <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
}

export function DocumentLibrary({
  onOpen,
  onDelete,
  onResumeUpload,
  currentDocumentId,
  isOpen = true,
  onClose,
  isMobileOpen = false,
  onMobileOpenChange,
  onTriggerUpload,
}: DocumentLibraryProps) {
  const [documents, setDocuments] = useState<StoredDocumentSummary[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [filterTab, setFilterTab] = useState<"all" | "ready" | "processing">("all")

  const refresh = useCallback(async () => {
    try {
      setDocuments(await listDocuments())
      setError("")
    } catch {
      setError("文档库加载失败")
    }
  }, [])

  useEffect(() => {
    refresh()
    window.addEventListener("document-library-changed", refresh)
    return () => {
      window.removeEventListener("document-library-changed", refresh)
    }
  }, [refresh])

  useEffect(() => {
    if (!documents.some((doc) => ["queued", "processing", "saving"].includes(doc.status))) return
    const timer = window.setInterval(refresh, 10_000)
    return () => window.clearInterval(timer)
  }, [documents, refresh])

  const openDocument = async (id: string) => {
    setBusy(true)
    try {
      const document = await getDocument(id)
      if (document?.status !== "ready") throw new Error("文档尚未解析完成")
      onOpen(document)
      if (onMobileOpenChange) onMobileOpenChange(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "打开文档失败")
    } finally {
      setBusy(false)
    }
  }

  const retryDocument = async (document: StoredDocumentSummary) => {
    setBusy(true)
    try {
      const endpoint = document.status === "failed" || document.status === "uploading" ? "process" : "refresh"
      const response = await fetch(`/api/documents/${document.id}/${endpoint}`, { method: "POST" })
      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        throw new Error(result.error || "更新解析状态失败")
      }
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新解析状态失败")
    } finally {
      setBusy(false)
    }
  }

  const removeDocuments = async (ids: string[]) => {
    if (!ids.length) return
    setBusy(true)
    try {
      await deleteDocuments(ids)
      await onDelete(ids)
      setSelected((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除文档失败")
    } finally {
      setBusy(false)
    }
  }

  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
      if (!matchesSearch) return false
      if (filterTab === "ready") return doc.status === "ready"
      if (filterTab === "processing") return ["queued", "processing", "saving", "uploading"].includes(doc.status)
      return true
    })
  }, [documents, searchQuery, filterTab])

  const libraryContent = (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-sidebar text-sidebar-foreground">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold tracking-tight text-foreground">我的文档</h2>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {documents.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={refresh}
            disabled={busy}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            aria-label="刷新文档库"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-7 w-7 text-muted-foreground hover:text-foreground lg:hidden"
              aria-label="关闭侧边栏"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Search and Filter */}
      <div className="p-3 space-y-2 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索文档…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border bg-background/80 py-1.5 pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground/60 transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setFilterTab("all")}
            className={cn(
              "px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors",
              filterTab === "all"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            全部 ({documents.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("ready")}
            className={cn(
              "px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors",
              filterTab === "ready"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            已就绪 ({documents.filter((d) => d.status === "ready").length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("processing")}
            className={cn(
              "px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors",
              filterTab === "processing"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            处理中 ({documents.filter((d) => ["queued", "processing", "saving", "uploading"].includes(d.status)).length})
          </button>
        </div>
      </div>

      {error && (
        <div className="m-2 rounded-lg bg-destructive/10 border border-destructive/20 p-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Document list */}
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {filteredDocuments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground mb-3">
              <UploadCloud className="h-6 w-6" />
            </div>
            <p className="text-xs font-medium text-foreground mb-1">
              {searchQuery ? "未找到匹配的文档" : "文档库为空"}
            </p>
            <p className="text-[11px] text-muted-foreground mb-3">
              {searchQuery ? "尝试更换搜索关键词" : "点击顶部按钮上传文档即可自动解析"}
            </p>
            {onTriggerUpload && !searchQuery && (
              <Button size="sm" variant="outline" onClick={onTriggerUpload} className="h-7 text-xs gap-1.5">
                <UploadCloud className="h-3.5 w-3.5" />
                立即上传
              </Button>
            )}
          </div>
        ) : (
          filteredDocuments.map((doc) => {
            const isCurrent = doc.id === currentDocumentId
            const isProcessing = ["queued", "processing", "saving"].includes(doc.status)
            const isFailed = doc.status === "failed"
            const statusInfo = statusConfig[doc.status] || { label: doc.status, variant: "secondary" }

            return (
              <div
                key={doc.id}
                className={cn(
                  "group relative flex items-start gap-2.5 rounded-xl p-2.5 transition-all text-left border",
                  isCurrent
                    ? "bg-primary/10 border-primary/30 shadow-sm"
                    : "border-transparent hover:bg-accent/60 hover:border-border/40"
                )}
              >
                {/* Selection checkbox */}
                <div className="pt-0.5">
                  <Checkbox
                    checked={selected.has(doc.id)}
                    aria-label={`选择 ${doc.name}`}
                    onCheckedChange={(checked) =>
                      setSelected((curr) => {
                        const next = new Set(curr)
                        if (checked) next.add(doc.id)
                        else next.delete(doc.id)
                        return next
                      })
                    }
                    className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                </div>

                {/* File icon */}
                <div className="pt-0.5">{getFileIcon(doc.name)}</div>

                {/* Document details */}
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    disabled={busy || doc.status !== "ready"}
                    onClick={() => openDocument(doc.id)}
                    className="block w-full text-left"
                  >
                    <span
                      className={cn(
                        "block truncate text-xs font-medium transition-colors",
                        isCurrent
                          ? "text-primary font-semibold"
                          : "text-foreground group-hover:text-primary",
                        doc.status !== "ready" && "text-muted-foreground"
                      )}
                      title={doc.name}
                    >
                      {doc.name}
                    </span>
                  </button>

                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span>{formatSize(doc.byteSize)}</span>
                    <span>·</span>
                    <Badge variant={statusInfo.variant} className="h-4 px-1 text-[9px] font-normal">
                      {isProcessing && <Loader2 className="mr-0.5 h-2.5 w-2.5 animate-spin" />}
                      {statusInfo.label}
                    </Badge>
                  </div>

                  {doc.error && (
                    <p className="mt-1 line-clamp-2 text-[10px] text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      <span className="truncate">{doc.error}</span>
                    </p>
                  )}

                  {/* Actions for non-ready states */}
                  {doc.status !== "ready" && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => retryDocument(doc)}
                        className="text-[10px] font-medium text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
                      >
                        <RefreshCw className="h-2.5 w-2.5" />
                        {isFailed ? "重试解析" : "刷新状态"}
                      </button>

                      {(doc.status === "uploading" || isFailed) && (
                        <label className="cursor-pointer text-[10px] font-medium text-primary hover:underline">
                          重新选择原文件
                          <input
                            type="file"
                            className="sr-only"
                            disabled={busy}
                            onChange={async (event) => {
                              const file = event.target.files?.[0]
                              event.target.value = ""
                              if (!file) return
                              setBusy(true)
                              try {
                                await onResumeUpload(doc.id, file)
                                await refresh()
                              } catch (cause) {
                                setError(cause instanceof Error ? cause.message : "继续上传失败")
                              } finally {
                                setBusy(false)
                              }
                            }}
                          />
                        </label>
                      )}
                    </div>
                  )}
                </div>

                {/* Individual delete button on hover */}
                <button
                  type="button"
                  onClick={() => removeDocuments([doc.id])}
                  disabled={busy}
                  className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-opacity rounded-md hover:bg-destructive/10"
                  aria-label="删除此文档"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* Batch action footer */}
      {selected.size > 0 && (
        <div className="border-t p-3 bg-background/50 backdrop-blur-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>已选 {selected.size} 份文档</span>
            <button
              onClick={() => setSelected(new Set())}
              className="text-primary hover:underline text-[11px]"
            >
              取消选择
            </button>
          </div>
          <Button
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() => removeDocuments([...selected])}
            className="w-full gap-2 rounded-xl text-xs h-8"
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除选中文档 ({selected.size})
          </Button>
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* Desktop collapsible sidebar */}
      <aside
        className={cn(
          "hidden h-full flex-col border-r bg-sidebar transition-all duration-300 ease-in-out lg:flex",
          isOpen ? "w-80 opacity-100" : "w-0 opacity-0 pointer-events-none overflow-hidden border-r-0"
        )}
      >
        {libraryContent}
      </aside>

      {/* Mobile Drawer */}
      <Sheet open={isMobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="left" className="flex w-[88vw] max-w-sm flex-col p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>我的文档库</SheetTitle>
          </SheetHeader>
          {libraryContent}
        </SheetContent>
      </Sheet>
    </>
  )
}
