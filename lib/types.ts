// 定义句子类型，包含文本内容和在文档中的位置信息
export interface Sentence {
  text: string
  nodeIndex: number // 文本节点在文档中的索引
  startOffset: number // 句子在文本节点中的起始位置
  endOffset: number // 句子在文本节点中的结束位置
}

// 定义可用语音类型
export interface Voice {
  id: string
  name: string
}

// 定义TTS API响应类型
export interface TTSResponse {
  success: boolean
  data?: {
    audio: string
  }
  message?: string
} 