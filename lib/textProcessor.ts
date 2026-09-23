import { sentenceBoundaries } from "./segmentText"
import type { Sentence } from "./types"

const BLOCK_SELECTOR = "p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,pre,div"

interface TextPart {
  nodeIndex: number
  text: string
  start: number
  end: number
}

export function extractSentencesFromHtml(html: string): Sentence[] {
  if (typeof window === "undefined") return []

  const container = document.createElement("div")
  container.innerHTML = html
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement
      if (!node.textContent?.trim() || parent?.closest("script,style")) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const groups = new Map<Element, Array<{ nodeIndex: number; text: string }>>()
  let node: Node | null
  let nodeIndex = 0
  while ((node = walker.nextNode())) {
    const element = node.parentElement
    if (!element) continue
    const block = element.closest(BLOCK_SELECTOR) || element
    const parts = groups.get(block) || []
    parts.push({ nodeIndex, text: node.textContent || "" })
    groups.set(block, parts)
    nodeIndex += 1
  }

  const sentences: Sentence[] = []
  for (const nodes of groups.values()) {
    let position = 0
    const parts: TextPart[] = nodes.map((part) => {
      const mapped = { ...part, start: position, end: position + part.text.length }
      position = mapped.end
      return mapped
    })
    const text = parts.map((part) => part.text).join("")

    for (const [rawStart, rawEnd] of sentenceBoundaries(text)) {
      let start = rawStart
      let end = rawEnd
      while (start < end && /\s/.test(text[start])) start += 1
      while (end > start && /\s/.test(text[end - 1])) end -= 1
      if (start >= end) continue

      const ranges = parts.flatMap((part) => {
        const rangeStart = Math.max(start, part.start)
        const rangeEnd = Math.min(end, part.end)
        return rangeStart < rangeEnd
          ? [{
              nodeIndex: part.nodeIndex,
              startOffset: rangeStart - part.start,
              endOffset: rangeEnd - part.start,
            }]
          : []
      })
      sentences.push({ text: text.slice(start, end), ranges })
    }
  }

  return sentences
}

export function highlightSentenceInHtml(documentHtml: string, sentence: Sentence | null) {
  if (typeof window === "undefined" || !documentHtml || !sentence) return documentHtml

  try {
    const container = document.createElement("div")
    container.innerHTML = documentHtml
    const textNodes: Node[] = []
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.textContent?.trim()
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
    })
    let node: Node | null
    while ((node = walker.nextNode())) textNodes.push(node)

    for (const range of [...sentence.ranges].sort((a, b) => b.nodeIndex - a.nodeIndex)) {
      const textNode = textNodes[range.nodeIndex]
      const text = textNode?.textContent || ""
      const start = Math.min(range.startOffset, text.length)
      const end = Math.min(range.endOffset, text.length)
      if (!textNode || start >= end) continue

      const fragment = document.createDocumentFragment()
      if (start > 0) fragment.append(document.createTextNode(text.slice(0, start)))
      const highlight = document.createElement("span")
      highlight.className = "current-reading"
      highlight.textContent = text.slice(start, end)
      fragment.append(highlight)
      if (end < text.length) fragment.append(document.createTextNode(text.slice(end)))
      textNode.parentNode?.replaceChild(fragment, textNode)
    }
    return container.innerHTML
  } catch (error) {
    console.error("高亮句子时出错:", error)
    return documentHtml
  }
}
