export function getMinerUServerConfig() {
  const token = process.env.MINERU_API_TOKEN
  if (!token) throw new Error("服务器未配置 MINERU_API_TOKEN")
  return {
    token,
    base: (process.env.MINERU_API_BASE || "https://mineru.net").replace(/\/$/, ""),
    modelVersion: process.env.MINERU_MODEL_VERSION === "pipeline" ? "pipeline" : "vlm",
  }
}
