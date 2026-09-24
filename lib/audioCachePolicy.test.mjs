import assert from "node:assert/strict"
import test from "node:test"
import { oldestAudioToRemove } from "./audioCachePolicy.ts"

test("按最早使用顺序清理云端音频，满足数量和容量上限", () => {
  const rows = [{ byte_size: 6 }, { byte_size: 6 }, { byte_size: 2 }]
  assert.deepEqual(oldestAudioToRemove(rows, 2, 8), [rows[0]])
  assert.deepEqual(oldestAudioToRemove(rows, 3, 10), [rows[0]])
})
