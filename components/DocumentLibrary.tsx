import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { BookOpen, Library, RefreshCw, Trash2 } from "lucide-react"
import { deleteDocuments, getDocument, listDocuments,
  type StoredDocument, type StoredDocumentSummary } from "@/lib/documentStore"

interface DocumentLibraryProps {
  onOpen: (document: StoredDocument) => void
  onDelete: (ids: string[]) => Promise<void>
  onResumeUpload: (id: string, file: File) => Promise<void>
}

const formatSize = (bytes: number) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / 1024 / 1024).toFixed(1)} MB`

const statusText: Record<string, string> = {
  uploading: "等待上传", queued: "等待解析", processing: "正在解析",
  saving: "正在保存", failed: "解析失败", ready: "可阅读",
}

export function DocumentLibrary({ onOpen, onDelete, onResumeUpload }: DocumentLibraryProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [documents, setDocuments] = useState<StoredDocumentSummary[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const refresh = useCallback(async () => {
    try { setDocuments(await listDocuments()); setError("") }
    catch { setError("文档库加载失败") }
  }, [])

  useEffect(() => {
    refresh()
    window.addEventListener("document-library-changed", refresh)
    return () => {
      window.removeEventListener("document-library-changed", refresh)
    }
  }, [refresh])

  useEffect(() => {
    if (!documents.some((document) => ["queued", "processing", "saving"].includes(document.status))) return
    const timer = window.setInterval(refresh, 15_000)
    return () => window.clearInterval(timer)
  }, [documents, refresh])

  const openDocument = async (id: string) => {
    setBusy(true)
    try {
      const document = await getDocument(id)
      if (document?.status !== "ready") throw new Error("文档尚未解析完成")
      onOpen(document)
      setMobileOpen(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "打开文档失败") }
    finally { setBusy(false) }
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
    } catch (cause) { setError(cause instanceof Error ? cause.message : "更新解析状态失败") }
    finally { setBusy(false) }
  }

  const removeSelected = async () => {
    if (!selected.size) return
    const ids = [...selected]
    setBusy(true)
    try {
      await deleteDocuments(ids)
      await onDelete(ids)
      setSelected(new Set())
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "删除文档失败") }
    finally { setBusy(false) }
  }

  const content = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="font-semibold">我的文档</h2>
          <p className="text-xs text-muted-foreground">{documents.length} 份文档，云端保存</p>
        </div>
        <Button variant="ghost" size="icon" onClick={refresh} aria-label="刷新文档库">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      {error && <p role="alert" className="px-4 py-2 text-sm text-red-600">{error}</p>}
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {documents.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">上传文件后会显示在这里</p>}
        {documents.map((document) => (
          <div key={document.id} className="group flex items-start gap-2 rounded-lg p-2 hover:bg-accent">
            <Checkbox checked={selected.has(document.id)} aria-label={`选择 ${document.name}`}
              onCheckedChange={(checked) => setSelected((current) => {
                const next = new Set(current)
                if (checked) next.add(document.id)
                else next.delete(document.id)
                return next
              })} className="mt-1" />
            <BookOpen className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <button type="button" disabled={busy || document.status !== "ready"}
                onClick={() => openDocument(document.id)} className="block w-full truncate text-left text-sm font-medium disabled:cursor-default">
                {document.name}
              </button>
              <p className="text-xs text-muted-foreground">{formatSize(document.byteSize)} · {statusText[document.status]}</p>
              {document.error && <p className="truncate text-xs text-red-600" title={document.error}>{document.error}</p>}
              {document.status !== "ready" && <button type="button" disabled={busy}
                className="mt-1 text-xs text-primary underline disabled:opacity-50"
                onClick={() => retryDocument(document)}>
                {document.status === "failed" ? "重试解析" : "刷新状态"}
              </button>}
              {(document.status === "uploading" || document.status === "failed") && <label
                className="ml-2 cursor-pointer text-xs text-primary underline">
                重新选择原文件
                <input type="file" className="sr-only" disabled={busy} onChange={async (event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ""
                  if (!file) return
                  setBusy(true)
                  try { await onResumeUpload(document.id, file); await refresh() }
                  catch (cause) { setError(cause instanceof Error ? cause.message : "继续上传失败") }
                  finally { setBusy(false) }
                }} />
              </label>}
            </div>
          </div>
        ))}
      </div>
      {selected.size > 0 && <div className="border-t p-3">
        <Button variant="destructive" disabled={busy} onClick={removeSelected} className="w-full gap-2">
          <Trash2 className="h-4 w-4" />删除所选（{selected.size}）
        </Button>
      </div>}
    </div>
  )

  return <>
    <aside className="fixed bottom-0 left-0 top-28 z-10 hidden w-72 flex-col border-r bg-background lg:flex">{content}</aside>
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2 lg:hidden" aria-label="打开文档库">
          <Library className="h-4 w-4" /><span className="hidden sm:inline">文档库</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-[86vw] flex-col p-0 sm:max-w-sm">
        <SheetHeader className="sr-only"><SheetTitle>文档库</SheetTitle></SheetHeader>
        {content}
      </SheetContent>
    </Sheet>
  </>
}
