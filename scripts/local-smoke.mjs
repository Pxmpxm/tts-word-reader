import assert from "node:assert/strict"
import { execFileSync, spawn } from "node:child_process"
import { createServer } from "node:http"
import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import JSZip from "jszip"

const status = JSON.parse(execFileSync("bunx", ["supabase", "status", "-o", "json"], { encoding: "utf8" }))
assert.equal(new URL(status.API_URL).hostname, "127.0.0.1", "This check only runs against local Supabase")

const email = `reader-smoke-${randomUUID()}@example.test`
const password = `local-${randomUUID()}`
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const user = createClient(status.API_URL, status.PUBLISHABLE_KEY)
const cookies = new Map()
const sessionClient = createServerClient(status.API_URL, status.PUBLISHABLE_KEY, {
  cookies: {
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)),
  },
})
const fakeAudio = Buffer.from([0xff, 0xfb, 0x90, 0x64, 0x00])
const resultZip = new JSZip()
resultZip.file("result/full.md", "# 扫描文档\n\n![示意图](images/fig.png)\n\n这里是解析正文。")
resultZip.file("result/content_list.json", JSON.stringify([{ type: "text", text: "这里是解析正文。" }]))
resultZip.file("result/images/fig.png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZYAAAAASUVORK5CYII=", "base64"))
const zipBytes = await resultZip.generateAsync({ type: "nodebuffer" })
const wordZip = new JSZip()
wordZip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
wordZip.file("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
wordZip.file("word/document.xml", '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>你好Word。</w:t></w:r></w:p></w:body></w:document>')
const wordBytes = await wordZip.generateAsync({ type: "nodebuffer" })
let ttsCalls = 0
const upstream = createServer((request, response) => {
  if (request.url === "/speech") {
    ttsCalls += 1
    response.writeHead(200, { "Content-Type": "audio/mpeg" })
    response.end(fakeAudio)
  } else if (request.url === "/api/v4/extract-results/batch/smoke-batch") {
    response.writeHead(200, { "Content-Type": "application/json" })
    response.end(JSON.stringify({ code: 0, data: { extract_result: [{ state: "done",
      full_zip_url: `http://127.0.0.1:${upstream.address().port}/result.zip` }] } }))
  } else if (request.url === "/result.zip") {
    response.writeHead(200, { "Content-Type": "application/zip" })
    response.end(zipBytes)
  } else {
    response.writeHead(404)
    response.end()
  }
})
await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve))
const upstreamPort = upstream.address().port
const appPort = 31407
const app = spawn("./node_modules/.bin/next", ["dev", "-p", String(appPort)], {
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: status.SECRET_KEY,
    OWNER_EMAIL: email,
    CRON_SECRET: "local-smoke-cron-secret",
    TTS_API_ENDPOINT: `http://127.0.0.1:${upstreamPort}/speech`,
    MINERU_API_BASE: `http://127.0.0.1:${upstreamPort}`,
    MINERU_API_TOKEN: "local-smoke-token",
  },
  stdio: "ignore",
})

let createdUser
let otherUser
let sourcePath
const base = `http://127.0.0.1:${appPort}`
const cookieHeader = () => [...cookies].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ")
const api = (path, options = {}) => fetch(`${base}${path}`, {
  ...options, headers: { cookie: cookieHeader(), ...(options.headers || {}) },
})

try {
  let ready = false
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (app.exitCode !== null) throw new Error("Next.js exited before becoming ready")
    try {
      const response = await fetch(`${base}/api/cron/heartbeat/4`)
      if (response.status === 404) { ready = true; break }
    } catch { /* startup */ }
    await delay(1000)
  }
  assert.ok(ready, "Next.js did not start")

  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error || !created.data.user) throw created.error || new Error("Could not create local user")
  createdUser = created.data.user
  const login = await sessionClient.auth.signInWithPassword({ email, password })
  if (login.error) throw login.error
  const userLogin = await user.auth.signInWithPassword({ email, password })
  if (userLogin.error) throw userLogin.error
  const otherEmail = `reader-other-${randomUUID()}@example.test`
  const otherCreated = await admin.auth.admin.createUser({ email: otherEmail, password, email_confirm: true })
  if (otherCreated.error || !otherCreated.data.user) throw otherCreated.error || new Error("Could not create second local user")
  otherUser = otherCreated.data.user
  const other = createClient(status.API_URL, status.PUBLISHABLE_KEY)
  const otherLogin = await other.auth.signInWithPassword({ email: otherEmail, password })
  if (otherLogin.error) throw otherLogin.error

  const file = new Blob(["你好世界。再次测试。"], { type: "text/plain" })
  const createResponse = await api("/api/documents", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "smoke.txt", size: file.size }),
  })
  if (!createResponse.ok) throw new Error(`Create document: ${await createResponse.text()}`)
  const document = await createResponse.json()
  sourcePath = document.sourcePath

  const uploaded = await user.storage.from("documents").upload(sourcePath, file, { contentType: "text/plain" })
  if (uploaded.error) throw uploaded.error
  const processed = await api(`/api/documents/${document.id}/process`, { method: "POST" })
  assert.equal(processed.status, 200, await processed.text())
  const { data: saved, error: savedError } = await user.from("documents")
    .select("status,html,markdown").eq("id", document.id).single()
  if (savedError) throw savedError
  assert.equal(saved.status, "ready")
  assert.match(saved.html, /你好世界。/)
  const { data: hidden } = await other.from("documents").select("id").eq("id", document.id)
  assert.equal(hidden?.length, 0, "other accounts must not see the owner's document")
  const forbiddenUpload = await other.storage.from("documents").upload(`${createdUser.id}/${document.id}/extra.txt`, file)
  assert.ok(forbiddenUpload.error, "other accounts must not upload under the owner's path")
  const { error: progressError } = await user.from("documents").update({ reading_index: 1 }).eq("id", document.id)
  if (progressError) throw progressError
  const { data: position } = await user.from("documents").select("reading_index").eq("id", document.id).single()
  assert.equal(position.reading_index, 1)

  const speech = JSON.stringify({ documentId: document.id, input: "你好世界。", voice: "zh-CN-XiaoxiaoNeural", style: "general" })
  for (let index = 0; index < 2; index += 1) {
    const response = await api("/api/tts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: speech,
    })
    assert.equal(response.status, 200, await response.text())
  }
  assert.equal(ttsCalls, 1, "second request should reuse the cloud audio cache")
  const { data: audioRows } = await user.from("audio_cache").select("cache_key").eq("document_id", document.id)
  assert.equal(audioRows?.length, 1)
  const clearAudio = await api("/api/audio-cache", {
    method: "DELETE", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId: document.id }),
  })
  assert.equal(clearAudio.status, 200, await clearAudio.text())
  const { data: clearedAudio } = await user.from("audio_cache").select("cache_key").eq("document_id", document.id)
  assert.equal(clearedAudio?.length, 0)

  const word = new Blob([wordBytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
  const wordResponse = await api("/api/documents", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "sample.docx", size: word.size }) })
  if (!wordResponse.ok) throw new Error(`Create DOCX: ${await wordResponse.text()}`)
  const wordDocument = await wordResponse.json()
  const wordUpload = await user.storage.from("documents").upload(wordDocument.sourcePath, word)
  if (wordUpload.error) throw wordUpload.error
  const wordProcessed = await api(`/api/documents/${wordDocument.id}/process`, { method: "POST" })
  assert.equal(wordProcessed.status, 200, await wordProcessed.text())
  const { data: savedWord, error: wordError } = await user.from("documents")
    .select("status,html").eq("id", wordDocument.id).single()
  if (wordError) throw wordError
  assert.equal(savedWord.status, "ready")
  assert.match(savedWord.html, /你好Word。/)

  const pdf = new Blob(["%PDF-"], { type: "application/pdf" })
  const pdfResponse = await api("/api/documents", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "scan.pdf", size: pdf.size }) })
  if (!pdfResponse.ok) throw new Error(`Create PDF: ${await pdfResponse.text()}`)
  const parsedPdf = await pdfResponse.json()
  const pdfUpload = await user.storage.from("documents").upload(parsedPdf.sourcePath, pdf)
  if (pdfUpload.error) throw pdfUpload.error
  const { error: jobError } = await admin.from("parse_jobs").insert({
    document_id: parsedPdf.id, user_id: createdUser.id, mineru_id: "smoke-batch",
    callback_token: "a".repeat(48), state: "processing",
  })
  if (jobError) throw jobError
  const { error: stateError } = await admin.from("documents").update({ status: "processing" }).eq("id", parsedPdf.id)
  if (stateError) throw stateError
  const refreshed = await api(`/api/documents/${parsedPdf.id}/refresh`, { method: "POST" })
  assert.equal(refreshed.status, 200, await refreshed.text())
  const { data: parsed, error: parsedError } = await user.from("documents")
    .select("status,markdown,mineru_json").eq("id", parsedPdf.id).single()
  if (parsedError) throw parsedError
  assert.equal(parsed.status, "ready")
  assert.match(parsed.markdown, /这里是解析正文/)
  assert.equal(parsed.mineru_json["result/content_list.json"][0].text, "这里是解析正文。")
  const { data: assets, error: assetsError } = await user.from("document_assets")
    .select("path,storage_path").eq("document_id", parsedPdf.id)
  if (assetsError) throw assetsError
  assert.equal(assets.length, 2, "image and original ZIP should be stored")
  const image = assets.find((asset) => asset.path.endsWith("fig.png"))
  const { data: signed, error: signedError } = await user.storage.from("documents")
    .createSignedUrl(image.storage_path, 60)
  if (signedError) throw signedError
  assert.ok(signed?.signedUrl)
  const callbackDenied = await fetch(`${base}/api/mineru/callback/${parsedPdf.id}?token=wrong`, { method: "POST" })
  assert.equal(callbackDenied.status, 401)

  const heartbeat = await api("/api/cron/heartbeat/1", {
    headers: { Authorization: "Bearer local-smoke-cron-secret" },
  })
  assert.equal(heartbeat.status, 200, await heartbeat.text())
  const unauthorizedHeartbeat = await api("/api/cron/heartbeat/1")
  assert.equal(unauthorizedHeartbeat.status, 401)
  const { data: ping } = await admin.from("heartbeats").select("pinged_at").eq("id", 1).single()
  assert.ok(ping?.pinged_at)

  const deleted = await api(`/api/documents/${document.id}`, { method: "DELETE" })
  assert.equal(deleted.status, 200, await deleted.text())
  const deletedPdf = await api(`/api/documents/${parsedPdf.id}`, { method: "DELETE" })
  assert.equal(deletedPdf.status, 200, await deletedPdf.text())
  const deletedWord = await api(`/api/documents/${wordDocument.id}`, { method: "DELETE" })
  assert.equal(deletedWord.status, 200, await deletedWord.text())
  const { data: remaining } = await user.from("documents").select("id").eq("id", document.id)
  assert.equal(remaining?.length, 0)
  console.log("Local Auth → upload → TXT/DOCX/MinerU persistence → TTS cache → heartbeat → delete: passed")
} finally {
  app.kill("SIGTERM")
  await new Promise((resolve) => upstream.close(resolve))
  if (sourcePath) await admin.storage.from("documents").remove([sourcePath])
  if (createdUser) await admin.auth.admin.deleteUser(createdUser.id)
  if (otherUser) await admin.auth.admin.deleteUser(otherUser.id)
}
