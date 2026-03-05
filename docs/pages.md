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
  - 左侧预览合成：底图 + 发型 + 眼镜 + 上衣颜色 + 下装颜色（Kenney Modular Character 图层叠加）
  - 右侧填写昵称、选择性别和形象选项
  - 昵称与性别必填，提交后保存形象数据并跳转主页面
- **关键实现**：`frontend/src/pages/noa/AvatarPage.tsx`

**API**

- `GET /api/avatar/base`
  - **Response 200**
    ```json
    { "image": "data:image/svg+xml;utf8,..." }
    ```

- `GET /api/avatar/options`
  - **Response 200**
    ```json
    {
      "hair": [{ "id": "short", "label": "短发", "image": "data:image/svg+xml;utf8,..." }],
      "glasses": [{ "id": "none", "label": "无眼镜", "image": "data:image/svg+xml;utf8,..." }],
      "topColors": [{ "id": "blue", "label": "蓝色", "image": "data:image/svg+xml;utf8,..." }],
      "bottomColors": [{ "id": "black", "label": "黑色", "image": "data:image/svg+xml;utf8,..." }]
    }
    ```

- `GET /api/avatar/component?type=hair&id=short`
  - **Response 200**
    ```json
    { "image": "data:image/svg+xml;utf8,..." }
    ```
  - **Response 400** / **404**
    ```json
    { "message": "参数错误" }
    ```

- `POST /api/avatar/save`
  - **Headers**：`Authorization: Bearer <token>`
  - **Request**
    ```json
    {
      "nickname": "小宇",
      "gender": "male",
      "hairStyle": "short",
      "glasses": "none",
      "topColor": "blue",
      "bottomColor": "black"
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
  - **顶部 header**（始终可见）：昵称问候、今日主题食物徽章、"记录进食"按钮（打开 FoodLogModal 底部弹层）、"历史绘本"入口、退出登录
  - **左侧面板**：虚拟形象合成渲染 + 可选正反馈文字气泡
  - **右侧面板**：两种互斥状态
    - **State A**（`book === null && !bookGenerating`）：内嵌进食记录表单，含"今天吃得怎么样？"标题、评分滑动条（0–10）、文本输入区域、"提交记录，生成绘本 →"按钮
    - **State B**（`book !== null || bookGenerating`）：绘本卡片，含三种子状态：
      - 生成中（`bookGenerating=true && !book`）：封面区域显示 `.book-gen-shimmer` 动画 + 标题/描述区显示 `.skeleton-shimmer` 占位；底部显示"绘本生成中…"占位文字
      - 未确认绘本（`book && !book.confirmed`）：封面预览 + "确认绘本，开始阅读"按钮 + "重新生成 (N/2)"按钮
      - 已确认绘本（`book.confirmed`）：封面预览 + "开始阅读"按钮（跳转 `/noa/books/:bookId?experiment=1`）
  - Header 中的"记录进食"按钮在 State B 下仍可用，打开 FoodLogModal 提交新进食记录
  - "重新生成"按钮打开 RegenModal 底部弹层（在主页面内完成，不再跳转至 `/noa/books/create`）
  - 进食记录提交或重新生成成功后：`book` → null，`bookGenerating` → true，进入生成中 shimmer 状态；轮询（每 3 秒）`GET /api/home/status` 等待新的**未确认**绘本（若返回已确认的历史书则忽略，继续等待）
- **关键实现**：`frontend/src/pages/noa/HomePage.tsx`

**API**

- `GET /api/home/status`
  - **Headers**：`Authorization: Bearer <token>`
  - **Response 200（有未确认绘本）**
    ```json
    {
      "avatar": {
        "nickname": "小宇",
        "baseImage": "data:image/svg+xml;utf8,...",
        "hairImage": "data:image/svg+xml;utf8,...",
        "glassesImage": "data:image/svg+xml;utf8,...",
        "topImage": "data:image/svg+xml;utf8,...",
        "bottomImage": "data:image/svg+xml;utf8,..."
      },
      "feedbackText": "太棒了！你又进步了一点点。",
      "themeFood": "胡萝卜",
      "book": {
        "bookID": "uuid",
        "title": "小宇的美味冒险",
        "preview": "data:image/svg+xml;utf8,...",
        "description": "今天我们尝试了胡萝卜...",
        "confirmed": false,
        "regenerateCount": 0
      }
    }
    ```
  - **Response 200（已确认历史书 / 无绘本）**
    ```json
    {
      "avatar": { "...": "..." },
      "feedbackText": "...",
      "themeFood": "胡萝卜",
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
    > `book` 字段可为 `null`（用户尚未提交进食记录）。`confirmed: true` 表示历史确认书，生成轮询期间前端会忽略此值，继续等待新的未确认绘本。

- `POST /api/food/log`
  - **Headers**：`Authorization: Bearer <token>`
  - **Request**
    ```json
    { "score": 8, "content": "今天吃得不错" }
    ```
  - **Response 200**
    ```json
    { "ok": true, "feedbackText": "太棒了！你又进步了一点点。", "expression": "happy", "score": 8 }
    ```

- `POST /api/voice/transcribe`
  - **Response 200**
    ```json
    { "text": "（语音转写示例）" }
    ```

- `POST /api/book/confirm`
  - **Response 200**
    ```json
    { "ok": true }
    ```

- `POST /api/book/regenerate`
  - **Request**
    ```json
    { "title": "新标题", "note": "偏冒险主题" }
    ```
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
- **功能**：展示已确认的历史绘本列表，点击进入阅读页。
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
    - TTS "朗读"开关（使用 zhimiao 语音；自动朗读故事文字，朗读完毕后续读互动提示）
  - **导航**：
    - "上一页" / "下一页"
    - 最后一页时显示"完成 ✓"按钮
  - **互动层**（InteractionLayer 组件）：支持 tap（圆形按钮，class `w-20 h-20`）、mimic、branch 交互类型
  - **图片轮询**：若 draft 中存在尚未生成图片的页面，每 3 秒轮询一次（最多 10 次），更新后刷新显示
  - **完成流程**（最后一页点击"完成"）：弹出 FeedbackModal → 若存在最终 session → 弹出 SUSModal → 返回主页
- **关键实现**：`frontend/src/pages/Reader.tsx`

---

## 管理员后台

- **Route**：`/noa/admin/users`
- **功能**：
  - 输入管理员密钥后加载数据
  - 统计概览：用户总数、会话总数、SUS 均分、数据完整度
  - 参与度漏斗：注册 → 完成形象 → 提交进食 → 生成绘本 → 确认绘本
  - 进食评分分布（拒绝/一般/喜欢）
  - 绘本指标（总生成数、确认率、平均重新生成次数）
  - 会话统计（完成率/中止率）、反馈分布（进食等级/中止原因）
  - SUS 可用性评分分布、数据完整度（反馈/SUS 回收率）
  - 用户明细表（可排序）：ID、目标食物、进食次数、平均分、绘本数、最近活跃
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
          "lastActive": "2026-03-05T10:00:00.000Z",
          "preview_count": 2,
          "review_count": 1,
          "experiment_completed_count": 3,
          "experiment_aborted_count": 1,
          "positive_feedback_count": 2
        }
      ]
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

## 后端路由汇总

- **user-api 入口**：`user-api/src/index.ts`
- **user-api 数据层**：`user-api/src/db.ts`（含 Avatar 资源种子数据）
- **backend 入口**：`backend/main.py`
- **backend 路由模块**：`backend/routers/`（session, story, feedback, sus, telemetry, tts, export, admin_stats）
- **LLM Prompt**：`backend/prompt.py`
