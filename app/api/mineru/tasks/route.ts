import { NextResponse } from "next/server"
import { getMinerUServerConfig, isVercelBlobUrl } from "@/lib/mineruServer"

export const maxDuration = 60

const VALID_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx",
  "png", "jpg", "jpeg", "jp2", "webp", "gif", "bmp",
])

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin")
    const host = request.headers.get("host")
    if (origin && host && new URL(origin).host !== host) {
      return NextResponse.json({ error: "仅允许本站提交解析任务" }, { status: 403 })
    }
    const { fileName, sourceUrl } = await request.json()
    const extension = typeof fileName === "string" ? fileName.split(".").pop()?.toLowerCase() : ""
    if (!fileName || fileName.length > 255 || /[\\/\0]/.test(fileName) || !extension || !VALID_EXTENSIONS.has(extension)) {
      return NextResponse.json({ error: "MinerU 不支持该文件格式" }, { status: 400 })
    }

    const config = getMinerUServerConfig()
    if (sourceUrl !== undefined) {
      if (!isVercelBlobUrl(sourceUrl)) {
        return NextResponse.json({ error: "临时文档地址无效" }, { status: 400 })
      }
      const response = await fetch(`${config.base}/api/v4/extract/task`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: sourceUrl,
          model_version: config.modelVersion,
          enable_formula: true,
          enable_table: true,
        }),
        cache: "no-store",
      })
      const result = await response.json()
      if (!response.ok || result.code !== 0 || !result.data?.task_id) {
        throw new Error(result.msg || `MinerU 请求失败：${response.status}`)
      }
      return NextResponse.json({ taskId: result.data.task_id, mode: "single" })
    }

    const response = await fetch(`${config.base}/api/v4/file-urls/batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: [{ name: fileName }],
        model_version: config.modelVersion,
        enable_formula: true,
        enable_table: true,
      }),
      cache: "no-store",
    })
    const result = await response.json()
    if (!response.ok || result.code !== 0 || !result.data?.file_urls?.[0]) {
      throw new Error(result.msg || `MinerU 请求失败：${response.status}`)
    }

    return NextResponse.json({
      taskId: result.data.batch_id,
      mode: "batch",
      uploadUrl: result.data.file_urls[0],
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建 MinerU 任务失败" },
      { status: 500 },
    )
  }
}
