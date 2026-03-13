import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import { adminRequired, authRequired, type AuthenticatedRequest } from "./auth";
import {
  addHistoryBook,
  findUserById,
  getAvatarBase,
  getAvatarComponent,
  getLatestAvatarState,
  getLatestHistoryBook,
  getRecentHistoryBooks,
  getTempBook,
  getTempBookById,
  getUserAvatar,
  getHistoryBookById,
  getLastFoodScore,
  getFoodLogHistory,
  getFoodLogHeatmapData,
  getRecentAvatarFeedbackTexts,
  getLatestCompletedReadingForUser,
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
  saveUserStoryArc,
  getUserStoryArc,
  clearTempBook,
  setFirstLoginFlag,
  deleteUser,
  getAdminStats,
  setUserGenerating,
  clearUserGenerating,
  isUserGenerating,
  getUserGeneratingState,
  setUserGeneratingError,
  clearUserGeneratingError,
  exportAllUsers,
  exportAllFoodLogs,
  exportAllReadingSessions,
  exportAllVoiceRecordings,
  exportAllAvatars,
  setUserAvatarEmotion,
  updateUserThemeFood,
} from "./db";
import { signUserToken } from "./jwt";
import { buildStoryArcUserProfile, type StoryArcExtraProfile } from "./storyArc";
import { buildPreviousBlocks, type StorySummaryOutput } from "./storySummary";

dotenv.config();

const FASTAPI_FETCH_TIMEOUT_SEC = (() => {
  const raw = Number(process.env.FASTAPI_FETCH_TIMEOUT_SEC ?? "900");
  return Number.isFinite(raw) && raw > 0 ? raw : 900;
})();

async function postJsonWithTimeout(url: string, body: unknown, timeoutSec: number) {
  const target = new URL(url);
  const payload = JSON.stringify(body);
  const transport = target.protocol === "https:" ? https : http;
  return await new Promise<{
    ok: boolean;
    status: number;
    text: string;
    json: unknown | null;
  }>((resolve, reject) => {
    const req = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => {
          let parsed: unknown | null = null;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch {
            parsed = null;
          }
          const status = res.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            text,
            json: parsed,
          });
        });
      },
    );
    req.setTimeout(timeoutSec * 1000, () => {
      req.destroy(new Error(`FASTAPI request timeout after ${timeoutSec}s`));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// In-memory set tracking users whose book is currently being generated/regenerated.
// Cleared when the temp book is saved (or on error). Survives individual requests but
// resets on server restart — acceptable because the polling client will see the book
// in the DB once generation completes regardless.
const generatingUsers = new Set<string>();
type PendingAutoStory = {
  storyId: string;
  title: string;
  summary: string;
  regenerateCount: number;
};
const pendingAutoStories = new Map<string, PendingAutoStory>();

function clearUserRuntimeGenerationState(userID: string) {
  generatingUsers.delete(userID);
  pendingAutoStories.delete(userID);
}

const app = express();

app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

function svgDataUri(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function createBookPreviewImage() {
  // Abstract cover art: clean gradient shapes, no embedded text (title shown in UI)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 480"><rect width="360" height="480" fill="#d1fae5"/><circle cx="300" cy="70" r="120" fill="#a7f3d0" opacity="0.5"/><circle cx="40" cy="430" r="140" fill="#6ee7b7" opacity="0.3"/><rect x="55" y="130" width="250" height="220" rx="22" fill="white" opacity="0.55"/><circle cx="180" cy="195" r="38" fill="#059669" opacity="0.12"/><rect x="85" y="250" width="190" height="9" rx="4.5" fill="#059669" opacity="0.18"/><rect x="85" y="272" width="150" height="9" rx="4.5" fill="#059669" opacity="0.14"/><rect x="85" y="294" width="170" height="9" rx="4.5" fill="#059669" opacity="0.16"/><circle cx="180" cy="196" r="22" fill="#059669" opacity="0.1"/></svg>`;
  return svgDataUri(svg);
}

function buildAvatarReferenceAssetPath(avatar: {
  gender: string;
  avatarColor: string;
  avatarShirt: string;
  avatarUnderdress: string;
  avatarGlasses: string;
}) {
  return `/basic/${avatar.gender}_${avatar.avatarColor}_${avatar.avatarShirt}_${avatar.avatarUnderdress}_${avatar.avatarGlasses}.png`;
}

function buildChildAvatarTemporalState(avatar: {
  nickname: string;
  gender: string;
  avatarColor: string;
  avatarShirt: string;
  avatarUnderdress: string;
  avatarGlasses: string;
}) {
  return {
    nickname: avatar.nickname,
    gender: avatar.gender,
    identity_source: "persistent_base_reference",
    color: avatar.avatarColor,
    shirt: avatar.avatarShirt,
    underdress: avatar.avatarUnderdress,
    glasses: avatar.avatarGlasses,
    reference_asset_kind: "frontend_public_png",
    reference_asset_path: buildAvatarReferenceAssetPath(avatar),
  };
}

function isPlaceholderPreview(preview: string) {
  return preview.startsWith("data:image/svg+xml");
}

function extractStoryId(content: string): string | null {
  try {
    const parsed = JSON.parse(content) as { story_id?: string };
    return typeof parsed.story_id === "string" ? parsed.story_id : null;
  } catch {
    return null;
  }
}

function extractBookMeta(content: string): { title: string; summary: string } | null {
  try {
    const parsed = JSON.parse(content) as { book_meta?: { title?: string; summary?: string } };
    const title = typeof parsed.book_meta?.title === "string" ? parsed.book_meta.title : "";
    const summary = typeof parsed.book_meta?.summary === "string" ? parsed.book_meta.summary : "";
    if (!title && !summary) return null;
    return { title, summary };
  } catch {
    return null;
  }
}

async function resolvePreviewFromBackend(storyId: string): Promise<string | null> {
  try {
    const res = await fetch(`${FASTAPI_URL}/api/v1/story/${storyId}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { draft?: { pages?: Array<{ page_no?: number; image_url?: string }> } };
    const pages = data.draft?.pages ?? [];
    if (pages.length === 0) return null;
    const allReady = pages.every((p) => typeof p.image_url === "string" && p.image_url.length > 0);
    if (!allReady) return null;
    const sorted = [...pages].sort((a, b) => (a.page_no ?? 0) - (b.page_no ?? 0));
    const first = sorted[0];
    return first?.image_url ?? null;
  } catch {
    return null;
  }
}

async function resolveDraftFromBackendIfReady(storyId: string): Promise<{ preview: string; content: string } | null> {
  try {
    const res = await fetch(`${FASTAPI_URL}/api/v1/story/${storyId}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { draft?: { pages?: Array<{ page_no?: number; image_url?: string }> } };
    const pages = data.draft?.pages ?? [];
    if (pages.length === 0) return null;
    const allReady = pages.every((p) => typeof p.image_url === "string" && p.image_url.length > 0);
    if (!allReady) return null;
    const sorted = [...pages].sort((a, b) => (a.page_no ?? 0) - (b.page_no ?? 0));
    const first = sorted[0];
    const preview = first?.image_url ?? null;
    if (!preview) return null;
    return { preview, content: JSON.stringify(data.draft) };
  } catch {
    return null;
  }
}

const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

async function generateStoryArcViaBackend(userProfile: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${FASTAPI_URL}/api/v1/continuity/story_arc/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_profile: userProfile }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`FastAPI continuity/story_arc/generate failed (${response.status}): ${text}`);
  }
  const data = (await response.json()) as { story_arc?: unknown };
  if (!data || typeof data !== "object" || !("story_arc" in data)) {
    throw new Error("FastAPI continuity/story_arc/generate returned invalid payload");
  }
  return data.story_arc;
}

async function summarizeViaBackend(params: {
  userID: string;
  previousBlocks: Array<{ episode_id: string; title: string; text_cn: string }>;
  storyFramework: Record<string, unknown> | null;
}): Promise<StorySummaryOutput | null> {
  if (!params.previousBlocks || params.previousBlocks.length === 0) return null;
  try {
    console.info(`INFO: summarize:start userID=${params.userID} blocks=${params.previousBlocks.length}`);
    const response = await fetch(`${FASTAPI_URL}/api/v1/continuity/summarize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        previous_blocks: params.previousBlocks.slice(0, 3),
        story_framework: params.storyFramework ?? null,
      }),
    });
    if (!response.ok) {
      console.info(`INFO: summarize:skip userID=${params.userID} status=${response.status}`);
      return null;
    }
    const data = (await response.json()) as { summary?: StorySummaryOutput };
    console.info(`INFO: summarize:done userID=${params.userID}`);
    return data.summary ?? null;
  } catch {
    console.info(`INFO: summarize:error userID=${params.userID}`);
    return null;
  }
}

/** 分数映射：user-api 0-10 → FastAPI 1-5 */
function mapScore(score: number): number {
  if (score <= 2) return 1;
  if (score <= 4) return 2;
  if (score <= 6) return 3;
  if (score <= 8) return 4;
  return 5;
}

function mapScoreToEmotion(score: number): 0 | 1 | 2 | 3 {
  if (score <= 3) return 0;
  if (score <= 6) return 1;
  if (score <= 8) return 2;
  return 3;
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
  avatarColor: string;
  avatarShirt: string;
  avatarUnderdress: string;
  avatarGlasses: string;
  mealScore: number;
  mealContent: string;
  regenerateCount: number;
  /** 最近历史进食记录（不含本次，降序） */
  recentHistory: Array<{ score: number; content: string; createdAt: string }>;
  /** 阅读行为摘要 */
  readingSummary: { totalSessions: number; lastCompletionRate: number | null; lastCompleted: boolean | null };
  storySummary?: StorySummaryOutput | null;
  storyArc?: Record<string, unknown> | null;
}): Promise<{
  storyId: string;
  title: string;
  summary: string;
}> {
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
    story_arc: params.storyArc ?? undefined,
    recap_and_goal: params.storySummary ?? undefined,
    temporal_characteristics: {
      selected_food_instance: params.themeFood,
      child_avatar: buildChildAvatarTemporalState({
        nickname: params.nickname,
        gender: params.gender,
        avatarColor: params.avatarColor,
        avatarShirt: params.avatarShirt,
        avatarUnderdress: params.avatarUnderdress,
        avatarGlasses: params.avatarGlasses,
      }),
    },
    story_config: {
      story_type: "interactive",
      difficulty: autoDifficulty,
      pages: 6,
      interactive_density: "medium",
      language: "zh-CN",
    },
  };

  const response = await postJsonWithTimeout(
    `${FASTAPI_URL}/api/v1/story/generate`,
    requestBody,
    FASTAPI_FETCH_TIMEOUT_SEC,
  );

  if (!response.ok) {
    throw new Error(`FastAPI story/generate failed (${response.status}): ${response.text}`);
  }

  const data = response.json as {
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

  return {
    storyId: draft.story_id,
    title: draft.book_meta.title,
    summary: draft.book_meta.summary,
  };
}

async function triggerAutoBookGeneration(userID: string, avatar: {
  nickname: string;
  gender: string;
  themeFood: string;
  avatarColor: string;
  avatarShirt: string;
  avatarUnderdress: string;
  avatarGlasses: string;
}) {
  if (generatingUsers.has(userID) || await isUserGenerating(userID)) return;
  const existingTemp = await getTempBook(userID);
  if (existingTemp) return;
  generatingUsers.add(userID);
  setUserGenerating(userID).catch(() => {});

  void (async () => {
    try {
      const history = await getFoodLogHistory(userID, 10);
      const latest = history[0] ?? null;
      const mealScore = latest?.score ?? 5;
      const mealContent = latest?.content ?? "暂无进食记录";
      const recentHistory = history.length > 1 ? history.slice(1) : [];
      const readingSummary = await getReadingSummary(userID);
      const storyArc = await getUserStoryArc(userID);
      const recentBooks = await getRecentHistoryBooks(userID, 3);
      const previousBlocks = buildPreviousBlocks(recentBooks);
      let storyFramework: Record<string, unknown> | null = null;
      if (storyArc?.storyArcJson) {
        try {
          const parsed = JSON.parse(storyArc.storyArcJson) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            storyFramework = parsed as Record<string, unknown>;
          }
        } catch {
          // ignore invalid story_arc payload
        }
      }
      const storySummary = await summarizeViaBackend({
        userID,
        previousBlocks,
        storyFramework,
      });
      const launched = await generateTempBookForUser({
        userID,
        nickname: avatar.nickname,
        gender: avatar.gender,
        themeFood: avatar.themeFood,
        avatarColor: avatar.avatarColor,
        avatarShirt: avatar.avatarShirt,
        avatarUnderdress: avatar.avatarUnderdress,
        avatarGlasses: avatar.avatarGlasses,
        mealScore,
        mealContent,
        regenerateCount: 0,
        recentHistory,
        readingSummary,
        storySummary,
        storyArc: storyFramework,
      });
      pendingAutoStories.set(userID, {
        storyId: launched.storyId,
        title: launched.title,
        summary: launched.summary,
        regenerateCount: 0,
      });
    } catch (err) {
      pendingAutoStories.delete(userID);
      generatingUsers.delete(userID);
      await clearUserGenerating(userID).catch(() => {});
      const message = err instanceof Error && err.message ? err.message : "绘本生成失败，请截图联系管理员";
      await setUserGeneratingError(userID, message).catch(() => {});
      console.error("[BOOK] 绘本生成失败:", err);
    }
  })();
}

async function generateAndSaveStoryArcBase(params: {
  userID: string;
  themeFood: string;
  nickname?: string | null;
  gender?: string | null;
  age?: number | null;
  extraProfile?: StoryArcExtraProfile | null;
  trigger: "register" | "avatar_save" | "theme_change";
}) {
  const existing = await getUserStoryArc(params.userID);
  let seedProfile: Record<string, unknown> | null = null;
  if (existing?.sourceProfileJson) {
    try {
      const parsed = JSON.parse(existing.sourceProfileJson) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        seedProfile = parsed as Record<string, unknown>;
      }
    } catch {
      // ignore invalid historical data
    }
  }
  const sourceProfile = buildStoryArcUserProfile({
    userID: params.userID,
    themeFood: params.themeFood,
    nickname: params.nickname ?? null,
    gender: params.gender ?? null,
    age: params.age ?? null,
  }, {
    seedProfile,
    extraProfile: params.extraProfile ?? null,
  });
  console.info(`INFO: story_arc:start userID=${params.userID} trigger=${params.trigger}`);
  const storyArc = await generateStoryArcViaBackend(sourceProfile);
  await saveUserStoryArc({
    userID: params.userID,
    storyArcJson: JSON.stringify(storyArc),
    sourceProfileJson: JSON.stringify(sourceProfile),
  });
  console.info(`INFO: story_arc:done userID=${params.userID} trigger=${params.trigger}`);
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
  // firstLogin = true only when the user has not set up their avatar yet
  const existingAvatar = await getUserAvatar(user.user_id);
  const firstLogin = !existingAvatar;
  if (!user.user_id.startsWith("demo") && user.first_login === 1 && existingAvatar) {
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
  const storyArcProfile =
    body && typeof body === "object" && (body as { storyArcProfile?: unknown }).storyArcProfile && typeof (body as { storyArcProfile?: unknown }).storyArcProfile === "object"
      ? ((body as { storyArcProfile: unknown }).storyArcProfile as StoryArcExtraProfile)
      : null;

  if (!userID.trim() || !password) {
    res.status(400).json({ message: "参数错误" });
    return;
  }

  try {
    await insertUser({ userID, password, firstLogin, themeFood });
    try {
      await generateAndSaveStoryArcBase({
        userID,
        themeFood,
        extraProfile: storyArcProfile,
        trigger: "register",
      });
    } catch (arcErr) {
      await deleteUser(userID).catch(() => {});
      clearUserRuntimeGenerationState(userID);
      throw arcErr;
    }
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
      clearUserRuntimeGenerationState(userID);
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
    color: avatar.avatarColor,
    shirt: avatar.avatarShirt,
    underdress: avatar.avatarUnderdress,
    glasses: avatar.avatarGlasses,
    emotion: avatar.avatarEmotion,
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
  if (!nickname) {
    res.status(400).json({ message: "昵称不能为空" });
    return;
  }

  const pick = (key: string) =>
    typeof (body as Record<string, unknown>)[key] === "string"
      ? (body as Record<string, string>)[key]
      : "";

  const gender = pick("gender") || "male";
  const color = pick("color") || "blue";
  const shirt = pick("shirt") || "short";
  const underdress = pick("underdress") || "short";
  const glasses = pick("glasses") || "no";

  if (gender !== "male" && gender !== "female") { res.status(400).json({ message: "性别参数错误" }); return; }
  if (color !== "blue" && color !== "red" && color !== "yellow") { res.status(400).json({ message: "颜色参数错误" }); return; }
  if (shirt !== "short" && shirt !== "long") { res.status(400).json({ message: "上衣参数错误" }); return; }
  if (underdress !== "short" && underdress !== "long") { res.status(400).json({ message: "下装参数错误" }); return; }
  if (glasses !== "no" && glasses !== "yes") { res.status(400).json({ message: "眼镜参数错误" }); return; }

  await saveUserAvatar({
    userID: req.user.userID,
    nickname,
    gender,
    avatarColor: color,
    avatarShirt: shirt,
    avatarUnderdress: underdress,
    avatarGlasses: glasses,
  });
  const latestAvatar = await getUserAvatar(req.user.userID);
  if (latestAvatar) {
    generateAndSaveStoryArcBase({
      userID: req.user.userID,
      themeFood: latestAvatar.themeFood,
      nickname: latestAvatar.nickname,
      gender: latestAvatar.gender,
      trigger: "avatar_save",
    }).catch((err) => {
      console.error("[STORY_ARC] async refresh after avatar save failed:", err);
    });
  }
  res.json({ ok: true });
});

app.post("/api/story/theme", authRequired, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ message: "未登录" });
    return;
  }
  const body = req.body as unknown;
  const themeFood =
    body && typeof body === "object" && typeof (body as { themeFood?: unknown }).themeFood === "string"
      ? (body as { themeFood: string }).themeFood.trim()
      : "";
  if (!themeFood) {
    res.status(400).json({ message: "themeFood 不能为空" });
    return;
  }
  await updateUserThemeFood(req.user.userID, themeFood);
  const avatar = await getUserAvatar(req.user.userID);
  try {
    await generateAndSaveStoryArcBase({
      userID: req.user.userID,
      themeFood,
      nickname: avatar?.nickname ?? null,
      gender: avatar?.gender ?? null,
      trigger: "theme_change",
    });
  } catch (e) {
    res.status(500).json({ message: "故事主题已更新，但 story_arc 重新生成失败" });
    return;
  }
  res.json({ ok: true, themeFood });
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

  const avatarData = {
    nickname: avatar.nickname,
    gender: avatar.gender,
    color: avatar.avatarColor,
    shirt: avatar.avatarShirt,
    underdress: avatar.avatarUnderdress,
    glasses: avatar.avatarGlasses,
    emotion: avatar.avatarEmotion,
  };

  const base = {
    avatar: avatarData,
    feedbackText: latestState?.feedbackText || "",
    themeFood: avatar.themeFood,
  };

  const tempBook = await getTempBook(req.user.userID);
  const generatingState = await getUserGeneratingState(req.user.userID);
  const generating = generatingUsers.has(req.user.userID) || generatingState.generating;
  const statusMetaWithBook = {
    generating,
    generatingSince: generating ? generatingState.generatingSince : null,
    generatingSlow: generating ? generatingState.generatingSlow : false,
    generationError: null,
  };
  const statusMetaNoBook = {
    generating,
    generatingSince: generating ? generatingState.generatingSince : null,
    generatingSlow: generating ? generatingState.generatingSlow : false,
    generationError: generating ? null : generatingState.generationError,
  };
  if (!tempBook && generating) {
    const pending = pendingAutoStories.get(req.user.userID);
    if (pending) {
      const resolved = await resolveDraftFromBackendIfReady(pending.storyId);
      if (resolved) {
        const meta = extractBookMeta(resolved.content);
        await saveTempBook({
          userID: req.user.userID,
          bookID: pending.storyId,
          title: meta?.title || pending.title,
          preview: resolved.preview,
          description: meta?.summary || pending.summary,
          content: resolved.content,
          regenerateCount: pending.regenerateCount,
        });
        pendingAutoStories.delete(req.user.userID);
        generatingUsers.delete(req.user.userID);
        await clearUserGenerating(req.user.userID).catch(() => {});
        await clearUserGeneratingError(req.user.userID).catch(() => {});
        res.json({
          ...base,
          generating: false,
          generatingSince: null,
          generatingSlow: false,
          generationError: null,
          book: {
            bookID: pending.storyId,
            title: meta?.title || pending.title,
            preview: resolved.preview,
            description: meta?.summary || pending.summary,
            confirmed: false,
            regenerateCount: pending.regenerateCount,
          },
        });
        return;
      }
    }
  }
  if (tempBook) {
    let preview = tempBook.preview;
    if (isPlaceholderPreview(preview)) {
      const storyId = extractStoryId(tempBook.content);
      if (storyId) {
        const resolved = await resolvePreviewFromBackend(storyId);
        if (resolved) {
          preview = resolved;
          await saveTempBook({
            userID: tempBook.userID,
            bookID: tempBook.bookID,
            title: tempBook.title,
            preview,
            description: tempBook.description,
            content: tempBook.content,
            regenerateCount: tempBook.regenerateCount,
          });
        }
      }
    }
    res.json({
      ...base,
      ...statusMetaWithBook,
      book: {
        bookID: tempBook.bookID,
        title: tempBook.title,
        preview,
        description: tempBook.description,
        confirmed: false,
        regenerateCount: tempBook.regenerateCount,
      },
    });
    return;
  }

  const latestHistory = await getLatestHistoryBook(req.user.userID);
  if (latestHistory) {
    let preview = latestHistory.preview;
    if (isPlaceholderPreview(preview)) {
      const storyId = extractStoryId(latestHistory.content);
      if (storyId) {
        const resolved = await resolvePreviewFromBackend(storyId);
        if (resolved) preview = resolved;
      }
    }
    res.json({
      ...base,
      ...statusMetaWithBook,
      book: {
        bookID: latestHistory.bookID,
        title: latestHistory.title,
        preview,
        description: latestHistory.description,
        confirmed: true,
        regenerateCount: 0,
      },
    });
    return;
  }

  if (!generating && generatingState.generationError) {
    res.json({
      ...base,
      generating: false,
      generatingSince: null,
      generatingSlow: false,
      generationError: generatingState.generationError,
      book: null,
    });
    return;
  }

  if (!generating) {
    triggerAutoBookGeneration(req.user.userID, avatar);
    res.json({
      ...base,
      generating: true,
      generatingSince: new Date().toISOString(),
      generatingSlow: false,
      generationError: null,
      book: null,
    });
    return;
  }

  res.json({ ...base, ...statusMetaNoBook, book: null });
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
  const foodName =
    typeof (body as { foodName?: unknown }).foodName === "string"
      ? (body as { foodName: string }).foodName.trim()
      : "";
  const score = Number((body as { score?: unknown }).score);
  const content =
    typeof (body as { content?: unknown }).content === "string"
      ? (body as { content: string }).content.trim()
      : "";
  const specificThing =
    typeof (body as { specificThing?: unknown }).specificThing === "string"
      ? (body as { specificThing: string }).specificThing.trim()
      : "";
  if (!foodName) {
    res.status(400).json({ message: "请输入今日食物" });
    return;
  }
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

  const avatar = await getUserAvatar(req.user.userID);
  if (!avatar) {
    res.status(404).json({ message: "未找到虚拟形象" });
    return;
  }
  const recentPhrases = await getRecentAvatarFeedbackTexts(req.user.userID, 2);

  const latestReading = await getLatestCompletedReadingForUser(req.user.userID);

  let feedbackText = "";
  try {
    const seed = Date.now();
    const r = await fetch(`${FASTAPI_URL}/api/v1/feedback_words/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nickname: avatar.nickname,
        picky_food: foodName,
        specific_thing: specificThing || null,
        self_rating: score,
        self_description: content,
        recent_phrases: recentPhrases,
        seed,
      }),
    });
    if (r.ok) {
      const data = (await r.json()) as { text?: unknown };
      if (typeof data.text === "string") feedbackText = data.text.trim();
    }
  } catch {
    // ignore
  }
  if (!feedbackText) {
    feedbackText =
      score >= 9
        ? "哇，你今天表现太棒了！继续保持！"
        : score >= 7
          ? "很好的尝试，继续加油！"
          : score >= 5
            ? "不错的进步，慢慢来！"
            : score >= 3
              ? "没关系，每一小步都是进步。"
              : "谢谢你的尝试，下次我们再试试看。";
  }
  const expression =
    score >= 7 ? "happy" : score >= 5 ? "encouraging" : score >= 3 ? "gentle" : "neutral";

  const emotion = mapScoreToEmotion(score);
  await insertFoodLog({
    userID: req.user.userID,
    foodName,
    specificThing: specificThing || null,
    score,
    content,
    voiceData,
    feedbackText,
    emotion,
    relatedBookID: latestReading?.bookId ?? null,
    relatedReadingSessionID: latestReading?.sessionId ?? null,
    relatedReadingEndedAt: latestReading?.endedAt ?? null,
  });

  await insertAvatarState({ userID: req.user.userID, feedbackText });

  await setUserAvatarEmotion(req.user.userID, emotion);

  res.json({ ok: true, feedbackText, expression, score, emotion });
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

  try {
    const storyId = tempBook.bookID;
    const r = await fetch(`${FASTAPI_URL}/api/v1/story/${storyId}`);
    if (!r.ok) {
      res.status(503).json({ message: "图片状态检查失败" });
      return;
    }
    const data = (await r.json()) as { draft?: { pages?: Array<{ page_no?: number; image_url?: unknown }>; book_meta?: { title?: string; summary?: string } } };
    const pages = data.draft?.pages ?? [];
    const allReady = pages.length > 0 && pages.every((p) => typeof p.image_url === "string" && p.image_url.length > 0);
    if (!allReady) {
      res.status(400).json({ message: "插图生成中，请稍后再确认绘本" });
      return;
    }
    const sorted = [...pages].sort((a, b) => (a.page_no ?? 0) - (b.page_no ?? 0));
    const firstUrl = typeof sorted[0]?.image_url === "string" ? (sorted[0].image_url as string) : null;
    const nextPreview = firstUrl || tempBook.preview;
    const nextTitle = data.draft?.book_meta?.title || tempBook.title;
    const nextDesc = data.draft?.book_meta?.summary || tempBook.description;
    const nextContent = data.draft ? JSON.stringify(data.draft) : tempBook.content;

    await addHistoryBook({
      bookID: tempBook.bookID,
      userID: tempBook.userID,
      title: nextTitle,
      preview: nextPreview,
      description: nextDesc,
      content: nextContent,
    });
    await clearTempBook(req.user.userID);
    res.json({ ok: true });
    return;
  } catch {
    res.status(503).json({ message: "图片状态检查失败" });
    return;
  }
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
    temporal_characteristics: {
      selected_food_instance: targetFoodOverride || avatar.themeFood,
      child_avatar: buildChildAvatarTemporalState({
        nickname: avatar.nickname,
        gender: avatar.gender,
        avatarColor: avatar.avatarColor,
        avatarShirt: avatar.avatarShirt,
        avatarUnderdress: avatar.avatarUnderdress,
        avatarGlasses: avatar.avatarGlasses,
      }),
    },
  };

  generatingUsers.add(req.user.userID);
  await setUserGenerating(req.user.userID).catch(() => {});
  try {
  const response = await postJsonWithTimeout(
    `${FASTAPI_URL}/api/v1/story/regenerate`,
    regenBody,
    FASTAPI_FETCH_TIMEOUT_SEC,
  );

  if (!response.ok) {
    console.error("[BOOK] 重新生成失败:", response.status, response.text);
    await setUserGeneratingError(req.user.userID, response.text || "绘本重新生成失败，请截图联系管理员").catch(() => {});
    res.status(502).json({ message: "绘本重新生成失败" });
    return;
  }

  const data = response.json as {
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
  await clearUserGeneratingError(req.user.userID).catch(() => {});

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

function audioExtFromMime(mimeType: string): string {
  const mime = mimeType.toLowerCase().split(";")[0].trim();
  if (mime === "audio/webm") return "webm";
  if (mime === "audio/mp4" || mime === "audio/x-m4a") return "m4a";
  if (mime === "audio/mpeg" || mime === "audio/mp3" || mime === "audio/mpga") return "mp3";
  if (mime === "audio/wav" || mime === "audio/x-wav" || mime === "audio/wave") return "wav";
  if (mime === "audio/ogg") return "ogg";
  if (mime === "audio/flac") return "flac";
  if (mime === "audio/aiff") return "aiff";
  return "webm";
}

app.post("/api/voice/transcribe", authRequired, upload.single("file"), async (req: AuthenticatedRequest, res) => {
  if (!req.user) { res.status(401).json({ message: "未登录" }); return; }
  const fastapiUrl = process.env.FASTAPI_URL || "http://localhost:8000";
  const file = (req as typeof req & { file?: { buffer: Buffer; mimetype?: string; originalname?: string } }).file;
  if (!file?.buffer) {
    res.status(400).json({ message: "未收到录音文件" });
    return;
  }

  const form = new FormData();
  const mime = (file.mimetype || "audio/webm").toLowerCase();
  const filename = `recording.${audioExtFromMime(mime)}`;
  form.append("file", new Blob([new Uint8Array(file.buffer)], { type: mime }), filename);

  const endpoint = fastapiUrl.replace(/\/$/, "") + "/api/v1/voice/transcribe";
  let resp: Response;
  try {
    resp = await fetch(endpoint, {
      method: "POST",
      body: form,
    });
  } catch (e) {
    res.status(502).json({ message: `语音转写失败: 无法连接到 ${endpoint}（${e instanceof Error ? e.message : "fetch failed"}）` });
    return;
  }
  const text = await resp.text();
  if (!resp.ok) {
    res.status(502).json({ message: `语音转写失败: ${text || resp.status}` });
    return;
  }
  let payload: { text?: string } | null = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  res.json({ text: payload?.text || "" });
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
  const now = new Date().toISOString();
  const startedAt = typeof body.startedAt === "string" ? body.startedAt : now;
  const endedAt = typeof body.endedAt === "string" ? body.endedAt : now;
  const startedMs = Date.parse(startedAt);
  const endedMs = Date.parse(endedAt);
  const computedDurationMs = Number.isFinite(startedMs) && Number.isFinite(endedMs) && endedMs >= startedMs
    ? endedMs - startedMs
    : 0;
  const clientDurationMs = typeof body.durationMs === "number" && Number.isFinite(body.durationMs) && body.durationMs >= 0
    ? Math.floor(body.durationMs)
    : 0;
  const durationMs = Math.max(clientDurationMs, computedDurationMs);
  const totalPages = typeof body.totalPages === "number" && Number.isFinite(body.totalPages) ? Math.max(0, Math.floor(body.totalPages)) : 0;
  const pagesRead = typeof body.pagesRead === "number" && Number.isFinite(body.pagesRead) ? Math.max(0, Math.floor(body.pagesRead)) : 0;
  const writeResult = await insertReadingSession({
    userID: req.user.userID,
    bookID: typeof body.bookId === "string" ? body.bookId : null,
    startedAt,
    endedAt,
    durationMs,
    totalPages,
    pagesRead,
    interactionCount: typeof body.interactionCount === "number" ? body.interactionCount : 0,
    completed: body.completed === true,
    sessionType: typeof body.sessionType === "string" ? body.sessionType : "experiment",
    tryLevel: typeof body.tryLevel === "string" ? body.tryLevel : null,
    abortReason: typeof body.abortReason === "string" ? body.abortReason : null,
  });
  const bookId = typeof body.bookId === "string" ? body.bookId : null;
  if (body.completed === true && bookId && writeResult.created) {
    const history = await getHistoryBookById(req.user.userID, bookId);
    if (history) {
      const avatar = await getUserAvatar(req.user.userID);
      if (avatar) {
        triggerAutoBookGeneration(req.user.userID, avatar);
      }
    }
  }
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
