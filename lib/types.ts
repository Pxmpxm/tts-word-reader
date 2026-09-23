// 定义句子类型，包含文本内容和在文档中的位置信息
export interface Sentence {
  text: string
  ranges: Array<{
    nodeIndex: number
    startOffset: number
    endOffset: number
  }>
}

// 定义可用语音类型
export interface Voice {
  id: string
  name: string
  group?: "female" | "male"
}

// 定义可用语音风格类型
export interface TTSStyleOption {
  id: string
  name: string
}

export interface TTSRequestOptions {
  speed?: number
  pitch?: string
  volume?: string
  style?: string
  signal?: AbortSignal
}
