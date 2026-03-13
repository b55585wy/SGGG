# E2E 测试计划 — 后端统计与导出字段验证

## 一、测试范围

覆盖两套后端的统计/导出端点，验证字段完整性、数据准确性、权限控制。

| 系统 | 基础路径 | 认证方式 |
|------|---------|---------|
| user-api (Node) | `/api/admin/*` | JWT admin token 或 `x-admin-key` header |
| backend (FastAPI) | `/api/v1/admin/*`, `/api/v1/export/*` | `x-admin-key` header 或 `?key=` |

---

## 二、CSV 导出端点测试 (user-api)

### 2.1 `/api/admin/export/users.csv`

| 测试场景 | 验证点 |
|---------|--------|
| 有用户数据 | CSV 列：`user_id, first_login, theme_food, nickname, gender, hair_style, glasses, top_color, bottom_color, avatar_created_at` |
| 用户无头像 | nickname/gender 等头像字段为空，不报错 |
| 空表 | 返回仅含列头的 CSV（不返回空 body） |
| 无权限 | 返回 403 |

### 2.2 `/api/admin/export/food_logs.csv`

| 测试场景 | 验证点 |
|---------|--------|
| 有记录 | CSV 列：`log_id, user_id, food_name, score, content, feedback_text, emotion, related_book_id, related_reading_session_id, related_reading_ended_at, created_at` |
| score 范围 | 值在 1-10 之间 |
| feedback_text | LLM 生成的反馈语非空（已提交的记录） |
| emotion | 值在 0-3 之间 |
| 空表 | 返回仅含列头的 CSV |

### 2.3 `/api/admin/export/reading_sessions.csv`

| 测试场景 | 验证点 |
|---------|--------|
| 有记录 | CSV 列：`id, user_id, book_id, started_at, ended_at, duration_ms, total_pages, pages_read, interaction_count, completed, session_type, try_level, abort_reason, skip_auto_book_generation, created_at` |
| session_type | 值为 `preview` / `review` / `experiment` 之一 |
| completed=1 时 | `try_level` 应有值（look/touch/play/read），`abort_reason` 为空 |
| completed=0 时 | `abort_reason` 应有值，`try_level` 为空 |
| skipAutoBookGeneration | 跳过饮食日志时，不触发新绘本生成（通过验证 history_books 表无新增） |
| 空表 | 返回仅含列头的 CSV |

### 2.4 `/api/admin/export/voice_recordings.csv`

| 测试场景 | 验证点 |
|---------|--------|
| 有记录 | CSV 列：`id, user_id, source, context_id, page_id, transcript, duration_ms, created_at` |
| source 字段 | 值为 `interaction` 或 `feedback` |
| 空表 | 返回仅含列头的 CSV |

### 2.5 `/api/admin/export/avatars.csv`

| 测试场景 | 验证点 |
|---------|--------|
| 有记录 | CSV 列：`user_id, nickname, gender, avatar_color, avatar_shirt, avatar_underdress, avatar_glasses, theme_food, created_at, updated_at` |
| gender | 值为 `male` 或 `female` |
| avatar_color | 值为 `blue` / `red` / `yellow` |
| avatar_glasses | 值为 `no` 或 `yes` |
| 空表 | 返回仅含列头的 CSV |

---

## 三、统计端点测试 (user-api)

### 3.1 `/api/admin/stats`

#### 3.1.1 funnel 漏斗

| 字段 | 验证点 |
|------|--------|
| `totalUsers` | 等于 users 表总行数 |
| `completedAvatar` | 等于 user_avatars 表总行数 |
| `submittedFoodLog` | 等于提交过 food_log 的去重用户数 |
| `generatedBook` | 等于 history_books 表去重用户数 |
| `confirmedBook` | 等于 confirmed_at 非空的去重用户数 |
| 递减关系 | `totalUsers >= completedAvatar >= submittedFoodLog >= generatedBook >= confirmedBook` |

#### 3.1.2 foodScores 进食评分

| 字段 | 验证点 |
|------|--------|
| `avgScore` | 等于所有 food_logs.score 的平均值 |
| `distribution.low` | score <= 3 的记录数 |
| `distribution.mid` | 4 <= score <= 6 的记录数 |
| `distribution.high` | score >= 7 的记录数 |

#### 3.1.3 enrichedUsers 详细用户数据

每个用户对象验证：

| 字段 | 验证点 |
|------|--------|
| `voiceCount` | 等于该用户 voice_recordings 表的记录数 |
| `totalPagesRead` | 等于该用户所有 reading_sessions.pages_read 之和 |
| `foodLogCount` | 等于该用户 food_logs 的记录数 |
| `avgScore` | 等于该用户 food_logs.score 的平均值 |
| `bookCount` | 等于该用户 history_books 的记录数 |
| `experimentCompletedCount` | session_type=experiment 且 completed=1 的数量 |
| `experimentAbortedCount` | session_type=experiment 且 completed=0 的数量 |
| `avgDurationMs` | 等于该用户所有 session 的 duration_ms 平均值 |
| `avgInteractionCount` | 等于该用户所有 session 的 interaction_count 平均值 |

#### 3.1.4 today 当日统计

| 字段 | 验证点 |
|------|--------|
| `sessionCount` | 等于今天创建的 reading_sessions 数量 |
| `totalDurationMs` | 等于今天所有 session 的 duration_ms 之和 |
| `totalInteractions` | 等于今天所有 session 的 interaction_count 之和 |

---

## 四、统计端点测试 (backend FastAPI)

### 4.1 `/api/v1/admin/stats`

| 模块 | 字段 | 验证点 |
|------|------|--------|
| sessions | `total` | 等于 sessions 表总行数 |
| sessions | `completed` / `aborted` | 分别等于 status=COMPLETED / ABORTED 的数量 |
| sessions | `completedRate` | = completed / total * 100 |
| feedback | `tryLevelDist` | 各 try_level 值的分布计数 |
| feedback | `abortReasonDist` | 各 abort_reason 值的分布计数 |
| sus | `avgScore` | 等于 sus_responses.sus_score 的平均值 |
| sus | `distribution` | low(<50) / mid(50-69) / high(>=70) 的分布 |
| telemetry | `totalEvents` | 等于 telemetry_events 表总行数 |
| telemetry | `avgDwellMs` | 等于 page_dwell 事件的 payload.duration_ms 平均值 |

---

## 五、CSV 导出端点测试 (backend FastAPI)

| 端点 | CSV 列 | 关键验证 |
|------|--------|---------|
| `/api/v1/export/admin/sessions.csv` | session_id, story_id, child_id, session_index, client_session_token, status, created_at | status 为 COMPLETED 或 ABORTED |
| `/api/v1/export/admin/telemetry.csv` | event_id, session_id, story_id, page_id, event_type, payload, ts_client_ms, created_at | payload 为合法 JSON |
| `/api/v1/export/admin/feedback.csv` | id, session_id, status, try_level, abort_reason, notes, created_at | try_level 和 abort_reason 互斥 |
| `/api/v1/export/admin/sus.csv` | id, session_id, answers, sus_score, created_at | sus_score 在 0-100 之间 |
| `/api/v1/export/admin/stories.csv` | story_id, parent_story_id, child_id, regen_count, title, summary, theme_food, story_type, page_count, created_at | page_count > 0 |
| `/api/v1/export/child/{child_id}` | session_index, session_id, ... | 返回指定 child 的完整联表数据 |

---

## 六、权限控制测试

| 场景 | 端点 | 预期 |
|------|------|------|
| 无 admin key | 所有 `/api/admin/*` | 403 |
| 错误 admin key | 所有 `/api/admin/*` | 403 |
| 未配置 ADMIN_API_KEY | 所有 `/api/admin/*` | 503 |
| 正确 admin key (header) | 所有 `/api/admin/*` | 200 |
| 正确 admin key (query) | CSV 导出 | 200 |
| 普通用户 token | `/api/admin/stats` | 403 |

---

## 七、核心业务流程 E2E

### 7.1 完整实验流程

```
创建用户 → 创建头像 → 记录进食 → 生成绘本 → 阅读绘本 → 提交反馈(completed)
                                                        → 触发新绘本生成
```

**验证点：**
- reading_sessions 新增一条 completed=1, session_type=experiment
- food_logs 新增一条记录，feedback_text 非空
- history_books 新增一条（自动生成）
- admin/stats 中该用户的 experimentCompletedCount +1

### 7.2 跳过饮食日志流程

```
阅读绘本到最后一页 → PostReadingModal → 点击"跳过" → logReadingSession(skipAutoBookGeneration=true)
```

**验证点：**
- reading_sessions 新增一条 completed=1
- history_books 无新增（未触发自动生成）

### 7.3 提前退出流程

```
阅读中途 → 点击退出 → AbortReasonModal → 选择原因 → 提交
```

**验证点：**
- reading_sessions 新增一条 completed=0, abort_reason 非空
- 点 X 或遮罩层 → 弹窗关闭，继续阅读（不记录退出）

### 7.4 误触提前退出

```
阅读中途 → 误触退出按钮 → AbortReasonModal 弹出 → 点 X 或遮罩层关闭
```

**验证点：**
- reading_sessions 无新增
- 阅读状态恢复正常

---

## 八、数据一致性验证

| 验证项 | 方法 |
|--------|------|
| CSV 行数 = 数据库行数 | 对比 CSV 行数（减去列头）与 stats 中对应计数 |
| 用户导出与统计一致 | users.csv 行数 = stats.funnel.totalUsers |
| 阅读记录导出一致 | reading_sessions.csv 中 completed=1 的行数 = stats 中 completed 计数 |
| 进食评分一致 | food_logs.csv 中 score 平均值 = stats.foodScores.avgScore |
| 时间字段格式 | 所有 `*_at` 字段为 ISO 8601 格式 |
| ID 唯一性 | 所有 `*_id` 字段在各自 CSV 中不重复 |
