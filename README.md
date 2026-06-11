# 文档朗读系统 (TTS Word Reader)
## 📌 项目概述

文档朗读系统是一个基于 Web 的现代化应用程序，允许用户上传 Word 文档 (`.docx`) 并使用先进的文本转语音 (TTS) 技术流畅地朗读文档内容。系统提供了极致的阅读体验，支持格式化文档的实时预览、细粒度（句子级别）的朗读高亮跟踪、播放速率调整、精细的交互动画以及深浅色主题切换。

## ✨ 核心特性

- **Word 文档解析与预览**：基于 `mammoth.js` 纯客户端解析 Word 文档内容，完美保留原始段落和排版格式。
- **智能句子分割与长文本处理**：
  - 支持中英文句子拆分，并能处理跨粗体、斜体、链接等内联标签的句子高亮。
  - 对于超长句子（>150字符）支持智能按标点符号断句分块加载，并为 TTS 请求设置超时保护。
- **极致的视觉反馈与动画设计**：
  - **动态呼吸高亮**：正在朗读的句子不仅具有高亮底色，还搭配了柔和的呼吸（Pulse）动画以及强调下划线。
  - **自动视区居中**：随着朗读进行，阅读视角会平滑滚动，将当前句子自动保持在屏幕中央。
  - **交互式控制器**：播放按钮支持悬停光影、播放进度反馈以及平滑的缩放动画。
  - **平滑过渡**：文档加载和组件切换拥有淡入（Fade-in）、放大（Zoom-in）等丰富的进入动画。
- **高级 TTS 控制面板**：
  - 播放/暂停控制，上一句/下一句快捷跳转。
  - 实时调整播放速率 (0.5x - 2.0x)。
  - 进度条拖拽：快速定位并朗读指定句子。
  - 多样化语音设置：支持20余种中文男/女声（如：晓晓、云希等）及各种语态风格（通用、客服、新闻、聊天等）。
- **客户端性能优化**：
  - 音频预加载缓冲池（Preload Pool）：智能预先加载后续即将朗读的句子音频，做到无缝衔接。
  - 本机持久音频缓存：可将已生成音频保存到浏览器 IndexedDB，并支持在高级设置中关闭或清空。
  - 全客户端渲染 (CSR)：基于 Next.js 的 `dynamic` 方案，解决由浏览器特有 API 引起的水合（Hydration）问题。

## 🛠️ 技术栈

- **框架**：[Next.js 16](https://nextjs.org/) (App Router)
- **UI 组件库**：[shadcn/ui](https://ui.shadcn.com/) + Radix UI
- **样式与动画**：[Tailwind CSS](https://tailwindcss.com/) + Tailwindcss-animate
- **文档解析**：[mammoth.js](https://github.com/mwilliamson/mammoth.js) (将 .docx 转换为 HTML)
- **HTML 清理**：[DOMPurify](https://github.com/cure53/DOMPurify) (防止 XSS 攻击)
- **图标**：[Lucide React](https://lucide.dev/)
- **音频引擎**：Web Audio API (HTML5 Audio)
- **开发语言**：TypeScript

## 📂 项目结构

```text
tts-word-reader/
├── app/                      # Next.js 应用主目录
│   ├── globals.css           # 全局样式（包含高亮呼吸灯等自定义 CSS 动画）
│   ├── layout.tsx            # 根布局文件
│   └── page.tsx              # 应用主界面（集成所有组件的核心容器）
├── components/               # React 可复用组件
│   ├── DocumentViewer.tsx    # 文档预览区（负责 HTML 渲染及滚动居中追踪）
│   ├── FileUploader.tsx      # 文件上传与解析组件
│   ├── PlaybackControls.tsx  # 播放控制器（播放/暂停、进度条、速率调整）
│   ├── SettingsPanel.tsx     # 语音与高级配置面板
│   └── ui/                   # 基于 shadcn/ui 的基础 UI 组件库
├── lib/                      # 核心业务逻辑与工具库
│   ├── textProcessor.ts      # 文本处理引擎（句子分割、动态高亮 HTML 注入）
│   ├── ttsAPI.ts             # TTS API 网络请求封装
│   ├── ttsOptions.ts         # 语音选项、音色配置数据
│   ├── persistentAudioCache.ts # IndexedDB 音频缓存封装
│   └── utils.ts              # Tailwind 类合并等通用工具
└── package.json              # 依赖与脚本配置
```

## 🚀 安装与启动

### 前提条件
- Node.js 20.0.0+
- Bun 1.2+

### 本地开发

1. **克隆代码库**
   ```bash
   git clone https://github.com/yourusername/tts-word-reader.git
   cd tts-word-reader
   ```

2. **安装依赖**
   ```bash
   bun install
   ```

3. **启动开发服务器**
   ```bash
   bun run dev
   ```

4. **访问应用**
   在浏览器中打开 `http://localhost:3000` 即可体验。

## 🔌 TTS API 接口规范

默认支持兼容 OpenAI TTS `/v1/audio/speech` 格式的 API。项目预设使用部署在 Cloudflare Workers 上的 VoiceCraft/Edge TTS 桥接接口。

**请求示例**:
```json
POST /v1/audio/speech
Content-Type: application/json

{
  "input": "欢迎使用文档朗读系统",
  "voice": "zh-CN-XiaoxiaoNeural",
  "speed": 1.0,
  "pitch": "0",
  "style": "general",
  "volume": "0"
}
```

**响应**: 直接返回 `audio/mpeg` 数据流。

> 隐私说明：上传的 Word 文件只在浏览器本地解析；朗读时，当前句子文本会发送到你配置的 TTS API。开启持久音频缓存后，生成的音频和对应文本会保存在本机浏览器 IndexedDB，可在高级设置中关闭或清空。

## 🧠 核心架构解析

1. **多重预加载策略 (Preloading & Caching)**:
   音频管理采用内存 `audioCache` Map 和 IndexedDB 持久缓存结合的策略。当播放当前句子时，系统会自动向后预取后续句子的音频。遇到过长句子则进行分块（Chunking）并发请求并缓存。
2. **纯客户端渲染**:
   涉及 Web Audio、`localStorage` 和 File API，`page.tsx` 底层被 `next/dynamic` 包裹以禁用 SSR，保证应用完美兼容并且无需担心服务端变量不匹配。
3. **安全与清理**:
   使用 `mammoth.js` 将 Word 转为粗略 HTML 后，经过 `DOMPurify` 严格过滤防 XSS，随后将 HTML 喂入自定义的 `textProcessor.ts`，通过跨 TextNode 范围定位插入 `.current-reading` 高亮。

## 📄 许可证

当前仓库尚未包含 LICENSE 文件；如需公开发布，请先补充许可证声明。
