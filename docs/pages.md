# 页面功能与接口说明

本文档按页面维度汇总：route、功能、相关 API 端点及示例请求/响应。

## 登录页

- **Route**：`/noa/login`
- **功能**：用户输入账号密码登录，登录成功后根据 `firstLogin` 跳转到 `/noa/avatar` 或 `/noa/home`。
- **布局**：两栏式。左侧装饰面板展示 `<h1>食育绘本</h1>` 及背景插图；右侧登录面板含 `欢迎回来` 提示语、`<h2>登录你的账号</h2>` 标题及表单。表单字段标签为"用户 ID"（含空格）。
- **关键实现**：`frontend/src/pages/noa/NcLoginPage.tsx`

**API**

- `POST /api/auth/login`
  - **Request**
    ```json
    { "userID": "demo", "password": "demo123" }
    ```
  - **Response 200**
    ```json
    { "token": "jwt-token", "user": { "userID": "demo" }, "firstLogin": true }
    ```
  - **Response 401**
    ```json
    { "message": "账号或密码错误" }
    ```

---

## 虚拟形象创建页

- **Route**：`/noa/avatar`
- **功能**：
  - 左侧预览：根据“性别/颜色/上衣/下装/眼镜”五个选项拼接图片文件名，直接展示预渲染好的完整 PNG（保持等比例缩放）
  - 右侧填写昵称、选择选项（中文展示），并使用英文值映射拼接图片名
  - 昵称必填；选项有默认值（`male + blue + short + short + no`）；提交后保存到数据库并跳转主页面
- **静态资源**：
  - basic：`/basic/{gender}_{color}_{shirt}_{underdress}_{glasses}.png`
  - emotion：`/emotion/emotion_{0|1|2|3}/{gender}_{color}_{shirt}_{underdress}_{glasses}_{0|1|2|3}.png`
- **关键实现**：`frontend/src/pages/noa/AvatarPage.tsx`

**API**

- `GET /api/avatar/current`
  - **Headers**：`Authorization: Bearer <token>`
  - **Response 200**
    ```json
    {
      "nickname": "小宇",
      "gender": "male",
      "color": "blue",
      "shirt": "short",
      "underdress": "short",
      "glasses": "no",
      "emotion": 1
    }
    ```
  - **Response 404**
    ```json
    { "message": "未找到虚拟形象" }
    ```

- `POST /api/avatar/save`
  - **Headers**：`Authorization: Bearer <token>`
  - **Request**
    ```json
    {
      "nickname": "小宇",
      "gender": "male",
      "color": "blue",
      "shirt": "short",
      "underdress": "short",
      "glasses": "no"
    }
    ```
  - **Response 200**
    ```json
    { "ok": true }
    ```
  - **Response 400**
    ```json
    { "message": "昵称和性别不能为空" }
    ```

---

## 主页面

- **Route**：`/noa/home`
- **功能**：
  - **顶部 header**（始终可见）：昵称问候、面板切换按钮（“查看绘本 / 记录进食”）、"历史绘本"入口、退出登录
  - **左侧面板**：虚拟形象合成渲染 + 正反馈文字气泡（显示在虚拟形象图上方，醒目展示；可点击朗读气泡内容）
  - **右侧面板**：通过头部按钮切换“绘本预览 / 进食记录”，互不影响
    - **绘本预览**（默认展示）：绘本卡片，含三种子状态：
      - 生成中（`bookGenerating=true && !book`）：封面区域显示 `.book-gen-shimmer` 动画 + 标题/描述区显示 `.skeleton-shimmer` 占位；底部显示"绘本生成中…"占位文字
      - 未确认绘本（`book && !book.confirmed`）：封面预览 + "确认绘本，开始阅读"按钮 + "重新生成 (N/2)"按钮
      - 已确认绘本（`book.confirmed`）：封面预览 + "开始阅读"按钮（跳转 `/noa/books/:bookId?experiment=1`）
    - **进食记录**：内嵌进食记录表单，提交条件为“今日食物 / 打分 / 描述”三项均填写：
      - 今日食物：输入框 + 录音转写回填
      - 打分：滑动条（0–10）
      - 描述：文本输入 + 录音转写回填
  - 头部的“记录进食 / 查看绘本”按钮用于切换右侧面板显示内容
  - "重新生成"按钮打开 RegenModal 底部弹层（在主页面内完成，不再跳转至 `/noa/books/create`）
  - 绘本生成触发从“读完已确认绘本后自动生成”切换为主流程，进食记录不再触发生成
  - 轮询（每 3 秒）`GET /api/home/status`，以 `generating: false` 作为终止条件（不再依赖 book 是否存在），确保刷新后生成状态可恢复
- **关键实现**：`frontend/src/pages/noa/HomePage.tsx`

**API**

- `GET /api/home/status`
  - **Headers**：`Authorization: Bearer <token>`
  - **Response 200（有未确认绘本，生成完成）**
    ```json
    {
      "avatar": {
        "nickname": "小宇",
        "gender": "male",
        "color": "blue",
        "shirt": "short",
        "underdress": "short",
        "glasses": "no",
        "emotion": 1
      },
      "feedbackText": "太棒了！你又进步了一点点。",
      "themeFood": "胡萝卜",
      "generating": false,
      "book": {
        "bookID": "uuid",
        "title": "小宇的美味冒险",
        "preview": "http://localhost:8000/static/images/xxxx.png",
        "description": "今天我们尝试了胡萝卜...",
        "confirmed": false,
        "regenerateCount": 0
      }
    }
    ```
  - **Response 200（生成中，`generating: true`）**
    ```json
    {
      "avatar": { "...": "..." },
      "feedbackText": "...",
      "themeFood": "胡萝卜",
      "generating": true,
      "book": null
    }
    ```
  - **Response 200（已确认历史书 / 无绘本）**
    ```json
    {
      "avatar": { "...": "..." },
      "feedbackText": "...",
      "themeFood": "胡萝卜",
      "generating": false,
      "book": {
        "bookID": "uuid",
        "title": "小宇的美味冒险",
        "preview": "data:image/svg+xml;utf8,...",
        "description": "...",
        "confirmed": true,
        "regenerateCount": 0
      }
    }
    ```
  > `generating: true` 表示服务器正在异步生成绘本（初次生成）或同步等待 FastAPI 重新生成。客户端以此字段决定是否继续轮询，并在页面刷新后恢复生成动效（不丢失状态）。`book` 字段可为 `null`（尚未生成完成或未提交进食记录）。

- `POST /api/food/log`
  - **Headers**：`Authorization: Bearer <token>`
  - **Request**
    ```json
    { "foodName": "胡萝卜", "score": 8, "content": "今天吃得不错" }
    ```
  - **说明**：仅记录进食，不触发绘本生成
  - **Response 200**
    ```json
    { "ok": true, "feedbackText": "太棒了！你又进步了一点点。", "expression": "happy", "score": 8, "emotion": 2 }
    ```
  - **emotion 映射**：`1-3 → 0`、`4-6 → 1`、`7-8 → 2`、`9-10 → 3`；会写入用户数据库，直到下一次进食记录提交前保持不变。

- `POST /api/voice/transcribe`
  - **Headers**：`Authorization: Bearer <token>`
  - **Request**：`multipart/form-data`，字段 `file`（音频文件）
  - **说明**：user-api 接收后转发到 backend `/api/v1/voice/transcribe`
  - **Response 200**
    ```json
    { "text": "今天我吃了胡萝卜" }
    ```

- `POST /api/book/confirm`
  - **Response 200**
    ```json
    { "ok": true }
    ```

- `POST /api/book/regenerate`
  - **Request**
    ```json
    {
      "reason": "太长了（选填）",
      "target_food": "西兰花（选填）",
      "story_type": "interactive（选填）",
      "difficulty": "medium（选填）",
      "pages": 8,
      "interaction_density": "medium（选填）"
    }
    ```
  > 均为选填；缺省时 user-api 会使用默认值：`story_type=interactive`、`difficulty=medium`、`pages=6`、`interaction_density=medium`；`target_food` 缺省时使用用户档案的目标食物。
  - **Response 200**
    ```json
    {
      "ok": true,
      "book": {
        "bookID": "uuid",
        "title": "新标题",
        "preview": "data:image/svg+xml;utf8,...",
        "description": "...",
        "confirmed": false,
        "regenerateCount": 1
      }
    }
    ```
  - **Response 400**
    ```json
    { "message": "已达到重新生成上限" }
    ```

---

## 绘本重新生成页（已废弃）

- **Route**：`/noa/books/create`
- **状态**：**已废弃**。重新生成功能已移至主页面的 RegenModal 底部弹层，此路由不再使用。
- **关键实现**：`frontend/src/pages/noa/BookCreatePage.tsx`（保留但不再入口可达）

**API**：`POST /api/book/regenerate`（同上）

---

## 历史绘本列表页

- **Route**：`/noa/books/history`
- **功能**：展示已确认的历史绘本列表，点击进入阅读页；无历史绘本时仅显示“还没有绘本”。
- **关键实现**：`frontend/src/pages/noa/BookHistoryPage.tsx`

**API**

- `GET /api/books/history`
  - **Response 200**
    ```json
    {
      "items": [
        {
          "bookID": "uuid",
          "title": "小宇的美味冒险",
          "preview": "data:image/svg+xml;utf8,...",
          "description": "今天我们尝试了胡萝卜...",
          "confirmedAt": "2026-03-01T00:00:00.000Z"
        }
      ]
    }
    ```

---

## 绘本阅读桥接页

- **Route**：`/noa/books/:bookId`
- **功能**：桥接/跳转页，不直接展示绘本内容。流程：
  1. 从 user-api 获取绘本详情（`GET /api/books/:bookId`）
  2. 解析 `content` 字段中的故事 draft JSON，提取 `story_id`
  3. 将 draft 存入 `localStorage`（键：`storybook_draft`、`storybook_book_id`）
  4. 根据查询参数决定模式：
     - `?experiment=1`：正式实验模式，调用 `POST /api/v1/session/start` 创建 telemetry session 并存入 `localStorage`，`storybook_source` = `'experiment'`
     - 无参数且绘本已确认：历史回顾只读模式，`storybook_source` = `'review'`
     - 无参数且绘本未确认：预览模式，`storybook_source` = `'preview'`
  5. 跳转至 `/reader`
- **插图检查**：若绘本插图未全部生成，提示等待并轮询 backend 直至完成后进入阅读
- **关键实现**：`frontend/src/pages/noa/BookDetailPage.tsx`

**API**

- `GET /api/books/:bookId`
  - **Response 200**
    ```json
    {
      "book": {
        "bookID": "uuid",
        "title": "小宇的美味冒险",
        "preview": "data:image/svg+xml;utf8,...",
        "description": "...",
        "content": "{\"title\":\"...\",\"pages\":[{\"text\":\"...\"}]}",
        "confirmed": true
      }
    }
    ```

---

## 故事阅读器

- **Route**：`/reader`
- **功能**：完整的交互式阅读体验，数据从 `localStorage`（`storybook_draft`、`storybook_session`）读取。
  - **布局**：左图片面板（宽度约 58%）+ 右文字与导航面板（约 42%）
  - **Header**：
    - "退出"按钮（有 session 时弹出 FeedbackModal；无 session 时直接返回主页）
    - 进度条 + 页码计数器
    - TTS "朗读"开关（使用 zhimiao 语音；翻页/退出/完成时自动停止上一段朗读；读完故事文字后可续读互动提示；若互动为情节选择，会在读完“选择你更想做的一步：”后继续读出选项文案）
  - **导航**：
    - "上一页" / "下一页"
    - 最后一页时显示"完成 ✓"按钮
  - **互动层**（InteractionLayer 组件）：支持 tap（圆形按钮，class `w-20 h-20`）、mimic、branch 交互类型；情节选择不再播放选择后的语音反馈语
  - **图片轮询**：若 draft 中存在尚未生成图片的页面，每 3 秒轮询一次（最多 10 次），更新后刷新显示
  - **完成流程**（最后一页点击"完成"）：弹出 FeedbackModal → 若存在最终 session → 弹出 SUSModal → 返回主页
- **关键实现**：`frontend/src/pages/Reader.tsx`

---

## 管理员后台

- **Route**：`/noa/admin/users`
- **功能**：
  - 输入管理员密钥后加载数据
  - 统计概览（两排卡片）：
    - 第一排：用户总数、会话总数（完成/中止）、SUS 均分、数据完整度
    - 第二排（当日）：今日阅读次数、今日累计时长、今日互动点击、今日正反馈
  - 参与度漏斗：注册 → 完成形象 → 提交进食 → 生成绘本 → 确认绘本
  - 进食评分分布（拒绝/一般/喜欢）
  - 绘本指标（总生成数、确认率、平均重新生成次数）
  - 会话统计（完成率/中止率）、反馈分布（进食等级/中止原因）
  - SUS 可用性评分分布、数据完整度（反馈/SUS 回收率）
  - 用户明细表（可排序）：ID、目标食物、进食次数、平均分、预览/回顾/实验完成/中断次数、正反馈次数、**平均时长**、**平均互动点击**、确认时间、最近活跃
  - 创建/删除用户
- **关键实现**：`frontend/src/pages/noa/AdminUsersPage.tsx`

**API**

- `GET /api/admin/stats`（user-api）
  - **Headers**：`x-admin-key: <ADMIN_API_KEY>`
  - **Response 200**
    ```json
    {
      "funnel": {
        "totalUsers": 5,
        "completedAvatar": 3,
        "submittedFoodLog": 2,
        "generatedBook": 2,
        "confirmedBook": 1
      },
      "foodScores": {
        "avgScore": 6.5,
        "distribution": { "low": 1, "mid": 3, "high": 2 }
      },
      "books": {
        "totalGenerated": 4,
        "totalConfirmed": 1,
        "avgRegenerateCount": 0.5
      },
      "enrichedUsers": [
        {
          "userID": "u1",
          "themeFood": "胡萝卜",
          "firstLogin": false,
          "foodLogCount": 3,
          "avgScore": 7.2,
          "bookCount": 1,
          "confirmedAt": "2026-03-05T10:00:00.000Z",
          "lastActive": "2026-03-05T10:00:00.000Z",
          "previewCount": 2,
          "reviewCount": 1,
          "experimentCompletedCount": 3,
          "experimentAbortedCount": 1,
          "positiveFeedbackCount": 2,
          "avgDurationMs": 85000,
          "avgInteractionCount": 4.5
        }
      ],
      "today": {
        "sessionCount": 3,
        "totalDurationMs": 255000,
        "totalInteractions": 14,
        "positiveFeedbackCount": 2
      }
    }
    ```

- `GET /api/v1/admin/stats`（backend，可选）
  - **Response 200**
    ```json
    {
      "sessions": { "total": 10, "completed": 7, "aborted": 3, "completedRate": 70, "abortedRate": 30 },
      "feedback": { "tryLevelDist": { "Lv1": 2, "Lv2": 3 }, "abortReasonDist": { "太辣了": 1 } },
      "sus": { "responseCount": 5, "avgScore": 72.5, "distribution": { "low": 0, "mid": 2, "high": 3 } },
      "completeness": { "sessionsWithFeedback": 7, "sessionsWithFeedbackPct": 70, "sessionsWithSUS": 5, "sessionsWithSUSPct": 50 }
    }
    ```

- `GET /api/admin/users`
  - **Response 200**
    ```json
    { "users": [{ "userID": "demo", "firstLogin": true, "themeFood": "胡萝卜" }] }
    ```

- `POST /api/admin/users`
  - **Request**
    ```json
    { "userID": "u1", "password": "p1", "firstLogin": true }
    ```

- `DELETE /api/admin/users/:userID`

---

## 数据字段说明

### reading_sessions 表字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `duration_ms` | INTEGER | 阅读会话时长（毫秒）。从 `started_at` 到 `ended_at` 差值，由前端 Reader 在退出时上报。管理员后台显示每用户平均时长（`avgDurationMs`）以及今日累计时长（`today.totalDurationMs`）。 |
| `interaction_count` | INTEGER | 本次阅读中互动点击总次数（tap 点击 + mimic"我做到了"点击 + branch 选择）。由前端 Reader 在退出时上报。管理员后台显示每用户平均互动次数（`avgInteractionCount`）以及今日总互动（`today.totalInteractions`）。 |
| `session_type` | TEXT | 阅读模式：`'preview'`（预览未确认绘本，不创建 telemetry session）、`'review'`（回顾已确认绘本）、`'experiment'`（正式实验，创建 telemetry session）。 |
| `try_level` | TEXT | 孩子尝试食物的等级，由家长在 FeedbackModal 中选择：`'look'`（只是看了看）、`'Lv1'`（闻了闻）、`'Lv2'`（舔了一下）、`'Lv3'`（咬了一口）、`'Lv4'`（吃了一部分）、`'Lv5'`（正常进食）。 |
| `abort_reason` | TEXT | 中止阅读的原因，由家长选择。 |
| `pages_read` | INTEGER | 实际阅读的页数。 |
| `total_pages` | INTEGER | 绘本总页数。 |
| `completed` | INTEGER | `1` = 阅读至最后一页并点击"完成"；`0` = 中途退出。 |

**正反馈（positiveFeedbackCount）**：`try_level IS NOT NULL AND try_level != 'look'`，即孩子不仅"看了看"而是有实际尝试行为（闻/舔/咬/吃）时计为一次正反馈。

### RegenModal 不满意原因选项

| `value` | 显示文字 | 说明 |
|---------|---------|------|
| `too_long` | 太长了 | 故事篇幅过长 |
| `too_short` | 太短了 | 故事篇幅过短 |
| `too_scary` | 太恐怖了 | 内容对孩子有压迫感 |
| `too_preachy` | 太说教了 | 说教感过强 |
| `not_cute` | 不够可爱 | 缺乏童趣 |
| `style_inconsistent` | 风格不统一 | 图文或情节风格不一致 |
| `interaction_unclear` | 互动不清晰 | 互动指令不明确 |
| `repetitive` | 内容重复 | 情节或句式重复 |
| `wrong_age_level` | 年龄不符合 | 难度/内容不适龄 |
| `other` | 其他 | 其他原因（配合补充说明输入框） |

### RegenModal 故事设置选项

| 字段 | 选项 | 说明 |
|------|------|------|
| `story_type` | `interactive`（互动冒险）/ `adventure`（探险故事）/ `social`（社交故事）/ `sensory`（感官体验） | 故事类型，影响情节结构 |
| `difficulty` | `easy` / `medium` / `hard` | 难度，影响词汇量和行为期望层级 |
| `interaction_density` | `low` / `medium` / `high` | 互动频率，影响每页互动指令的数量 |
| `pages` | 数字（如 `6`、`8`、`10`） | 绘本总页数 |

---

## 后端路由汇总

- **user-api 入口**：`user-api/src/index.ts`
- **user-api 数据层**：`user-api/src/db.ts`（含 Avatar 资源种子数据）
- **backend 入口**：`backend/main.py`
- **backend 路由模块**：`backend/routers/`（session, story, feedback, sus, telemetry, tts, export, admin_stats）
- **LLM Prompt**：`backend/prompt.py`
