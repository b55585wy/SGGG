# 页面功能与接口说明

本文档按页面维度汇总：route、功能、相关 API 端点及示例请求/响应。

## 登录页

- **Route**：`/noa/login`
- **功能**：用户输入账号密码登录，登录成功后根据 `firstLogin` 跳转到 `/noa/avatar` 或 `/noa/home`。
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
  - 顶部 header：昵称问候、今日挑战食物、退出登录、历史绘本入口
  - 左侧：虚拟形象（图层叠加渲染）+ 正反馈话框 + 进食情况录入（评分滑动条 + 文本/语音输入）
  - 右侧：绘本封面预览 + 确认/重新生成入口
- **关键实现**：`frontend/src/pages/noa/HomePage.tsx`

**API**

- `GET /api/home/status`
  - **Headers**：`Authorization: Bearer <token>`
  - **Response 200**
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

- `POST /api/food/log`
  - **Headers**：`Authorization: Bearer <token>`
  - **Request**
    ```json
    { "score": 8, "content": "今天吃得不错", "voiceData": null }
    ```
  - **Response 200**
    ```json
    { "ok": true, "feedbackText": "太棒了！你又进步了一点点。" }
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

## 绘本重新生成页

- **Route**：`/noa/books/create`
- **功能**：仅从主页面"我要重新生成"进入，填写标题建议与补充要求后提交重新生成。
- **关键实现**：`frontend/src/pages/noa/BookCreatePage.tsx`

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

## 绘本阅读页

- **Route**：`/noa/books/:bookId`
- **功能**：展示绘本封面、简介与内容。
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
          "lastActive": "2026-03-05T10:00:00.000Z"
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
