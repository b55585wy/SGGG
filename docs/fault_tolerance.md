# 生成故障处理（Fault Tolerance）

本文档聚焦本项目在“绘本文案/插图生成”相关链路上新增的故障处理能力，目标是：

- 用户侧：尽量不弹出随机报错；可恢复故障自动重试；不可恢复故障给出可操作提示（截图联系管理员）
- 服务侧：避免同步等待导致的 `HeadersTimeoutError`、避免“生成中状态永远不结束”、避免部分插图丢失后无法自动补齐
- 运维侧：通过环境变量控制等待上限、退避参数、降级策略，并提供 E2E 故障演练手段

---

## 1. 链路与角色

- **frontend**：只展示状态（生成中/已生成/错误），通过轮询 `/api/home/status` 驱动 UI
- **user-api**：业务编排与兜底（触发生成、轮询后端、落库 temp_books、超时过期、对用户展示错误）
- **backend**：AI 生成与产物存储（文案生成、插图生成、故事草稿持久化、静态图片存储）

---

## 2. 关键问题与对应方案

### 2.1 backend 文案生成慢导致 user-api `UND_ERR_HEADERS_TIMEOUT`

**问题**：过去 `/api/v1/story/generate` 会同步调用 LLM，backend 在很久之后才返回响应头，user-api 的 `fetch(...)` 可能先超时，导致本次生成链路中断。

**方案**：backend 改为“立即返回 + 后台生成”：

- `POST /api/v1/story/generate` / `POST /api/v1/story/regenerate`
  - 立即创建 `story_id`
  - 写入占位 draft（`generation_status: GENERATING_TEXT`，title/summary 可能为“生成中”）
  - 启动后台线程：生成文案 → 生成插图 → 持久化 draft
  - 接口立即返回占位 draft（不会因 LLM 慢而卡住响应头）

user-api 侧只需拿到 `story_id`，然后通过 `GET /api/v1/story/{story_id}` 轮询进度/读取最终内容。

### 2.2 插图部分失败导致草稿永远缺图

**问题**：图片生成可能出现临时失败或部分页缺图，导致 draft 不完整。

**方案**：

- backend 图片生成线程会循环检查缺图页，只对缺失页重试，直到全部页有 `image_url` 才结束
- 新增接口 `POST /api/v1/story/{story_id}/ensure_images`：仅补齐缺失插图（不会重复生成已有插图）
- user-api 在“查看绘本”面板（`ensureBook=1`）下会主动触发补全逻辑：
  - 已有部分插图：调用 `ensure_images` 补齐剩余页
  - 一张都没有：重启完整生成

### 2.3 “生成中”状态永远不结束（服务崩溃/重启）

**问题**：生成过程中如果 user-api 进程崩溃/重启，可能来不及清理 `generating_since`，导致 `generating=true` 被永久保持。

**方案**：

- `users.generating_since` 引入“超时过期”逻辑：超过阈值自动清空并写入 `generating_error`
- 阈值使用 `max(BOOK_GENERATE_MAX_WAIT_SEC, BOOK_REGENERATE_MAX_WAIT_SEC)`
- 因此即使服务故障，最终也会自动回到 `generating=false`，并引导用户截图联系管理员

### 2.4 长时间生成体验优化（自动降级）

**问题**：并发高/上游限流时生成可能很慢，用户体验差。

**方案**（user-api）：

- 当生成持续超过 `BOOK_*_DEGRADE_AFTER_SEC`：
  - `pages` 降到最多 4
  - `difficulty=easy`
  - `interactive_density=low`
- 同时存在最大等待上限 `BOOK_*_MAX_WAIT_SEC`，超时后结束并返回错误提示

### 2.5 文字生成退避重试与超时扩展

**方案**（backend）：

- 文案 LLM 调用支持退避重试：针对 `429/503/504` 与超时类异常自动重试
- 若持续出现超时，会逐步放大单次 timeout（直到上限）
- 受“总等待窗口”限制，超过后才会最终抛出错误

### 2.6 不可恢复错误的用户提示策略

**策略**：

- 可恢复类（429/503/超时/网络抖动）：自动重试/退避
- 不可恢复类（401/403/参数错误等）：结束生成，`generationError` 提示用户截图联系管理员

---

## 3. 状态字段与判定规则

### 3.1 backend story draft 状态

`GET /api/v1/story/{story_id}` 返回的 `draft` 中包含：

- `generation_status`：
  - `GENERATING_TEXT`：文案生成中
  - `GENERATING_IMAGES`：插图生成中
  - `READY`：文案与插图都齐全
  - `ERROR`：后台任务失败
- `generation_error`：当 `ERROR` 时记录错误字符串（用于前端展示）

### 3.2 user-api home/status 生成状态

`GET /api/home/status` 返回字段：

- `generating`：是否认为当前用户在生成中
- `generatingSince`：生成开始时间（DB 字段）
- `generatingSlow`：生成是否超过 3 分钟（用于提示“生成较久请等待”）
- `generationError`：生成错误（用于提示“截图联系管理员”）
- `book`：
  - 当前策略：只有当“文案与所有页插图都齐全”才返回 `book`；否则 `book=null` 并展示生成中

### 3.3 生成状态判定优先级（核心规则）

本系统的“生成状态”同时参考 user-api 侧状态与 backend 侧状态。判定顺序与优先级如下：

1. **硬错误优先（立即结束 generating）**
   - user-api 侧若存在 `users.generating_error`（即 `generationError` 非空），且当前没有可展示的 `book`，则前端应展示错误提示并停止生成动效。
   - backend 侧若 `draft.generation_status == "ERROR"` 或存在 `draft.generation_error`，user-api 轮询时会把该错误同步到 `users.generating_error`，并结束生成。

2. **未完成产物优先（继续 generating）**
   - 若当前存在临时绘本（tempBook），但 backend draft 仍未满足“全部页 `image_url` 均存在”的条件，则统一视为未完成：`book=null`，前端持续显示生成中。
   - user-api 轮询 backend 的依据是 `GET /api/v1/story/{story_id}`，并以“所有页图片齐全”为 ready 条件。

3. **backend 正在跑时避免重复触发（跳过补全）**
   - 当 `ensureBook=1` 且发现缺图时，会先查看 backend `draft.generation_status`：
     - 非 `READY`（如 `GENERATING_TEXT/GENERATING_IMAGES`）：认为 backend 仍在执行中，不重复触发补全任务，仅继续返回生成中。

4. **user-api 是否认为在生成中**
   - `generating = generatingUsers.has(userID) || isUserGenerating(userID)`
   - 其中 `isUserGenerating` 会读取 `users.generating_since` 并做“超时过期”：
     - 若 `generating_since` 超过 `max(BOOK_GENERATE_MAX_WAIT_SEC, BOOK_REGENERATE_MAX_WAIT_SEC)`，会自动清空 `generating_since`，并写入 `generating_error`，从而确保最终 `generating=false`（避免永远卡住）。

5. **补全触发条件（ensureBook=1）**
   - 触发时机：用户在主页面右侧切换到“查看绘本”面板时，前端请求 `/api/home/status?ensureBook=1`
   - 触发前提：当前有 tempBook，且不在生成中（`generating=false`），且 story 缺图
   - 执行动作：
     - 已有部分图片（ready>0）：调用 backend `POST /api/v1/story/{story_id}/ensure_images` 补齐剩余页
     - 无任何图片（ready==0）：重启一次完整生成（重新创建 story_id 并写入新的 tempBook）

### 3.4 生成状态相关字段的位置（落库点）

- user-api（用户数据库）：
  - `users.generating_since`：开始生成时写入；成功/失败/过期时清空
  - `users.generating_error`：不可恢复错误/超时过期/后台失败时写入
  - `temp_books`：临时绘本；生成过程中会先写占位 preview，最终 ready 后再写入真实 preview 与完整 content（draft JSON）

- backend（storybook.db）：
  - `stories.story_json`：包含 draft 全量（含 `generation_status/generation_error`），由后台线程持续更新

### 3.5 `generating` 的维护逻辑（生命周期）

`generating` 是 user-api 在 `/api/home/status` 返回的聚合字段，用于驱动前端“生成中动效/轮询停止条件”。它不是 backend 推送的状态，而是 user-api **根据内存态 + 持久化态**综合计算出来的。

#### 3.5.1 数据来源

- **内存态**：`generatingUsers`（`Set<userID>`）
  - 作用：同一 user-api 进程内，避免重复触发生成/重生成任务；任务结束后立即清理
  - 特性：进程重启后会丢失

- **持久化态**：`users.generating_since`
  - 作用：跨刷新/跨进程重启仍能恢复“生成中”状态（避免刷新后动效消失）
  - 写入时间：生成任务启动时写入 `datetime('now')`
  - 清理时间：任务完成/失败/过期时清空

计算方式（概念上）：

- `generating = generatingUsers.has(userID) || isUserGenerating(userID)`

#### 3.5.2 什么时候置为 true

1. **自动生成触发**
   - 条件：`/api/home/status` 发现没有 tempBook 且不在 generating 中
   - 行为：启动后台生成任务，并调用 `setUserGenerating(userID)`

2. **重新生成触发**
   - 条件：用户点击“重新生成”
   - 行为：接口立即返回 `{ok:true}`，后台任务开始执行，并调用 `setUserGenerating(userID)`

#### 3.5.3 什么时候置为 false

1. **任务正常结束**
   - 生成完成（文案与全部插图齐全并落库 temp_books）后，后台任务 finally 会调用 `clearUserGenerating(userID)`，并从 `generatingUsers` 删除该 userID。

2. **任务失败**
   - 后台任务捕获到不可恢复错误时写入 `users.generating_error`，随后 `clearUserGenerating(userID)`，使得 `/api/home/status` 返回 `generating=false` 且带 `generationError`。

3. **超时过期（服务中断兜底）**
   - `isUserGenerating(userID)` 会检查 `generating_since` 是否超过阈值 `max(BOOK_GENERATE_MAX_WAIT_SEC, BOOK_REGENERATE_MAX_WAIT_SEC)`：
     - 超过则自动清空 `generating_since`
     - 同时补写 `generating_error`（若原本为空）
   - 该逻辑保证：即使 user-api/back-end 崩溃导致任务中断，最终也会回到 `generating=false`，避免无限等待。

#### 3.5.4 与 tempBook / backend draft 的关系

- 只要 tempBook 存在但 backend draft 未 ready（未全页有图），`/api/home/status` 会优先返回 `book=null` 并保持 `generating=true`（除非已经落到 `generationError`）。
- `generating` 是“任务/兜底状态”，而不是“产物是否齐全”的唯一依据；产物齐全最终以 backend draft 全页 `image_url` 判定为准。

---

## 4. 环境变量（.env）参数清单

### 4.1 backend/.env（文案与插图生成）

文案生成（LLM）：

- `STORYTEXT_OPENAI_URI`
- `STORYTEXT_OPENAI_API_KEY`
- `STORYTEXT_OPENAI_MODEL`
- `STORYTEXT_OPENAI_TIMEOUT_SEC`（初始单次 timeout，默认 120）
- `STORYTEXT_OPENAI_TIMEOUT_MAX_SEC`（单次 timeout 上限，默认 600）
- `STORYTEXT_OPENAI_MAX_TOTAL_SEC`（总等待窗口上限，默认 7200）
- `STORYTEXT_OPENAI_BACKOFF_SEC`（初始退避秒，默认 2）
- `STORYTEXT_OPENAI_BACKOFF_MAX_SEC`（退避秒上限，默认 60）

插图生成（Images）：

- `STORYIMAGE_OPENAI_URI`
- `STORYIMAGE_OPENAI_API_KEY`
- `STORYIMAGE_OPENAI_MODEL`
- `STORYIMAGE_OPENAI_TIMEOUT_SEC`（初始单次 timeout，默认 60）
- `STORYIMAGE_OPENAI_TIMEOUT_MAX_SEC`（单次 timeout 上限，默认 180）

测试演练（仅测试用途）：

- `ADMIN_API_KEY`（用于访问测试管理接口）

### 4.2 user-api/.env（兜底与降级）

- `BOOK_GENERATE_MAX_WAIT_SEC`（秒，默认 1200）
- `BOOK_REGENERATE_MAX_WAIT_SEC`（秒，默认 1200）
- `BOOK_GENERATE_DEGRADE_AFTER_SEC`（秒，默认 180）
- `BOOK_REGENERATE_DEGRADE_AFTER_SEC`（秒，默认 180）

---

## 5. 故障演练（E2E）

### 5.1 模拟生成链路变慢

`/api/v1/admin/test/llm_delay` 测试接口已移除。  
如需演练“生成慢”场景，请通过环境、网络或模型侧限流方式模拟慢请求，并验证前端轮询 `home/status` 的行为。

---

## 6. 观测与排查建议

- user-api 会在 `/api/home/status?ensureBook=1` 的补全分支打印关键日志（userID/storyId/ready/total/采取的动作）
- backend 会在图片生成、后台生成线程等关键节点打印 `[INFO]` 日志
