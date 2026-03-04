# 管理员后台重构计划：密钥门禁 + CSCW 统计面板

## 问题分析

1. **密钥输入不可见**：当前密钥输入只是页面顶部一个小 input，用户找不到。需要改为"门禁"模式——未验证前整个页面被锁定。
2. **缺少 CSCW 统计字段**：现有 admin/users 只返回 `userID, firstLogin, themeFood`，无法支持研究分析。
3. **缺少编辑功能**：只有创建和删除，没有修改用户信息的能力。

## 现有数据表（可聚合计算 CSCW 指标）

- `users`: user_id, password, first_login, theme_food
- `user_avatars`: nickname, gender, skin_color, hair, hair_color, created_at, updated_at
- `user_food_logs`: score, content, voice_data, created_at
- `user_avatar_states`: feedback_text, created_at
- `temp_books`: regenerate_count, created_at
- `history_books`: confirmed_at

## CSCW 统计字段设计（从现有表实时聚合）

### A. 主要结果指标（Primary Outcomes）
| 字段 | 类型 | 说明 | SQL 来源 |
|------|------|------|----------|
| total_food_logs | int | 食物记录总数 | COUNT(*) from food_logs |
| avg_food_score | float | 平均接受度评分 | AVG(score) |
| first_score | float | 首次评分（基线） | MIN(created_at) 对应的 score |
| latest_score | float | 最近评分 | MAX(created_at) 对应的 score |
| score_delta | float | 评分变化量 | latest - first |

### B. 参与度指标（Engagement）
| 字段 | 类型 | 说明 |
|------|------|------|
| voice_log_count | int | 语音输入次数 |
| total_books_confirmed | int | 已确认绘本数 |
| has_pending_book | bool | 是否有未确认绘本 |
| avatar_configured | bool | 是否已配置头像 |
| nickname | string | 昵称 |
| gender | string | 性别 |

### C. 时间指标（Temporal）
| 字段 | 类型 | 说明 |
|------|------|------|
| first_log_at | string | 首次记录时间 |
| last_active_at | string | 最近活跃时间 |
| days_active | int | 有记录的天数 |
| study_duration_days | int | 参与天数跨度 |

### D. 交互模式（Interaction Patterns）
| 字段 | 类型 | 说明 |
|------|------|------|
| low_score_count | int | 评分≤4次数 |
| high_score_count | int | 评分≥8次数 |

## 实施步骤

### Step 1: 后端 — db.ts 添加统计查询函数

新增 `getUserStats(userID)` 和 `listUsersWithStats()` 函数。
- 单条大 SQL 联查 food_logs + history_books + temp_books + user_avatars
- 返回上述全部 CSCW 字段
- 无需新建表，全部从现有 5 张表实时聚合

### Step 2: 后端 — index.ts 添加/修改 API

- `GET /api/admin/users` → 改为返回含内联统计的用户列表
- `GET /api/admin/users/:userID/stats` → 返回单用户完整 CSCW 统计
- `PUT /api/admin/users/:userID` → 编辑用户（password, themeFood）
- `GET /api/admin/export/csv` → 导出全部用户统计为 CSV

### Step 3: 前端 — AdminUsersPage.tsx 重构

1. **密钥门禁**：未输入密钥时，显示全屏锁定界面（Lock 图标 + 密钥输入框 + 验证按钮），验证通过后才展示管理面板
2. **用户表格增强**：
   - 列：用户ID | 昵称 | 目标食物 | 记录数 | 平均分 | 评分变化 | 活跃天数 | 绘本数 | 最近活跃 | 操作
   - 操作栏：编辑 | 删除 | 查看详情
3. **用户详情弹窗**：点击用户行展开/弹窗，显示完整 CSCW 统计
4. **编辑用户弹窗**：修改密码和目标食物
5. **CSV 导出按钮**：一键导出研究数据
6. **创建用户表单**：保留现有功能

### Step 4: 测试
- 更新 e2e/admin.spec.ts 覆盖新功能
