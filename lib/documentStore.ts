import { browserDb } from "./supabase/client"

export interface DocumentAsset {
  path: string
  type: string
  url: string
}

export interface StoredDocument {
  id: string
  name: string
  sourceType: "docx" | "text" | "markdown" | "mineru"
  status: "uploading" | "queued" | "processing" | "saving" | "ready" | "failed"
  html?: string
  markdown?: string
  assets: DocumentAsset[]
  readingIndex: number
  error?: string
  createdAt: number
  updatedAt: number
  byteSize: number
}

export type StoredDocumentSummary = Pick<
  StoredDocument, "id" | "name" | "sourceType" | "status" | "createdAt" | "updatedAt" | "byteSize" | "error"
>

export async function listDocuments(): Promise<StoredDocumentSummary[]> {
  const { data, error } = await browserDb().from("documents")
    .select("id,name,source_type,status,file_size,error,created_at,updated_at")
    .order("updated_at", { ascending: false })
  if (error) throw error
  return (data || []).map((row) => ({
    id: row.id, name: row.name, sourceType: row.source_type, status: row.status,
    byteSize: row.file_size, error: row.error || undefined,
    createdAt: Date.parse(row.created_at), updatedAt: Date.parse(row.updated_at),
  }))
}

export async function getDocument(id: string): Promise<StoredDocument | null> {
  const db = browserDb()
  const { data: row, error } = await db.from("documents")
    .select("id,name,source_type,status,file_size,html,markdown,reading_index,error,created_at,updated_at")
    .eq("id", id).maybeSingle()
  if (error) throw error
  if (!row) return null
  const { data: assetRows, error: assetError } = await db.from("document_assets")
    .select("path,mime_type,storage_path").eq("document_id", id)
  if (assetError) throw assetError
  const images = (assetRows || []).filter((asset) => asset.mime_type.startsWith("image/"))
  const assets: DocumentAsset[] = []
  for (let offset = 0; offset < images.length; offset += 100) {
    const batch = images.slice(offset, offset + 100)
    const { data: urls, error: urlError } = await db.storage.from("documents")
      .createSignedUrls(batch.map((asset) => asset.storage_path), 24 * 60 * 60)
    if (urlError || !urls) throw urlError || new Error("读取文档图片失败")
    const signed = new Map(urls.map((item) => [item.path, item.signedUrl]))
    for (const asset of batch) {
      const url = signed.get(asset.storage_path)
      if (!url) throw new Error("文档图片地址已失效")
      assets.push({ path: asset.path, type: asset.mime_type, url })
    }
  }
  return {
    id: row.id, name: row.name, sourceType: row.source_type, status: row.status,
    html: row.html || undefined, markdown: row.markdown || undefined, assets,
    readingIndex: row.reading_index, error: row.error || undefined,
    byteSize: row.file_size, createdAt: Date.parse(row.created_at), updatedAt: Date.parse(row.updated_at),
  }
}

export async function deleteDocuments(ids: string[]) {
  for (const id of ids) {
    const response = await fetch(`/api/documents/${encodeURIComponent(id)}`, { method: "DELETE" })
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      throw new Error(result.error || "删除文档失败")
    }
  }
}

export async function saveReadingIndex(id: string, readingIndex: number) {
  const { error } = await browserDb().from("documents")
    .update({ reading_index: readingIndex }).eq("id", id)
  if (error) throw error
}
