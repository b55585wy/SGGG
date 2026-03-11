# 合并分析：`vk/46fe-bug-1-2-home-3` ← `origin/main`

## 概览

| 项目 | 详情 |
|------|------|
| 分叉点 | `7676f15` |
| Feature 分支 | 20 个 commit（封面生成 + 统一表单 + 管理员绘本 + E2E + Bug fixes） |
| Main 分支 | 3 个 commit（`eab25ed`, `fd522a2`, `e6ecb8a`） |
| 冲突文件数 | **7 个** |

## 冲突文件逐一分析

---

### 1. `backend/llm.py` — 难度：🔴 高

| 侧 | 变更 |
|----|------|
| **Main** | 完全重写 LLM 调用：去掉 OpenAI SDK，改用原生 `urllib.request` + 环境变量 `STORYTEXT_OPENAI_URI/KEY/MODEL`；删除 `get_client()`；`str \| None` → `Optional[str]` |
| **Feature** | 仅在 `generate_story_content` 签名增加 `custom_prompt` 参数并传递给 `build_user_prompt` |

**建议策略：以 Main 为基底，叠加 Feature 的 `custom_prompt` 参数**
- 取 Main 的完整重写（新的 `_post_json` + 环境变量驱动）
- 在 Main 的 `generate_story_content` 签名中加回 `custom_prompt: Optional[str] = None`
- 将 `custom_prompt` 传给 `build_user_prompt`

---

### 2. `backend/prompt.py` — 难度：🟢 低

| 侧 | 变更 |
|----|------|
| **Main** | `str \| None` → `Optional[str]`（仅类型注释风格变化） |
| **Feature** | 增加 `custom_prompt` 参数 + `custom_note` 拼接逻辑 |

**建议策略：两侧合并**
- 用 Main 的 `Optional[str]` 风格
- 加上 Feature 的 `custom_prompt` 参数和 `custom_note` 逻辑
- 非常简单的纯追加合并

---

### 3. `backend/routers/story.py` — 难度：🟡 中

| 侧 | 变更 |
|----|------|
| **Main** | `_generate_images_bg` 增加 `print` 日志；`story_generate` 增加日志 `print`；去掉 `custom_prompt` 参数 |
| **Feature** | `_generate_images_bg` 增加封面图生成（`generate_cover_image`）；`story_generate` 增加 `custom_prompt=req.custom_prompt` |

**建议策略：Feature 为基底，合入 Main 的日志**
- 保留 Feature 的封面生成逻辑 + `custom_prompt`
- 合入 Main 的 `print` 日志语句
- `_generate_images_bg` 取 Feature 版本（含封面），加上 Main 的 `print` 开始/完成日志

---

### 4. `frontend/src/pages/Reader.tsx` — 难度：🔴 高

| 侧 | 变更 |
|----|------|
| **Main** | TTS 重构（`autoReadSeqRef`, `lastAutoReadKeyRef`）；choice 类型互动朗读选项文本；`tts.stop()` 在退出/反馈/SUS 等处调用；删除 `PaintBrush` 图标占位 → 改为 spinner；删除 `InteractionLayer` 的 `autoRead` prop；删除 `pending_meal_reminder`；`FeedbackModal` 保持不变 |
| **Feature** | 新增封面页（`showCover` 状态 + cover UI）；`FeedbackModal` → `AbortReasonModal` + `PostReadingModal`；`goTo(next < 0)` 回到封面；进度条/TTS 在封面隐藏；图片轮询增加 `cover_image_url`；`BookOpen` 图标；`goHome` 提取 |

**建议策略：以 Feature 为基底，叠加 Main 的 TTS 重构**
1. 保留 Feature 的全部封面页逻辑 + `PostReadingModal`/`AbortReasonModal` 拆分
2. 合入 Main 的 TTS 改进：
   - `autoReadSeqRef` / `lastAutoReadKeyRef` 去重逻辑
   - choice 互动朗读选项文本
   - `tts.stop()` 在 `onExit`/`onFeedbackDone`/`onSUSDone`/`onInteraction`/`onBranch` 中调用
3. 删除 `PaintBrush` 图片占位 → 用 Main 的 spinner
4. 删除 `InteractionLayer` 的 `autoRead` prop（Main 已移除）
5. 注意：Feature 已经做了 `goHome` 提取（Main 没有但不冲突）

**最复杂的文件**，需要逐段手动合并。

---

### 5. `frontend/src/pages/noa/BookDetailPage.tsx` — 难度：🟡 中

| 侧 | 变更 |
|----|------|
| **Main** | 完全重构：增加图片就绪检查 → 若未就绪则轮询 FastAPI；`startReading` 提取为独立函数；增加 `blocking`/`pendingStoryId` 状态；删除 `MealReminderModal` |
| **Feature** | 仅删除 `MealReminderModal`，简化 init 流程 |

**建议策略：取 Main 版本**
- Main 是 Feature 的超集——两侧都删了 `MealReminderModal`
- Main 额外增加了图片就绪轮询，是更完善的方案
- 直接采用 Main 版本即可

---

### 6. `frontend/src/pages/noa/HomePage.tsx` — 难度：🔴 高

| 侧 | 变更 |
|----|------|
| **Main** | RegenModal 重构：故事类型提升到 `01` 位、原因降到 `04` 且可选；删除 title/note 字段；InlineFoodLog 增加 `foodName` 字段 + 录音功能（MediaRecorder）；`normalizePreview()` 助手函数；`useTTS` hook 反馈文字朗读；`showFoodLogPanel` 替代 `showFoodLogModal`；反馈文字气泡移到角色上方；绘本预览用 `normalizePreview`；删除 `Sparkle` 标签；`book: ... \| null` 类型修改；SVG preview 轮询（60 次）；State A 改为空状态 CTA；进食记录不触发绘本生成 |
| **Feature** | 删除 `InlineFoodLog` → 改用 `FoodLogModal` from `PostReadingModal`；删除 `useMemo`；增加 SVG preview 轮询（20 次）；`readCompleted` 控制"记录进食"按钮可见性；`generateError` 错误处理 + State A 错误/空状态显示；`WarningCircle` 图标 |

**建议策略：以 Main 为基底，叠加 Feature 的关键功能**
1. 取 Main 的 RegenModal 重构（故事类型优先、原因可选）
2. 取 Main 的 InlineFoodLog 增强（foodName、录音）
3. 取 Main 的 `normalizePreview`、`useTTS` 反馈朗读、气泡移位
4. 从 Feature 合入：
   - `generateError` 错误处理（`setGenerateError` 状态 + State A 错误显示）
   - SVG preview 轮询逻辑（保留，与 Main 的版本相似但取 Main 的 60 次上限）
   - `readCompleted` 按钮显示逻辑
   - `FoodLogModal` 组件引用改为 Feature 的 `PostReadingModal`
5. 注意：两侧对 State A 区域改动最大。Main 改为 InlineFoodLog 面板切换，Feature 改为 CTA + 错误状态。需要决定取哪套 UX。

**推荐：State A 面板取 Main 的设计（InlineFoodLog 内联），但 `showFoodLogPanel` 改用 Feature 的 FoodLogModal（弹窗式）。两者可共存：内联面板 + 弹窗均可触发。**

---

### 7. `user-api/src/index.ts` — 难度：🔴 高

| 侧 | 变更 |
|----|------|
| **Main** | `multer` 文件上传；`getLatestCompletedReadingForUser` 查询；`isPlaceholderPreview()` / `extractStoryId()` / `resolvePreviewFromBackend()` 助手函数；`triggerAutoBookGeneration()`（阅读完成后自动生成下一本）；Food log 增加 `foodName`/`relatedBookID`/`relatedReadingSessionID`/`relatedReadingEndedAt`；Food log 不再触发绘本生成；`/api/voice/transcribe` 改为真实 multer 上传转发；`/api/reading/log` 增加自动生成触发 |
| **Feature** | `pollCoverAndUpdate()` / `pollCoverAndUpdateHistory()` 封面轮询函数；`updateTempBookCover` / `updateHistoryBookCover` DB 函数导入；`generateTempBookForUser` 增加 `age` / `customPrompt` 参数；管理员建号时可选生成绘本（`/api/admin/users` 扩展）；`/api/home/status` 增加 `generateError` + `readCompleted` + 历史封面 content 提取；Food log `.then()` 增加封面轮询；`/api/book/confirm` 增加后端 draft 拉取 + 封面轮询；`/api/book/regenerate` 增加封面轮询；`/api/books/history` 增加 content 封面提取；空 CSV 表头处理 |

**建议策略：逐区域合并**

| 区域 | 取谁 | 说明 |
|------|------|------|
| imports & helpers | 合并 | Main 的 `multer` + Feature 的 `pollCover*` + `updateTempBookCover` 等 |
| `resolvePreviewFromBackend` vs `pollCoverAndUpdate` | 都保留 | 功能不同：前者是请求时同步解析，后者是 fire-and-forget 异步轮询 |
| `generateTempBookForUser` 参数 | Feature | `age` + `customPrompt` |
| `triggerAutoBookGeneration` | Main | 阅读完成后自动生成（Feature 没有此功能） |
| `/api/admin/users` | Feature | 管理员建号生成绘本 |
| `/api/home/status` | 合并 | Main 的 `resolvePreviewFromBackend` 同步解析 + Feature 的 `generateError`/`readCompleted`/content 提取 |
| `/api/food/log` | 合并 | Main 的 `foodName`/`latestReading` + Feature 的 `.then(pollCover)` + `setGenerateError` |
| `/api/book/confirm` | Feature | 后端 draft 拉取 + 封面轮询 |
| `/api/book/regenerate` | Feature | 封面轮询 |
| `/api/voice/transcribe` | Main | multer 真实上传 |
| `/api/reading/log` | Main | 自动生成触发 |
| `/api/books/history` | Feature | content 封面提取 |
| CSV helpers | Feature | 空表头处理 |

---

## 非冲突文件（Main 独有，自动合入）

这些文件只有 Main 修改，Feature 未碰，git 会自动合入：
- `frontend/src/components/InteractionLayer.tsx`（删除 `autoRead` prop）
- `frontend/src/hooks/useTTS.ts`（可能有小改动）
- 新文件（如果有的话）

## 非冲突文件（Feature 独有，自动保留）

- `backend/image_gen.py`（新增 `generate_cover_image`）
- `frontend/src/types/story.ts`（`cover_image_url`）
- `user-api/src/db.ts`（`updateTempBookCover`/`updateHistoryBookCover`/`hasCompletedReading` 等）
- `e2e/reader.spec.ts`（封面页测试）
- 各种 E2E 测试文件

## 推荐合并顺序

1. **先合简单的后端文件**：`prompt.py` → `llm.py` → `story.py`
2. **合 `BookDetailPage.tsx`**：直接取 Main
3. **合 `user-api/src/index.ts`**：最大逻辑量，按上表逐区域
4. **合 `HomePage.tsx`**：UI 交互变化最大
5. **合 `Reader.tsx`**：逻辑最复杂（封面 + TTS 重构）
6. **最后跑 E2E 测试验证**

## 预估工作量

| 文件 | 预估时间 |
|------|----------|
| `prompt.py` | 2 分钟 |
| `llm.py` | 5 分钟 |
| `story.py` | 5 分钟 |
| `BookDetailPage.tsx` | 2 分钟（取 Main） |
| `index.ts` | 15-20 分钟 |
| `HomePage.tsx` | 15-20 分钟 |
| `Reader.tsx` | 15-20 分钟 |
| E2E 验证 + 修复 | 10-15 分钟 |
| **合计** | **~70-90 分钟** |

## 风险提示

1. **`InteractionLayer` prop 变更**：Main 删除了 `autoRead` prop，Feature 的 Reader 可能还在传递，合并后需确认
2. **`FeedbackModal` vs `PostReadingModal`**：Feature 拆分了 Modal，需确保 Main 不再引用旧的 `FeedbackModal`
3. **Food log 流程分歧**：Main 的进食记录不再触发绘本生成（改为阅读完成后自动触发），Feature 保留了进食→绘本的流程。需要产品决策
4. **`MealReminderModal` 已双侧删除**：确认无残留引用
5. **DB schema 变更**：Main 增加了 `food_name`、`related_book_id` 等字段，需要确认 migration 是否已包含
