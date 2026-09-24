import { NextResponse } from "next/server"
import { currentUser, adminDb } from "@/lib/supabase/server"
import { refreshMineruJob } from "@/lib/mineruJob"

export const maxDuration = 300

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 })
  const { id } = await context.params
  const { data } = await adminDb().from("documents").select("id")
    .eq("id", id).eq("user_id", user.id).maybeSingle()
  if (!data) return NextResponse.json({ error: "文档不存在" }, { status: 404 })
  try {
    return NextResponse.json({ status: await refreshMineruJob(id) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "刷新任务失败" }, { status: 500 })
  }
}
