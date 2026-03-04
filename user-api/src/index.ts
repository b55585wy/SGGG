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
  insertUser,
  insertAvatarState,
  insertFoodLog,
  listAvatarOptions,
  listHistoryBooks,
  listUsers,
  saveTempBook,
  saveUserAvatar,
  clearTempBook,
  setFirstLoginFlag,
  deleteUser,
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

function createBookPayload(params: {
  nickname: string;
  themeFood: string;
  promptTitle?: string | null;
  promptNote?: string | null;
}) {
  const title = params.promptTitle?.trim() || `${params.nickname}的美味冒险`;
  const preview = createBookPreviewImage(title);
  const extra = params.promptNote?.trim() ? ` ${params.promptNote.trim()}` : "";
  const description = `今天我们尝试了${params.themeFood}，一起把勇气装进口袋。${extra}`;
  const content = JSON.stringify({
    title,
    pages: [
      { text: `${params.nickname}准备和${params.themeFood}交朋友。` },
      { text: `勇敢尝试后，大家一起鼓掌。` },
    ],
  });
  return { title, preview, description, content };
}

async function generateTempBookForUser(params: {
  userID: string;
  nickname: string;
  themeFood: string;
  regenerateCount: number;
  promptTitle?: string | null;
  promptNote?: string | null;
}) {
  const payload = createBookPayload({
    nickname: params.nickname,
    themeFood: params.themeFood,
    promptTitle: params.promptTitle,
    promptNote: params.promptNote,
  });
  await saveTempBook({
    userID: params.userID,
    bookID: crypto.randomUUID(),
    title: payload.title,
    preview: payload.preview,
    description: payload.description,
    content: payload.content,
    regenerateCount: params.regenerateCount,
  });
  return payload;
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

  if (!userID.trim() || !password) {
    res.status(400).json({ message: "参数错误" });
    return;
  }

  try {
    await insertUser({ userID, password, firstLogin });
    res.status(201).json({ user: { userID }, firstLogin });
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

  const hairStyle =
    typeof (body as { hairStyle?: unknown }).hairStyle === "string"
      ? (body as { hairStyle: string }).hairStyle
      : null;
  const glasses =
    typeof (body as { glasses?: unknown }).glasses === "string"
      ? (body as { glasses: string }).glasses
      : null;
  const topColor =
    typeof (body as { topColor?: unknown }).topColor === "string"
      ? (body as { topColor: string }).topColor
      : null;
  const bottomColor =
    typeof (body as { bottomColor?: unknown }).bottomColor === "string"
      ? (body as { bottomColor: string }).bottomColor
      : null;

  await saveUserAvatar({
    userID: req.user.userID,
    nickname,
    gender,
    hairStyle,
    glasses,
    topColor,
    bottomColor,
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

  const tempBook = await getTempBook(req.user.userID);
  if (tempBook) {
    res.json({
      avatar: {
        nickname: avatar.nickname,
        baseImage,
        hairImage: hairImage || "",
        glassesImage: glassesImage || "",
        topImage: topImage || "",
        bottomImage: bottomImage || "",
      },
      feedbackText: latestState?.feedbackText || "",
      themeFood: avatar.themeFood,
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
      avatar: {
        nickname: avatar.nickname,
        baseImage,
        hairImage: hairImage || "",
        glassesImage: glassesImage || "",
        topImage: topImage || "",
        bottomImage: bottomImage || "",
      },
      feedbackText: latestState?.feedbackText || "",
      themeFood: avatar.themeFood,
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

  const payload = await generateTempBookForUser({
    userID: req.user.userID,
    nickname: avatar.nickname,
    themeFood: avatar.themeFood,
    regenerateCount: 0,
  });

  const savedTemp = await getTempBook(req.user.userID);
  res.json({
    avatar: {
      nickname: avatar.nickname,
      baseImage,
      hairImage: hairImage || "",
      glassesImage: glassesImage || "",
      topImage: topImage || "",
      bottomImage: bottomImage || "",
    },
    feedbackText: latestState?.feedbackText || "",
    themeFood: avatar.themeFood,
    book: {
      bookID: savedTemp?.bookID || crypto.randomUUID(),
      title: payload.title,
      preview: payload.preview,
      description: payload.description,
      confirmed: false,
      regenerateCount: 0,
    },
  });
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

  const feedbackText = "太棒了！你又进步了一点点。";
  await insertAvatarState({ userID: req.user.userID, feedbackText });

  const avatar = await getUserAvatar(req.user.userID);
  if (avatar) {
    void generateTempBookForUser({
      userID: req.user.userID,
      nickname: avatar.nickname,
      themeFood: avatar.themeFood,
      regenerateCount: 0,
    });
  }

  res.json({ ok: true, feedbackText });
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
  const payload = await generateTempBookForUser({
    userID: req.user.userID,
    nickname: avatar.nickname,
    themeFood: avatar.themeFood,
    regenerateCount: tempBook.regenerateCount + 1,
    promptTitle,
    promptNote,
  });
  const updated = await getTempBook(req.user.userID);
  res.json({
    ok: true,
    book: {
      bookID: updated?.bookID || tempBook.bookID,
      title: payload.title,
      preview: payload.preview,
      description: payload.description,
      confirmed: false,
      regenerateCount: updated?.regenerateCount ?? tempBook.regenerateCount + 1,
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
  console.log(`API listening on http://localhost:${port}`);
});
