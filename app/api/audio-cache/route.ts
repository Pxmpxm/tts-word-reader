import { NextResponse } from "next/server"
import { adminDb, currentUser } from "@/lib/supabase/server"

export async function DELETE(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 })
  const { documentId } = await request.json().catch(() => ({}))
  if (documentId !== undefined && typeof documentId !== "string") {
    return NextResponse.json({ error: "文档 ID 无效" }, { status: 400 })
  }
  const db = adminDb()
  if (documentId) {
    const { data } = await db.from("documents").select("id")
      .eq("id", documentId).eq("user_id", user.id).maybeSingle()
    if (!data) return NextResponse.json({ error: "文档不存在" }, { status: 404 })
  }
  let query = db.from("audio_cache").select("storage_path").eq("user_id", user.id)
  if (documentId) query = query.eq("document_id", documentId)
  const { data: records, error: readError } = await query
  if (readError) return NextResponse.json({ error: "读取音频缓存失败" }, { status: 500 })
  const paths = (records || []).map((item) => item.storage_path)
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await db.storage.from("audio").remove(paths.slice(index, index + 100))
    if (error) return NextResponse.json({ error: "清理音频文件失败" }, { status: 500 })
  }
  let deletion = db.from("audio_cache").delete().eq("user_id", user.id)
  if (documentId) deletion = deletion.eq("document_id", documentId)
  const { error } = await deletion
  if (error) return NextResponse.json({ error: "清理缓存记录失败" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
