import { NextResponse } from "next/server"
import { getMinerUServerConfig, VALID_MINERU_TASK_ID } from "@/lib/mineruServer"

export const maxDuration = 60

export async function GET(request: Request, context: { params: Promise<{ batchId: string }> }) {
  try {
    const { batchId } = await context.params
    if (!VALID_MINERU_TASK_ID.test(batchId)) return NextResponse.json({ error: "任务 ID 无效" }, { status: 400 })
    const { token, base } = getMinerUServerConfig()
    const mode = new URL(request.url).searchParams.get("mode") === "single" ? "single" : "batch"
    const statusResponse = await fetch(mode === "single"
      ? `${base}/api/v4/extract/task/${batchId}`
      : `${base}/api/v4/extract-results/batch/${batchId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    const status = await statusResponse.json()
    const item = mode === "single" ? status.data : status.data?.extract_result?.[0]
    if (!statusResponse.ok || status.code !== 0 || item?.state !== "done" || !item.full_zip_url) {
      return NextResponse.json({ error: item?.err_msg || "MinerU 结果尚未就绪" }, { status: 409 })
    }

    const zipResponse = await fetch(item.full_zip_url, { cache: "no-store" })
    if (!zipResponse.ok || !zipResponse.body) throw new Error("下载 MinerU 结果失败")
    return new Response(zipResponse.body, {
      headers: {
        "Content-Type": "application/zip",
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "下载 MinerU 结果失败" },
      { status: 500 },
    )
  }
}
