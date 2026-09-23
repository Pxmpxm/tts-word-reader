export const VALID_MINERU_TASK_ID = /^[a-zA-Z0-9-]{1,128}$/

export function isVercelBlobUrl(value: unknown): value is string {
  if (typeof value !== "string") return false
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com")
  } catch {
    return false
  }
}

export function getMinerUServerConfig() {
  const token = process.env.MINERU_API_TOKEN
  if (!token) throw new Error("服务器未配置 MINERU_API_TOKEN")
  return {
    token,
    base: (process.env.MINERU_API_BASE || "https://mineru.net").replace(/\/$/, ""),
    modelVersion: process.env.MINERU_MODEL_VERSION === "pipeline" ? "pipeline" : "vlm",
  }
}
