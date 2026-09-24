import { NextResponse } from "next/server"
import { adminDb } from "@/lib/supabase/server"
import { refreshMineruJob } from "@/lib/mineruJob"
import { pruneAudioCache } from "@/lib/audioCacheCleanup"

export const maxDuration = 300

export async function GET(request: Request, context: { params: Promise<{ slot: string }> }) {
  const { slot } = await context.params
  if (!["1", "2", "3"].includes(slot)) return new Response("Not found", { status: 404 })
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const db = adminDb()
  const { error } = await db.from("heartbeats").upsert({ id: 1, pinged_at: new Date().toISOString() })
  if (error) return NextResponse.json({ error: "Supabase 心跳写入失败" }, { status: 503 })

  const { data: jobs, error: jobsError } = await db.from("parse_jobs").select("document_id")
    .in("state", ["queued", "processing", "saving"]).order("updated_at", { ascending: true }).limit(1)
  if (jobsError) console.error("Could not query MinerU tasks", jobsError)
  let failed = jobsError ? 1 : 0
  // ponytail: one recovery job per heartbeat; raise this only if a real backlog develops.
  for (const job of jobs || []) {
    try { await refreshMineruJob(job.document_id) }
    catch (error) { failed += 1; console.error("MinerU task recovery failed", error) }
  }
  const staleBefore = new Date(Date.now() - 15 * 60_000).toISOString()
  const { data: abandoned } = await db.from("documents").select("id")
    .eq("status", "queued").lt("updated_at", staleBefore).limit(10)
  for (const document of abandoned || []) {
    const { data: job } = await db.from("parse_jobs").select("document_id")
      .eq("document_id", document.id).maybeSingle()
    if (!job) await db.from("documents").update({ status: "failed", error: "解析任务未能启动，请重试" })
      .eq("id", document.id).eq("status", "queued")
  }
  const removedAudio = await pruneAudioCache().catch((error) => {
    console.error("Audio cache cleanup failed", error)
    return -1
  })
  return NextResponse.json({ ok: true, retried: (jobs || []).length, failed, removedAudio })
}
