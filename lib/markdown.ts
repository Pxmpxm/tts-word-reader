const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;")

const stripInlineMarkdown = (value: string) => value
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
  .replace(/[*_~`]/g, "")

const decodePath = (path: string) => {
  try { return decodeURIComponent(path) } catch { return path }
}

export function markdownToHtml(markdown: string, assetUrls: Map<string, string> = new Map()) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n")
  const html: string[] = []
  let inCode = false
  let list: "ul" | "ol" | null = null

  const closeList = () => {
    if (list) html.push(`</${list}>`)
    list = null
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line.startsWith("```")) {
      closeList()
      html.push(inCode ? "</code></pre>" : "<pre><code>")
      inCode = !inCode
      continue
    }
    if (inCode) {
      html.push(`${escapeHtml(rawLine)}\n`)
      continue
    }
    if (!line) {
      closeList()
      continue
    }

    // MinerU 会在 Markdown 中直接输出 HTML 表格，最终仍由 DOMPurify 统一清理。
    if (/^<\/?(?:table|thead|tbody|tfoot|tr|th|td)(?:\s|>)/i.test(line)) {
      closeList()
      html.push(line)
      continue
    }

    const image = line.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)$/)
    if (image) {
      closeList()
      const source = assetUrls.get(image[2]) || assetUrls.get(decodePath(image[2]))
      if (source) html.push(`<figure><img src="${escapeHtml(source)}" alt="${escapeHtml(image[1])}" /></figure>`)
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      closeList()
      const level = heading[1].length
      html.push(`<h${level}>${escapeHtml(stripInlineMarkdown(heading[2]))}</h${level}>`)
      continue
    }

    const unordered = line.match(/^[-*+]\s+(.+)$/)
    const ordered = line.match(/^\d+[.)]\s+(.+)$/)
    if (unordered || ordered) {
      const nextList = unordered ? "ul" : "ol"
      if (list !== nextList) {
        closeList()
        list = nextList
        html.push(`<${list}>`)
      }
      html.push(`<li>${escapeHtml(stripInlineMarkdown((unordered || ordered)![1]))}</li>`)
      continue
    }

    closeList()
    const text = line.replace(/^>\s?/, "")
    html.push(`<p>${escapeHtml(stripInlineMarkdown(text))}</p>`)
  }

  closeList()
  if (inCode) html.push("</code></pre>")
  return html.join("")
}

export function getMarkdownImagePaths(markdown: string) {
  return [...markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)]
    .map((match) => match[1])
}
