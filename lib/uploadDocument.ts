import { browserDb } from "./supabase/client"

export async function uploadDocument(file: File, path: string, onProgress?: (message: string) => void) {
  const db = browserDb()
  if (file.size <= 6 * 1024 * 1024) {
    const { error } = await db.storage.from("documents").upload(path, file, {
      contentType: file.type || "application/octet-stream", upsert: true,
    })
    if (error) throw error
    return
  }
  const { data: { session } } = await db.auth.getSession()
  if (!session) throw new Error("登录状态已过期")
  const { Upload } = await import("tus-js-client")
  const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0]
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`,
      headers: { authorization: `Bearer ${session.access_token}`, "x-upsert": "true" },
      metadata: {
        bucketName: "documents", objectName: path,
        contentType: file.type || "application/octet-stream", cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024,
      fingerprint: async (source) => `${path}:${source.name}:${source.size}:${source.lastModified}`,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      onProgress: (sent, total) => onProgress?.(`正在上传文件 ${Math.round(sent / total * 100)}%`),
      onError: reject,
      onSuccess: () => resolve(),
    })
    upload.findPreviousUploads().then((previous) => {
      if (previous.length) upload.resumeFromPreviousUpload(previous[0])
      upload.start()
    }).catch(reject)
  })
}
