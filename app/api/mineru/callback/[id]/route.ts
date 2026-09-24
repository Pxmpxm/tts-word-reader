import { NextResponse } from "next/server"
import { adminDb } from "@/lib/supabase/server"
import { refreshMineruJob } from "@/lib/mineruJob"

export const maxDuration = 300

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const token = new URL(request.url).searchParams.get("token")
  if (!token || !/^[a-f0-9]{48}$/.test(token)) return new Response("Unauthorized", { status: 401 })
  const { data: job } = await adminDb().from("parse_jobs").select("document_id")
    .eq("document_id", id).eq("callback_token", token).maybeSingle()
  if (!job) return new Response("Unauthorized", { status: 401 })
  try {
    const status = await refreshMineruJob(id)
    if (status === "queued") return new Response("Task not ready", { status: 503 })
    return NextResponse.json({ status })
  } catch {
    return new Response("Retry callback", { status: 503 })
  }
}
