import { Sentence } from './types';

/**
 * 从HTML中提取句子，保留原始HTML结构和位置信息
 * @param html HTML文本
 * @returns 提取的句子数组
 */
export function extractSentencesFromHtml(html: string): Sentence[] {
  // 直接进行客户端检查，如果不在客户端则返回空数组
  if (typeof window === 'undefined') return [];

  // 创建一个临时的DOM元素来解析HTML
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;

  // 获取所有文本节点
  const textNodes: Node[] = [];
  const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      // 过滤掉空白文本节点
      if (node.textContent && node.textContent.trim().length > 0) {
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_REJECT;
    },
  });

  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  // 从文本节点中提取句子，并记录位置信息
  const sentences: Sentence[] = [];
  const cjkSentenceEndRegex = /[。！？；]/;
  const latinSentenceEndRegex = /[.!?;]/;

  for (let nodeIndex = 0; nodeIndex < textNodes.length; nodeIndex++) {
    const textNode = textNodes[nodeIndex];
    const text = textNode.textContent || "";
    let startOffset = 0;

    // 查找句子结束标记
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      const isCjkSentenceEnd = cjkSentenceEndRegex.test(char);
      const isLatinSentenceEnd =
        latinSentenceEndRegex.test(char) &&
        (i === text.length - 1 || /\s/.test(nextChar) || i + 1 === text.length);

      if (
        isCjkSentenceEnd ||
        isLatinSentenceEnd
      ) {
        // 找到一个句子结束标记
        const sentenceText = text.substring(startOffset, i + 1).trim();
        if (sentenceText.length > 0) {
          sentences.push({
            text: sentenceText,
            nodeIndex,
            startOffset,
            endOffset: i + 1,
          });
        }
        startOffset = i + 1;
      }
    }

    // 处理剩余的文本（如果没有以句子结束标记结尾）
    const remainingText = text.substring(startOffset).trim();
    if (remainingText.length > 0) {
      sentences.push({
        text: remainingText,
        nodeIndex,
        startOffset,
        endOffset: text.length,
      });
    }
  }

  // 过滤掉空句子并返回
  return sentences.filter((sentence) => sentence.text.trim().length > 0);
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
  // 直接进行客户端检查
  if (typeof window === 'undefined' || !documentHtml || !sentence) {
    return documentHtml;
  }

  try {
    // 创建一个临时的DOM元素来处理HTML
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = documentHtml;

    // 获取所有文本节点
    const newTextNodes: Node[] = [];
    const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (node.textContent && node.textContent.trim().length > 0) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_REJECT;
      },
    });

    let node;
    while ((node = walker.nextNode())) {
      newTextNodes.push(node);
    }

    // 使用存储的位置信息找到正确的文本节点和位置
    if (newTextNodes.length > sentence.nodeIndex) {
      const textNode = newTextNodes[sentence.nodeIndex];
      const text = textNode.textContent || "";

      // 确保位置信息在有效范围内
      const startOffset = Math.min(sentence.startOffset, text.length);
      const endOffset = Math.min(sentence.endOffset, text.length);

      if (startOffset < endOffset) {
        // 分割文本节点
        const before = text.substring(0, startOffset);
        const middle = text.substring(startOffset, endOffset);
        const after = text.substring(endOffset);

        // 创建高亮元素
        const span = document.createElement("span");
        span.className = "current-reading";
        span.textContent = middle;

        // 替换原始文本节点
        const fragment = document.createDocumentFragment();
        if (before) {
          fragment.appendChild(document.createTextNode(before));
        }
        fragment.appendChild(span);
        if (after) {
          fragment.appendChild(document.createTextNode(after));
        }

        textNode.parentNode?.replaceChild(fragment, textNode);
      }
    }

    return tempDiv.innerHTML;
  } catch (error) {
    console.error("高亮句子时出错:", error);
    return documentHtml;
  }
} 
