import crypto from "node:crypto";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { adminRequired, authRequired, type AuthenticatedRequest } from "./auth";
import {
  addHistoryBook,
  findUserById,
  getAvatarBase,
  getAvatarComponent,
  getLatestAvatarState,
  getLatestHistoryBook,
  getTempBook,
  getTempBookById,
  getUserAvatar,
  getHistoryBookById,
  getLastFoodScore,
  getFoodLogHistory,
  getFoodLogHeatmapData,
  getReadingSummary,
  insertUser,
  insertAvatarState,
  insertFoodLog,
  insertReadingSession,
  getDailyReadingStats,
  insertVoiceRecording,
  listAvatarOptions,
  listHistoryBooks,
  listUsers,
  saveTempBook,
  saveUserAvatar,
  clearTempBook,
  setFirstLoginFlag,
  deleteUser,
  getAdminStats,
  setUserGenerating,
  clearUserGenerating,
  isUserGenerating,
  setGenerateError,
  clearGenerateError,
  getGenerateError,
  exportAllUsers,
  exportAllFoodLogs,
  exportAllReadingSessions,
  exportAllVoiceRecordings,
  exportAllAvatars,
} from "./db";
import { signUserToken } from "./jwt";

dotenv.config();

// In-memory set tracking users whose book is currently being generated/regenerated.
// Cleared when the temp book is saved (or on error). Survives individual requests but
// resets on server restart — acceptable because the polling client will see the book
// in the DB once generation completes regardless.
const generatingUsers = new Set<string>();

const app = express();

app.use(cors());
app.use(express.json());

function svgDataUri(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function createBookPreviewImage() {
  // Abstract cover art: clean gradient shapes, no embedded text (title shown in UI)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 480"><rect width="360" height="480" fill="#d1fae5"/><circle cx="300" cy="70" r="120" fill="#a7f3d0" opacity="0.5"/><circle cx="40" cy="430" r="140" fill="#6ee7b7" opacity="0.3"/><rect x="55" y="130" width="250" height="220" rx="22" fill="white" opacity="0.55"/><circle cx="180" cy="195" r="38" fill="#059669" opacity="0.12"/><rect x="85" y="250" width="190" height="9" rx="4.5" fill="#059669" opacity="0.18"/><rect x="85" y="272" width="150" height="9" rx="4.5" fill="#059669" opacity="0.14"/><rect x="85" y="294" width="170" height="9" rx="4.5" fill="#059669" opacity="0.16"/><circle cx="180" cy="196" r="22" fill="#059669" opacity="0.1"/></svg>`;
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

/** 根据最近得分列表计算趋势（improving / declining / stable） */
function calcScoreTrend(scores: number[]): "improving" | "declining" | "stable" {
  if (scores.length < 2) return "stable";
  // 比较最近一次与前两次均值
  const latest = scores[0];
  const baseline = scores.slice(1, 3).reduce((a, b) => a + b, 0) / Math.min(scores.length - 1, 2);
  if (latest - baseline >= 1) return "improving";
  if (baseline - latest >= 1) return "declining";
  return "stable";
}

/** 计算首次尝试至今的天数 */
function daysSinceFirst(firstAt: string): number {
  const first = new Date(firstAt).getTime();
  return Math.round((Date.now() - first) / 86_400_000);
}

async function generateTempBookForUser(params: {
  userID: string;
  nickname: string;
  gender: string;
  themeFood: string;
  mealScore: number;
  mealContent: string;
  regenerateCount: number;
  /** 最近历史进食记录（不含本次，降序） */
  recentHistory: Array<{ score: number; content: string; createdAt: string }>;
  /** 阅读行为摘要 */
  readingSummary: { totalSessions: number; lastCompletionRate: number | null; lastCompleted: boolean | null };
  /** 孩子年龄，默认 5 */
  age?: number;
  /** 管理员自定义 prompt（附加到故事生成请求中） */
  customPrompt?: string;
}) {
  const allScores = [params.mealScore, ...params.recentHistory.map((h) => h.score)];
  const trend = calcScoreTrend(allScores);
  const attemptNumber = params.recentHistory.length + 1; // 含本次
  const firstAt = params.recentHistory.length > 0
    ? params.recentHistory[params.recentHistory.length - 1].createdAt
    : new Date().toISOString();

  // 自动推断故事难度：进步中且读完了上一本 → 稍难；一直低分 → 简单
  let autoDifficulty: "easy" | "medium" | "hard" = "medium";
  if (trend === "improving" && params.readingSummary.lastCompleted === true) {
    autoDifficulty = allScores[0] >= 7 ? "hard" : "medium";
  } else if (allScores[0] <= 3) {
    autoDifficulty = "easy";
  }

  const requestBody: Record<string, unknown> = {
    child_profile: {
      nickname: params.nickname,
      age: params.age ?? 5,
      gender: params.gender,
    },
    meal_context: {
      target_food: params.themeFood,
      meal_score: mapScore(params.mealScore),
      meal_text: params.mealContent || "",
      attempt_number: attemptNumber,
    },
    food_history: {
      recent_scores: params.recentHistory.slice(0, 5).map((h) => h.score),
      score_trend: trend,
      days_since_first_attempt: daysSinceFirst(firstAt),
    },
    reading_context: {
      total_reading_sessions: params.readingSummary.totalSessions,
      previous_book_completed: params.readingSummary.lastCompleted ?? false,
      previous_book_completion_rate: params.readingSummary.lastCompletionRate,
    },
    story_config: {
      story_type: "interactive",
      difficulty: autoDifficulty,
      pages: 6,
      interactive_density: "medium",
      language: "zh-CN",
    },
  };
  if (params.customPrompt) {
    requestBody.custom_prompt = params.customPrompt;
  }

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
    preview: createBookPreviewImage(),
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

  const token = signUserToken({ userID: user.user_id });
  // firstLogin based on DB flag so admin-generated accounts still visit /noa/avatar
  const existingAvatar = await getUserAvatar(user.user_id);
  const firstLogin = user.first_login === 1;
  if (!user.user_id.startsWith("demo") && firstLogin) {
    await setFirstLoginFlag(user.user_id, false);
  }

  // Set persistent httpOnly cookie — survives localStorage clears on iOS Safari
  res.cookie("noa_token", token, {
    httpOnly: true,
    maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
    path: "/",
    sameSite: "lax",
  });

  res.json({
    token,
    user: { userID: user.user_id },
    firstLogin,
  });
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("noa_token", { path: "/" });
  res.json({ ok: true });
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
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message.includes("UNIQUE constraint failed")) {
      res.status(409).json({ message: "用户已存在" });
      return;
    }
    res.status(500).json({ message: "创建用户失败" });
    return;
  }

  // Optionally generate default storybook
  const wantBook = (body as { generateBook?: unknown }).generateBook === true;
  if (wantBook) {
    const nickname =
      typeof (body as { nickname?: unknown }).nickname === "string"
        ? (body as { nickname: string }).nickname.trim() || userID
        : userID;
    const gender =
      (body as { gender?: unknown }).gender === "female" ? "female" : "male";
    const age =
      typeof (body as { age?: unknown }).age === "number"
        ? (body as { age: number }).age
        : 5;
    const customPrompt =
      typeof (body as { customPrompt?: unknown }).customPrompt === "string"
        ? (body as { customPrompt: string }).customPrompt.trim()
        : "";

    // Auto-create avatar so the user doesn't need the avatar step
    await saveUserAvatar({ userID, nickname, gender });

    // Fire-and-forget story generation
    generatingUsers.add(userID);
    setUserGenerating(userID).catch(() => {});
    clearGenerateError(userID).catch(() => {});
    generateTempBookForUser({
      userID,
      nickname,
      gender,
      themeFood,
      mealScore: 5,
      mealContent: `第一次尝试${themeFood}`,
      regenerateCount: 0,
      recentHistory: [],
      readingSummary: { totalSessions: 0, lastCompletionRate: null, lastCompleted: null },
      age,
      customPrompt: customPrompt || undefined,
    })
      .catch(async (err) => {
        console.error("[ADMIN-BOOK] 默认绘本生成失败:", err);
        const msg = err instanceof Error ? err.message : "绘本生成失败";
        await setGenerateError(userID, msg).catch(() => {});
      })
      .finally(async () => {
        generatingUsers.delete(userID);
        await clearUserGenerating(userID).catch(() => {});
      });
  }

  res.status(201).json({ user: { userID }, firstLogin, themeFood, bookGenerating: wantBook });
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

app.get("/api/avatar/current", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) { res.status(401).json({ message: "未登录" }); return; }
  const avatar = await getUserAvatar(req.user.userID);
  if (!avatar) { res.status(404).json({ message: "未找到虚拟形象" }); return; }
  res.json({
    nickname: avatar.nickname,
    gender: avatar.gender,
    hairStyle: avatar.hairStyle,
    glasses: avatar.glasses,
    topColor: avatar.topColor,
    bottomColor: avatar.bottomColor,
  });
});

app.get("/api/avatar/base", async (_req, res) => {
  const image = await getAvatarBase();
  if (!image) {
    res.status(404).json({ message: "未找到形象底图" });
    return;
  }
  res.json({ image });
});

app.get("/api/avatar/options", async (_req, res) => {
  const options = await listAvatarOptions();
  res.json(options);
});

app.get("/api/avatar/component", async (req, res) => {
  const type = typeof req.query.type === "string" ? req.query.type : "";
  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!type || !id) {
    res.status(400).json({ message: "参数错误" });
    return;
  }
  if (type !== "hair" && type !== "glasses" && type !== "top" && type !== "bottom") {
    res.status(400).json({ message: "参数错误" });
    return;
  }
  const image = await getAvatarComponent(type, id);
  if (!image) {
    res.status(404).json({ message: "未找到组件图片" });
    return;
  }
  res.json({ image });
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
      : null;

  await saveUserAvatar({
    userID: req.user.userID,
    nickname,
    gender,
    hairStyle: str("hairStyle"),
    glasses: str("glasses"),
    topColor: str("topColor"),
    bottomColor: str("bottomColor"),
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

  const [baseImage, hairImage, glassesImage, topImage, bottomImage, latestState] =
    await Promise.all([
      getAvatarBase(),
      avatar.hairStyle ? getAvatarComponent("hair", avatar.hairStyle) : Promise.resolve(null),
      avatar.glasses ? getAvatarComponent("glasses", avatar.glasses) : Promise.resolve(null),
      avatar.topColor ? getAvatarComponent("top", avatar.topColor) : Promise.resolve(null),
      avatar.bottomColor ? getAvatarComponent("bottom", avatar.bottomColor) : Promise.resolve(null),
      getLatestAvatarState(req.user.userID),
    ]);

  const avatarData = {
    nickname: avatar.nickname,
    baseImage,
    hairImage: hairImage || "",
    glassesImage: glassesImage || "",
    topImage: topImage || "",
    bottomImage: bottomImage || "",
  };

  const base = {
    avatar: avatarData,
    feedbackText: latestState?.feedbackText || "",
    themeFood: avatar.themeFood,
  };

  const tempBook = await getTempBook(req.user.userID);
  const generating = generatingUsers.has(req.user.userID) || await isUserGenerating(req.user.userID);
  const generateError = generating ? null : await getGenerateError(req.user.userID);
  if (tempBook) {
    res.json({
      ...base,
      generating,
      generateError,
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
      generating,
      generateError,
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

  res.json({ ...base, generating, generateError, book: null });
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

  // 在插入本次记录前先取历史，确保历史不含本次（计算 attempt_number / trend 准确）
  const [historyBeforeInsert, avatar] = await Promise.all([
    getFoodLogHistory(req.user.userID, 10),
    getUserAvatar(req.user.userID),
  ]);

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

  const skipGen = (body as { skipBookGeneration?: unknown }).skipBookGeneration === true;
  if (avatar && !skipGen) {
    const readingSummary = await getReadingSummary(req.user.userID);
    generatingUsers.add(req.user.userID);
    setUserGenerating(req.user.userID).catch(() => {});
    clearGenerateError(req.user.userID).catch(() => {});
    generateTempBookForUser({
      userID: req.user.userID,
      nickname: avatar.nickname,
      gender: avatar.gender,
      themeFood: avatar.themeFood,
      mealScore: score,
      mealContent: content,
      regenerateCount: 0,
      recentHistory: historyBeforeInsert,
      readingSummary,
    }).catch(async (err) => {
        console.error("[BOOK] 绘本生成失败:", err);
        const msg = err instanceof Error ? err.message : "绘本生成失败";
        await setGenerateError(req.user!.userID, msg).catch(() => {});
      })
      .finally(async () => {
        generatingUsers.delete(req.user!.userID);
        await clearUserGenerating(req.user!.userID).catch(() => {});
      });
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
  const promptReason =
    body && typeof body === "object" && typeof (body as { reason?: unknown }).reason === "string"
      ? (body as { reason: string }).reason
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

  const regenPages =
    body && typeof body === "object" && typeof (body as { pages?: unknown }).pages === "number"
      ? Math.min(12, Math.max(4, (body as { pages: number }).pages))
      : 6;

  const regenDifficulty =
    body && typeof body === "object" && typeof (body as { difficulty?: unknown }).difficulty === "string"
      ? (body as { difficulty: string }).difficulty
      : "medium";

  const regenInteractionDensity =
    body && typeof body === "object" && typeof (body as { interaction_density?: unknown }).interaction_density === "string"
      ? (body as { interaction_density: string }).interaction_density
      : "medium";

  // Optional: temporary food override for this regeneration only
  const targetFoodOverride =
    body && typeof body === "object" && typeof (body as { target_food?: unknown }).target_food === "string"
      ? (body as { target_food: string }).target_food.trim()
      : null;

  const regenBody = {
    previous_story_id: tempBook.bookID,
    target_food: targetFoodOverride || avatar.themeFood,
    story_type: storyType,
    pages: regenPages,
    difficulty: regenDifficulty,
    interaction_density: regenInteractionDensity,
    dissatisfaction_reason: promptReason || promptNote || "用户要求重新生成",
  };

  generatingUsers.add(req.user.userID);
  await setUserGenerating(req.user.userID).catch(() => {});
  try {
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
    preview: createBookPreviewImage(),
    description: draft.book_meta.summary,
    content: JSON.stringify(draft),
    regenerateCount: tempBook.regenerateCount + 1,
  });

  res.json({
    ok: true,
    book: {
      bookID: draft.story_id,
      title: draft.book_meta.title,
      preview: createBookPreviewImage(),
      description: draft.book_meta.summary,
      confirmed: false,
      regenerateCount: tempBook.regenerateCount + 1,
    },
  });
  } finally {
    generatingUsers.delete(req.user.userID);
    await clearUserGenerating(req.user.userID).catch(() => {});
  }
});

app.get("/api/food/heatmap", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ message: "未登录" });
    return;
  }
  const weeksParam = Number((req.query as { weeks?: string }).weeks ?? "5");
  const weeks = Number.isFinite(weeksParam) && weeksParam > 0 && weeksParam <= 52 ? weeksParam : 5;
  const days = await getFoodLogHeatmapData(req.user.userID, weeks * 7);
  res.json({ days });
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

// ─── Voice Recording ────────────────────────────────────────

app.post("/api/voice/record", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) { res.status(401).json({ message: "未登录" }); return; }
  const body = req.body as {
    audioData?: unknown;
    transcript?: unknown;
    source?: unknown;
    contextId?: unknown;
    pageId?: unknown;
    durationMs?: unknown;
  };
  const recordingId = await insertVoiceRecording({
    userID: req.user.userID,
    source: typeof body.source === "string" ? body.source : "interaction",
    contextId: typeof body.contextId === "string" ? body.contextId : null,
    pageId: typeof body.pageId === "string" ? body.pageId : null,
    audioData: typeof body.audioData === "string" ? body.audioData : null,
    transcript: typeof body.transcript === "string" ? body.transcript : null,
    durationMs: typeof body.durationMs === "number" ? body.durationMs : null,
  });
  const transcript = typeof body.transcript === "string" ? body.transcript : "";
  res.json({ ok: true, recordingId, transcript });
});

// Legacy transcribe stub — kept for backward compat with food log button
app.post("/api/voice/transcribe", authRequired, (_req: AuthenticatedRequest, res) => {
  res.json({ text: "" });
});

app.get("/api/auth/me", authRequired, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

// ─── Reading Session Auto-Log ──────────────────────────────

app.post("/api/reading/log", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) { res.status(401).json({ message: "未登录" }); return; }
  const body = req.body as {
    bookId?: unknown;
    startedAt?: unknown;
    endedAt?: unknown;
    durationMs?: unknown;
    totalPages?: unknown;
    pagesRead?: unknown;
    interactionCount?: unknown;
    completed?: unknown;
    sessionType?: unknown;
    tryLevel?: unknown;
    abortReason?: unknown;
  };
  const durationMs = typeof body.durationMs === "number" ? body.durationMs : 0;
  const totalPages = typeof body.totalPages === "number" ? body.totalPages : 0;
  const pagesRead = typeof body.pagesRead === "number" ? body.pagesRead : 0;
  const now = new Date().toISOString();
  await insertReadingSession({
    userID: req.user.userID,
    bookID: typeof body.bookId === "string" ? body.bookId : null,
    startedAt: typeof body.startedAt === "string" ? body.startedAt : now,
    endedAt: typeof body.endedAt === "string" ? body.endedAt : now,
    durationMs,
    totalPages,
    pagesRead,
    interactionCount: typeof body.interactionCount === "number" ? body.interactionCount : 0,
    completed: body.completed === true,
    sessionType: typeof body.sessionType === "string" ? body.sessionType : "experiment",
    tryLevel: typeof body.tryLevel === "string" ? body.tryLevel : null,
    abortReason: typeof body.abortReason === "string" ? body.abortReason : null,
  });
  // Return daily count for today for this user
  const daily = await getDailyReadingStats(1);
  const todayCount = daily[0]?.sessionCount ?? 1;
  res.json({ ok: true, todayCount });
});

// ─── Admin CSV Exports ─────────────────────────────────────

function checkAdminKey(req: express.Request, res: express.Response): boolean {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) { res.status(503).json({ message: "未配置管理员密钥" }); return false; }
  const key = req.header("x-admin-key") || (typeof req.query.key === "string" ? req.query.key : "");
  if (key !== expected) { res.status(403).json({ message: "无权限" }); return false; }
  return true;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => {
      const v = row[h];
      if (v == null) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","));
  }
  return lines.join("\n");
}

function csvRoute(
  filename: string,
  fetcher: () => Promise<Record<string, unknown>[]>,
) {
  return async (req: express.Request, res: express.Response) => {
    if (!checkAdminKey(req, res)) return;
    try {
      const rows = await fetcher();
      const csv = toCsv(rows);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (e) {
      console.error(`[EXPORT] ${filename} error:`, e);
      res.status(500).json({ message: "导出失败" });
    }
  };
}

app.get("/api/admin/export/users.csv", csvRoute("users.csv", exportAllUsers));
app.get("/api/admin/export/food_logs.csv", csvRoute("food_logs.csv", exportAllFoodLogs));
app.get("/api/admin/export/reading_sessions.csv", csvRoute("reading_sessions.csv", exportAllReadingSessions));
app.get("/api/admin/export/voice_recordings.csv", csvRoute("voice_recordings.csv", exportAllVoiceRecordings));
app.get("/api/admin/export/avatars.csv", csvRoute("avatars.csv", exportAllAvatars));

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port} (with admin stats)`);
});
