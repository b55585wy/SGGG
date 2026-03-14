# 当前实现快照（2026-03-14）

## 0. 说明

- 本文档记录“当前代码真实行为”，用于替代口头记忆。
- 扫描范围：`backend/`、`user-api/`、`frontend/` 关键业务代码与配置。
- 重点覆盖：生成链路、阅读链路、交互/图像、超时与重试、数据落库、已知偏差。

---

## 1. 服务职责与启动

### 1.1 三服务职责

- `backend`（FastAPI，`8000`）
  - 故事文本生成（episode module）
  - 图片生成与互动差分图生成
  - telemetry / feedback / sus / tts / transcribe
- `user-api`（Express，`3001`）
  - 用户认证与账号管理
  - 主页状态聚合、自动触发绘本生成、确认/重生成
  - 进食记录、阅读日志、语音记录、导出
- `frontend`（Vite React，`5173`）
  - `/noa/*` 用户流程页面
  - `/reader` 阅读器（交互、TTS、反馈）

### 1.2 本地启动命令

```bash
# backend
cd backend && uvicorn main:app --reload --port 8000

# user-api
cd user-api && npm run dev

# frontend
cd frontend && npm run dev
```

---

## 2. 路由与代理（当前）

### 2.1 前端路由

- `/noa/login`
- `/noa/avatar`
- `/noa/home`
- `/noa/books/create`（仍存在，但主流程已由 home 内弹层承接）
- `/noa/books/history`
- `/noa/books/:bookId`
- `/noa/admin/users`
- `/reader`

见：`frontend/src/main.tsx`

### 2.2 Vite 代理

- `/api/user/*` -> `http://localhost:3001/api/*`
- `/api/v1/*` -> `http://localhost:8000/api/v1/*`
- `/static/*` -> `http://localhost:8000/static/*`

见：`frontend/vite.config.ts`

---

## 3. 生成链路（当前真实逻辑）

## 3.1 自动生成触发（非阻塞前端）

- 触发点：`GET /api/home/status` 在“无 temp_book 且未在生成”时会触发 `triggerAutoBookGeneration(...)`。
- `user-api` 不同步等待图片全部完成：
  - 先调用 backend `POST /api/v1/story/generate` 获取 `story_id + 元数据`；
  - 将 pending 状态保存在内存 `pendingAutoStories` 与 DB `users.generating_since`；
  - 前端继续轮询 `/api/home/status`。
- 当图片完成后，`/api/home/status` 会把最终 draft/preview 落库到 `temp_books`，并清理 generating 状态。

见：`user-api/src/index.ts` 的 `triggerAutoBookGeneration` 与 `/api/home/status`

## 3.2 重新生成

- 入口：home 的 RegenModal（不是旧 create 页）。
- `POST /api/book/regenerate`：
  - 会先做 `regenerateCount >= 2` 限制；
  - 调 backend `POST /api/v1/story/regenerate`；
  - 立即保存新的 `temp_book`（preview 先用占位 SVG），图片后续异步完成。

见：`frontend/src/pages/noa/HomePage.tsx`、`user-api/src/index.ts`

## 3.3 backend 文本生成与图片生成

- `backend/routers/story.py`
  - `/generate` 和 `/regenerate` 都先跑 `generate_story_from_episode(...)`
  - 返回 draft 后，另起线程 `_generate_images_bg(...)` 异步生成图片
- 图片生成实现：`backend/image_gen.py`
  - 页图并发：`ThreadPoolExecutor(max_workers=2)`
  - 单图重试：`MAX_RETRIES=3`，退避 `[2,5,10]` 秒
  - 对 `tap/drag/mimic` 额外生成 `interaction_image_url` 差分图（基于原图 edits）

---

## 4. 约束参数（当前值）

## 4.1 Episode 结构约束

- 来源：`backend/basic_constraints.json` + `backend/episode_module.py`
- 当前核心值：
  - `episode_page_count = 12`
  - `words_per_page_target_cn = [60, 80]`
  - `word_count_cn_profiles.standard = [720, 960]`
  - `sensory_min_per_episode = 2`
  - `knowledge_min_per_episode = 1`
  - `role_model_min_per_episode = 1`
  - `micro_interactions_max_per_episode = 4`
  - `choice_points_max_per_episode = 2`（但策略层实际限制 choice <= 1）
- 重试次数：`generate_episode(..., max_retries=2)`。

## 4.2 交互上限（策略+校验）

- `tap/drag/mimic` 共享预算，目标不超过 4。
- `record_voice <= 1`
- `choice <= 1`
- 校验容忍：超 1 个以内容忍（再超才判失败重生）。

见：`backend/episode_module.py`（developer policy + `_validate_episode_output`）

## 4.3 图像差分图 Prompt 机制

- 仅对 `tap/drag/mimic` 生成差分图。
- 通过 `_build_interaction_delta_prompt(...)` 强调：
  - 角色/构图/镜头保持一致；
  - 只体现操作结果变化；
  - 禁止 UI/箭头/文字叠加。

见：`backend/image_gen.py`

---

## 5. 阅读链路（当前）

## 5.1 Reader 行为

- 自动朗读开启后，翻页会自动续读下一页。
- 互动完成不再强制停止 TTS（避免翻页后“朗读断掉”体验）。
- `tap/drag/mimic` 完成后可切换到 `interaction_image_url` 差分图显示。

见：`frontend/src/pages/Reader.tsx`、`frontend/src/components/InteractionLayer.tsx`

## 5.2 阅读日志与 onDone 触发

- 在“最后一页点击完成”即立即写阅读日志 `completed=true`，不依赖反馈弹窗提交。
- 在“退出”时也立即写一笔 `completed=false`，防止弹窗阶段关闭 App 导致时长丢失。
- 反馈提交后再写一次用于补全 `tryLevel/abortReason`，后端通过 upsert 合并到同一 session。

见：`frontend/src/pages/Reader.tsx`、`user-api/src/index.ts:/api/reading/log`、`user-api/src/db.ts:insertReadingSession`

## 5.3 自动触发下本生成

- 仅在 `reading/log` 写入“新建 completed session（created=true）”时触发。
- 避免反馈补写导致重复触发。

见：`user-api/src/index.ts` `/api/reading/log`

---

## 6. 进食记录与语音链路（当前）

## 6.1 进食记录

- 表单字段：`foodName`、`score`、`content`、`specificThing(可选)`。
- 进食反馈语优先调用 backend `/api/v1/feedback_words/generate`，失败时本地兜底文案。
- emotion 按 score 映射并写入用户 avatar 状态。

见：`frontend/src/pages/noa/HomePage.tsx`、`user-api/src/index.ts:/api/food/log`

## 6.2 语音转写

- 前端录音时根据浏览器支持动态选择 mime type。
- 上传文件名与内容类型会在 backend 转写端进行“魔数+MIME+扩展名”归一化，避免 webm/m4a 错配导致 502。

见：`frontend/src/pages/noa/HomePage.tsx`、`user-api/src/index.ts:/api/voice/transcribe`、`backend/routers/tts.py:/voice/transcribe`

---

## 7. 数据落库（当前）

## 7.1 user-api SQLite（`user-api/data/db.sqlite`）

- 用户与形象：`users`、`user_avatars`、`user_avatar_states`
- 绘本：`temp_books`、`history_books`、`user_story_arcs`
- 进食与阅读：`user_food_logs`（含 `specific_thing`）、`reading_sessions`、`voice_recordings`

删除用户会清理上述业务数据，并清理内存中的生成状态。

见：`user-api/src/db.ts`、`user-api/src/index.ts`

## 7.2 backend SQLite（`backend/storybook.db`）

- `stories`、`sessions`、`telemetry_events`、`feedback`、`sus_responses`

见：`backend/database.py`

---

## 8. 超时与等待（当前配置来源）

- user-api 调 backend HTTP 超时：
  - `FASTAPI_FETCH_TIMEOUT_SEC`，默认 `900s`（15min）
- user-api 生成状态超时判定：
  - `BOOK_GENERATE_MAX_WAIT_SEC` 默认 `1200s`
  - `BOOK_REGENERATE_MAX_WAIT_SEC` 默认 `1200s`
  - 实际取二者最大值
- 生成“变慢”阈值：
  - `BOOK_GENERATE_SLOW_SEC` 默认 `180s`
- backend 子模块超时：
  - `EPISODE_MODULE_TIMEOUT_SEC` 默认 `240s`
  - `CONTINUITY_MODULE_TIMEOUT_SEC` 默认 `180s`

见：`user-api/.env.example`、`user-api/src/db.ts`、`user-api/src/index.ts`、`backend/episode_text.py`、`backend/routers/continuity.py`

---

## 9. 已知偏差/待修点（按当前代码）

- 页数参数偏差：
  - `user-api` 发给 backend 的 `story_config.pages` 默认/可选值是 6~12；
  - 但 episode 实际页数受 `backend/basic_constraints.json` 的 `episode_page_count=12` 主导。
- `feedback_words` 请求中 `specific_thing` 已从 user-api 透传，但 backend 的 `FeedbackWordsGenerateRequest` 目前未显式声明该字段（会被忽略）。
- 前端全量 build 当前有历史类型错误（`useSession.ts` / `lib/api.ts`），与本次文档记录无关但会影响 CI。

---

## 10. 代码真值入口（建议优先阅读）

- 生成主链路：`user-api/src/index.ts`
- 用户侧数据层：`user-api/src/db.ts`
- backend 故事与图片：`backend/routers/story.py`、`backend/episode_text.py`、`backend/episode_module.py`、`backend/image_gen.py`
- 阅读器：`frontend/src/pages/Reader.tsx`
- 主页（生成/重生成/进食）：`frontend/src/pages/noa/HomePage.tsx`

