import { createHash } from "node:crypto"
import { NextResponse } from "next/server"
import { adminDb, currentUser } from "@/lib/supabase/server"
import { AVAILABLE_TTS_STYLES, AVAILABLE_TTS_VOICES, DEFAULT_TTS_API_ENDPOINT } from "@/lib/ttsOptions"

export const maxDuration = 60

export async function POST(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 })
  const { documentId, input, voice, style } = await request.json().catch(() => ({}))
  if (typeof documentId !== "string" || typeof input !== "string" || !input.trim()
    || input.length > 150 || !AVAILABLE_TTS_VOICES.some((item) => item.id === voice)
    || !AVAILABLE_TTS_STYLES.some((item) => item.id === style)) {
    return NextResponse.json({ error: "朗读参数无效" }, { status: 400 })
  }
  const db = adminDb()
  const { data: document } = await db.from("documents").select("id")
    .eq("id", documentId).eq("user_id", user.id).eq("status", "ready").maybeSingle()
  if (!document) return NextResponse.json({ error: "文档不可阅读" }, { status: 404 })

  const endpoint = process.env.TTS_API_ENDPOINT || DEFAULT_TTS_API_ENDPOINT
  const cacheKey = createHash("sha256").update(JSON.stringify([endpoint, input, voice, style])).digest("hex")
  const storagePath = `${user.id}/${documentId}/${cacheKey}.mp3`
  const { data: cached } = await db.from("audio_cache").select("storage_path")
    .eq("user_id", user.id).eq("document_id", documentId).eq("cache_key", cacheKey).maybeSingle()
  if (cached) {
    const { data: audio } = await db.storage.from("audio").download(cached.storage_path)
    if (audio) {
      await db.from("audio_cache").update({ last_used_at: new Date().toISOString() })
        .eq("user_id", user.id).eq("document_id", documentId).eq("cache_key", cacheKey)
      return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, no-store" } })
    }
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, voice, style, speed: 1, pitch: "0", volume: "0" }),
      signal: AbortSignal.timeout(30_000), cache: "no-store",
    })
    if (!response.ok) throw new Error(`TTS 服务返回 ${response.status}`)
    if ((response.headers.get("content-type") || "").includes("application/json")) {
      throw new Error("TTS 服务未返回音频")
    }
    const bytes = await response.arrayBuffer()
    if (!bytes.byteLength || bytes.byteLength > 4 * 1024 * 1024) throw new Error("TTS 音频为空或过大")
    const { error: uploadError } = await db.storage.from("audio").upload(storagePath, bytes, {
      contentType: "audio/mpeg", upsert: true,
    })
    if (uploadError) throw uploadError
    const { error: dbError } = await db.from("audio_cache").upsert({
      user_id: user.id, document_id: documentId, cache_key: cacheKey,
      storage_path: storagePath, byte_size: bytes.byteLength,
      last_used_at: new Date().toISOString(),
    }, { onConflict: "user_id,document_id,cache_key" })
    if (dbError) throw dbError
    return new Response(bytes, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, no-store" } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "生成语音失败" }, { status: 502 })
  }
}
