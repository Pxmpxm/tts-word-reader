import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Database, FileText, Trash2 } from "lucide-react"
import {
  deleteDocuments,
  getDocument,
  listDocuments,
  type StoredDocument,
  type StoredDocumentSummary,
} from "@/lib/documentStore"

interface DocumentLibraryProps {
  onOpen: (document: StoredDocument) => void
  onDelete: (ids: string[]) => Promise<void>
}

const formatSize = (bytes: number) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export function DocumentLibrary({ onOpen, onDelete }: DocumentLibraryProps) {
  const [open, setOpen] = useState(false)
  const [documents, setDocuments] = useState<StoredDocumentSummary[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const refresh = async () => setDocuments(await listDocuments())

  useEffect(() => {
    if (open) refresh().catch(console.error)
  }, [open])

  const openDocument = async (id: string) => {
    setBusy(true)
    try {
      const document = await getDocument(id)
      if (document) {
        onOpen(document)
        setOpen(false)
      }
    } finally {
      setBusy(false)
    }
  }

  const removeSelected = async () => {
    const ids = [...selected]
    if (ids.length === 0) return
    setBusy(true)
    try {
      await deleteDocuments(ids)
      await onDelete(ids)
      setSelected(new Set())
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2" aria-label="缓存管理">
          <Database className="h-4 w-4" />
          <span className="hidden sm:inline">缓存管理</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>IndexedDB 文档缓存</DialogTitle>
          <DialogDescription>按文档名打开或清理原文件、MinerU 解析资产和关联音频。</DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto px-6">
          {documents.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">暂无缓存文档</p>
          ) : documents.map((document) => (
            <div key={document.id} className="flex items-center gap-3 border-b py-3 last:border-0">
              <Checkbox
                checked={selected.has(document.id)}
                aria-label={`选择清理 ${document.name}`}
                onCheckedChange={(checked) => setSelected((current) => {
                  const next = new Set(current)
                  if (checked) next.add(document.id)
                  else next.delete(document.id)
                  return next
                })}
              />
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              <button type="button" disabled={busy} onClick={() => openDocument(document.id)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium">{document.name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatSize(document.byteSize)} · {new Date(document.updatedAt).toLocaleString()}
                </span>
              </button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => openDocument(document.id)}>
                打开
              </Button>
            </div>
          ))}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="destructive" disabled={busy || selected.size === 0} onClick={removeSelected} className="gap-2">
            <Trash2 className="h-4 w-4" />
            清理所选（{selected.size}）
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
