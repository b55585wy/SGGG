# 统一进食记录表单设计

## 现状：三个入口 + 一个相关弹窗

### 1. FeedbackModal（阅读后反馈）
- **触发**：读完/中止故事后立即弹出
- **内容**：选择尝试程度（看了看/闻了闻/摸了摸/舔了舔/咬一口/嚼了嚼/吞下去了）或中止原因
- **评分方式**：7 个图标按钮（行为阶梯式）
- **API**：`POST /api/feedback`（独立接口，不是 food/log）

### 2. MealReminderModal（阅读后进食提醒）
- **触发**：下次打开书本详情页时，如果上次读完了故事
- **内容**：Phase 1 提示 → Phase 2 爱心评分 + 文字描述
- **评分方式**：5 颗爱心（score = hearts × 2 → 2/4/6/8/10）
- **API**：`POST /api/food/log`（带 `skipBookGeneration: true`）

### 3. HomePage 记录进食（内联 + 弹窗）
- **触发**：首页无活跃绘本时自动出现 / 点击"记录进食"按钮
- **内容**：滑块评分 + 文字描述 + 语音转写
- **评分方式**：0-10 滑块
- **API**：`POST /api/food/log`（触发绘本生成）

---

## 问题分析

| 问题 | 说明 |
|------|------|
| 评分方式不统一 | 爱心 vs 滑块，用户困惑 |
| FeedbackModal 与 MealReminder 问的是同一件事 | "用餐怎么样？" vs "上次读完有没有试着吃呢？"，都是关于吃的反馈 |
| 语音支持不一致 | 首页有语音，弹窗没有 |
| 时间割裂 | FeedbackModal 读完立即问尝试程度，MealReminder 下次才追问细节 — 用户要回忆两次 |

---

## 统一方案

### 核心思路：合并为两步，一次完成

读完故事后，把 FeedbackModal 和 MealReminderModal **合并成一个流程**，在故事结束时一次性收集所有信息。首页的记录进食保留，但 UI 统一。

### 统一后的用户流程

```
故事完成（COMPLETED）
  └─→ 统一弹窗
       ├─ Step 1: 尝试程度（原 FeedbackModal 的 7 个图标）
       ├─ Step 2: 爱心评分 + 文字/语音描述（原 MealReminder + InlineFoodLog）
       └─ 提交 → 同时写 feedback + food/log

故事中止（ABORTED）
  └─→ 中止原因弹窗（保持不变，不涉及进食记录）

首页主动记录
  └─→ 记录进食弹窗
       ├─ 爱心评分
       ├─ 文字/语音描述
       └─ 提交 → food/log + 触发绘本生成
```

### 统一弹窗 UI 结构

```
┌──────────────────────────────────┐
│          用餐怎么样？              │
│       今日食物：西兰花              │
│                                  │
│  ┌─ Step 1: 尝试程度 ──────────┐  │
│  │                             │  │
│  │  👁 看了看    🌸 闻了闻       │  │
│  │  ✋ 摸了摸    💧 舔了舔       │  │
│  │  🍪 咬一口    😊 嚼了嚼       │  │
│  │  ⭐ 吞下去了                 │  │
│  │                             │  │
│  └─────────────────────────────┘  │
│                                  │
│  ┌─ Step 2: 喜欢程度 ──────────┐  │
│  │                             │  │
│  │     ♡   ♡   ♥   ♥   ♡      │  │
│  │         (爱心评分)           │  │
│  │                             │  │
│  │  ┌─────────────────┐ 🎤    │  │
│  │  │ 描述一下吃的情况…  │       │  │
│  │  │                 │       │  │
│  │  └─────────────────┘       │  │
│  └─────────────────────────────┘  │
│                                  │
│  补充说明（可选）                   │
│  ┌─────────────────────────────┐  │
│  │                             │  │
│  └─────────────────────────────┘  │
│                                  │
│       [ 提交反馈 ]                │
│                                  │
│    还没吃，先跳过                  │
└──────────────────────────────────┘
```

### 首页记录进食（简化版，无 Step 1）

```
┌──────────────────────────────────┐
│          今天吃得怎么样？           │
│       今日食物：西兰花              │
│                                  │
│       ♡   ♡   ♥   ♥   ♡          │
│           (爱心评分)               │
│                                  │
│  ┌─────────────────────┐ 🎤      │
│  │ 描述一下吃的情况…      │         │
│  │                     │         │
│  └─────────────────────┘         │
│                                  │
│    [ 提交记录，生成绘本 → ]        │
└──────────────────────────────────┘
```

### 组件拆分

```
FoodLogForm（共享表单组件）
├── HeartRating          — 爱心评分（统一）
├── 文字 textarea        — 进食描述
├── 语音按钮             — 转写（统一支持）
└── props:
    ├── skipBookGeneration: boolean
    ├── onDone: (data) => void
    └── themeFood?: string

PostReadingModal（故事完成后的统一弹窗）
├── Step 1: TryLevelPicker（尝试程度，从 FeedbackModal 提取）
├── Step 2: FoodLogForm（爱心 + 文字 + 语音）
├── "先跳过" 按钮
└── 提交 → 同时调 feedback + food/log API

FoodLogModal（首页弹窗，复用 FoodLogForm）
└── FoodLogForm（skipBookGeneration=false）
```

### 删除的组件
- `MealReminderModal.tsx` — 功能并入 `PostReadingModal`
- `FeedbackModal.tsx` 的 COMPLETED 分支 — 并入 `PostReadingModal`
- `FeedbackModal.tsx` 的 ABORTED 分支 — 保留为独立的 `AbortReasonModal`
- `InlineFoodLog` 中的滑块 — 替换为 `HeartRating`
- `pending_meal_reminder` localStorage flag — 不再需要，因为读完立即收集

### 评分统一

| 之前 | 之后 |
|------|------|
| 滑块 0-10（连续） | 爱心 1-5（hearts × 2 → 2/4/6/8/10） |
| 爱心 1-5 | 爱心 1-5（不变） |

选爱心而非滑块的理由：
- 目标用户是儿童，爱心更直觉
- 离散选择比连续滑块更容易做决定
- 5 级足够表达偏好，0-10 精度对儿童没有意义

### API 变更

无需修改后端 API：
- `POST /api/food/log` 保持 `{ score, content, skipBookGeneration? }`
- `POST /api/feedback` 保持 `{ session_id, status, try_level, notes? }`
- PostReadingModal 提交时先后调用两个 API

---

## 变更影响

| 文件 | 变更 |
|------|------|
| `components/MealReminderModal.tsx` | 删除，功能并入新组件 |
| `components/FeedbackModal.tsx` | 拆分：COMPLETED 逻辑移入 PostReadingModal，ABORTED 保留 |
| `components/FoodLogForm.tsx` | **新建**：共享的爱心 + 文字 + 语音表单 |
| `components/PostReadingModal.tsx` | **新建**：统一的读后弹窗 |
| `pages/Reader.tsx` | 移除 `pending_meal_reminder` flag，FeedbackModal → PostReadingModal/AbortReasonModal |
| `pages/noa/BookDetailPage.tsx` | 移除 `pending_meal_reminder` 检测逻辑 |
| `pages/noa/HomePage.tsx` | InlineFoodLog 改用 HeartRating + 语音，移除 `pending_meal_reminder` 清除 |
| E2E 测试 | `meal-reminder.spec.ts` 需要重写，`admin.spec.ts` 不受影响 |
