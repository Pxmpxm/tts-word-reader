# 文档朗读系统 (TTS Word Reader)

![文档朗读系统](https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-CHBUKSXOk4iFAV14cIoVzkEyezti8t.png)

## 项目概述

文档朗读系统是一个基于Web的应用程序，允许用户上传Word文档并使用文本转语音(TTS)技术朗读文档内容。系统支持文档格式化预览、句子级别的朗读控制、播放速率调整等功能，为用户提供流畅的文档朗读体验。

## 项目状态

- **UI开发**: ✅ 已完成
- **TTS接口对接**: ✅ 已完成
- **音频播放功能**: ✅ 已完成
- **用户体验优化**: ✅ 已完成
- **代码重构**: ✅ 已完成

## 项目结构

```
tts-word-reader/
├── app/                      # Next.js 应用目录
│   ├── favicon.ico           # 网站图标
│   ├── globals.css           # 全局样式
│   ├── layout.tsx            # 应用布局组件
│   └── page.tsx              # 主页面组件（客户端渲染）
├── components/               # 可复用组件
│   ├── DocumentViewer.tsx    # 文档预览组件
│   ├── FileUploader.tsx      # 文件上传组件
│   ├── PlaybackControls.tsx  # 播放控制组件
│   ├── SettingsPanel.tsx     # 设置面板组件
│   └── ui/                   # UI基础组件
│       ├── button.tsx        # 按钮组件
│       ├── card.tsx          # 卡片组件
│       ├── slider.tsx        # 滑块组件
│       ├── tabs.tsx          # 标签页组件
│       └── ...               # 其他UI组件
├── lib/                      # 功能库和工具
│   ├── playbackController.ts # 播放控制逻辑
│   ├── textProcessor.ts      # 文本处理逻辑
│   ├── types.ts              # 类型定义
│   └── utils.ts              # 通用工具函数
├── public/                   # 静态资源目录
├── README.md                 # 项目说明文档
├── next.config.js            # Next.js配置
├── package.json              # 项目依赖和脚本
├── postcss.config.js         # PostCSS配置
├── tailwind.config.ts        # Tailwind CSS配置
└── tsconfig.json             # TypeScript配置
```

## 主要功能

- **Word文档上传与解析**：支持上传.docx格式文档并保留原始格式
- **文档预览**：实时预览上传的文档内容，保留原始格式和样式
- **TTS朗读控制**：
  - 播放/暂停朗读
  - 上一句/下一句导航
  - 朗读进度显示和控制
  - 播放速率调节 (0.5x - 2.0x)
- **语音设置**：
  - 多种中文语音选择（包括男声/女声、多地方口音）
- **高级设置**：
  - TTS API配置
- **朗读跟踪**：当前朗读句子高亮显示并自动滚动
- **本地存储**：自动保存设置（播放速率、API端点）

## 技术栈

- **前端框架**：Next.js 14+ (App Router)
- **UI组件**：shadcn/ui + Tailwind CSS
- **文档解析**：mammoth.js (Word文档转HTML)
- **状态管理**：React Hooks
- **图标**：Lucide React
- **音频处理**：Web Audio API
- **客户端渲染**：使用dynamic import确保纯客户端渲染

## 代码组织

项目采用模块化设计，主要组件结构如下：

### 核心组件

- **FileUploader**: 文件上传组件
- **DocumentViewer**: 文档预览组件
- **PlaybackControls**: 播放控制组件
- **SettingsPanel**: 设置面板组件

### 功能模块

- **textProcessor.ts**: 文本处理模块，负责从HTML中提取句子和高亮显示
- **playbackController.ts**: 播放控制模块，管理音频播放和相关设置
- **ttsAPI.ts**: TTS API接口模块，处理与语音合成API的通信
- **utils.ts**: 工具函数模块，提供通用功能支持

### 类型定义

- **types.ts**: 统一的类型定义文件，定义了Sentence、Voice等类型

## 文件功能说明

### 主要组件

- **app/page.tsx**: 应用主组件，整合所有功能模块，处理状态管理和事件逻辑
- **components/FileUploader.tsx**: 处理文档上传，支持拖放和点击上传
- **components/DocumentViewer.tsx**: 渲染文档内容，处理句子高亮和滚动
- **components/PlaybackControls.tsx**: 提供播放控制UI，包括播放/暂停、上一句/下一句、进度条和速率调节
- **components/SettingsPanel.tsx**: 提供TTS设置选项，包括语音选择和高级设置

### 核心功能模块

- **lib/textProcessor.ts**: 
  - `extractSentencesFromHtml`: 从HTML中提取句子
  - `highlightSentenceInHtml`: 高亮显示当前朗读句子
- **lib/playbackController.ts**: 
  - 处理音频播放控制逻辑
  - 管理播放速率设置
- **lib/utils.ts**:
  - `loadFromLocalStorage`: 加载本地存储数据
  - `delay`: 提供异步延迟功能
  - `isClient`: 检测客户端环境

## 最近更新

- 重构了代码结构，将原始大型组件拆分为更小的可复用组件
- 修复了客户端渲染问题，确保应用完全在客户端运行
- 添加了引用索引系统，解决了异步环境中的索引不同步问题
- 优化了播放逻辑，确保正确播放当前句子
- 改进了错误处理，增强了应用稳定性

## 安装与设置

### 前提条件

- Node.js 18.0.0 或更高版本
- npm, yarn 或 pnpm

### 安装步骤

1. 克隆仓库

```bash
git clone https://github.com/yourusername/tts-word-reader.git
cd tts-word-reader
```

2. 安装依赖

```bash
# 使用npm安装依赖
npm install

# 或使用yarn
yarn install

# 或使用pnpm
pnpm install
```

3. 启动开发服务器

```bash
# 启动开发服务器
npm run dev
```

4. 在浏览器中访问 `http://localhost:3000`

## 使用说明

1. **上传文档**：点击左侧的"选择文件"按钮，选择一个.docx格式的Word文档
2. **选择语音**：在TTS设置区域选择合适的语音
3. **开始朗读**：点击播放按钮开始朗读，系统会自动高亮当前朗读的句子
4. **控制朗读**：
   - 使用播放/暂停按钮控制朗读状态
   - 使用上一句/下一句按钮在文档中导航
   - 调整速率滑块控制朗读速度 (0.5x - 2.0x)
   - 使用进度条可以快速跳转到指定位置
5. **高级设置**：可在高级设置标签页中配置TTS API端点

## TTS API 接口规范

系统使用的TTS API接口需满足以下规范：

### 请求格式

```json
POST /api/v1/tts/generate
Content-Type: application/json

{
  "text": "要朗读的文本内容",
  "voice": "zh-CN-YunjianNeural",
  "rate": "0%",
  "pitch": "0Hz",
  "volume": "0%"
}
```

### 响应格式

```json
{
  "success": true,
  "data": {
    "audio": "/path/to/audio.mp3"
  }
}
```

## 开发者注意事项

1. **客户端渲染**: 应用使用`dynamic`导入并设置`{ ssr: false }`确保纯客户端渲染，避免水合错误
2. **状态管理**: 使用`useRef`+`useState`组合来处理异步环境中的状态更新
3. **文本处理**: 短文本(少于6字符)会自动跳过，无需发送TTS请求
4. **错误处理**: 音频加载失败时会自动尝试播放下一句
5. **设置持久化**: 使用`localStorage`保存用户设置

## 许可证

本项目采用MIT许可证 - 详情请参阅LICENSE文件

## 联系方式

如有问题或建议，请通过以下方式联系我们：

- 项目仓库Issues
- 电子邮件: example@example.com

---

感谢使用文档朗读系统！
