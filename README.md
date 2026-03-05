# SGGG - 食光故事馆

三服务架构的儿童挑食干预互动绘本系统。

## 架构概览

| 服务 | 技术栈 | 端口 | 说明 |
|------|--------|------|------|
| **backend** | FastAPI + SQLAlchemy | 8000 | 故事生成、LLM、TTS、会话/反馈/SUS 数据 |
| **user-api** | Express + sql.js | 3001 | 用户管理、Avatar、进食记录、绘本 CRUD |
| **frontend** | React 19 + Vite + Tailwind 4 | 5173 | 前端 SPA（`/noa/*` 路由） |

前端通过 Vite proxy 统一转发：
- `/api/user/*` → `localhost:3001/api/*`（user-api）
- `/api/v1/*` → `localhost:8000/api/v1/*`（backend）

## 安装与初始化

**第一步：安装依赖**

```bash
# 在项目根目录执行
npm install
cd frontend && npm install && cd ..
cd user-api && npm install && cd ..
cd backend && pip install -r requirements.txt && cd ..
```

**第二步：创建环境变量文件**

```bash
# user-api（必须，含管理员密钥）
cp user-api/.env.example user-api/.env
# 编辑 user-api/.env，将 ADMIN_API_KEY 改为 dev-admin（与 E2E 测试一致）
# PORT=3001
# JWT_SECRET=dev-secret-change-me
# ADMIN_API_KEY=dev-admin          ← 改这里
# FASTAPI_URL=http://localhost:8000

# backend（必须，含 LLM API 密钥）
# 在 backend/ 目录下创建 .env：
# DEEPSEEK_API_KEY=sk-xxxx
# DASHSCOPE_API_KEY=sk-xxxx        ← 图片生成（可选）
```

> **注意**：frontend 目录下已有 `.env` 和 `.env.development`，无需另行创建。

## 启动

同时启动三个服务（推荐，在项目根目录执行）：

```bash
npm run dev
```

单独启动（各服务需在其自己的目录下运行）：

```bash
# backend（端口 8000）—— 必须在 backend/ 目录下
cd backend && uvicorn main:app --reload --port 8000

# user-api（端口 3001）—— 必须在 user-api/ 目录下
cd user-api && npm run dev

# frontend（端口 5173）—— 必须在 frontend/ 目录下（注意不是旧的 taste-skill/）
cd frontend && npm run dev
```

## Web Routes

| 路由 | 页面 | 登录要求 |
|------|------|----------|
| `/noa/login` | 登录页 | 否 |
| `/noa/avatar` | 虚拟形象创建页 | 是 |
| `/noa/home` | 主页面（进食录入 + 绘本） | 是 |
| `/noa/books/create` | 绘本重新生成表单 | 是 |
| `/noa/books/history` | 历史绘本列表 | 是 |
| `/noa/books/:bookId` | 绘本阅读页 | 是 |
| `/noa/admin/users` | 管理员后台（统计 + 用户管理） | `x-admin-key` |
| `/reader` | 故事阅读器（backend 故事） | 是 |

## API Endpoints

### user-api（通过 `/api/user` 代理）

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| GET | `/api/health` | 健康检查 | 无 |
| POST | `/api/auth/login` | 登录 | 无 |
| GET | `/api/auth/me` | 当前用户信息 | Bearer |
| GET | `/api/avatar/base` | 形象底图 | 无 |
| GET | `/api/avatar/options` | 形象选项列表 | 无 |
| GET | `/api/avatar/component` | 单个组件图片（`?type=&id=`） | 无 |
| POST | `/api/avatar/save` | 保存用户形象 | Bearer |
| GET | `/api/home/status` | 主页聚合数据 | Bearer |
| POST | `/api/food/log` | 提交进食记录 | Bearer |
| POST | `/api/book/confirm` | 确认临时绘本 | Bearer |
| POST | `/api/book/regenerate` | 重新生成临时绘本 | Bearer |
| GET | `/api/books/history` | 历史绘本列表 | Bearer |
| GET | `/api/books/:bookId` | 绘本详情 | Bearer |
| POST | `/api/voice/transcribe` | 语音转写（占位） | Bearer |
| POST | `/api/admin/users` | 创建用户 | `x-admin-key` |
| GET | `/api/admin/users` | 查询用户列表 | `x-admin-key` |
| DELETE | `/api/admin/users/:userID` | 删除用户（级联） | `x-admin-key` |
| GET | `/api/admin/stats` | 管理员统计数据 | `x-admin-key` |

### backend（通过 `/api/v1` 代理）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/session/start` | 创建故事会话 |
| GET | `/api/v1/story/{story_id}` | 获取故事 |
| POST | `/api/v1/story/generate` | 生成故事 |
| POST | `/api/v1/story/regenerate` | 重新生成故事 |
| POST | `/api/v1/feedback/submit` | 提交反馈 |
| POST | `/api/v1/sus/submit` | 提交 SUS 问卷 |
| POST | `/api/v1/telemetry/report` | 遥测上报 |
| POST | `/api/v1/tts` | 文本转语音 |
| GET | `/api/v1/export/child/{id}` | 导出儿童数据 |
| GET | `/api/v1/admin/stats` | 后端统计数据 |

## 登录与首次登录

- `firstLogin=true` → 跳转 `/noa/avatar`
- `firstLogin=false` → 跳转 `/noa/home`
- 账号 `demo`（密码 `demo123`）为调试用途：每次登录都返回 `firstLogin=true`

## 管理员能力

管理员接口通过 Header `x-admin-key` 鉴权，服务端需配置环境变量 `ADMIN_API_KEY`。

### 启动带管理员密钥

```bash
# 方式 1：统一启动
ADMIN_API_KEY=dev-admin npm run dev

# 方式 2：单独启动 user-api
cd user-api && ADMIN_API_KEY=dev-admin npm run dev
```

### 命令行操作

```bash
# 创建用户
curl -X POST http://localhost:3001/api/admin/users \
  -H 'content-type: application/json' \
  -H 'x-admin-key: dev-admin' \
  -d '{"userID":"u1","password":"p1","firstLogin":true}'

# 删除用户
curl -X DELETE http://localhost:3001/api/admin/users/u1 \
  -H 'x-admin-key: dev-admin'
```

### 页面操作

1. 启动：`ADMIN_API_KEY=dev-admin npm run dev`
2. 打开：`http://localhost:5173/noa/admin/users`
3. 输入与 `ADMIN_API_KEY` 相同的密钥，点击"加载数据"
4. 支持：统计概览、参与度漏斗、进食评分分布、绘本指标、会话/反馈/SUS 统计、用户 CRUD

## 数据库

| 服务 | 文件 | 说明 |
|------|------|------|
| user-api | `user-api/data/db.sqlite` | 用户、Avatar、进食记录、绘本 |
| backend | `backend/storybook.db` | 故事会话、反馈、SUS |

可用 DB Browser for SQLite / DBeaver 打开查看。

## 常用脚本

```bash
npm run dev          # 同时启动三个服务
npm test             # Playwright E2E 测试
npm run test:ui      # Playwright UI 模式

cd frontend && npm run lint
cd frontend && npx tsc --noEmit
cd user-api && npx tsc --noEmit
```

## 目录结构

```
SGGG/
├── backend/               # FastAPI 故事生成服务
│   ├── main.py
│   ├── prompt.py          # LLM prompt 定义
│   ├── llm.py             # LLM 调用 (OpenAI/DashScope)
│   ├── models.py          # SQLAlchemy 模型
│   ├── database.py
│   ├── routers/           # API 路由模块
│   └── requirements.txt
├── user-api/              # Express 用户管理服务
│   └── src/
│       ├── index.ts       # API 路由
│       ├── db.ts          # 数据库 + Avatar 资源
│       ├── auth.ts        # JWT 鉴权
│       └── jwt.ts         # Token 签发
├── frontend/              # React SPA
│   └── src/
│       ├── main.tsx       # 路由入口
│       ├── pages/noa/     # 页面组件
│       └── lib/           # 工具库
├── e2e/                   # Playwright E2E 测试
├── scripts/               # 工具脚本
│   └── compose_avatar.py  # Kenney 角色图层生成
├── docs/
│   ├── pages.md           # 页面功能与接口详细说明
│   ├── prompts/           # Prompt 文档
│   │   ├── 绘本故事prompt.md
│   │   ├── 前端开工promptV1.0.md
│   │   └── taste_skill.md
│   └── misc/              # 设计/架构文档
│       ├── SYSTEM_ARCHITECTURE.md
│       ├── API_v1_Interface_Contract.md
│       └── ...
└── package.json           # 根 monorepo 配置
```

## 提交 Clean 版本前需要删除的内容

以下文件/目录不应包含在提交版本中：

```
# 运行时数据（含用户隐私）
user-api/data/db.sqlite
backend/storybook.db
backend/static/images/

# 环境变量（含 API 密钥等敏感信息）
backend/.env
user-api/.env
frontend/.env

# 依赖和构建产物
node_modules/
frontend/node_modules/
frontend/dist/
user-api/node_modules/
user-api/dist/
backend/__pycache__/

# 测试产物
playwright-report/
test-results/
screenshots/

# 开发工具残留
.history/
.claude/

# 参考文件
noa_child.zip
claude-scientific-skills/
```

确认方式：上述内容已在 `.gitignore` 中配置。提交前执行 `git status` 确认无敏感文件被追踪。如果需要发送干净的 zip 包，可以用：

```bash
git archive --format=zip -o SGGG-clean.zip HEAD
```
