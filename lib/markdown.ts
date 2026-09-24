import { Marked } from "marked"

const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;")

export function markdownToHtml(markdown: string, assetUrls: Map<string, string> = new Map()) {
  const parser = new Marked({
    async: false,
    gfm: true,
    renderer: {
      image({ href, text }) {
        let decoded = href
        try { decoded = decodeURIComponent(href) } catch { /* malformed URL */ }
        const source = assetUrls.get(href) || assetUrls.get(decoded)
        return source
          ? `<img src="${escapeHtml(source)}" alt="${escapeHtml(text)}" />`
          : escapeHtml(text)
      },
    },
  })
  return parser.parse(markdown.replace(/^[\u200B-\u200F\uFEFF]/, "")) as string
}
