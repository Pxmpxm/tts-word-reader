import assert from "node:assert/strict"
import test from "node:test"
import { sentenceBoundaries, splitTextIntoTTSChunks } from "./segmentText.ts"

test("保留短句并按中英文句末切分", () => {
  const text = "你好。第一章\nVersion 1.2 is ready.继续。"
  assert.deepEqual(sentenceBoundaries(text).map(([start, end]) => text.slice(start, end).trim()), [
    "你好。",
    "第一章\nVersion 1.2 is ready.",
    "继续。",
  ])
})

test("长句分块不超过 TTS 限制且不丢正文", () => {
  const source = "这是一句很长的话，".repeat(25)
  const chunks = splitTextIntoTTSChunks(source)
  assert.ok(chunks.length > 1)
  assert.ok(chunks.every((chunk) => chunk.length <= 150))
  assert.equal(chunks.join(""), source)
})
