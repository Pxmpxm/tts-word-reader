import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"
import { adminDb, currentUser } from "@/lib/supabase/server"
import { getMinerUServerConfig } from "@/lib/mineruServer"
import { markdownToHtml } from "@/lib/markdown"

export const maxDuration = 300

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 })
  const { id } = await context.params
  const db = adminDb()
  const { data: document } = await db.from("documents")
    .select("id,name,source_type,source_path,file_size,status")
    .eq("id", id).eq("user_id", user.id).maybeSingle()
  if (!document) return NextResponse.json({ error: "文档不存在" }, { status: 404 })
  if (document.status !== "uploading" && document.status !== "failed") {
    return NextResponse.json({ status: document.status })
  }
  const { data: source, error: sourceError } = await db.storage.from("documents").download(document.source_path)
  if (sourceError || !source || source.size !== document.file_size) {
    return NextResponse.json({ error: "源文件尚未完整上传" }, { status: 409 })
  }
  const { data: claimed } = await db.from("documents").update({
    status: "queued", error: null, updated_at: new Date().toISOString(),
  })
    .eq("id", id).eq("status", document.status).select("id").maybeSingle()
  if (!claimed) return NextResponse.json({ status: "queued" })

  try {
    if (document.source_type !== "mineru") {
      let html: string | null = null
      let markdown: string | null = null
      if (document.source_type === "docx") {
        const mammoth = await import("mammoth")
        const result = await mammoth.convertToHtml({ buffer: Buffer.from(await source.arrayBuffer()) })
        html = result.value
      } else {
        markdown = await source.text()
        html = markdownToHtml(markdown)
      }
      const { error } = await db.from("documents").update({
        html, markdown, status: "ready", updated_at: new Date().toISOString(),
      }).eq("id", id)
      if (error) throw error
      return NextResponse.json({ status: "ready" })
    }

    const config = getMinerUServerConfig()
    const callbackToken = randomBytes(24).toString("hex")
    const callbackBase = process.env.MINERU_CALLBACK_BASE_URL
      || (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : new URL(request.url).origin)
    const callback = callbackBase.startsWith("https://")
      ? `${callbackBase.replace(/\/$/, "")}/api/mineru/callback/${id}?token=${callbackToken}` : undefined
    const { error: jobError } = await db.from("parse_jobs").upsert({
      document_id: id, user_id: user.id, callback_token: callbackToken, mineru_id: null,
      state: "queued", error: null, updated_at: new Date().toISOString(),
    }, { onConflict: "document_id" })
    if (jobError) throw jobError
    const taskResponse = await fetch(`${config.base}/api/v4/file-urls/batch`, {
      method: "POST", headers: {
        Authorization: `Bearer ${config.token}`, "Content-Type": "application/json",
      },
      body: JSON.stringify({ files: [{ name: document.name, data_id: id }],
        model_version: config.modelVersion, enable_formula: true, enable_table: true,
        ...(callback ? { callback, seed: callbackToken } : {}),
      }), cache: "no-store",
    })
    const task = await taskResponse.json()
    if (!taskResponse.ok || task.code !== 0 || !task.data?.batch_id || !task.data.file_urls?.[0]) {
      throw new Error(task.msg || "创建 MinerU 任务失败")
    }
    const { error: idError } = await db.from("parse_jobs").update({
      mineru_id: task.data.batch_id, state: "processing", updated_at: new Date().toISOString(),
    }).eq("document_id", id)
    if (idError) throw idError
    const uploadUrl = new URL(task.data.file_urls[0])
    if (uploadUrl.protocol !== "https:" || !uploadUrl.hostname.endsWith(".aliyuncs.com")) {
      throw new Error("MinerU 上传地址无效")
    }
    const upload = await fetch(uploadUrl, { method: "PUT", body: Buffer.from(await source.arrayBuffer()) })
    if (!upload.ok) throw new Error(`向 MinerU 上传文件失败：${upload.status}`)
    const { error: statusError } = await db.from("documents").update({ status: "processing" })
      .eq("id", id).eq("status", "queued")
    if (statusError) throw statusError
    return NextResponse.json({ status: "processing" })
  } catch (error) {
    const message = error instanceof Error ? error.message : "解析失败"
    await Promise.all([
      db.from("documents").update({ status: "failed", error: message }).eq("id", id)
        .in("status", ["queued", "processing"]),
      db.from("parse_jobs").update({ state: "failed", error: message }).eq("document_id", id)
        .in("state", ["queued", "processing"]),
    ])
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
