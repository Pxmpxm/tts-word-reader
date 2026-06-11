import type { Sentence, TextNodePosition } from "./types";

interface TextNodeRange {
  node: Text;
  nodeIndex: number;
  start: number;
  end: number;
}

const CJK_SENTENCE_ENDINGS = new Set(["。", "！", "？", "；"]);
const LATIN_SENTENCE_ENDINGS = new Set([".", "!", "?", ";"]);
const CLOSING_PUNCTUATION = new Set([
  "\"",
  "'",
  ")",
  "]",
  "}",
  "”",
  "’",
  "」",
  "』",
  "）",
  "】",
  "》",
  "〉",
]);

const COMMON_ABBREVIATIONS = new Set([
  "dr",
  "mr",
  "mrs",
  "ms",
  "prof",
  "sr",
  "jr",
  "st",
  "vs",
  "etc",
  "e.g",
  "i.e",
  "no",
]);

function collectTextNodes(root: HTMLElement) {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      return node.textContent && node.textContent.length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  let currentNode = walker.nextNode();
  while (currentNode) {
    textNodes.push(currentNode as Text);
    currentNode = walker.nextNode();
  }

  let fullText = "";
  const ranges = textNodes.map((node, nodeIndex) => {
    const start = fullText.length;
    fullText += node.textContent || "";
    return {
      node,
      nodeIndex,
      start,
      end: fullText.length,
    };
  });

  return { fullText, ranges };
}

function mapGlobalOffsetToPosition(
  ranges: TextNodeRange[],
  globalOffset: number,
  bias: "start" | "end"
): TextNodePosition | null {
  if (ranges.length === 0) return null;

  if (bias === "start") {
    for (const range of ranges) {
      if (globalOffset >= range.start && globalOffset < range.end) {
        return {
          nodeIndex: range.nodeIndex,
          offset: globalOffset - range.start,
        };
      }
    }
  } else {
    for (let i = ranges.length - 1; i >= 0; i -= 1) {
      const range = ranges[i];
      if (globalOffset > range.start && globalOffset <= range.end) {
        return {
          nodeIndex: range.nodeIndex,
          offset: globalOffset - range.start,
        };
      }
    }
  }

  const fallbackRange = bias === "start" ? ranges[0] : ranges[ranges.length - 1];
  return {
    nodeIndex: fallbackRange.nodeIndex,
    offset: bias === "start" ? 0 : (fallbackRange.node.textContent || "").length,
  };
}

function isDecimalPoint(text: string, index: number) {
  return /\d/.test(text[index - 1] || "") && /\d/.test(text[index + 1] || "");
}

function isAbbreviationPeriod(text: string, index: number) {
  const left = text.slice(Math.max(0, index - 12), index + 1).trim();
  const tokenMatch = left.match(/([A-Za-z](?:\.[A-Za-z])+\.|[A-Za-z]+)\.$/);
  const token = tokenMatch?.[1]?.toLowerCase();
  if (!token) return false;

  return COMMON_ABBREVIATIONS.has(token) || /^(?:[a-z]\.){2,}$/.test(`${token}.`);
}

function canEndLatinSentence(text: string, index: number) {
  const char = text[index];
  const nextChar = text[index + 1] || "";

  if (char === "." && (isDecimalPoint(text, index) || isAbbreviationPeriod(text, index))) {
    return false;
  }

  return index === text.length - 1 || /\s/.test(nextChar) || CLOSING_PUNCTUATION.has(nextChar);
}

function isSentenceEnding(text: string, index: number) {
  const char = text[index];
  if (CJK_SENTENCE_ENDINGS.has(char)) return true;
  if (!LATIN_SENTENCE_ENDINGS.has(char)) return false;
  return canEndLatinSentence(text, index);
}

function consumeClosingPunctuation(text: string, endOffset: number) {
  let offset = endOffset;
  while (offset < text.length && CLOSING_PUNCTUATION.has(text[offset])) {
    offset += 1;
  }
  return offset;
}

function pushSentence(
  sentences: Sentence[],
  text: string,
  ranges: TextNodeRange[],
  rawStart: number,
  rawEnd: number
) {
  let start = rawStart;
  let end = rawEnd;

  while (start < end && /\s/.test(text[start])) start += 1;
  while (end > start && /\s/.test(text[end - 1])) end -= 1;

  if (start >= end) return;

  const mappedStart = mapGlobalOffsetToPosition(ranges, start, "start");
  const mappedEnd = mapGlobalOffsetToPosition(ranges, end, "end");
  if (!mappedStart || !mappedEnd) return;

  sentences.push({
    text: text.slice(start, end),
    start: mappedStart,
    end: mappedEnd,
  });
}

/**
 * 从HTML中提取句子，保留原始HTML结构和跨标签范围信息
 * @param html HTML文本
 * @returns 提取的句子数组
 */
export function extractSentencesFromHtml(html: string): Sentence[] {
  if (typeof window === "undefined") return [];

  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;

  const { fullText, ranges } = collectTextNodes(tempDiv);
  if (!fullText.trim()) return [];

  const sentences: Sentence[] = [];
  let sentenceStart = 0;

  for (let i = 0; i < fullText.length; i += 1) {
    if (!isSentenceEnding(fullText, i)) continue;

    const sentenceEnd = consumeClosingPunctuation(fullText, i + 1);
    pushSentence(sentences, fullText, ranges, sentenceStart, sentenceEnd);
    sentenceStart = sentenceEnd;
    i = sentenceEnd - 1;
  }

  pushSentence(sentences, fullText, ranges, sentenceStart, fullText.length);
  return sentences;
}

function replaceTextRangeWithHighlight(textNode: Text, startOffset: number, endOffset: number) {
  const text = textNode.textContent || "";
  const start = Math.max(0, Math.min(startOffset, text.length));
  const end = Math.max(start, Math.min(endOffset, text.length));
  if (start >= end || !textNode.parentNode) return;

  const fragment = document.createDocumentFragment();
  const before = text.slice(0, start);
  const middle = text.slice(start, end);
  const after = text.slice(end);

  if (before) fragment.appendChild(document.createTextNode(before));

  const span = document.createElement("span");
  span.className = "current-reading";
  span.textContent = middle;
  fragment.appendChild(span);

  if (after) fragment.appendChild(document.createTextNode(after));

  textNode.parentNode.replaceChild(fragment, textNode);
}

/**
 * 高亮当前句子在HTML中的位置
 * @param documentHtml 原始HTML
 * @param sentence 当前句子
 * @returns 高亮后的HTML
 */
export function highlightSentenceInHtml(
  documentHtml: string,
  sentence: Sentence | null
): string {
  if (typeof window === "undefined" || !documentHtml || !sentence) {
    return documentHtml;
  }

  try {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = documentHtml;

    const { ranges } = collectTextNodes(tempDiv);
    if (
      sentence.start.nodeIndex < 0 ||
      sentence.end.nodeIndex < sentence.start.nodeIndex ||
      sentence.end.nodeIndex >= ranges.length
    ) {
      return documentHtml;
    }

    for (let nodeIndex = sentence.end.nodeIndex; nodeIndex >= sentence.start.nodeIndex; nodeIndex -= 1) {
      const range = ranges[nodeIndex];
      if (!range) continue;

      const startOffset = nodeIndex === sentence.start.nodeIndex ? sentence.start.offset : 0;
      const endOffset =
        nodeIndex === sentence.end.nodeIndex
          ? sentence.end.offset
          : range.node.textContent?.length || 0;

      replaceTextRangeWithHighlight(range.node, startOffset, endOffset);
    }

    return tempDiv.innerHTML;
  } catch (error) {
    console.error("高亮句子时出错:", error);
    return documentHtml;
  }
}
