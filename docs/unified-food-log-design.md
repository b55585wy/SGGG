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

### 核心思路

1. 所有入口统一使用**完整版弹窗**（含尝试程度 + 星星评分 + 文字/语音）
2. 评分统一为 **5 颗星星，支持半星**（0.5 步进 → score 1-10）
3. 读完故事后一次性收集所有信息，删除 `pending_meal_reminder` 延后机制

### 统一后的用户流程

```
故事完成（COMPLETED）
  └─→ 统一弹窗（完整版）
       ├─ 尝试程度（7 个图标）
       ├─ 星星评分（半星精度 → 1-10）
       ├─ 文字/语音描述
       └─ 提交 → 同时写 feedback + food/log

故事中止（ABORTED）
  └─→ 中止原因弹窗（保持不变，不涉及进食记录）

首页主动记录
  └─→ 统一弹窗（完整版，无尝试程度步骤）
       ├─ 星星评分（半星精度 → 1-10）
       ├─ 文字/语音描述
       └─ 提交 → food/log + 触发绘本生成
```

### 星星评分组件（StarRating）

5 颗星星，支持半星点击/滑动：

```
评分交互：
  ☆☆☆☆☆  →  score = 0（未评分）
  ★☆☆☆☆  →  score = 2（1 星）
  ★½☆☆☆  →  score = 3（1.5 星）
  ★★☆☆☆  →  score = 4（2 星）
  ★★½☆☆  →  score = 5（2.5 星）
  ★★★☆☆  →  score = 6（3 星）
  ★★★½☆  →  score = 7（3.5 星）
  ★★★★☆  →  score = 8（4 星）
  ★★★★½  →  score = 9（4.5 星）
  ★★★★★  →  score = 10（5 星）

实现：
  - 每颗星分左右两半，左半 = n-0.5 星，右半 = n 星
  - 点击左半区域 → 半星（半填充）
  - 点击右半区域 → 全星（全填充）
  - hover 时实时预览填充状态
  - score = stars × 2（半星 = 奇数分，全星 = 偶数分）
```

### 统一弹窗 UI 结构（完整版）

```
┌──────────────────────────────────────┐
│                                 [✕]  │
│            用餐怎么样？                │
│         今日食物：西兰花                │
│                                      │
│  ┌─ 尝试程度 ───────────────────────┐ │
│  │                                  │ │
│  │  👁看了看  🌸闻了闻  ✋摸了摸      │ │
│  │  💧舔了舔  🍪咬一口  😊嚼了嚼      │ │
│  │         ⭐吞下去了                │ │
│  │                                  │ │
│  └──────────────────────────────────┘ │
│                                      │
│  ┌─ 喜欢程度 ───────────────────────┐ │
│  │                                  │ │
│  │      ★  ★  ★½  ☆  ☆             │ │
│  │           5 / 10                 │ │
│  │                                  │ │
│  └──────────────────────────────────┘ │
│                                      │
│  ┌─ 描述 ──────────────────────┐ 🎤  │
│  │ 描述一下吃的情况…              │     │
│  │                             │     │
│  │                             │     │
│  └─────────────────────────────┘     │
│                                      │
│  补充说明（可选）                       │
│  ┌──────────────────────────────────┐ │
│  │                                  │ │
│  └──────────────────────────────────┘ │
│                                      │
│         [ 提交反馈 ]                  │
│                                      │
│       还没吃，先跳过                   │
└──────────────────────────────────────┘
```

说明：
- 阅读后场景（COMPLETED）：显示尝试程度 + 星星 + 描述 + 补充说明 + 跳过
- 首页场景：隐藏尝试程度区块和补充说明，其余相同
- "还没吃，先跳过" 仅阅读后场景显示

### 组件拆分

```
StarRating（星星评分组件）
├── 5 颗星，支持半星点击
├── hover 预览
├── props: { value, onChange }
└── score 范围 1-10（半星步进）

FoodLogForm（共享表单组件）
├── StarRating           — 星星评分（统一）
├── 文字 textarea        — 进食描述
├── 语音按钮             — 转写（统一支持）
└── props:
    ├── skipBookGeneration: boolean
    ├── onDone: (data) => void
    ├── themeFood?: string
    ├── showTryLevel?: boolean      — 是否显示尝试程度（阅读后=true，首页=false）
    ├── showNotes?: boolean         — 是否显示补充说明（阅读后=true，首页=false）
    ├── showSkip?: boolean          — 是否显示跳过按钮（阅读后=true，首页=false）
    ├── sessionId?: string          — 用于 feedback API
    └── submitLabel?: string        — 按钮文字（"提交反馈" / "提交记录，生成绘本 →"）

PostReadingModal（故事完成后弹窗）
└── FoodLogForm({
      showTryLevel: true,
      showNotes: true,
      showSkip: true,
      skipBookGeneration: true,
      sessionId,
      submitLabel: '提交反馈'
    })

FoodLogModal（首页弹窗）
└── FoodLogForm({
      showTryLevel: false,
      showNotes: false,
      showSkip: false,
      skipBookGeneration: false,
      submitLabel: '提交记录，生成绘本 →'
    })
```

### 删除的组件
- `MealReminderModal.tsx` — 功能并入 `PostReadingModal`
- `FeedbackModal.tsx` 的 COMPLETED 分支 — 并入 `PostReadingModal`
- `FeedbackModal.tsx` 的 ABORTED 分支 — 保留为独立的 `AbortReasonModal`
- `InlineFoodLog` — 替换为 `FoodLogForm`
- `HeartRating` — 替换为 `StarRating`
- `pending_meal_reminder` localStorage flag — 不再需要

### 评分统一

| 之前 | 之后 |
|------|------|
| 滑块 0-10（整数，连续拖动） | 星星 1-10（半星步进，点击选择） |
| 爱心 1-5（hearts × 2 → 偶数分） | 星星 1-10（半星步进，覆盖全部整数） |

选星星半星的理由：
- 保留 1-10 完整评分范围，后端 API 无需修改
- 星星比滑块更直觉，儿童容易理解
- 半星比纯 5 级精度更高，满足研究数据需要
- 星星评分是广泛认知的 UI 模式，无学习成本

### API 变更

无需修改后端 API：
- `POST /api/food/log` 保持 `{ score, content, skipBookGeneration? }`，score 范围仍为 1-10
- `POST /api/feedback` 保持 `{ session_id, status, try_level, notes? }`
- PostReadingModal 提交时先后调用两个 API

---

## 变更影响

| 文件 | 变更 |
|------|------|
| `components/MealReminderModal.tsx` | 删除，功能并入新组件 |
| `components/FeedbackModal.tsx` | 拆分：COMPLETED → PostReadingModal，ABORTED → AbortReasonModal |
| `components/StarRating.tsx` | **新建**：半星评分组件 |
| `components/FoodLogForm.tsx` | **新建**：共享的统一表单 |
| `components/PostReadingModal.tsx` | **新建**：阅读后统一弹窗 |
| `pages/Reader.tsx` | 移除 `pending_meal_reminder` flag，FeedbackModal → PostReadingModal/AbortReasonModal |
| `pages/noa/BookDetailPage.tsx` | 移除 `pending_meal_reminder` 检测逻辑 |
| `pages/noa/HomePage.tsx` | InlineFoodLog → FoodLogForm，移除 `pending_meal_reminder` 清除，删除 FoodLogModal 替换为统一弹窗 |
| E2E 测试 | `meal-reminder.spec.ts` 需要重写为统一弹窗测试 |
