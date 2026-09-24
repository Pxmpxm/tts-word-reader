import assert from "node:assert/strict"
import test from "node:test"
import { markdownToHtml } from "./markdown.ts"

test("保留 MinerU HTML 表格供 DOMPurify 清理和展示", () => {
  const table = "<table><tr><td>问题主题</td><td>页码</td></tr></table>"
  const html = markdownToHtml(table)
  assert.match(html, /<table>/)
  assert.match(html, /<td>问题主题<\/td>/)
  assert.equal(html.includes("&lt;table"), false)
})

test("MinerU 图片只使用已授权的资产地址", () => {
  const html = markdownToHtml("![示例](images/a.png) ![未知](missing.png)",
    new Map([["images/a.png", "https://example.com/signed.png"]]))
  assert.match(html, /src="https:\/\/example.com\/signed.png"/)
  assert.equal(html.includes("src=\"missing.png\""), false)
})
