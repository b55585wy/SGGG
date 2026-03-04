# 深度融合分析：noa_child × SGGG

## 一、当前问题诊断

当前的集成方式是**并排放置**——两套系统完全独立运行、零交互：

| 维度 | SGGS (taste-skill) | noa_child | 问题 |
|------|-------------------|-----------|------|
| 认证 | 不用localStorage 假认证 (useAuth) | JWT 真认证 (user-api) | 两套账号体系，用户要登录两次 |
| 儿童档案 | 不用前端本地存储 (useChildren) | 服务端 user_avatars 表 | 同一个孩子信息存两处 |
| 故事生成 | DeepSeek LLM 真生成 | `createBookPayload()` 占位符填充 | noa_child 的绘本是假的，不用 |
| 阅读体验 | 完整 Reader（交互/TTS/遥测） | BookDetailPage 纯文本展示 | noa_child 的阅读页是极简版 |
| 进食记录 | Generate 页面表单的一个字段，这样子整合，点击我要重新生成进入这个界面 | 独立 food_log 系统（评分+文本+语音）这个是注册后进入的初始界面，初始界面有点击重新生成 | 现在数据不互通，需要打通数据 |
| 路由守卫 | ProtectedRoute (localStorage) | RequireAuth (JWT) + RouteTracker | /noa 路由缺少 JWT 守卫 |

**核心矛盾**：noa_child 有完整的用户管理+进食记录+绘本确认流程，但绘本是假的；SGGG 有真正的 AI 绘本生成+丰富阅读器，但缺少用户管理。它们是同一个产品的两个半边。

---

## 二、目标用户流程（融合后）

```
[/noa/login JWT 登录]
        │
        ├── firstLogin=true ──→ [/noa/avatar 创建虚拟形象]
        │                               │
        └── firstLogin=false ───────────┤
                                        ▼
                              [/noa/home 主页面] ← 这是注册后的初始界面
                              ┌─────────────────────────────────────┐
                              │ 左栏: 虚拟形象 + 进食记录表单        │
                              │   score(0-10) + content + 语音      │
                              │       │                             │
                              │       ▼ 提交进食记录                 │
                              │   POST food/log                     │
                              │     → 存入 user_food_logs           │
                              │     → 异步调用 FastAPI 生成绘本      │
                              │       (用 avatar 信息 + food_log)    │
                              │                                     │
                              │ 右栏: 绘本封面卡片                   │
                              │   ├── 点击封面 → /reader 完整阅读器  │
                              │   ├── [确认] → 存入 history_books   │
                              │   └── [我要重新生成] ──────┐        │
                              └────────────────────────────┼────────┘
                                                           │
                                                           ▼
                              [/noa/books/create 故事配置页面]
                              ┌─────────────────────────────────────┐
                              │ 整合 Generate 页面的配置字段:        │
                              │   · 标题建议 (可选)                  │
                              │   · 补充要求/不满意原因              │
                              │   · 故事类型 (可选覆盖)              │
                              │   · 难度 / 页数 / 交互密度 (可选)    │
                              │                                     │
                              │ 提交 → user-api 调用 FastAPI         │
                              │   POST /api/v1/story/regenerate     │
                              │   → 回到 /noa/home 显示新绘本        │
                              └─────────────────────────────────────┘

废弃的旧路由（不再使用）:
  /login, /register   ← 被 /noa/login 替代 (JWT)
  / (Generate)        ← 其配置表单整合进 /noa/books/create
  /preview            ← 绘本预览整合在 /noa/home 右栏
  不用 useAuth, useChildren (localStorage 假认证和本地存储)
  保留 /reader        ← 被 /noa/home 点击封面跳转使用
```

---

## 三、融合步骤（共 5 步）

> **前提**：不用 localStorage 假认证、不用 useChildren 本地存储、不用 createBookPayload 假绘本。
> 旧路由 `/login`, `/register`, `/` (Generate), `/preview` 废弃，`/reader` 保留供跳转。

---

### 步骤 1：清理旧路由 + JWT 守卫

**做什么**：
1. main.tsx 中删除旧的 taste-skill 路由（`/login`, `/register`, `/`, `/preview`）
2. 保留 `/reader`（供 BookDetailPage 跳转）
3. 为 `/noa/*` 路由添加 JWT 守卫和路径追踪
4. 根路由 `/` 重定向到 `/noa/login`

**伪代码**：

```
// 新建 frontend/src/pages/noa/NcRequireAuth.tsx

function NcRequireAuth({ children }) {
  token = auth.getToken()                  // 读 localStorage 的 noa_child_token
  if (!token) return <Navigate to="/noa/login" />
  return children
}
```

```
// 新建 frontend/src/pages/noa/NcRouteTracker.tsx

function NcRouteTracker({ children }) {
  location = useLocation()
  useEffect(() => {
    sessionStorage.setItem('lastPath', location.pathname)
  }, [location.pathname])
  return children
}
```

```
// main.tsx — 重写路由

<BrowserRouter>
  <NcRouteTracker>
    <Routes>
      {/* 入口重定向 */}
      <Route path="/" element={<Navigate to="/noa/login" replace />} />

      {/* noa_child 路由 */}
      <Route path="/noa/login"          element={<NcLoginPage />} />
      <Route path="/noa/admin/users"    element={<AdminUsersPage />} />
      <Route path="/noa/avatar"         element={<NcRequireAuth><AvatarPage /></NcRequireAuth>} />
      <Route path="/noa/home"           element={<NcRequireAuth><NcHomePage /></NcRequireAuth>} />
      <Route path="/noa/books/create"   element={<NcRequireAuth><BookCreatePage /></NcRequireAuth>} />
      <Route path="/noa/books/history"  element={<NcRequireAuth><BookHistoryPage /></NcRequireAuth>} />
      <Route path="/noa/books/:bookId"  element={<NcRequireAuth><BookDetailPage /></NcRequireAuth>} />

      {/* 保留 Reader — BookDetailPage 跳转到这里 */}
      <Route path="/reader"             element={<NcRequireAuth><ReaderPage /></NcRequireAuth>} />

      {/* 兜底 */}
      <Route path="*" element={<Navigate to="/noa/login" replace />} />
    </Routes>
  </NcRouteTracker>
</BrowserRouter>
```

**删除的文件/import**（不再引用）：
- `import LoginPage from './pages/Login'` — 删
- `import RegisterPage from './pages/Register'` — 删
- `import GeneratePage from './pages/Generate'` — 删
- `import PreviewPage from './pages/Preview'` — 删
- `import ProtectedRoute from './components/ProtectedRoute'` — 删

**影响范围**：新建 2 个小组件，重写 main.tsx 路由表。

---

### 步骤 2：对接 DeepSeek — user-api 调用 FastAPI 生成真绘本

**做什么**：改写 `user-api/src/index.ts` 中的 `generateTempBookForUser()`，从写死占位符改为调用 FastAPI。

**当前**（假的）：
```
createBookPayload() → 写死 title + 2 行文字
```

**改为**（真的）：
```
// user-api/src/index.ts

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000'

async function generateTempBookForUser(params) {
  // params: { userID, nickname, gender, themeFood, mealScore, mealContent, regenerateCount, promptTitle?, promptNote? }

  // 1. 构建 FastAPI GenerateRequest (参照 backend/models.py)
  requestBody = {
    child_profile: {
      nickname: params.nickname,
      age: 5,                          // 默认值（user_avatars 暂无 age 字段）
      gender: params.gender,           // "male" | "female"
    },
    meal_context: {
      target_food: params.themeFood,
      meal_score: mapScore(params.mealScore),  // 0-10 → 1-5
      meal_text: params.mealContent || "",
    },
    story_config: {
      story_type: "interactive",
      difficulty: "medium",
      pages: 6,
      interactive_density: "medium",
      language: "zh-CN",
    },
  }

  // 2. HTTP 调用 FastAPI
  response = await fetch(`${FASTAPI_URL}/api/v1/story/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) throw new Error('FastAPI story/generate failed')
  data = await response.json()
  // data = { draft: { story_id, book_meta, pages[], ending, ... } }

  draft = data.draft

  // 3. 存入 temp_books（story_id 作为 bookID）
  await saveTempBook({
    userID: params.userID,
    bookID: draft.story_id,
    title: draft.book_meta.title,
    preview: createBookPreviewImage(draft.book_meta.title),  // 保留 SVG 封面
    description: draft.book_meta.summary,
    content: JSON.stringify(draft),    // 完整 story JSON 存这里
    regenerateCount: params.regenerateCount,
  })
}

// 分数映射：user-api 0-10 → FastAPI 1-5
function mapScore(score: number): number {
  if (score <= 0) return 1
  if (score <= 2) return 1
  if (score <= 4) return 2
  if (score <= 6) return 3
  if (score <= 8) return 4
  return 5
}
```

**同时改写 `/api/book/regenerate` 端点**：
```
// user-api/src/index.ts — POST /api/book/regenerate

// 当前：调用 generateTempBookForUser() (假的)
// 改为：调用 FastAPI /api/v1/story/regenerate

app.post("/api/book/regenerate", authRequired, async (req, res) => {
  tempBook = await getTempBook(userID)
  if (!tempBook) → 404
  if (tempBook.regenerateCount >= 2) → 400

  avatar = await getUserAvatar(userID)

  // tempBook.bookID 就是 FastAPI 的 story_id
  regenBody = {
    previous_story_id: tempBook.bookID,
    target_food: avatar.themeFood,
    story_type: "interactive",
    dissatisfaction_reason: req.body.note || "用户要求重新生成",
  }

  response = await fetch(`${FASTAPI_URL}/api/v1/story/regenerate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(regenBody),
  })

  data = await response.json()
  draft = data.draft

  await saveTempBook({
    userID,
    bookID: draft.story_id,
    title: draft.book_meta.title,
    preview: createBookPreviewImage(draft.book_meta.title),
    description: draft.book_meta.summary,
    content: JSON.stringify(draft),
    regenerateCount: tempBook.regenerateCount + 1,
  })

  // 返回给前端
  res.json({ ok: true, book: { ... } })
})
```

**新增 `.env` 配置**：
```
# user-api/.env
FASTAPI_URL=http://localhost:8000
```

**删除**：`createBookPayload()` 函数。

**影响范围**：只改 `user-api/src/index.ts` 和 `.env`，不改 FastAPI 代码。

---

### 步骤 3：进食记录驱动首次绘本生成

**做什么**：提交 food/log 后，用进食数据 + avatar 信息调用 DeepSeek 异步生成绘本。

**当前**：food/log 只存数据 + 返回写死反馈语 + 调用假的 generateTempBookForUser()
**改为**：传入真实 mealScore/mealContent → 调用步骤 2 中改造后的 generateTempBookForUser()

**伪代码**：

```
// user-api/src/index.ts — POST /api/food/log

app.post("/api/food/log", authRequired, async (req, res) => {
  // ... 验证 score, content 不变 ...
  await insertFoodLog({ userID, score, content, voiceData })

  // 生成分级反馈语（替换写死的）
  feedbackText = score >= 8 ? "哇，你今天表现太棒了！"
               : score >= 5 ? "很好的尝试，继续加油！"
               : "没关系，每一小步都是进步。"
  await insertAvatarState({ userID, feedbackText })

  // 异步触发真绘本生成（不阻塞响应）
  avatar = await getUserAvatar(userID)
  if (avatar) {
    generateTempBookForUser({
      userID,
      nickname: avatar.nickname,
      gender: avatar.gender,           // ← 新增，传给 child_profile
      themeFood: avatar.themeFood,
      mealScore: score,                // ← 新增，传给 meal_context
      mealContent: content,            // ← 新增，传给 meal_context
      regenerateCount: 0,
    }).catch(err => console.error('[BOOK] 绘本生成失败:', err))
  }

  res.json({ ok: true, feedbackText })
})
```

**前端行为**（不用改代码）：
1. 用户在 `/noa/home` 提交进食记录
2. 立即得到 feedbackText 显示在左栏
3. 后台 DeepSeek 生成绘本（约 5-15 秒）
4. 用户下次 `loadStatus()` 或刷新时，右栏显示真实绘本卡片

**影响范围**：只改 user-api/src/index.ts 中的 food/log 处理。

---

### 步骤 4：BookDetailPage 对接 Reader 阅读器

**做什么**：点击绘本封面后，创建阅读 session，跳转到完整的 `/reader`。

**当前**：BookDetailPage 只是纯文本展示
**改为**：解析 content 中的 story_id → 创建 session → 跳转 Reader

**伪代码**：

```
// frontend/src/pages/noa/BookDetailPage.tsx — 改写

function BookDetailPage() {
  { bookId } = useParams()
  navigate = useNavigate()
  [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      // 1. 从 user-api 获取绘本详情
      data = await ncApi.getJson(`/api/books/${bookId}`)
      book = data.book

      // 2. 解析 content 中的 story JSON
      draft = JSON.parse(book.content)
      storyId = draft.story_id

      // 3. 调用 FastAPI 创建阅读 session
      //    注意：这里直接调 /api/v1 (FastAPI)，不经 ncApi
      sessionToken = crypto.randomUUID()        // 幂等键
      sessionRes = await fetch('/api/v1/session/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          story_id: storyId,
          client_session_token: sessionToken,
          child_id: getCurrentUserID(),          // 从 JWT 解析 or 从 ncApi 获取
        }),
      })
      sessionData = await sessionRes.json()

      // 4. 存入 localStorage（Reader 从这里读取）
      localStorage.setItem('currentDraft', JSON.stringify(draft))
      localStorage.setItem('currentSessionId', sessionData.session_id)
      localStorage.setItem('sessionIndex', sessionData.session_index)

      // 5. 跳转 Reader
      navigate('/reader', { replace: true })
    }
    init()
  }, [bookId])

  return <div>正在准备阅读...</div>
}
```

**需要确认**：Reader.tsx 当前从 localStorage 读哪些 key？
→ 需要对齐 key 名，确保 Reader 能正确读取 draft + sessionId。

**影响范围**：重写 BookDetailPage.tsx，Reader.tsx 可能需要微调 localStorage key 名。

---

### 步骤 5：扩展 BookCreatePage 为故事配置页面

**做什么**：把 Generate 页面中有用的故事配置选项（故事类型、难度、页数、交互密度）整合到 `/noa/books/create`，让用户"重新生成"时能自定义。

**当前**：BookCreatePage 只有 title + note 两个字段
**改为**：增加从 Generate 页面提取的配置选项

**伪代码**：

```
// frontend/src/pages/noa/BookCreatePage.tsx — 扩展表单

function BookCreatePage() {
  // 现有字段
  [title, setTitle] = useState('')
  [note, setNote] = useState('')

  // 新增：从 Generate 页面提取的故事配置
  [storyType, setStoryType] = useState('interactive')
  // 可选值: "interactive" | "adventure" | "social" | "sensory" 等
  [difficulty, setDifficulty] = useState('medium')
  [pages, setPages] = useState(6)
  [interactionDensity, setInteractionDensity] = useState('medium')

  async function onSubmit() {
    // POST /api/user/book/regenerate
    // 把新增的配置也传过去
    await ncApi.postJson('/api/book/regenerate', {
      title: title.trim(),
      note: note.trim(),
      // 新增
      story_type: storyType,
      difficulty,
      pages,
      interaction_density: interactionDensity,
    })
    navigate('/noa/home', { replace: true })
  }

  // UI: 在原有 title + note 下方新增配置区域
  return (
    <div>
      {/* 现有: 标题建议 + 补充要求 */}
      ...

      {/* 新增: 故事配置（可折叠的"高级选项"） */}
      <details>
        <summary>高级故事配置</summary>
        <select value={storyType}>
          <option value="interactive">互动冒险</option>
          <option value="adventure">探险故事</option>
          <option value="social">社交故事</option>
          <option value="sensory">感官体验</option>
        </select>
        <select value={difficulty}>
          <option value="easy">简单</option>
          <option value="medium">中等</option>
          <option value="hard">困难</option>
        </select>
        <input type="range" min={4} max={12} value={pages} />
        <select value={interactionDensity}>
          <option value="low">低</option>
          <option value="medium">中</option>
          <option value="high">高</option>
        </select>
      </details>
    </div>
  )
}
```

**user-api 侧**：`/api/book/regenerate` 需要把这些新字段转发给 FastAPI：
```
// user-api/src/index.ts — POST /api/book/regenerate 扩展

regenBody = {
  previous_story_id: tempBook.bookID,
  target_food: avatar.themeFood,
  story_type: req.body.story_type || "interactive",     // ← 新增
  dissatisfaction_reason: req.body.note || "用户要求重新生成",
}
```

**影响范围**：改 BookCreatePage.tsx 的 UI + user-api 的 regenerate 端点。

---

## 四、执行优先级

| 优先级 | 步骤 | 难度 | 说明 |
|--------|------|------|------|
| P0 | 步骤 1：清理旧路由 + JWT 守卫 | 低 | 必须先做——统一入口，废弃假认证 |
| P0 | 步骤 2：对接 DeepSeek 生成 | 中 | 核心——否则绘本是假的 |
| P0 | 步骤 3：进食记录驱动生成 | 低 | 步骤 2 的自然延伸，改几行参数传递 |
| P1 | 步骤 4：对接 Reader 阅读器 | 中 | 重要——否则无法真正阅读绘本 |
| P2 | 步骤 5：扩展故事配置页面 | 低 | 增强——让"重新生成"更灵活 |

---

## 五、不改动 / 废弃的部分

**不改动**：
- `backend/*` 全部 Python 代码（user-api 通过 HTTP 调用，不改 FastAPI）
- `frontend/src/pages/Reader.tsx`（被 BookDetailPage 跳转使用，逻辑不变）
- `frontend/src/types/*` 类型定义
- `frontend/src/components/InteractionLayer.tsx`, `FeedbackModal.tsx`, `SUSModal.tsx` 等
- `frontend/src/hooks/useSession.ts`, `useTelemetry.ts`（Reader 内部用）
- 根目录所有 `.md` 设计文档

**废弃（可删除）**：
- `frontend/src/pages/Login.tsx` — 被 `/noa/login` 替代
- `frontend/src/pages/Register.tsx` — 被 `/noa/login` 替代
- `frontend/src/pages/Generate.tsx` — 配置表单整合进 BookCreatePage
- `frontend/src/pages/Preview.tsx` — 预览整合在 `/noa/home` 右栏
- `frontend/src/components/ProtectedRoute.tsx` — 被 NcRequireAuth 替代
- `frontend/src/hooks/useAuth.ts` — 被 `lib/auth.ts` (JWT) 替代
- `frontend/src/hooks/useChildren.ts` — 被 user_avatars 服务端替代
