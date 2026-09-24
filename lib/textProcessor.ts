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

export function markSentencesInHtml(documentHtml: string, sentences: Sentence[]) {
  if (typeof document === "undefined" || !documentHtml || sentences.length === 0) return documentHtml

  const container = document.createElement("div")
  container.innerHTML = documentHtml
  const nodes: Node[] = []
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => node.textContent?.trim() && !node.parentElement?.closest("script,style")
      ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  })
  let node: Node | null
  while ((node = walker.nextNode())) nodes.push(node)

  const ranges = new Map<number, Array<{ start: number; end: number; sentence: number }>>()
  sentences.forEach((sentence, index) => sentence.ranges.forEach((range) => {
    const parts = ranges.get(range.nodeIndex) || []
    parts.push({ start: range.startOffset, end: range.endOffset, sentence: index })
    ranges.set(range.nodeIndex, parts)
  }))

  for (const [index, parts] of ranges) {
    const textNode = nodes[index]
    if (!textNode?.parentNode) continue
    const text = textNode.textContent || ""
    const fragment = document.createDocumentFragment()
    let position = 0
    for (const part of parts.sort((a, b) => a.start - b.start)) {
      if (part.start < position || part.end > text.length) continue
      if (part.start > position) fragment.append(document.createTextNode(text.slice(position, part.start)))
      const span = document.createElement("span")
      span.dataset.readerSentence = String(part.sentence)
      span.textContent = text.slice(part.start, part.end)
      fragment.append(span)
      position = part.end
    }
    if (position < text.length) fragment.append(document.createTextNode(text.slice(position)))
    textNode.parentNode.replaceChild(fragment, textNode)
  }
  return container.innerHTML
}
