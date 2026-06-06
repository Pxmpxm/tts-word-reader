import type { TTSStyleOption, Voice } from "./types"

export const DEFAULT_TTS_API_ENDPOINT = "https://tts-voice-magic.pxmxmp1224.workers.dev/v1/audio/speech"
export const DEFAULT_TTS_STYLE = "general"

export const AVAILABLE_TTS_VOICES: Voice[] = [
  { id: "zh-CN-XiaoxiaoNeural", name: "晓晓 (女声·温柔)", group: "female" },
  { id: "zh-CN-XiaoyiNeural", name: "晓伊 (女声·甜美)", group: "female" },
  { id: "zh-CN-XiaochenNeural", name: "晓辰 (女声·知性)", group: "female" },
  { id: "zh-CN-XiaohanNeural", name: "晓涵 (女声·优雅)", group: "female" },
  { id: "zh-CN-XiaomengNeural", name: "晓梦 (女声·梦幻)", group: "female" },
  { id: "zh-CN-XiaomoNeural", name: "晓墨 (女声·文艺)", group: "female" },
  { id: "zh-CN-XiaoqiuNeural", name: "晓秋 (女声·成熟)", group: "female" },
  { id: "zh-CN-XiaoruiNeural", name: "晓睿 (女声·智慧)", group: "female" },
  { id: "zh-CN-XiaoshuangNeural", name: "晓双 (女声·活泼)", group: "female" },
  { id: "zh-CN-XiaoxuanNeural", name: "晓萱 (女声·清新)", group: "female" },
  { id: "zh-CN-XiaoyanNeural", name: "晓颜 (女声·柔美)", group: "female" },
  { id: "zh-CN-XiaoyouNeural", name: "晓悠 (女声·悠扬)", group: "female" },
  { id: "zh-CN-XiaozhenNeural", name: "晓甄 (女声·端庄)", group: "female" },
  { id: "zh-CN-YunxiNeural", name: "云希 (男声·清朗)", group: "male" },
  { id: "zh-CN-YunyangNeural", name: "云扬 (男声·阳光)", group: "male" },
  { id: "zh-CN-YunjianNeural", name: "云健 (男声·稳重)", group: "male" },
  { id: "zh-CN-YunfengNeural", name: "云枫 (男声·磁性)", group: "male" },
  { id: "zh-CN-YunhaoNeural", name: "云皓 (男声·豪迈)", group: "male" },
  { id: "zh-CN-YunxiaNeural", name: "云夏 (男声·热情)", group: "male" },
  { id: "zh-CN-YunyeNeural", name: "云野 (男声·野性)", group: "male" },
  { id: "zh-CN-YunzeNeural", name: "云泽 (男声·深沉)", group: "male" },
]

export const AVAILABLE_TTS_STYLES: TTSStyleOption[] = [
  { id: "general", name: "通用风格" },
  { id: "assistant", name: "智能助手" },
  { id: "chat", name: "聊天对话" },
  { id: "customerservice", name: "客服专业" },
  { id: "newscast", name: "新闻播报" },
  { id: "affectionate", name: "亲切温暖" },
  { id: "calm", name: "平静舒缓" },
  { id: "cheerful", name: "愉快欢乐" },
  { id: "gentle", name: "温和柔美" },
  { id: "lyrical", name: "抒情诗意" },
  { id: "serious", name: "严肃正式" },
]
