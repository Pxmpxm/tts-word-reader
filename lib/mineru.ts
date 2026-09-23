import type { DocumentAsset } from "./documentStore"

export interface MinerUResult {
  markdown: string
  assets: DocumentAsset[]
}

interface MinerUTask {
  taskId: string
  mode: "single" | "batch"
  sourceUrl?: string
}

export async function submitMinerUDocument(file: File, onProgress?: (message: string) => void) {
  let task: MinerUTask
  try {
    task = await submitWithVercelBlob(file, onProgress)
  } catch (blobError) {
    if (file.size > 4 * 1024 * 1024) {
      throw new Error(blobError instanceof Error
        ? `Vercel Blob 上传不可用：${blobError.message}`
        : "Vercel Blob 上传不可用")
    }
    task = await submitWithServerProxy(file, onProgress)
  }

  const startedAt = Date.now()
  while (Date.now() - startedAt < 10 * 60 * 1000) {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    const query = new URLSearchParams({ mode: task.mode })
    if (task.sourceUrl) query.set("sourceUrl", task.sourceUrl)
    const response = await fetch(`/api/mineru/tasks/${encodeURIComponent(task.taskId)}?${query}`)
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || "查询 MinerU 任务失败")
    if (result.state === "failed") throw new Error(result.error || "MinerU 解析失败")
    if (result.state === "done") {
      onProgress?.("正在保存解析资产…")
      return downloadMinerUResult(task)
    }
    const pageProgress = result.totalPages
      ? `（${result.extractedPages || 0}/${result.totalPages} 页）`
      : ""
    onProgress?.(`MinerU 正在解析${pageProgress}…`)
  }
  throw new Error("MinerU 解析超时，请稍后重试")
}

async function submitWithVercelBlob(file: File, onProgress?: (message: string) => void): Promise<MinerUTask> {
  const configResponse = await fetch("/api/blob/upload")
  const config = await configResponse.json()
  if (!configResponse.ok || !config.configured) throw new Error("Vercel Blob 尚未配置")

  onProgress?.("正在上传临时文档…")
  const { upload } = await import("@vercel/blob/client")
  const blob = await upload(`mineru/${crypto.randomUUID()}-${file.name}`, file, {
    access: "public",
    handleUploadUrl: "/api/blob/upload",
    multipart: file.size > 5 * 1024 * 1024,
  })

  onProgress?.("正在创建 MinerU 解析任务…")
  const response = await fetch("/api/mineru/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, sourceUrl: blob.url }),
  })
  const result = await response.json()
  if (!response.ok) {
    await fetch("/api/blob/upload", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: blob.url }),
    }).catch(() => undefined)
    throw new Error(result.error || "无法创建 MinerU 解析任务")
  }
  return { taskId: result.taskId, mode: "single", sourceUrl: blob.url }
}

async function submitWithServerProxy(file: File, onProgress?: (message: string) => void): Promise<MinerUTask> {
  onProgress?.("正在申请 MinerU 上传地址…")
  const createResponse = await fetch("/api/mineru/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name }),
  })
  const createResult = await createResponse.json()
  if (!createResponse.ok) throw new Error(createResult.error || "无法创建 MinerU 解析任务")

  onProgress?.("正在上传文档…")
  const uploadResponse = await fetch("/api/mineru/upload", {
    method: "POST",
    headers: { "x-mineru-upload-url": createResult.uploadUrl },
    body: file,
  })
  if (!uploadResponse.ok) {
    const uploadResult = await uploadResponse.json().catch(() => ({}))
    throw new Error(uploadResult.error || `文档上传失败：${uploadResponse.status}`)
  }
  return { taskId: createResult.taskId, mode: "batch" }
}

async function downloadMinerUResult(task: MinerUTask): Promise<MinerUResult> {
  const response = await fetch(
    `/api/mineru/tasks/${encodeURIComponent(task.taskId)}/result?mode=${task.mode}`,
  )
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    throw new Error(result.error || "下载 MinerU 结果失败")
  }

  const { default: JSZip } = await import("jszip")
  const zip = await JSZip.loadAsync(await response.blob())
  const files = Object.values(zip.files).filter((file) => !file.dir)
  const markdownFile = files.find((file) => /(^|\/)full\.md$/i.test(file.name))
    || files.find((file) => /\.md$/i.test(file.name))
  if (!markdownFile) throw new Error("MinerU 结果中没有 Markdown 正文")

  const markdown = await markdownFile.async("text")
  const assets = await Promise.all(files
    .filter((file) => file !== markdownFile)
    .map(async (file) => {
      const blob = await file.async("blob")
      const type = imageMimeType(file.name) || blob.type
      return { path: file.name, type, blob: new Blob([blob], { type }) }
    }))

  return { markdown, assets }
}

function imageMimeType(path: string) {
  const extension = path.split(".").pop()?.toLowerCase()
  return ({
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
  } as Record<string, string>)[extension || ""] || ""
}
