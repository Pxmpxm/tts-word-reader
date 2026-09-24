import "server-only"
import { createHash } from "node:crypto"
import JSZip from "jszip"
import { adminDb } from "@/lib/supabase/server"
import { getMinerUServerConfig } from "@/lib/mineruServer"

type Job = {
  document_id: string
  user_id: string
  mineru_id: string | null
  state: string
  updated_at: string
}

const mimeTypes: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", jp2: "image/jp2",
  gif: "image/gif", webp: "image/webp", bmp: "image/bmp",
  tif: "image/tiff", tiff: "image/tiff", svg: "image/svg+xml",
}

export async function refreshMineruJob(documentId: string) {
  const db = adminDb()
  const { data: job, error: jobError } = await db.from("parse_jobs")
    .select("document_id,user_id,mineru_id,state,updated_at")
    .eq("document_id", documentId).maybeSingle()
  if (jobError || !job) throw new Error("解析任务不存在")
  return processJob(job as Job)
}

async function processJob(job: Job) {
  if (job.state === "done" || job.state === "failed") return job.state
  if (!job.mineru_id) {
    if (Date.now() - Date.parse(job.updated_at) > 15 * 60_000) {
      const db = adminDb()
      const error = "解析任务未能启动，请从文档库重试"
      await Promise.all([
        db.from("parse_jobs").update({ state: "failed", error }).eq("document_id", job.document_id),
        db.from("documents").update({ status: "failed", error }).eq("id", job.document_id),
      ])
      return "failed"
    }
    return "queued"
  }
  if (job.state === "saving" && Date.now() - Date.parse(job.updated_at) < 15 * 60_000) return "saving"

  const db = adminDb()
  const { token, base } = getMinerUServerConfig()
  const response = await fetch(`${base}/api/v4/extract-results/batch/${encodeURIComponent(job.mineru_id)}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
  })
  const result = await response.json()
  if (!response.ok || result.code !== 0) throw new Error(result.msg || "查询 MinerU 失败")
  const item = result.data?.extract_result?.[0]
  if (!item || item.state === "pending" || item.state === "running" || item.state === "waiting-file") return "processing"
  if (item.state === "failed") {
    const error = item.err_msg || "MinerU 解析失败"
    await Promise.all([
      db.from("parse_jobs").update({ state: "failed", error, updated_at: new Date().toISOString() }).eq("document_id", job.document_id),
      db.from("documents").update({ status: "failed", error }).eq("id", job.document_id),
    ])
    return "failed"
  }
  if (item.state !== "done" || !item.full_zip_url) return "processing"

  let claim = db.from("parse_jobs")
    .update({ state: "saving", updated_at: new Date().toISOString() })
    .eq("document_id", job.document_id).eq("state", job.state)
  if (job.state === "saving") {
    claim = claim.lt("updated_at", new Date(Date.now() - 15 * 60_000).toISOString())
  }
  const { data: claimed } = await claim.select("document_id").maybeSingle()
  if (!claimed) return "saving"
  await db.from("documents").update({ status: "saving" }).eq("id", job.document_id)
    .in("status", ["queued", "processing"])
  try {
    await saveResult(job, item.full_zip_url)
    await db.from("parse_jobs").update({ state: "done", error: null, updated_at: new Date().toISOString() })
      .eq("document_id", job.document_id)
    return "done"
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存 MinerU 结果失败"
    await db.from("parse_jobs").update({ error: message, updated_at: new Date(0).toISOString() })
      .eq("document_id", job.document_id)
    throw error
  }
}

async function saveResult(job: Job, zipUrl: string) {
  const db = adminDb()
  const response = await fetch(zipUrl, { cache: "no-store" })
  if (!response.ok) throw new Error("下载 MinerU 结果失败")
  const zipBytes = Buffer.from(await response.arrayBuffer())
  if (zipBytes.length > 100 * 1024 * 1024) throw new Error("MinerU 结果 ZIP 超过处理上限")
  const zip = await JSZip.loadAsync(zipBytes)
  const files = Object.values(zip.files).filter((file) => !file.dir)
  const markdownFile = files.find((file) => /(^|\/)full\.md$/i.test(file.name))
    || files.find((file) => /\.md$/i.test(file.name))
  if (!markdownFile) throw new Error("MinerU 结果没有 Markdown 正文")
  const markdown = await markdownFile.async("text")
  const json: Record<string, unknown> = {}
  const assets = []
  let extractedBytes = 0
  for (const file of files) {
    const bytes = await file.async("uint8array")
    extractedBytes += bytes.length
    if (extractedBytes > 150 * 1024 * 1024) throw new Error("MinerU 结果解压后超过处理上限")
    if (/\.json$/i.test(file.name)) {
      json[file.name] = JSON.parse(Buffer.from(bytes).toString("utf8"))
      continue
    }
    if (file === markdownFile || /\.md$/i.test(file.name)) continue
    const extension = file.name.split(".").pop()?.toLowerCase() || "bin"
    const digest = createHash("sha256").update(file.name).digest("hex")
    const storagePath = `${job.user_id}/${job.document_id}/assets/${digest}.${extension}`
    const mimeType = mimeTypes[extension] || "application/octet-stream"
    const { error } = await db.storage.from("documents").upload(storagePath, bytes, {
      contentType: mimeType, upsert: true,
    })
    if (error) throw error
    assets.push({ document_id: job.document_id, user_id: job.user_id, path: file.name,
      storage_path: storagePath, mime_type: mimeType, byte_size: bytes.length })
  }
  if (zipBytes.length <= 50 * 1024 * 1024) {
    const storagePath = `${job.user_id}/${job.document_id}/mineru-result.zip`
    const { error } = await db.storage.from("documents").upload(storagePath, zipBytes, {
      contentType: "application/zip", upsert: true,
    })
    if (error) throw error
    assets.push({ document_id: job.document_id, user_id: job.user_id, path: "__mineru_zip__",
      storage_path: storagePath, mime_type: "application/zip", byte_size: zipBytes.length })
  }
  if (assets.length) {
    const { error } = await db.from("document_assets").upsert(assets, { onConflict: "document_id,path" })
    if (error) throw error
  }
  const { error } = await db.from("documents").update({
    markdown, mineru_json: json, status: "ready", error: null, updated_at: new Date().toISOString(),
  }).eq("id", job.document_id)
  if (error) throw error
}
