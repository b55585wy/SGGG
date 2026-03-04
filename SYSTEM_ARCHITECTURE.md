# SGGG 系统架构与数据流全览

## 一、三服务架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        浏览器 (localhost:5173)                       │
│                                                                     │
│  ┌──────────────────────────┐   ┌──────────────────────────────┐   │
│  │    taste-skill 路由       │   │       noa_child 路由          │   │
│  │  /login  /register       │   │  /noa/login  /noa/avatar     │   │
│  │  /  (Generate)           │   │  /noa/home                   │   │
│  │  /preview                │   │  /noa/books/create           │   │
│  │  /reader                 │   │  /noa/books/history          │   │
│  │                          │   │  /noa/books/:bookId          │   │
│  │  认证: localStorage 假   │   │  /noa/admin/users            │   │
│  │  API:  src/lib/api.ts    │   │                              │   │
│  │        → /api/v1/*       │   │  认证: JWT (noa_child_token) │   │
│  │                          │   │  API:  src/lib/ncApi.ts      │   │
│  │                          │   │        → /api/user/*         │   │
│  └────────────┬─────────────┘   └──────────────┬───────────────┘   │
│               │                                │                    │
└───────────────┼────────────────────────────────┼────────────────────┘
                │                                │
         Vite Proxy                       Vite Proxy
         /api/v1/* →                      /api/user/* →
         直通                             rewrite 去掉 /user
                │                                │
                ▼                                ▼
┌──────────────────────────┐   ┌──────────────────────────────┐
│   backend (FastAPI)       │   │   user-api (Express)          │
│   Python · port 8000      │   │   Node.js · port 3001         │
│                           │   │                               │
│   DB: storybook.db        │   │   DB: data/db.sqlite          │
│   (SQLite)                │   │   (sql.js)                    │
│                           │   │                               │
│   外部依赖:               │   │   外部依赖:                   │
│   · DeepSeek LLM          │   │   · 无                        │
│   · DashScope 图片生成     │   │                               │
│   · DashScope TTS          │   │                               │
└──────────────────────────┘   └──────────────────────────────┘
     两个后端之间零通信 ← ← ← ← ← 这是核心问题
```

---

## 二、后端 API 端点清单

### backend (FastAPI, port 8000)

```
GET  /health

POST /api/v1/story/generate      ← 输入: child_profile + meal_context + story_config
                                    输出: { draft: { story_id, book_meta, pages[], ending } }
                                    副作用: 后台线程异步生成图片

POST /api/v1/story/regenerate    ← 输入: previous_story_id + dissatisfaction_reason
                                    输出: { draft: ... }
                                    限制: 每个故事最多重新生成 2 次

GET  /api/v1/story/{story_id}    ← 输出: { draft: ... }  (含图片 URL，前端轮询用)

POST /api/v1/session/start       ← 输入: story_id + client_session_token + child_id?
                                    输出: { session_id, status, session_index }

POST /api/v1/telemetry/report    ← 输入: events[]  (批量遥测事件，按 event_id 去重)

POST /api/v1/feedback/submit     ← 输入: session_id + status(COMPLETED|ABORTED) + ...

POST /api/v1/sus/submit          ← 输入: session_id + answers[10]  (SUS 问卷)

POST /api/v1/tts                 ← 输入: text + voice  → 输出: audio/mpeg

GET  /api/v1/export/child/{id}   ← 输出: CSV 导出
```

### user-api (Express, port 3001)

```
GET  /api/health

POST /api/auth/login             ← 输入: userID + password
                                    输出: { token, user, firstLogin }

GET  /api/auth/me                ← 输出: { user: { userID } }

POST /api/admin/users            ← (需 x-admin-key) 创建用户
GET  /api/admin/users            ← (需 x-admin-key) 用户列表
DEL  /api/admin/users/:userID    ← (需 x-admin-key) 删除用户

GET  /api/avatar/base            ← 输出: base SVG data URI
GET  /api/avatar/options         ← 输出: { hair[], glasses[], topColors[], bottomColors[] }
GET  /api/avatar/component       ← 输出: 单个组件 SVG
POST /api/avatar/save            ← (需 JWT) 保存虚拟形象

GET  /api/home/status            ← (需 JWT) 主页状态（形象+绘本+反馈）
POST /api/food/log               ← (需 JWT) 提交进食记录
POST /api/book/confirm           ← (需 JWT) 确认绘本 → 存入 history
POST /api/book/regenerate        ← (需 JWT) 重新生成绘本 (上限 2 次)

GET  /api/books/history          ← (需 JWT) 历史绘本列表
GET  /api/books/:bookId          ← (需 JWT) 绘本详情

POST /api/voice/transcribe       ← (存根) 返回占位文本
```

---

## 三、数据库 Schema 对比

### storybook.db (FastAPI)

```
stories
├── story_id        TEXT PK        ← "st_" + uuid
├── parent_story_id TEXT           ← 重新生成时指向原 story
├── child_id        TEXT           ← 可选
├── regen_count     INT            ← 0-2
├── story_json      TEXT           ← 完整 JSON (book_meta + pages + ending)
└── created_at      TEXT

sessions
├── session_id           TEXT PK   ← "ss_" + uuid
├── story_id             TEXT
├── child_id             TEXT
├── session_index        INT       ← 该孩子第几次阅读 (0-based)
├── client_session_token TEXT      ← 幂等键
├── status               TEXT      ← READING | COMPLETED | ABORTED
└── created_at           TEXT
    UNIQUE(story_id, client_session_token)

telemetry_events
├── event_id     TEXT PK
├── session_id   TEXT
├── story_id     TEXT
├── page_id      TEXT
├── event_type   TEXT              ← page_view, interaction, branch_select...
├── payload      TEXT (JSON)
├── ts_client_ms INT
└── created_at   TEXT

feedback
├── session_id   TEXT UNIQUE
├── status       TEXT              ← COMPLETED | ABORTED
├── try_level    TEXT              ← 尝试等级
├── abort_reason TEXT
└── notes        TEXT

sus_responses
├── session_id TEXT UNIQUE
├── answers    TEXT (JSON)         ← [1-5] × 10
└── sus_score  REAL               ← 0-100
```

### data/db.sqlite (user-api)

```
users
├── user_id     TEXT PK
├── password    TEXT               ← 明文
└── first_login INT                ← 1=首次

user_avatars
├── user_id      TEXT PK
├── nickname     TEXT              ← ★ 与 FastAPI 的 child_profile.nickname 对应
├── gender       TEXT              ← ★ 与 child_profile.gender 对应
├── hair_style   TEXT
├── glasses      TEXT
├── top_color    TEXT
├── bottom_color TEXT
├── theme_food   TEXT DEFAULT '胡萝卜'  ← ★ 与 meal_context.target_food 对应
├── created_at   TEXT
└── updated_at   TEXT

user_food_logs
├── log_id     TEXT PK
├── user_id    TEXT
├── score      INT                 ← 0-10 ★ 与 meal_context.meal_score 对应 (量程不同)
├── content    TEXT                ← ★ 与 meal_context.meal_text 对应
├── voice_data TEXT
└── created_at TEXT

user_avatar_states
├── state_id      TEXT PK
├── user_id       TEXT
├── expression    TEXT
├── body_posture  TEXT
├── feedback_text TEXT             ← 写死的 "太棒了！你又进步了一点点。"
└── created_at    TEXT

temp_books
├── user_id          TEXT PK       ← 每用户一本
├── book_id          TEXT          ← ★ 应该 = story_id
├── title            TEXT          ← ★ 现在是写死的，应来自 LLM
├── preview          TEXT          ← SVG data URI
├── description      TEXT          ← ★ 现在是写死的，应来自 LLM
├── content          TEXT          ← ★ 现在是 2 页占位符，应是完整 story_json
├── regenerate_count INT
├── created_at       TEXT
└── updated_at       TEXT

history_books
├── book_id      TEXT PK           ← ★ = story_id
├── user_id      TEXT
├── title        TEXT
├── preview      TEXT
├── description  TEXT
├── content      TEXT              ← ★ 完整 story_json
└── confirmed_at TEXT
```

---

## 四、用户流程图（当前状态 — 两条平行线）

```
                    taste-skill 流程                              noa_child 流程
                    ─────────────                              ──────────────

                    /login                                     /noa/login
                    localStorage 存账号                         POST /api/auth/login
                         │                                          │
                         ▼                                          ▼
                    / (Generate)                               /noa/avatar (首次)
                    手动填写:                                   设置 nickname, gender
                    · 孩子昵称/年龄/性别                        保存到 user_avatars 表
                    · 目标食物                                       │
                    · 用餐评分(1-5)                                  ▼
                    · 用餐描述                                  /noa/home
                    · 故事配置                                  ┌────────────────────┐
                         │                                     │ 左栏: 虚拟形象      │
                         ▼                                     │   进食记录表单      │
            POST /api/v1/story/generate                        │   score(0-10)      │
              ┌─────────────────────┐                          │   content 文本     │
              │ DeepSeek LLM 真生成  │                          │       │            │
              │ → book_meta         │                          │       ▼            │
              │ → pages[]           │                          │  POST food/log     │
              │ → ending            │                          │  返回写死反馈语     │
              │ + 异步图片生成       │                          │                    │
              └──────────┬──────────┘                          │ 右栏: 绘本卡片      │
                         │                                     │   title=写死        │
                         ▼                                     │   content=2页占位   │
                    /preview                                   │   preview=SVG      │
                    查看故事摘要                                │       │            │
                    重新生成(上限2次)                            │  确认/重新生成      │
                    "开始阅读"按钮                              └────────┬───────────┘
                         │                                              │
                         ▼                                              ▼
                    /reader                                    /noa/books/:bookId
                    ┌─────────────────────┐                    ┌──────────────────┐
                    │ 完整阅读体验:        │                    │ 纯文本展示:       │
                    │ · 翻页 + 进度条      │                    │ · 标题            │
                    │ · 插图展示           │                    │ · 2 行占位文字     │
                    │ · 6 种交互类型       │                    │ · 无交互           │
                    │ · TTS 语音朗读       │                    │ · 无 TTS           │
                    │ · 遥测事件采集       │                    │ · 无遥测           │
                    │ · 反馈问卷           │                    └──────────────────┘
                    │ · SUS 可用性量表     │
                    └─────────────────────┘

                         ↑↓ 零交互 ↑↓
```

---

## 五、融合后目标流程图

```
                              统一流程
                              ────────

                         /noa/login
                         POST /api/auth/login → JWT
                              │
                    ┌─────────┴─────────────┐
                    │ firstLogin=true        │ firstLogin=false
                    ▼                        ▼
               /noa/avatar              /noa/home
               设置形象:                      │
               nickname ─────────┐            │
               gender ──────────┐│            │
               themeFood ──────┐││            │
                    │          │││            │
                    ▼          │││            │
               /noa/home       │││            │
                               │││            │
              ┌────────────────┴┴┴────────────┴─────────────────┐
              │                     主页面                       │
              │                                                  │
              │  左栏: 虚拟形象 + 进食记录                        │
              │    用户提交 food/log (score + content)            │
              │         │                                        │
              │         ▼                                        │
              │  ┌─ user-api ──────────────────────────────┐     │
              │  │  1. insertFoodLog()          存入DB      │     │
              │  │  2. insertAvatarState()      更新反馈语  │     │
              │  │  3. 异步调用 FastAPI ↓↓↓               │     │
              │  │         │                               │     │
              │  │         ▼                               │     │
              │  │  ┌─ backend (FastAPI) ────────────────┐ │     │
              │  │  │  POST /api/v1/story/generate       │ │     │
              │  │  │  输入:                              │ │     │
              │  │  │    child_profile:                   │ │     │
              │  │  │      nickname ← user_avatars       │ │     │
              │  │  │      gender   ← user_avatars       │ │     │
              │  │  │      age      ← 默认5              │ │     │
              │  │  │    meal_context:                    │ │     │
              │  │  │      target_food ← theme_food      │ │     │
              │  │  │      meal_score  ← food_log.score  │ │     │
              │  │  │      meal_text   ← food_log.content│ │     │
              │  │  │    story_config:                    │ │     │
              │  │  │      story_type: "interactive"      │ │     │
              │  │  │      pages: 6                       │ │     │
              │  │  │      ...                            │ │     │
              │  │  │                                     │ │     │
              │  │  │  DeepSeek LLM → 故事 JSON           │ │     │
              │  │  │  DashScope  → 异步生成图片           │ │     │
              │  │  │                                     │ │     │
              │  │  │  返回: { draft: { story_id,         │ │     │
              │  │  │    book_meta, pages[], ending } }    │ │     │
              │  │  └─────────────────────────────────────┘ │     │
              │  │         │                               │     │
              │  │         ▼                               │     │
              │  │  4. saveTempBook({                      │     │
              │  │       bookID: story_id,                 │     │
              │  │       title: book_meta.title,           │     │
              │  │       content: JSON(整个 draft),        │     │
              │  │     })                                  │     │
              │  └─────────────────────────────────────────┘     │
              │                                                  │
              │  右栏: 绘本卡片                                   │
              │    显示 LLM 生成的真实标题和摘要                    │
              │    ┌──────────┐  ┌────────────┐                  │
              │    │  确认     │  │ 重新生成(2次) │                  │
              │    └────┬─────┘  └─────┬──────┘                  │
              │         │              │                          │
              │         │        POST /api/v1/story/regenerate   │
              │         │              │                          │
              │         ▼              ▼                          │
              │    addHistoryBook()   更新 temp_books             │
              └──────────────────────────────────────────────────┘
                               │
                    点击绘本卡片 │
                               ▼
                    ┌────────── 两种方案 ──────────┐
                    │                              │
              方案 A: 跳转                    方案 B: 直接渲染
              BookDetailPage                  在 /noa/books/:id
              自动创建 session                路由中渲染 ReaderPage
              navigate('/reader')
                    │                              │
                    └──────────────┬───────────────┘
                                  ▼
                         /reader (现有完整阅读器)
                         · 翻页 + 插图(含轮询)
                         · 6 种交互类型
                         · TTS 语音朗读
                         · 遥测事件采集
                         · 反馈问卷
                         · SUS 可用性量表
```

---

## 六、关键字段映射表

从 user-api 调用 FastAPI 时，字段如何对应：

```
user-api 数据源                    FastAPI GenerateRequest 字段
──────────────                    ──────────────────────────

user_avatars.nickname         →   child_profile.nickname
user_avatars.gender           →   child_profile.gender
(缺少 age，需新增或默认值)      →   child_profile.age = 5
user_avatars.theme_food       →   meal_context.target_food

user_food_logs.score (0-10)   →   meal_context.meal_score (1-5)
                                   需要映射: Math.round(score / 2) 或 Math.ceil(score / 2)
                                   0→1, 1-2→1, 3-4→2, 5-6→3, 7-8→4, 9-10→5

user_food_logs.content        →   meal_context.meal_text

(无)                          →   story_config.story_type = "interactive"
(无)                          →   story_config.difficulty = "medium"
(无)                          →   story_config.pages = 6
(无)                          →   story_config.interactive_density = "medium"

temp_books.regenerate_count   →   确定是否调用 /regenerate 还是 /generate
BookCreatePage 的 note        →   RegenerateRequest.dissatisfaction_reason
```

---

## 七、需要修改的文件清单

```
修改文件                              改什么                               属于哪个服务
─────                               ─────                               ─────────

user-api/src/index.ts               generateTempBookForUser() 改为       user-api
                                    调用 FastAPI /api/v1/story/generate
                                    而不是 createBookPayload() 写死

user-api/src/index.ts               POST /api/food/log 处理中            user-api
                                    生成更有意义的 feedbackText
                                    (可选: 根据 score 分级)

user-api/.env.example               新增 FASTAPI_URL=http://localhost:8000  user-api

frontend/src/main.tsx               /noa 路由包裹 NcRequireAuth           frontend
frontend/src/pages/noa/NcRequireAuth.tsx  新建 JWT 守卫组件               frontend
frontend/src/pages/noa/NcRouteTracker.tsx 新建路径追踪组件                 frontend

frontend/src/pages/noa/BookDetailPage.tsx                                frontend
                                    方案A: 创建 session → 跳 /reader
                                    方案B: 直接渲染 Reader 组件

backend/*                           不改                                  backend
frontend/src/pages/Generate.tsx     不改 (可选: 读取 avatar 自动填充)      frontend
frontend/src/pages/Reader.tsx       不改                                  frontend
frontend/src/pages/Preview.tsx      不改                                  frontend
frontend/src/components/*           不改                                  frontend
frontend/src/hooks/*                不改                                  frontend
frontend/src/lib/api.ts             不改                                  frontend
```

---

## 八、调用链路图（融合后关键场景）

### 场景 1: 提交进食记录 → 自动生成绘本

```
浏览器                     user-api (3001)              backend (8000)         外部服务
──────                     ──────────────              ───────────────        ────────

POST /api/user/food/log
  { score: 7, content: "今天尝了一口胡萝卜" }
        │
        │  Vite proxy rewrite
        │  /api/user/food/log → /api/food/log
        ▼
        ├─→ insertFoodLog()
        ├─→ insertAvatarState({ feedbackText })
        ├─→ res.json({ ok, feedbackText })  ←── 立即返回给前端
        │
        └─→ (异步) generateTempBookForUser()
                    │
                    ├─→ getUserAvatar() → { nickname, gender, themeFood }
                    ├─→ 构建 GenerateRequest
                    │
                    ├─→ POST http://localhost:8000/api/v1/story/generate
                    │         │
                    │         ├─→ DeepSeek API ──→ LLM 生成故事 JSON
                    │         ├─→ 存入 storybook.db
                    │         ├─→ (后台线程) DashScope ──→ 生成图片
                    │         └─→ 返回 { draft: { story_id, ... } }
                    │
                    └─→ saveTempBook({
                          bookID: draft.story_id,
                          title:  draft.book_meta.title,
                          content: JSON.stringify(draft),
                        })
```

### 场景 2: 阅读绘本（对接 Reader）

```
浏览器                     user-api (3001)              backend (8000)
──────                     ──────────────              ───────────────

GET /noa/books/:bookId (BookDetailPage)
        │
        ├─→ GET /api/user/books/:bookId
        │         → 返回 { book: { bookID, content(=draft JSON) } }
        │
        ├─→ 解析 content → draft.story_id
        │
        ├─→ POST /api/v1/session/start
        │     { story_id, client_session_token, child_id: userID }
        │         → 返回 { session_id, session_index }
        │
        ├─→ 存 localStorage: currentStoryId, currentSessionId
        │
        └─→ navigate('/reader')
                    │
                    ├─→ GET /api/v1/story/{story_id}  (轮询图片)
                    ├─→ 交互事件 → POST /api/v1/telemetry/report
                    ├─→ TTS → POST /api/v1/tts
                    ├─→ 完成/中止 → POST /api/v1/feedback/submit
                    └─→ 第 9 次 → POST /api/v1/sus/submit
```

### 场景 3: 重新生成绘本

```
浏览器                     user-api (3001)              backend (8000)
──────                     ──────────────              ───────────────

/noa/books/create 页面
用户输入: title建议 + note补充
        │
        ├─→ POST /api/user/book/regenerate
        │     { title, note }
        │         │
        │         ├─→ getTempBook() → { bookID (= story_id) }
        │         ├─→ 检查 regenerateCount < 2
        │         │
        │         ├─→ POST http://localhost:8000/api/v1/story/regenerate
        │         │     { previous_story_id: bookID,
        │         │       dissatisfaction_reason: note,
        │         │       target_food: avatar.themeFood,
        │         │       story_type: "interactive" }
        │         │         │
        │         │         ├─→ DeepSeek 重新生成
        │         │         └─→ 返回新 { draft }
        │         │
        │         └─→ saveTempBook({ bookID: new_story_id, ... })
        │
        └─→ navigate('/noa/home')  → loadStatus() 显示新绘本
```
