import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { del } from "@vercel/blob"
import { NextResponse } from "next/server"
import { isVercelBlobUrl } from "@/lib/mineruServer"

const ALLOWED_CONTENT_TYPES = [
  "application/octet-stream",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/*",
]

export function GET() {
  return NextResponse.json({ configured: Boolean(process.env.BLOB_READ_WRITE_TOKEN) })
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin")
    const host = request.headers.get("host")
    if (origin && host && new URL(origin).host !== host) {
      return NextResponse.json({ error: "仅允许本站上传文档" }, { status: 403 })
    }

    const body = await request.json() as HandleUploadBody
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_CONTENT_TYPES,
        maximumSizeInBytes: 200 * 1024 * 1024,
        addRandomSuffix: true,
        cacheControlMaxAge: 60,
      }),
      onUploadCompleted: async () => undefined,
    })
    return NextResponse.json(response)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "无法创建文档上传凭证" },
      { status: 400 },
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const origin = request.headers.get("origin")
    const host = request.headers.get("host")
    if (origin && host && new URL(origin).host !== host) {
      return NextResponse.json({ error: "仅允许本站清理临时文档" }, { status: 403 })
    }
    const { url } = await request.json()
    if (!isVercelBlobUrl(url)) return NextResponse.json({ error: "临时文档地址无效" }, { status: 400 })
    await del(url)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "清理临时文档失败" },
      { status: 400 },
    )
  }
}
