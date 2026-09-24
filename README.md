# 文档朗读

上传 DOCX、TXT、Markdown、PDF、图片或 Office 文档，保存解析结果并逐句朗读。Next.js 同时提供阅读界面与后端接口；Supabase 保存账号、文档、MinerU 解析数据和音频缓存。数据不再写入 IndexedDB。

## 部署配置

1. 新建 Supabase 免费项目，执行 `supabase/migrations/` 中的迁移。项目使用私有 `documents` 与 `audio` Storage 桶。
2. 在 Supabase Auth → Users 中设置自己的邮箱密码账号，并关闭公开注册。将这个邮箱写入服务端 `OWNER_EMAIL` 环境变量；其他账号不能调用文档、MinerU 与 TTS 接口。应用只提供邮箱密码登录。
3. 复制 `.env.example` 为 `.env.local`，填写 Supabase、MinerU 与定时任务环境变量。`SUPABASE_SECRET_KEY` 和 `MINERU_API_TOKEN` 只放在服务端。
4. `bun install`、`bun run dev`。生产环境继续部署到 Vercel，并配置同名环境变量。

免费版文件上限为 50 MB。大于 6 MB 的原文件使用断点续传，文件直接进入 Supabase Storage，不经过 Vercel 函数请求体。MinerU 本地文件通过服务端上传至 MinerU 提供的地址；解析完成后，回调或任务刷新接口把 Markdown 和 JSON 写入 PostgreSQL，图片和原始 ZIP 保存到私有 Storage。ZIP 超过免费版 50 MB 单文件上限时，只保存已提取的正文、JSON 和资产。

`vercel.json` 每日 03:00、11:00、19:00 UTC 触发 `/api/cron/heartbeat/[slot]`，接口校验 `CRON_SECRET` 后写入数据库，并补偿未完成的 MinerU 任务。Vercel Hobby 定时任务可能在指定小时内延迟运行；心跳能产生数据库活动，但 Supabase 是否暂停仍由其平台规则判断。部署后应从 Vercel Cron 日志确认任务实际运行。

## 使用

登录后上传文件。DOCX、TXT、Markdown 由后端直接解析；PDF、图片和其他 Office 文件由 MinerU 解析。解析中的文档会保留在文档库，关闭页面后仍可继续处理；上传中断时可重新选择同一个文件继续。打开已完成的文档即可播放、暂停、逐句跳转、调整倍速与语音风格。阅读位置和语音设置保存在账号中；音频保存到云端，可在设置中清空，并由定时任务限制缓存规模。

默认 TTS 接口是 `lib/ttsOptions.ts` 中的 VoiceCraft/Edge TTS 桥接服务。可通过服务端环境变量 `TTS_API_ENDPOINT` 替换。

## 检查

`bun run test`、`bun run lint`、`bun run build`。需要验证真实接口时，用 `bunx supabase start` 启动本地服务，再运行 `bun run smoke:local`：它使用临时账号验证文件直传、TXT/DOCX 解析、模拟 MinerU 结果落库、音频缓存、心跳、权限隔离与删除；不会请求真实 MinerU。
