import type { TTSRequestOptions } from "./types"

export async function generateSpeechBlob(
  text: string,
  voice: string,
  options: TTSRequestOptions = {},
): Promise<Blob> {
  const response = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId: options.documentId, input: text, voice, style: options.style || "general" }),
    signal: options.signal,
  })
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    throw new Error(result.error || `TTS 服务返回 ${response.status}`)
  }
  return response.blob()
}
