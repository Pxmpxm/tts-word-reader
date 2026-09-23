import assert from "node:assert/strict"
import test from "node:test"
import { markdownToHtml } from "./markdown.ts"

test("保留 MinerU HTML 表格供 DOMPurify 清理和展示", () => {
  const table = "<table><tr><td>问题主题</td><td>页码</td></tr></table>"
  const html = markdownToHtml(table)
  assert.equal(html, table)
  assert.equal(html.includes("&lt;table"), false)
})
