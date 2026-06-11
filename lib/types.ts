// 定义文本节点中的位置，用于定位跨标签的句子范围
export interface TextNodePosition {
  nodeIndex: number
  offset: number
}

// 定义句子类型，包含文本内容和在文档中的范围信息
export interface Sentence {
  text: string
  start: TextNodePosition
  end: TextNodePosition
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
  timeoutMs?: number
}
