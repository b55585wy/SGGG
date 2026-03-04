import crypto from "node:crypto";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { adminRequired, authRequired, type AuthenticatedRequest } from "./auth";
import {
  addHistoryBook,
  findUserById,
  getLatestAvatarState,
  getLatestHistoryBook,
  getTempBook,
  getTempBookById,
  getUserAvatar,
  getHistoryBookById,
  getLastFoodScore,
  insertUser,
  insertAvatarState,
  insertFoodLog,
  listHistoryBooks,
  listUsers,
  saveTempBook,
  saveUserAvatar,
  clearTempBook,
  setFirstLoginFlag,
  deleteUser,
  getAdminStats,
} from "./db";
import { signUserToken } from "./jwt";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

function svgDataUri(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function createBookPreviewImage(title: string) {
  const safeTitle = title.slice(0, 10);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 480"><rect width="360" height="480" rx="18" fill="#f9fafb"/><rect x="24" y="24" width="312" height="72" rx="12" fill="#fff"/><text x="36" y="68" font-size="20" fill="#111827" font-family="Arial">${safeTitle}</text><rect x="24" y="120" width="312" height="240" rx="16" fill="#e5e7eb"/><rect x="24" y="376" width="312" height="56" rx="10" fill="#fff"/><text x="36" y="412" font-size="14" fill="#6b7280" font-family="Arial">绘本预览</text></svg>`;
  return svgDataUri(svg);
}

const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

/** 分数映射：user-api 0-10 → FastAPI 1-5 */
function mapScore(score: number): number {
  if (score <= 2) return 1;
  if (score <= 4) return 2;
  if (score <= 6) return 3;
  if (score <= 8) return 4;
  return 5;
}

async function generateTempBookForUser(params: {
  userID: string;
  nickname: string;
  gender: string;
  themeFood: string;
  mealScore: number;
  mealContent: string;
  regenerateCount: number;
}) {
  const requestBody = {
    child_profile: {
      nickname: params.nickname,
      age: 5,
      gender: params.gender,
    },
    meal_context: {
      target_food: params.themeFood,
      meal_score: mapScore(params.mealScore),
      meal_text: params.mealContent || "",
    },
    story_config: {
      story_type: "interactive",
      difficulty: "medium",
      pages: 6,
      interactive_density: "medium",
      language: "zh-CN",
    },
  };

  const response = await fetch(`${FASTAPI_URL}/api/v1/story/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`FastAPI story/generate failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    draft: {
      story_id: string;
      book_meta: { title: string; summary: string };
      pages: unknown[];
      ending: unknown;
      avatar_feedback?: { feedbackText: string; expression: string };
    };
  };
  const draft = data.draft;

  // Update avatar state with LLM-generated feedback if available
  if (draft.avatar_feedback?.feedbackText) {
    await insertAvatarState({
      userID: params.userID,
      feedbackText: draft.avatar_feedback.feedbackText,
    });
  }

  await saveTempBook({
    userID: params.userID,
    bookID: draft.story_id,
    title: draft.book_meta.title,
    preview: createBookPreviewImage(draft.book_meta.title),
    description: draft.book_meta.summary,
    content: JSON.stringify(draft),
    regenerateCount: params.regenerateCount,
  });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/login", async (req, res) => {
  const body = req.body as unknown;
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { userID?: unknown }).userID !== "string" ||
    typeof (body as { password?: unknown }).password !== "string"
  ) {
    res.status(400).json({ message: "参数错误" });
    return;
  }

  const { userID, password } = body as { userID: string; password: string };
  const user = await findUserById(userID);
  if (!user || user.password !== password) {
    res.status(401).json({ message: "账号或密码错误" });
    return;
  }

  const isDemoUser = user.user_id === "demo";
  const firstLogin = isDemoUser ? true : user.first_login === 1;
  const token = signUserToken({ userID: user.user_id });
  if (isDemoUser) {
    await setFirstLoginFlag(user.user_id, true);
  } else if (firstLogin) {
    await setFirstLoginFlag(user.user_id, false);
  }

  res.json({
    token,
    user: { userID: user.user_id },
    firstLogin,
  });
});

app.post("/api/admin/users", adminRequired, async (req, res) => {
  const body = req.body as unknown;
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { userID?: unknown }).userID !== "string" ||
    typeof (body as { password?: unknown }).password !== "string"
  ) {
    res.status(400).json({ message: "参数错误" });
    return;
  }

  const { userID, password } = body as { userID: string; password: string };
  const firstLogin =
    typeof (body as { firstLogin?: unknown }).firstLogin === "boolean"
      ? (body as { firstLogin: boolean }).firstLogin
      : true;
  const themeFood =
    typeof (body as { themeFood?: unknown }).themeFood === "string"
      ? (body as { themeFood: string }).themeFood.trim()
      : "胡萝卜";

  if (!userID.trim() || !password) {
    res.status(400).json({ message: "参数错误" });
    return;
  }

  try {
    await insertUser({ userID, password, firstLogin, themeFood });
    res.status(201).json({ user: { userID }, firstLogin, themeFood });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message.includes("UNIQUE constraint failed")) {
      res.status(409).json({ message: "用户已存在" });
      return;
    }
    res.status(500).json({ message: "创建用户失败" });
  }
});

app.get("/api/admin/users", adminRequired, async (_req, res) => {
  const users = await listUsers();
  res.json({ users });
});

app.delete("/api/admin/users/:userID", adminRequired, async (req, res) => {
  const userID = Array.isArray(req.params.userID) ? req.params.userID[0] : req.params.userID;
  if (!userID) {
    res.status(400).json({ message: "参数错误" });
    return;
  }
  try {
    const deleted = await deleteUser(userID);
    if (deleted) {
      res.json({ ok: true, message: "删除成功" });
    } else {
      res.status(404).json({ message: "用户不存在" });
    }
  } catch (e) {
    res.status(500).json({ message: "删除失败" });
  }
});

app.get("/api/admin/stats", adminRequired, async (_req, res) => {
  try {
    const stats = await getAdminStats();
    res.json(stats);
  } catch (e) {
    console.error("[ADMIN] stats error:", e);
    res.status(500).json({ message: "统计数据加载失败" });
  }
});

app.post("/api/avatar/save", authRequired, async (req: AuthenticatedRequest, res) => {
  const body = req.body as unknown;
  if (!req.user) {
    res.status(401).json({ message: "未登录" });
    return;
  }
  if (!body || typeof body !== "object") {
    res.status(400).json({ message: "参数错误" });
    return;
  }
  const nickname =
    typeof (body as { nickname?: unknown }).nickname === "string"
      ? (body as { nickname: string }).nickname.trim()
      : "";
  const gender =
    typeof (body as { gender?: unknown }).gender === "string"
      ? (body as { gender: string }).gender
      : "";
  if (!nickname || (gender !== "male" && gender !== "female")) {
    res.status(400).json({ message: "昵称和性别不能为空" });
    return;
  }

  const str = (key: string) =>
    typeof (body as Record<string, unknown>)[key] === "string"
      ? (body as Record<string, string>)[key]
      : undefined;

  await saveUserAvatar({
    userID: req.user.userID,
    nickname,
    gender,
    skinColor: str("skinColor"),
    hair: str("hair"),
    hairColor: str("hairColor"),
  });
  res.json({ ok: true });
});

app.get("/api/home/status", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ message: "未登录" });
    return;
  }
  const avatar = await getUserAvatar(req.user.userID);
  if (!avatar) {
    res.status(404).json({ message: "未找到虚拟形象" });
    return;
  }

  const latestState = await getLatestAvatarState(req.user.userID);
  const lastScore = await getLastFoodScore(req.user.userID);

  const avatarData = {
    nickname: avatar.nickname,
    skinColor: avatar.skinColor,
    hair: avatar.hair,
    hairColor: avatar.hairColor,
  };

  const base = {
    avatar: avatarData,
    feedbackText: latestState?.feedbackText || "",
    themeFood: avatar.themeFood,
    lastScore,
  };

  const tempBook = await getTempBook(req.user.userID);
  if (tempBook) {
    res.json({
      ...base,
      book: {
        bookID: tempBook.bookID,
        title: tempBook.title,
        preview: tempBook.preview,
        description: tempBook.description,
        confirmed: false,
        regenerateCount: tempBook.regenerateCount,
      },
    });
    return;
  }

  const latestHistory = await getLatestHistoryBook(req.user.userID);
  if (latestHistory) {
    res.json({
      ...base,
      book: {
        bookID: latestHistory.bookID,
        title: latestHistory.title,
        preview: latestHistory.preview,
        description: latestHistory.description,
        confirmed: true,
        regenerateCount: 0,
      },
    });
    return;
  }

  res.json({ ...base, book: null });
});

app.post("/api/food/log", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ message: "未登录" });
    return;
  }
  const body = req.body as unknown;
  if (!body || typeof body !== "object") {
    res.status(400).json({ message: "参数错误" });
    return;
  }
  const score = Number((body as { score?: unknown }).score);
  const content =
    typeof (body as { content?: unknown }).content === "string"
      ? (body as { content: string }).content.trim()
      : "";
  if (!Number.isFinite(score) || score <= 0) {
    res.status(400).json({ message: "请先滑动评分条" });
    return;
  }
  if (!content) {
    res.status(400).json({ message: "请输入进食记录" });
    return;
  }
  const voiceData =
    typeof (body as { voiceData?: unknown }).voiceData === "string"
      ? (body as { voiceData: string }).voiceData
      : null;

  await insertFoodLog({
    userID: req.user.userID,
    score,
    content,
    voiceData,
  });

  // Immediate feedback (score-based); LLM feedback comes async via story generation
  const feedbackText =
    score >= 9
      ? "哇，你今天表现太棒了！继续保持！"
      : score >= 7
        ? "很好的尝试，继续加油！"
        : score >= 5
          ? "不错的进步，慢慢来！"
          : score >= 3
            ? "没关系，每一小步都是进步。"
            : "谢谢你的尝试，下次我们再试试看。";
  const expression =
    score >= 7 ? "happy" : score >= 5 ? "encouraging" : score >= 3 ? "gentle" : "neutral";

  await insertAvatarState({ userID: req.user.userID, feedbackText });

  const avatar = await getUserAvatar(req.user.userID);
  if (avatar) {
    generateTempBookForUser({
      userID: req.user.userID,
      nickname: avatar.nickname,
      gender: avatar.gender,
      themeFood: avatar.themeFood,
      mealScore: score,
      mealContent: content,
      regenerateCount: 0,
    }).catch((err) => console.error("[BOOK] 绘本生成失败:", err));
  }

  res.json({ ok: true, feedbackText, expression, score });
});

app.post("/api/book/confirm", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ message: "未登录" });
    return;
  }
  const tempBook = await getTempBook(req.user.userID);
  if (!tempBook) {
    res.status(404).json({ message: "未找到待确认绘本" });
    return;
  }
  await addHistoryBook({
    bookID: tempBook.bookID,
    userID: tempBook.userID,
    title: tempBook.title,
    preview: tempBook.preview,
    description: tempBook.description,
    content: tempBook.content,
  });
  await clearTempBook(req.user.userID);
  res.json({ ok: true });
});

app.post("/api/book/regenerate", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ message: "未登录" });
    return;
  }
  const body = req.body as unknown;
  const promptTitle =
    body && typeof body === "object" && typeof (body as { title?: unknown }).title === "string"
      ? (body as { title: string }).title
      : null;
  const promptNote =
    body && typeof body === "object" && typeof (body as { note?: unknown }).note === "string"
      ? (body as { note: string }).note
      : null;
  const tempBook = await getTempBook(req.user.userID);
  if (!tempBook) {
    res.status(404).json({ message: "未找到待确认绘本" });
    return;
  }
  if (tempBook.regenerateCount >= 2) {
    res.status(400).json({ message: "已达到重新生成上限" });
    return;
  }
  const avatar = await getUserAvatar(req.user.userID);
  if (!avatar) {
    res.status(404).json({ message: "未找到虚拟形象" });
    return;
  }

  const storyType =
    body && typeof body === "object" && typeof (body as { story_type?: unknown }).story_type === "string"
      ? (body as { story_type: string }).story_type
      : "interactive";

  const regenBody = {
    previous_story_id: tempBook.bookID,
    target_food: avatar.themeFood,
    story_type: storyType,
    dissatisfaction_reason: promptNote || "用户要求重新生成",
  };

  const response = await fetch(`${FASTAPI_URL}/api/v1/story/regenerate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(regenBody),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("[BOOK] 重新生成失败:", response.status, text);
    res.status(502).json({ message: "绘本重新生成失败" });
    return;
  }

  const data = (await response.json()) as {
    draft: {
      story_id: string;
      book_meta: { title: string; summary: string };
      pages: unknown[];
      ending: unknown;
    };
  };
  const draft = data.draft;

  await saveTempBook({
    userID: req.user.userID,
    bookID: draft.story_id,
    title: draft.book_meta.title,
    preview: createBookPreviewImage(draft.book_meta.title),
    description: draft.book_meta.summary,
    content: JSON.stringify(draft),
    regenerateCount: tempBook.regenerateCount + 1,
  });

  res.json({
    ok: true,
    book: {
      bookID: draft.story_id,
      title: draft.book_meta.title,
      preview: createBookPreviewImage(draft.book_meta.title),
      description: draft.book_meta.summary,
      confirmed: false,
      regenerateCount: tempBook.regenerateCount + 1,
    },
  });
});

app.get("/api/books/history", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ message: "未登录" });
    return;
  }
  const items = await listHistoryBooks(req.user.userID);
  res.json({
    items: items.map((item) => ({
      bookID: item.bookID,
      title: item.title,
      preview: item.preview,
      description: item.description,
      confirmedAt: item.confirmedAt,
    })),
  });
});

app.get("/api/books/:bookId", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ message: "未登录" });
    return;
  }
  const bookID = Array.isArray(req.params.bookId)
    ? req.params.bookId[0]
    : req.params.bookId;
  if (!bookID) {
    res.status(400).json({ message: "参数错误" });
    return;
  }
  const tempBook = await getTempBookById(req.user.userID, bookID);
  if (tempBook) {
    res.json({
      book: {
        bookID: tempBook.bookID,
        title: tempBook.title,
        preview: tempBook.preview,
        description: tempBook.description,
        content: tempBook.content,
        confirmed: false,
      },
    });
    return;
  }
  const historyBook = await getHistoryBookById(req.user.userID, bookID);
  if (!historyBook) {
    res.status(404).json({ message: "绘本不存在" });
    return;
  }
  res.json({
    book: {
      bookID: historyBook.bookID,
      title: historyBook.title,
      preview: historyBook.preview,
      description: historyBook.description,
      content: historyBook.content,
      confirmed: true,
    },
  });
});

app.post("/api/voice/transcribe", authRequired, (_req: AuthenticatedRequest, res) => {
  res.json({ text: "（语音转写示例）" });
});

app.get("/api/auth/me", authRequired, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port} (with admin stats)`);
});
