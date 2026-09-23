import assert from "node:assert/strict"
import test from "node:test"
import { sentenceBoundaries } from "./segmentText.ts"

test("保留短句并按中英文句末切分", () => {
  const text = "你好。第一章\nVersion 1.2 is ready.继续。"
  assert.deepEqual(sentenceBoundaries(text).map(([start, end]) => text.slice(start, end).trim()), [
    "你好。",
    "第一章\nVersion 1.2 is ready.",
    "继续。",
  ])
})
