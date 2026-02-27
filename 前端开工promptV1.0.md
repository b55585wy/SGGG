前端开工 Prompt v1.0（终版，可直接复制）

你正在开发一个 AI 儿童互动绘本系统前端（React + TypeScript，Next.js 也可）。
请严格依据以下接口契约与系统规范实现，不要自行修改字段名或接口路径。

参考文档：

Story_System_Architecture_v1.0_Spec.md

API_v1_Interface_Contract.md

目标：实现完整闭环 generate → preview(信任校准) → session/start → reading(埋点+TTS) → feedback。

0) 强约束（必须遵守）

不得重命名任何接口字段（story_id / session_id / page_id / behavior_anchor 等都必须保持一致）

/session/start 必须使用 client_session_token(UUID)，并允许重复请求返回 status=existed

Telemetry 事件必须 批量 buffer 上报，单条上报不允许

Reader 页面必须实现：

语音伴读（TTS）

InteractionLayer 多态渲染

图片骨架屏 / 占位图（防布局塌陷）

1) 页面/路由结构（必须实现）

Generate.tsx：输入 child_profile / meal_context / story_config → 调用 generate

Preview.tsx：展示 title/summary/design_logic + 重生成 + 开始阅读

Reader.tsx：StoryCard 阅读 + 互动 + TTS + 埋点 + 退出/完成反馈

核心组件：

StoryCard.tsx

InteractionLayer.tsx

FeedbackModal.tsx

建议目录：

/pages
  Generate.tsx
  Preview.tsx
  Reader.tsx

/components
  StoryCard.tsx
  InteractionLayer.tsx
  FeedbackModal.tsx

/hooks
  useTelemetry.ts
  useSession.ts
  useTTS.ts

/types
  story.ts
  telemetry.ts
2) 必须对接的 5 个接口

POST /api/v1/story/generate → 返回 draft + story_id

POST /api/v1/story/regenerate → 传 previous_story_id（后端限制 regen_count < 2）

POST /api/v1/session/start → 传 story_id + client_session_token → 返回 session_id (created/existed)

POST /api/v1/telemetry/report → 批量 events[]

POST /api/v1/feedback/submit → COMPLETED(try_level) 或 ABORTED(abort_reason)

3) Preview 页面（信任校准必须展示）

必须展示：

book_meta.title

book_meta.summary

book_meta.design_logic（必须显著展示，不能藏起来）

按钮：

「重生成」→ POST /story/regenerate

「确认开始阅读」→ 进入 session/start

4) Reader 页面关键逻辑（必须实现）
4.1 Session 启动（幂等）

点击“开始阅读”时：

const client_session_token = crypto.randomUUID()
POST /api/v1/session/start { story_id, client_session_token }

保存：

session_id

story_id

建议用 localStorage 保存 session（刷新不丢）。

5) Telemetry 埋点（必须实现 + 批量上报）
5.1 事件结构（每条都必须带）
{
  event_id: crypto.randomUUID(),
  schema_version: "telemetry-1.0.0",
  ts_client_ms: Date.now(),
  session_id,
  story_id,
  page_id,          // 可选但建议尽量带
  event_type,
  payload
}
5.2 触发规则（必须）

页面进入：page_view

页面离开：page_dwell { duration_ms }

互动完成：interaction { event_key, latency_ms }

分支选择：branch_select { choice_id }

故事结束：story_complete { completion_rate }

5.3 TTS 埋点（新增，必须）

点击朗读按钮时，上报：

read_aloud_play { enabled:true, page_id }

（如果暂停/停止，也可上报 read_aloud_play { enabled:false }）

5.4 批量上报机制（必须）

buffer 本地事件数组

每 3 秒 或 累计 20 条触发一次 POST

调用：POST /api/v1/telemetry/report

失败要重试（至少保留 buffer，不要丢）

6) InteractionLayer 多态渲染（必须）

你必须根据 interaction.type 分发渲染：

none：不渲染互动层

tap：渲染一个可点击热点（可用透明覆盖+高亮提示）

choice：渲染两个或多个按钮（分支选择）

drag：渲染拖拽交互（可先做简化版：把元素拖到目标区域）

mimic：渲染“模仿动作提示”（可只做提示+确认按钮）

record_voice：如果不做录音，可先用占位按钮 + 上报事件

互动完成时：

必须上报 interaction，payload 至少包含 event_key 和 latency_ms

7) 语音伴读 TTS（必须）

在 Reader.tsx 中实现：

每页有一个「朗读」按钮

默认朗读 page.text

可用 Web Speech API（优先）：

speechSynthesis.speak(new SpeechSynthesisUtterance(text))

要求：

点击朗读上报 read_aloud_play

翻页时自动停止上一页朗读（避免叠音）

若浏览器不支持，显示降级提示并仍允许继续阅读

8) 图片加载与骨架屏（必须）

由于图片可能异步生成/加载：

在 StoryCard.tsx：

图片区域必须有固定高度

图片未加载完成前显示 Skeleton / 占位图

图片加载失败显示 fallback（不允许页面塌陷）

（可选埋点但建议做）：

image_loaded { page_id }

image_error { page_id, reason }

9) 退出/完成与反馈（必须）

读到最后一页 → status=COMPLETED → 弹 FeedbackModal（try_level 必填）

点击退出 → status=ABORTED → 弹 FeedbackModal（abort_reason 必填）

提交：
POST /api/v1/feedback/submit

10) 交付验收标准（必须通过）

generate → preview → start → reader → feedback 全链路跑通

埋点事件以 batch 形式发送（可在 console/network 看到）

TTS 可用（或降级提示），并上报 read_aloud_play

interaction.type 的多态渲染至少实现 none/tap/choice，drag/mimic 可先简化但必须有入口

图片骨架屏不塌陷