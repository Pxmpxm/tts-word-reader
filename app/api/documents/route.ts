import { NextResponse } from "next/server"
import { adminDb, currentUser } from "@/lib/supabase/server"

export async function POST(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 })

  const { name, size } = await request.json().catch(() => ({}))
  const extension = typeof name === "string" ? name.split(".").pop()?.toLowerCase() : ""
  const localTypes: Record<string, "docx" | "text" | "markdown"> = {
    docx: "docx", txt: "text", md: "markdown", markdown: "markdown",
  }
  const mineruTypes = new Set(["pdf", "doc", "ppt", "pptx", "xls", "xlsx", "png", "jpg", "jpeg", "jp2", "webp", "gif", "bmp"])
  if (typeof name !== "string" || name.length < 1 || name.length > 255 || /[\\/\0]/.test(name)
    || (!localTypes[extension || ""] && !mineruTypes.has(extension || ""))
    || !Number.isSafeInteger(size) || size < 1 || size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "文件类型无效，或超过免费版 50 MB 限制" }, { status: 400 })
  }

  const id = crypto.randomUUID()
  const sourcePath = `${user.id}/${id}/source.${extension}`
  const db = adminDb()
  const { error } = await db.from("documents").insert({
    id, user_id: user.id, name, source_type: localTypes[extension || ""] || "mineru",
    file_size: size, source_path: sourcePath,
  })
  if (error) return NextResponse.json({ error: "创建文档失败" }, { status: 500 })
  return NextResponse.json({ id, sourcePath })
}
