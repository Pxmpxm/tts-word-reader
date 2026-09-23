import { NextResponse } from "next/server"

export const maxDuration = 60

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

export async function POST(request: Request) {
  try {
    const rawUploadUrl = request.headers.get("x-mineru-upload-url")
    if (!rawUploadUrl) return NextResponse.json({ error: "缺少上传地址" }, { status: 400 })

    const uploadUrl = new URL(rawUploadUrl)
    if (uploadUrl.protocol !== "https:" || !uploadUrl.hostname.endsWith(".aliyuncs.com")) {
      return NextResponse.json({ error: "上传地址无效" }, { status: 400 })
    }

    const contentLength = Number(request.headers.get("content-length"))
    if (contentLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Vercel 部署下 MinerU 文件暂不能超过 4 MB" }, { status: 413 })
    }
    const body = await request.arrayBuffer()
    if (body.byteLength === 0 || body.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "文件为空或超过 4 MB" }, { status: 413 })
    }

    const response = await fetch(uploadUrl, { method: "PUT", body, cache: "no-store" })
    if (!response.ok) throw new Error(`MinerU 文件上传失败：${response.status}`)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "MinerU 文件上传失败" },
      { status: 500 },
    )
  }
}
