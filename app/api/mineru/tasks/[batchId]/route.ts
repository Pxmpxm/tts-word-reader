import { NextResponse } from "next/server"
import { del } from "@vercel/blob"
import { getMinerUServerConfig, isVercelBlobUrl, VALID_MINERU_TASK_ID } from "@/lib/mineruServer"

export const maxDuration = 60

export async function GET(request: Request, context: { params: Promise<{ batchId: string }> }) {
  try {
    const { batchId } = await context.params
    if (!VALID_MINERU_TASK_ID.test(batchId)) return NextResponse.json({ error: "任务 ID 无效" }, { status: 400 })
    const { token, base } = getMinerUServerConfig()
    const searchParams = new URL(request.url).searchParams
    const mode = searchParams.get("mode") === "single" ? "single" : "batch"
    const response = await fetch(mode === "single"
      ? `${base}/api/v4/extract/task/${batchId}`
      : `${base}/api/v4/extract-results/batch/${batchId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    const result = await response.json()
    const item = mode === "single" ? result.data : result.data?.extract_result?.[0]
    if (!response.ok || result.code !== 0) {
      throw new Error(result.msg || `MinerU 查询失败：${response.status}`)
    }
    if (!item) return NextResponse.json({ state: "waiting-file" })

    const sourceUrl = searchParams.get("sourceUrl")
    if (["done", "failed"].includes(item.state) && isVercelBlobUrl(sourceUrl)) {
      await del(sourceUrl).catch(() => undefined)
    }

    return NextResponse.json({
      state: item.state,
      error: item.err_msg || undefined,
      extractedPages: item.extract_progress?.extracted_pages,
      totalPages: item.extract_progress?.total_pages,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "查询 MinerU 任务失败" },
      { status: 500 },
    )
  }
}
