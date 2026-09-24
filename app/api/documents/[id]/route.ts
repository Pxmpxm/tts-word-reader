import { NextResponse } from "next/server"
import { adminDb, currentUser } from "@/lib/supabase/server"

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 })
  const { id } = await context.params
  const db = adminDb()
  const { data: document } = await db.from("documents").select("id,source_path")
    .eq("id", id).eq("user_id", user.id).maybeSingle()
  if (!document) return NextResponse.json({ error: "文档不存在" }, { status: 404 })

  const [{ data: assets }, { data: audio }] = await Promise.all([
    db.from("document_assets").select("storage_path").eq("document_id", id),
    db.from("audio_cache").select("storage_path").eq("document_id", id),
  ])
  const documentPaths = [document.source_path, ...(assets || []).map((item) => item.storage_path)]
  const audioPaths = (audio || []).map((item) => item.storage_path)
  for (const [bucket, paths] of [["documents", documentPaths], ["audio", audioPaths]] as const) {
    for (let offset = 0; offset < paths.length; offset += 100) {
      const { error } = await db.storage.from(bucket).remove(paths.slice(offset, offset + 100))
      if (error) return NextResponse.json({ error: "清理文档文件失败，请重试" }, { status: 500 })
    }
  }
  const { error } = await db.from("documents").delete().eq("id", id).eq("user_id", user.id)
  if (error) return NextResponse.json({ error: "删除文档记录失败，请重试" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
