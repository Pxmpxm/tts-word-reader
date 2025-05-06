# 文档朗读系统 (TTS Word Reader)

![文档朗读系统](https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-CHBUKSXOk4iFAV14cIoVzkEyezti8t.png)

## 项目概述

文档朗读系统是一个基于Web的应用程序，允许用户上传Word文档并使用文本转语音(TTS)技术朗读文档内容。系统支持文档格式化预览、句子级别的朗读控制、音量和播放速率调整等功能，为用户提供流畅的文档朗读体验。

## 项目状态

- **UI开发**: ✅ 已完成
- **TTS接口对接**: 🔄 进行中
- **音频播放功能**: 🔄 进行中
- **用户体验优化**: 🔄 进行中

## 主要功能

- **Word文档上传与解析**：支持上传.docx格式文档并保留原始格式
- **文档预览**：实时预览上传的文档内容，保留原始格式和样式
- **TTS朗读控制**：
  - 播放/暂停朗读
  - 上一句/下一句导航
  - 朗读进度显示和控制
  - 音量和播放速率调节
- **语音设置**：
  - 多种中文语音选择（包括男声/女声、多地方口音）
- **高级设置**：
  - TTS API配置
- **朗读跟踪**：当前朗读句子高亮显示并自动滚动

## 技术栈

- **前端框架**：Next.js 14+ (App Router)
- **UI组件**：shadcn/ui + Tailwind CSS
- **文档解析**：mammoth.js (Word文档转HTML)
- **状态管理**：React Hooks
- **图标**：Lucide React
- **音频处理**：Web Audio API

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

3. 添加环境变量

创建`.env.local`文件并添加以下内容：

```
# TTS API设置
NEXT_PUBLIC_TTS_API_ENDPOINT=https://your-tts-api.com/synthesize
```

4. 启动开发服务器

```bash
# 启动开发服务器
npm run dev
```

5. 在浏览器中访问 `http://localhost:3000`

## 使用说明

1. **上传文档**：点击左侧的"选择文件"按钮，选择一个.docx格式的Word文档
2. **选择语音**：在TTS设置区域选择合适的语音
3. **开始朗读**：点击播放按钮开始朗读，系统会自动高亮当前朗读的句子
4. **控制朗读**：
   - 使用播放/暂停按钮控制朗读状态
   - 使用上一句/下一句按钮在文档中导航
   - 调整音量滑块控制朗读音量
   - 调整速率滑块控制朗读速度
5. **高级设置**：可在高级设置标签页中配置TTS API端点

## TTS API 接口规范

计划中的TTS API接口应满足以下规范：

### 请求格式

```json
POST /api/tts
Content-Type: application/json

{
  "text": "要朗读的文本内容",
  "voice": "zh-CN-XiaochenNeural"
}
```

### 响应格式

返回MP3格式的音频文件，Content-Type为`audio/mpeg`。

## 开发计划

- [ ] 对接TTS API接口
- [ ] 实现音频流式处理
- [ ] 添加音频缓存机制
- [ ] 优化句子分割算法
- [ ] 实现导出音频功能
- [ ] 添加夜间模式切换

## 贡献指南

1. Fork项目仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建Pull Request

## 许可证

本项目采用MIT许可证 - 详情请参阅LICENSE文件

## 联系方式

如有问题或建议，请通过以下方式联系我们：

- 项目仓库Issues
- 电子邮件: example@example.com

---

感谢使用文档朗读系统！
