import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";

let sqlPromise: Promise<SqlJsStatic> | null = null;
let dbPromise: Promise<Database> | null = null;

function getDataDir() {
  return path.join(process.cwd(), "data");
}

function getDbFilePath() {
  return path.join(getDataDir(), "db.sqlite");
}

function getSql() {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: (file: string) => {
        const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
        return path.join(path.dirname(wasmPath), file);
      },
    });
  }
  return sqlPromise;
}

function ensureSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      password TEXT NOT NULL,
      first_login INTEGER NOT NULL DEFAULT 1,
      theme_food TEXT DEFAULT '胡萝卜'
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS avatar_assets (
      asset_type TEXT NOT NULL,
      asset_key TEXT NOT NULL,
      label TEXT NOT NULL,
      image_data TEXT NOT NULL,
      PRIMARY KEY (asset_type, asset_key)
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS user_avatars (
      user_id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      gender TEXT NOT NULL,
      hair_style TEXT,
      glasses TEXT,
      top_color TEXT,
      bottom_color TEXT,
      theme_food TEXT DEFAULT '胡萝卜',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS user_food_logs (
      log_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      food_name TEXT NOT NULL,
      score INTEGER NOT NULL,
      content TEXT NOT NULL,
      voice_data TEXT,
      related_book_id TEXT,
      related_reading_session_id TEXT,
      related_reading_ended_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS user_avatar_states (
      state_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expression TEXT,
      body_posture TEXT,
      feedback_text TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS temp_books (
      user_id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      title TEXT NOT NULL,
      preview TEXT NOT NULL,
      description TEXT NOT NULL,
      content TEXT NOT NULL,
      regenerate_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS history_books (
      book_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      preview TEXT NOT NULL,
      description TEXT NOT NULL,
      content TEXT NOT NULL,
      confirmed_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS reading_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      book_id TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      total_pages INTEGER NOT NULL DEFAULT 0,
      pages_read INTEGER NOT NULL DEFAULT 0,
      interaction_count INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      try_level TEXT,
      abort_reason TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_rs_user ON reading_sessions(user_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_rs_date ON reading_sessions(created_at);`);
  db.run(`
    CREATE TABLE IF NOT EXISTS voice_recordings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'interaction',
      context_id TEXT,
      page_id TEXT,
      audio_data TEXT,
      transcript TEXT,
      duration_ms INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_vr_user ON voice_recordings(user_id);`);
}

function ensureUserAvatarColumns(db: Database) {
  // users table migration
  {
    const res = db.exec("PRAGMA table_info(users);");
    const columns = new Set<string>();
    for (const row of res[0]?.values ?? []) {
      if (typeof row[1] === "string") columns.add(row[1]);
    }
    if (!columns.has("theme_food")) {
      db.run("ALTER TABLE users ADD COLUMN theme_food TEXT DEFAULT '胡萝卜';");
    }
    if (!columns.has("generating_since")) {
      db.run("ALTER TABLE users ADD COLUMN generating_since TEXT DEFAULT NULL;");
    }
  }

  // reading_sessions table migration — add session_type column
  {
    const rs = db.exec("PRAGMA table_info(reading_sessions);");
    const rsCols = new Set<string>();
    for (const row of rs[0]?.values ?? []) {
      if (typeof row[1] === "string") rsCols.add(row[1]);
    }
    if (!rsCols.has("session_type")) {
      db.run("ALTER TABLE reading_sessions ADD COLUMN session_type TEXT NOT NULL DEFAULT 'experiment';");
    }
  }

  // user_avatars table migration
  const res = db.exec("PRAGMA table_info(user_avatars);");
  const columns = new Set<string>();
  const rows = res[0]?.values ?? [];
  for (const row of rows) {
    const name = row[1];
    if (typeof name === "string") {
      columns.add(name);
    }
  }
  if (!columns.has("theme_food")) {
    db.run("ALTER TABLE user_avatars ADD COLUMN theme_food TEXT DEFAULT '胡萝卜';");
  }
}

function ensureFoodLogColumns(db: Database) {
  const res = db.exec("PRAGMA table_info(user_food_logs);");
  const columns = new Set<string>();
  for (const row of res[0]?.values ?? []) {
    if (typeof row[1] === "string") columns.add(row[1]);
  }
  if (!columns.has("food_name")) {
    db.run("ALTER TABLE user_food_logs ADD COLUMN food_name TEXT NOT NULL DEFAULT '';");
  }
  if (!columns.has("related_book_id")) {
    db.run("ALTER TABLE user_food_logs ADD COLUMN related_book_id TEXT;");
  }
  if (!columns.has("related_reading_session_id")) {
    db.run("ALTER TABLE user_food_logs ADD COLUMN related_reading_session_id TEXT;");
  }
  if (!columns.has("related_reading_ended_at")) {
    db.run("ALTER TABLE user_food_logs ADD COLUMN related_reading_ended_at TEXT;");
  }
}

function ensureSeedData(db: Database) {
  const res = db.exec("SELECT COUNT(*) AS cnt FROM users;");
  const cnt = (res[0]?.values?.[0]?.[0] as number | undefined) ?? 0;
  if (cnt > 0) return;
  db.run(
    "INSERT INTO users (user_id, password, first_login) VALUES ($user_id, $password, $first_login);",
    {
      $user_id: "demo",
      $password: "demo123",
      $first_login: 1,
    },
  );
}

function svgDataUri(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function ensureAvatarAssets(db: Database) {
  const res = db.exec("SELECT COUNT(*) AS cnt FROM avatar_assets;");
  const cnt = (res[0]?.values?.[0]?.[0] as number | undefined) ?? 0;
  if (cnt > 0) return;

  const baseSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><rect width="300" height="420" rx="16" fill="#f8fafc" stroke="none"/><circle cx="150" cy="80" r="38"/><circle cx="135" cy="78" r="4" fill="#111827" stroke="none"/><circle cx="165" cy="78" r="4" fill="#111827" stroke="none"/><path d="M140 96 Q150 104 160 96"/><rect x="125" y="125" width="50" height="20" rx="10"/><path d="M150 145 L150 270"/><path d="M150 170 L90 200"/><path d="M150 170 L210 200"/><path d="M90 200 L70 240"/><path d="M210 200 L230 240"/><path d="M150 270 L120 360"/><path d="M150 270 L180 360"/><path d="M120 360 L110 400"/><path d="M180 360 L190 400"/></svg>`;

  const hairSvgA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420"><path d="M110 70 Q150 40 190 70 Q180 50 150 46 Q120 50 110 70" fill="#111827"/></svg>`;
  const hairSvgB = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420"><path d="M108 72 Q120 40 150 42 Q180 40 192 72 Q175 58 150 60 Q125 58 108 72" fill="#1f2937"/></svg>`;
  const hairSvgC = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420"><path d="M110 72 Q150 30 190 72 Q200 110 190 140 Q175 120 150 120 Q125 120 110 140 Q100 110 110 72" fill="#374151"/></svg>`;

  const glassesNone = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420"></svg>`;
  const glassesRound = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420" fill="none" stroke="#111827" stroke-width="4"><circle cx="135" cy="80" r="14"/><circle cx="165" cy="80" r="14"/><path d="M149 80 L151 80"/></svg>`;
  const glassesSquare = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420" fill="none" stroke="#111827" stroke-width="4"><rect x="118" y="66" width="32" height="24" rx="4"/><rect x="150" y="66" width="32" height="24" rx="4"/><path d="M150 78 L150 78"/></svg>`;

  const topColors = [
    { key: "blue", label: "蓝色", color: "#60a5fa" },
    { key: "green", label: "绿色", color: "#34d399" },
    { key: "orange", label: "橙色", color: "#fb923c" },
  ];
  const bottomColors = [
    { key: "black", label: "黑色", color: "#111827" },
    { key: "gray", label: "灰色", color: "#9ca3af" },
    { key: "yellow", label: "黄色", color: "#facc15" },
  ];

  const assets: Array<{ type: string; key: string; label: string; svg: string }> = [
    { type: "base", key: "default", label: "默认底图", svg: baseSvg },
    { type: "hair", key: "short", label: "短发", svg: hairSvgA },
    { type: "hair", key: "round", label: "圆刘海", svg: hairSvgB },
    { type: "hair", key: "long", label: "长发", svg: hairSvgC },
    { type: "glasses", key: "none", label: "无眼镜", svg: glassesNone },
    { type: "glasses", key: "round", label: "圆框", svg: glassesRound },
    { type: "glasses", key: "square", label: "方框", svg: glassesSquare },
  ];

  for (const item of topColors) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420"><rect x="118" y="150" width="64" height="90" rx="18" fill="${item.color}"/><rect x="92" y="165" width="30" height="18" rx="9" fill="${item.color}"/><rect x="178" y="165" width="30" height="18" rx="9" fill="${item.color}"/></svg>`;
    assets.push({ type: "top", key: item.key, label: item.label, svg });
  }

  for (const item of bottomColors) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420"><rect x="130" y="250" width="20" height="110" rx="8" fill="${item.color}"/><rect x="150" y="250" width="20" height="110" rx="8" fill="${item.color}"/></svg>`;
    assets.push({ type: "bottom", key: item.key, label: item.label, svg });
  }

  const stmt = db.prepare(
    "INSERT INTO avatar_assets (asset_type, asset_key, label, image_data) VALUES ($type, $key, $label, $image);",
  );
  try {
    for (const asset of assets) {
      stmt.run({
        $type: asset.type,
        $key: asset.key,
        $label: asset.label,
        $image: svgDataUri(asset.svg),
      });
    }
  } finally {
    stmt.free();
  }
}

export async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const SQL = await getSql();
      const dataDir = getDataDir();
      const dbFilePath = getDbFilePath();

      fs.mkdirSync(dataDir, { recursive: true });

      const existing = fs.existsSync(dbFilePath)
        ? fs.readFileSync(dbFilePath)
        : null;

      const db = existing
        ? new SQL.Database(new Uint8Array(existing))
        : new SQL.Database();

      ensureSchema(db);
      ensureUserAvatarColumns(db);
      ensureFoodLogColumns(db);
      ensureSeedData(db);
      ensureAvatarAssets(db);
      await persistDb(db);

      return db;
    })();
  }
  return dbPromise;
}

export async function persistDb(db: Database) {
  const dbFilePath = getDbFilePath();
  const data = db.export();
  fs.writeFileSync(dbFilePath, Buffer.from(data));
}

export type UserRow = {
  user_id: string;
  password: string;
  first_login: number;
};

export async function findUserById(userID: string): Promise<UserRow | null> {
  const db = await getDb();
  const stmt = db.prepare(
    "SELECT user_id, password, first_login FROM users WHERE user_id = $user_id LIMIT 1;",
  );
  try {
    stmt.bind({ $user_id: userID });
    if (!stmt.step()) return null;
    return stmt.getAsObject() as unknown as UserRow;
  } finally {
    stmt.free();
  }
}

export async function setFirstLoginFlag(userID: string, firstLogin: boolean) {
  const db = await getDb();
  db.run("UPDATE users SET first_login = $first_login WHERE user_id = $user_id;", {
    $user_id: userID,
    $first_login: firstLogin ? 1 : 0,
  });
  await persistDb(db);
}

export async function insertUser(params: {
  userID: string;
  password: string;
  firstLogin?: boolean;
  themeFood?: string;
}) {
  const db = await getDb();
  db.run(
    "INSERT INTO users (user_id, password, first_login, theme_food) VALUES ($user_id, $password, $first_login, $theme_food);",
    {
      $user_id: params.userID,
      $password: params.password,
      $first_login: params.firstLogin === false ? 0 : 1,
      $theme_food: params.themeFood || "胡萝卜",
    },
  );
  await persistDb(db);
}

export async function listUsers(): Promise<Array<{ userID: string; firstLogin: boolean; themeFood: string }>> {
  const db = await getDb();
  const stmt = db.prepare("SELECT user_id, first_login, theme_food FROM users ORDER BY user_id ASC;");
  try {
    const users: Array<{ userID: string; firstLogin: boolean; themeFood: string }> = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as unknown as { user_id: string; first_login: number; theme_food: string | null };
      users.push({ userID: row.user_id, firstLogin: row.first_login === 1, themeFood: row.theme_food || "胡萝卜" });
    }
    return users;
  } finally {
    stmt.free();
  }
}

export async function getUserThemeFood(userID: string): Promise<string> {
  const db = await getDb();
  const stmt = db.prepare("SELECT theme_food FROM users WHERE user_id = $user_id LIMIT 1;");
  try {
    stmt.bind({ $user_id: userID });
    if (!stmt.step()) return "胡萝卜";
    const row = stmt.getAsObject() as unknown as { theme_food: string | null };
    return row.theme_food || "胡萝卜";
  } finally {
    stmt.free();
  }
}

export type AvatarOption = {
  id: string;
  label: string;
  image: string;
};

export async function getAvatarBase(): Promise<string | null> {
  const db = await getDb();
  const stmt = db.prepare(
    "SELECT image_data FROM avatar_assets WHERE asset_type = 'base' AND asset_key = 'default' LIMIT 1;",
  );
  try {
    if (!stmt.step()) return null;
    const row = stmt.getAsObject() as unknown as { image_data: string };
    return row.image_data || null;
  } finally {
    stmt.free();
  }
}

async function listOptionsByType(type: string): Promise<AvatarOption[]> {
  const db = await getDb();
  const stmt = db.prepare(
    "SELECT asset_key, label, image_data FROM avatar_assets WHERE asset_type = $type ORDER BY asset_key ASC;",
  );
  try {
    const options: AvatarOption[] = [];
    stmt.bind({ $type: type });
    while (stmt.step()) {
      const row = stmt.getAsObject() as unknown as {
        asset_key: string;
        label: string;
        image_data: string;
      };
      options.push({ id: row.asset_key, label: row.label, image: row.image_data });
    }
    return options;
  } finally {
    stmt.free();
  }
}

export async function listAvatarOptions(): Promise<{
  hair: AvatarOption[];
  glasses: AvatarOption[];
  topColors: AvatarOption[];
  bottomColors: AvatarOption[];
}> {
  const [hair, glasses, topColors, bottomColors] = await Promise.all([
    listOptionsByType("hair"),
    listOptionsByType("glasses"),
    listOptionsByType("top"),
    listOptionsByType("bottom"),
  ]);
  return { hair, glasses, topColors, bottomColors };
}

export async function getAvatarComponent(
  type: "hair" | "glasses" | "top" | "bottom",
  id: string,
): Promise<string | null> {
  const db = await getDb();
  const stmt = db.prepare(
    "SELECT image_data FROM avatar_assets WHERE asset_type = $type AND asset_key = $key LIMIT 1;",
  );
  try {
    stmt.bind({ $type: type, $key: id });
    if (!stmt.step()) return null;
    const row = stmt.getAsObject() as unknown as { image_data: string };
    return row.image_data || null;
  } finally {
    stmt.free();
  }
}

export async function saveUserAvatar(params: {
  userID: string;
  nickname: string;
  gender: string;
  hairStyle?: string | null;
  glasses?: string | null;
  topColor?: string | null;
  bottomColor?: string | null;
}) {
  const db = await getDb();
  const now = new Date().toISOString();
  const themeFood = await getUserThemeFood(params.userID);
  db.run(
    `
    INSERT INTO user_avatars (
      user_id, nickname, gender,
      hair_style, glasses, top_color, bottom_color,
      theme_food,
      created_at, updated_at
    )
    VALUES (
      $user_id, $nickname, $gender,
      $hair_style, $glasses, $top_color, $bottom_color,
      $theme_food,
      $created_at, $updated_at
    )
    ON CONFLICT(user_id) DO UPDATE SET
      nickname = $nickname,
      gender = $gender,
      hair_style = $hair_style,
      glasses = $glasses,
      top_color = $top_color,
      bottom_color = $bottom_color,
      theme_food = $theme_food,
      updated_at = $updated_at;
    `,
    {
      $user_id: params.userID,
      $nickname: params.nickname,
      $gender: params.gender,
      $hair_style: params.hairStyle ?? null,
      $glasses: params.glasses ?? null,
      $top_color: params.topColor ?? null,
      $bottom_color: params.bottomColor ?? null,
      $theme_food: themeFood,
      $created_at: now,
      $updated_at: now,
    },
  );
  await persistDb(db);
}

export type UserAvatar = {
  userID: string;
  nickname: string;
  gender: string;
  hairStyle: string | null;
  glasses: string | null;
  topColor: string | null;
  bottomColor: string | null;
  themeFood: string;
  createdAt: string;
  updatedAt: string;
};

export async function getUserAvatar(userID: string): Promise<UserAvatar | null> {
  const db = await getDb();
  const stmt = db.prepare(
    `
    SELECT user_id, nickname, gender, hair_style, glasses, top_color, bottom_color, theme_food, created_at, updated_at
    FROM user_avatars
    WHERE user_id = $user_id
    LIMIT 1;
    `,
  );
  try {
    stmt.bind({ $user_id: userID });
    if (!stmt.step()) return null;
    const row = stmt.getAsObject() as unknown as {
      user_id: string;
      nickname: string;
      gender: string;
      hair_style: string | null;
      glasses: string | null;
      top_color: string | null;
      bottom_color: string | null;
      theme_food: string | null;
      created_at: string;
      updated_at: string;
    };
    return {
      userID: row.user_id,
      nickname: row.nickname,
      gender: row.gender,
      hairStyle: row.hair_style ?? null,
      glasses: row.glasses ?? null,
      topColor: row.top_color ?? null,
      bottomColor: row.bottom_color ?? null,
      themeFood: row.theme_food || "胡萝卜",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } finally {
    stmt.free();
  }
}

export async function insertFoodLog(params: {
  userID: string;
  foodName: string;
  score: number;
  content: string;
  voiceData?: string | null;
  relatedBookID?: string | null;
  relatedReadingSessionID?: string | null;
  relatedReadingEndedAt?: string | null;
}) {
  const db = await getDb();
  const now = new Date().toISOString();
  db.run(
    `
    INSERT INTO user_food_logs (
      log_id,
      user_id,
      food_name,
      score,
      content,
      voice_data,
      related_book_id,
      related_reading_session_id,
      related_reading_ended_at,
      created_at
    )
    VALUES (
      $log_id,
      $user_id,
      $food_name,
      $score,
      $content,
      $voice_data,
      $related_book_id,
      $related_reading_session_id,
      $related_reading_ended_at,
      $created_at
    );
    `,
    {
      $log_id: crypto.randomUUID(),
      $user_id: params.userID,
      $food_name: params.foodName,
      $score: params.score,
      $content: params.content,
      $voice_data: params.voiceData ?? null,
      $related_book_id: params.relatedBookID ?? null,
      $related_reading_session_id: params.relatedReadingSessionID ?? null,
      $related_reading_ended_at: params.relatedReadingEndedAt ?? null,
      $created_at: now,
    },
  );
  await persistDb(db);
}

export async function getLatestFoodLog(userID: string): Promise<{ score: number; content: string } | null> {
  const db = await getDb();
  const stmt = db.prepare(
    `
    SELECT score, content
    FROM user_food_logs
    WHERE user_id = $user_id
    ORDER BY created_at DESC
    LIMIT 1;
    `,
  );
  try {
    stmt.bind({ $user_id: userID });
    if (!stmt.step()) return null;
    const row = stmt.getAsObject() as unknown as { score: number; content: string };
    return { score: row.score, content: row.content };
  } finally {
    stmt.free();
  }
}

export async function getLatestCompletedReadingForUser(userID: string): Promise<{
  sessionId: string;
  bookId: string;
  endedAt: string;
} | null> {
  const db = await getDb();
  const stmt = db.prepare(
    `
    SELECT rs.id, rs.book_id, rs.ended_at
    FROM reading_sessions rs
    JOIN history_books hb ON hb.book_id = rs.book_id AND hb.user_id = rs.user_id
    WHERE rs.user_id = $user_id AND rs.completed = 1 AND rs.book_id IS NOT NULL
    ORDER BY rs.ended_at DESC
    LIMIT 1;
    `,
  );
  try {
    stmt.bind({ $user_id: userID });
    if (!stmt.step()) return null;
    const row = stmt.getAsObject() as unknown as { id: string; book_id: string; ended_at: string };
    return { sessionId: row.id, bookId: row.book_id, endedAt: row.ended_at };
  } finally {
    stmt.free();
  }
}

export async function insertAvatarState(params: {
  userID: string;
  feedbackText?: string | null;
  expression?: string | null;
  bodyPosture?: string | null;
}) {
  const db = await getDb();
  const now = new Date().toISOString();
  db.run(
    `
    INSERT INTO user_avatar_states (state_id, user_id, expression, body_posture, feedback_text, created_at)
    VALUES ($state_id, $user_id, $expression, $body_posture, $feedback_text, $created_at);
    `,
    {
      $state_id: crypto.randomUUID(),
      $user_id: params.userID,
      $expression: params.expression ?? null,
      $body_posture: params.bodyPosture ?? null,
      $feedback_text: params.feedbackText ?? null,
      $created_at: now,
    },
  );
  await persistDb(db);
}

export async function getLatestAvatarState(userID: string): Promise<{
  feedbackText: string | null;
} | null> {
  const db = await getDb();
  const stmt = db.prepare(
    `
    SELECT feedback_text
    FROM user_avatar_states
    WHERE user_id = $user_id
    ORDER BY created_at DESC
    LIMIT 1;
    `,
  );
  try {
    stmt.bind({ $user_id: userID });
    if (!stmt.step()) return null;
    const row = stmt.getAsObject() as unknown as { feedback_text: string | null };
    return { feedbackText: row.feedback_text ?? null };
  } finally {
    stmt.free();
  }
}

export async function getLastFoodScore(userID: string): Promise<number | null> {
  const db = await getDb();
  const stmt = db.prepare(
    "SELECT score FROM user_food_logs WHERE user_id = $user_id ORDER BY created_at DESC LIMIT 1;",
  );
  try {
    stmt.bind({ $user_id: userID });
    if (!stmt.step()) return null;
    const row = stmt.getAsObject() as unknown as { score: number };
    return row.score ?? null;
  } finally {
    stmt.free();
  }
}

export type FoodLogEntry = {
  score: number;
  content: string;
  createdAt: string;
};

/**
 * 获取用户最近 N 条进食记录（不含本次，按时间降序）
 * 用于向 GPT 传递纵向历史数据，支持个性化故事生成
 */
export async function getFoodLogHistory(
  userID: string,
  limit = 10,
): Promise<FoodLogEntry[]> {
  const db = await getDb();
  const stmt = db.prepare(
    `SELECT score, content, created_at
     FROM user_food_logs
     WHERE user_id = $user_id
     ORDER BY created_at DESC
     LIMIT $limit;`,
  );
  try {
    stmt.bind({ $user_id: userID, $limit: limit });
    const entries: FoodLogEntry[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as unknown as {
        score: number;
        content: string;
        created_at: string;
      };
      entries.push({ score: row.score, content: row.content, createdAt: row.created_at });
    }
    return entries;
  } finally {
    stmt.free();
  }
}

export type HeatmapDayEntry = {
  date: string;    // YYYY-MM-DD
  avgScore: number;
  count: number;
};

/**
 * 获取用户指定天数内每日进食打卡的聚合数据，用于热力图展示
 */
export async function getFoodLogHeatmapData(
  userID: string,
  days: number = 35,
): Promise<HeatmapDayEntry[]> {
  const db = await getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const stmt = db.prepare(
    `SELECT
       substr(created_at, 1, 10) as day,
       AVG(score) as avg_score,
       COUNT(*) as log_count
     FROM user_food_logs
     WHERE user_id = $user_id
       AND substr(created_at, 1, 10) >= $cutoff
     GROUP BY day
     ORDER BY day ASC;`,
  );
  try {
    stmt.bind({ $user_id: userID, $cutoff: cutoffStr });
    const entries: HeatmapDayEntry[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as unknown as {
        day: string;
        avg_score: number;
        log_count: number;
      };
      entries.push({
        date: row.day,
        avgScore: Math.round(row.avg_score * 10) / 10,
        count: row.log_count,
      });
    }
    return entries;
  } finally {
    stmt.free();
  }
}

export type ReadingSummary = {
  totalSessions: number;
  lastCompletionRate: number | null; // 0-1
  lastCompleted: boolean | null;
};

/**
 * 获取用户最近一次阅读会话摘要，用于个性化故事难度调整
 */
export async function getReadingSummary(userID: string): Promise<ReadingSummary> {
  const db = await getDb();
  const totalStmt = db.prepare(
    "SELECT COUNT(*) as cnt FROM reading_sessions WHERE user_id = $user_id;",
  );
  let totalSessions = 0;
  try {
    totalStmt.bind({ $user_id: userID });
    if (totalStmt.step()) {
      totalSessions = (totalStmt.getAsObject() as unknown as { cnt: number }).cnt ?? 0;
    }
  } finally {
    totalStmt.free();
  }

  const lastStmt = db.prepare(
    `SELECT completed, pages_read, total_pages
     FROM reading_sessions
     WHERE user_id = $user_id
     ORDER BY created_at DESC
     LIMIT 1;`,
  );
  try {
    lastStmt.bind({ $user_id: userID });
    if (!lastStmt.step()) {
      return { totalSessions, lastCompletionRate: null, lastCompleted: null };
    }
    const row = lastStmt.getAsObject() as unknown as {
      completed: number;
      pages_read: number;
      total_pages: number;
    };
    const rate =
      row.total_pages > 0
        ? Math.round((row.pages_read / row.total_pages) * 100) / 100
        : null;
    return {
      totalSessions,
      lastCompletionRate: rate,
      lastCompleted: row.completed === 1,
    };
  } finally {
    lastStmt.free();
  }
}

export type TempBook = {
  userID: string;
  bookID: string;
  title: string;
  preview: string;
  description: string;
  content: string;
  regenerateCount: number;
  createdAt: string;
  updatedAt: string;
};

export type HistoryBook = {
  bookID: string;
  userID: string;
  title: string;
  preview: string;
  description: string;
  content: string;
  confirmedAt: string;
};

export async function getTempBook(userID: string): Promise<TempBook | null> {
  const db = await getDb();
  const stmt = db.prepare(
    `
    SELECT user_id, book_id, title, preview, description, content, regenerate_count, created_at, updated_at
    FROM temp_books
    WHERE user_id = $user_id
    LIMIT 1;
    `,
  );
  try {
    stmt.bind({ $user_id: userID });
    if (!stmt.step()) return null;
    const row = stmt.getAsObject() as unknown as {
      user_id: string;
      book_id: string;
      title: string;
      preview: string;
      description: string;
      content: string;
      regenerate_count: number;
      created_at: string;
      updated_at: string;
    };
    return {
      userID: row.user_id,
      bookID: row.book_id,
      title: row.title,
      preview: row.preview,
      description: row.description,
      content: row.content,
      regenerateCount: row.regenerate_count ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } finally {
    stmt.free();
  }
}

export async function saveTempBook(params: {
  userID: string;
  bookID: string;
  title: string;
  preview: string;
  description: string;
  content: string;
  regenerateCount: number;
}) {
  const db = await getDb();
  const now = new Date().toISOString();
  db.run(
    `
    INSERT INTO temp_books (
      user_id,
      book_id,
      title,
      preview,
      description,
      content,
      regenerate_count,
      created_at,
      updated_at
    )
    VALUES (
      $user_id,
      $book_id,
      $title,
      $preview,
      $description,
      $content,
      $regenerate_count,
      $created_at,
      $updated_at
    )
    ON CONFLICT(user_id) DO UPDATE SET
      book_id = $book_id,
      title = $title,
      preview = $preview,
      description = $description,
      content = $content,
      regenerate_count = $regenerate_count,
      updated_at = $updated_at;
    `,
    {
      $user_id: params.userID,
      $book_id: params.bookID,
      $title: params.title,
      $preview: params.preview,
      $description: params.description,
      $content: params.content,
      $regenerate_count: params.regenerateCount,
      $created_at: now,
      $updated_at: now,
    },
  );
  await persistDb(db);
}

export async function clearTempBook(userID: string) {
  const db = await getDb();
  db.run("DELETE FROM temp_books WHERE user_id = $user_id;", { $user_id: userID });
  await persistDb(db);
}

export async function addHistoryBook(params: {
  bookID: string;
  userID: string;
  title: string;
  preview: string;
  description: string;
  content: string;
}) {
  const db = await getDb();
  const now = new Date().toISOString();
  db.run(
    `
    INSERT INTO history_books (book_id, user_id, title, preview, description, content, confirmed_at)
    VALUES ($book_id, $user_id, $title, $preview, $description, $content, $confirmed_at);
    `,
    {
      $book_id: params.bookID,
      $user_id: params.userID,
      $title: params.title,
      $preview: params.preview,
      $description: params.description,
      $content: params.content,
      $confirmed_at: now,
    },
  );
  await persistDb(db);
}

export async function listHistoryBooks(userID: string): Promise<HistoryBook[]> {
  const db = await getDb();
  const stmt = db.prepare(
    `
    SELECT book_id, user_id, title, preview, description, content, confirmed_at
    FROM history_books
    WHERE user_id = $user_id
    ORDER BY confirmed_at DESC;
    `,
  );
  try {
    stmt.bind({ $user_id: userID });
    const items: HistoryBook[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as unknown as {
        book_id: string;
        user_id: string;
        title: string;
        preview: string;
        description: string;
        content: string;
        confirmed_at: string;
      };
      items.push({
        bookID: row.book_id,
        userID: row.user_id,
        title: row.title,
        preview: row.preview,
        description: row.description,
        content: row.content,
        confirmedAt: row.confirmed_at,
      });
    }
    return items;
  } finally {
    stmt.free();
  }
}

export async function getLatestHistoryBook(userID: string): Promise<HistoryBook | null> {
  const db = await getDb();
  const stmt = db.prepare(
    `
    SELECT book_id, user_id, title, preview, description, content, confirmed_at
    FROM history_books
    WHERE user_id = $user_id
    ORDER BY confirmed_at DESC
    LIMIT 1;
    `,
  );
  try {
    stmt.bind({ $user_id: userID });
    if (!stmt.step()) return null;
    const row = stmt.getAsObject() as unknown as {
      book_id: string;
      user_id: string;
      title: string;
      preview: string;
      description: string;
      content: string;
      confirmed_at: string;
    };
    return {
      bookID: row.book_id,
      userID: row.user_id,
      title: row.title,
      preview: row.preview,
      description: row.description,
      content: row.content,
      confirmedAt: row.confirmed_at,
    };
  } finally {
    stmt.free();
  }
}

export async function deleteUser(userID: string): Promise<boolean> {
  const db = await getDb();
  const existsStmt = db.prepare(
    `
    SELECT 1
    FROM users
    WHERE user_id = $user_id
    LIMIT 1;
    `,
  );
  try {
    existsStmt.bind({ $user_id: userID });
    if (!existsStmt.step()) {
      return false;
    }
    db.run("BEGIN TRANSACTION");
    db.run("DELETE FROM temp_books WHERE user_id = $user_id", { $user_id: userID });
    db.run("DELETE FROM history_books WHERE user_id = $user_id", { $user_id: userID });
    db.run("DELETE FROM user_avatar_states WHERE user_id = $user_id", { $user_id: userID });
    db.run("DELETE FROM user_food_logs WHERE user_id = $user_id", { $user_id: userID });
    db.run("DELETE FROM user_avatars WHERE user_id = $user_id", { $user_id: userID });
    db.run("DELETE FROM users WHERE user_id = $user_id", { $user_id: userID });
    db.run("COMMIT");
    await persistDb(db);
    return true;
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  } finally {
    existsStmt.free();
  }
}

// ─── Admin Stats ───────────────────────────────────────────

export async function insertReadingSession(params: {
  userID: string;
  bookID?: string | null;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  totalPages: number;
  pagesRead: number;
  interactionCount: number;
  completed: boolean;
  sessionType?: string;
  tryLevel?: string | null;
  abortReason?: string | null;
}) {
  const db = await getDb();
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO reading_sessions
      (id, user_id, book_id, started_at, ended_at, duration_ms, total_pages, pages_read, interaction_count, completed, session_type, try_level, abort_reason, created_at)
     VALUES ($id, $user_id, $book_id, $started_at, $ended_at, $duration_ms, $total_pages, $pages_read, $interaction_count, $completed, $session_type, $try_level, $abort_reason, $created_at);`,
    {
      $id: crypto.randomUUID(),
      $user_id: params.userID,
      $book_id: params.bookID ?? null,
      $started_at: params.startedAt,
      $ended_at: params.endedAt,
      $duration_ms: params.durationMs,
      $total_pages: params.totalPages,
      $pages_read: params.pagesRead,
      $interaction_count: params.interactionCount,
      $completed: params.completed ? 1 : 0,
      $session_type: params.sessionType ?? "experiment",
      $try_level: params.tryLevel ?? null,
      $abort_reason: params.abortReason ?? null,
      $created_at: now,
    },
  );
  await persistDb(db);
}

export async function insertVoiceRecording(params: {
  userID: string;
  source?: string;
  contextId?: string | null;
  pageId?: string | null;
  audioData?: string | null;
  transcript?: string | null;
  durationMs?: number | null;
}): Promise<string> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO voice_recordings
      (id, user_id, source, context_id, page_id, audio_data, transcript, duration_ms, created_at)
     VALUES ($id, $user_id, $source, $context_id, $page_id, $audio_data, $transcript, $duration_ms, $created_at);`,
    {
      $id: id,
      $user_id: params.userID,
      $source: params.source ?? "interaction",
      $context_id: params.contextId ?? null,
      $page_id: params.pageId ?? null,
      $audio_data: params.audioData ?? null,
      $transcript: params.transcript ?? null,
      $duration_ms: params.durationMs ?? null,
      $created_at: now,
    },
  );
  await persistDb(db);
  return id;
}

export type DailyReadingStat = {
  date: string;
  sessionCount: number;
  completedCount: number;
  totalDurationMs: number;
  totalInteractions: number;
  positiveFeedbackCount: number;
};

export async function getDailyReadingStats(days = 7): Promise<DailyReadingStat[]> {
  const db = await getDb();
  const rows = db.exec(`
    SELECT
      DATE(created_at) as date,
      COUNT(*) as session_count,
      SUM(completed) as completed_count,
      SUM(duration_ms) as total_duration_ms,
      SUM(interaction_count) as total_interactions,
      SUM(CASE WHEN try_level IS NOT NULL AND try_level != 'look' THEN 1 ELSE 0 END) as positive_feedback_count
    FROM reading_sessions
    WHERE created_at >= DATE('now', '-${days} days')
    GROUP BY DATE(created_at)
    ORDER BY date DESC;
  `);
  const result: DailyReadingStat[] = [];
  const cols = rows[0]?.columns ?? [];
  for (const row of rows[0]?.values ?? []) {
    const get = (name: string) => row[cols.indexOf(name)];
    result.push({
      date: get("date") as string,
      sessionCount: (get("session_count") as number) ?? 0,
      completedCount: (get("completed_count") as number) ?? 0,
      totalDurationMs: (get("total_duration_ms") as number) ?? 0,
      totalInteractions: (get("total_interactions") as number) ?? 0,
      positiveFeedbackCount: (get("positive_feedback_count") as number) ?? 0,
    });
  }
  return result;
}

// ─── Admin Stats ───────────────────────────────────────────

export type AdminUserStats = {
  funnel: {
    totalUsers: number;
    completedAvatar: number;
    submittedFoodLog: number;
    generatedBook: number;
    confirmedBook: number;
  };
  foodScores: {
    avgScore: number | null;
    distribution: { low: number; mid: number; high: number };
  };
  books: {
    totalGenerated: number;
    totalConfirmed: number;
    avgRegenerateCount: number | null;
  };
  enrichedUsers: Array<{
    userID: string;
    themeFood: string;
    firstLogin: boolean;
    nickname: string | null;
    gender: string | null;
    voiceCount: number;
    totalPagesRead: number;
    totalTotalPages: number;
    foodLogCount: number;
    avgScore: number | null;
    bookCount: number;
    confirmedAt: string | null;
    lastActive: string | null;
    previewCount: number;
    reviewCount: number;
    experimentCompletedCount: number;
    experimentAbortedCount: number;
    positiveFeedbackCount: number;
    avgDurationMs: number;
    avgInteractionCount: number;
  }>;
  today: {
    sessionCount: number;
    totalDurationMs: number;
    totalInteractions: number;
    positiveFeedbackCount: number;
  };
};

function execScalar(db: Database, sql: string): number {
  const res = db.exec(sql);
  return (res[0]?.values[0]?.[0] as number) ?? 0;
}

export async function getAdminStats(): Promise<AdminUserStats> {
  const db = await getDb();

  const totalUsers = execScalar(db, "SELECT COUNT(*) FROM users;");
  const completedAvatar = execScalar(db, "SELECT COUNT(*) FROM user_avatars;");
  const submittedFoodLog = execScalar(db, "SELECT COUNT(DISTINCT user_id) FROM user_food_logs;");
  const generatedTB = execScalar(db, "SELECT COUNT(DISTINCT user_id) FROM temp_books;");
  const generatedHB = execScalar(db, "SELECT COUNT(DISTINCT user_id) FROM history_books;");
  const confirmedBook = generatedHB;

  // Merge distinct users who have temp OR history books
  const bookUserIds = new Set<string>();
  for (const tbl of ["temp_books", "history_books"] as const) {
    const r = db.exec(`SELECT DISTINCT user_id FROM ${tbl};`);
    for (const row of r[0]?.values ?? []) bookUserIds.add(row[0] as string);
  }
  const generatedBook = bookUserIds.size;

  // Food score stats
  const scoreRows = db.exec(`
    SELECT
      AVG(score) as avg_score,
      SUM(CASE WHEN score <= 3 THEN 1 ELSE 0 END) as low,
      SUM(CASE WHEN score >= 4 AND score <= 6 THEN 1 ELSE 0 END) as mid,
      SUM(CASE WHEN score >= 7 THEN 1 ELSE 0 END) as high
    FROM user_food_logs;
  `);
  const sr = scoreRows[0]?.values[0];
  const avgScore = sr?.[0] != null ? Math.round((sr[0] as number) * 10) / 10 : null;
  const distribution = {
    low: (sr?.[1] as number) ?? 0,
    mid: (sr?.[2] as number) ?? 0,
    high: (sr?.[3] as number) ?? 0,
  };

  // Book metrics
  const totalGeneratedBooks =
    execScalar(db, "SELECT COUNT(*) FROM temp_books;") +
    execScalar(db, "SELECT COUNT(*) FROM history_books;");
  const totalConfirmedBooks = execScalar(db, "SELECT COUNT(*) FROM history_books;");
  const avgRegenRow = db.exec("SELECT AVG(regenerate_count) FROM temp_books WHERE regenerate_count > 0;");
  const avgRegenerateCount =
    avgRegenRow[0]?.values[0]?.[0] != null
      ? Math.round((avgRegenRow[0].values[0][0] as number) * 10) / 10
      : null;

  // Per-user enriched data
  const enrichedRows = db.exec(`
    SELECT
      u.user_id,
      u.theme_food,
      u.first_login,
      ua.nickname,
      ua.gender,
      COALESCE(vr.voice_count, 0) as voice_count,
      COALESCE(fl.cnt, 0) as food_log_count,
      fl.avg_score,
      COALESCE(hb.cnt, 0) as book_count,
      hb.last_confirmed_at,
      COALESCE(fl.last_at, ua.updated_at) as last_active,
      COALESCE(rs.preview_count, 0) as preview_count,
      COALESCE(rs.review_count, 0) as review_count,
      COALESCE(rs.experiment_completed_count, 0) as experiment_completed_count,
      COALESCE(rs.experiment_aborted_count, 0) as experiment_aborted_count,
      COALESCE(rs.positive_feedback_count, 0) as positive_feedback_count,
      COALESCE(rs.avg_duration_ms, 0) as avg_duration_ms,
      COALESCE(rs.avg_interaction_count, 0) as avg_interaction_count,
      COALESCE(rs.total_pages_read, 0) as total_pages_read,
      COALESCE(rs.total_total_pages, 0) as total_total_pages
    FROM users u
    LEFT JOIN (
      SELECT user_id, COUNT(*) as cnt, AVG(score) as avg_score, MAX(created_at) as last_at
      FROM user_food_logs GROUP BY user_id
    ) fl ON u.user_id = fl.user_id
    LEFT JOIN (
      SELECT user_id, COUNT(*) as cnt, MAX(confirmed_at) as last_confirmed_at FROM history_books GROUP BY user_id
    ) hb ON u.user_id = hb.user_id
    LEFT JOIN user_avatars ua ON u.user_id = ua.user_id
    LEFT JOIN (
      SELECT user_id, COUNT(*) as voice_count FROM voice_recordings GROUP BY user_id
    ) vr ON u.user_id = vr.user_id
    LEFT JOIN (
      SELECT
        user_id,
        SUM(CASE WHEN session_type = 'preview' THEN 1 ELSE 0 END) as preview_count,
        SUM(CASE WHEN session_type = 'review' THEN 1 ELSE 0 END) as review_count,
        SUM(CASE WHEN session_type = 'experiment' AND completed = 1 THEN 1 ELSE 0 END) as experiment_completed_count,
        SUM(CASE WHEN session_type = 'experiment' AND completed = 0 THEN 1 ELSE 0 END) as experiment_aborted_count,
        SUM(CASE WHEN session_type = 'experiment' AND try_level IS NOT NULL AND try_level != 'look' THEN 1 ELSE 0 END) as positive_feedback_count,
        AVG(duration_ms) as avg_duration_ms,
        AVG(interaction_count) as avg_interaction_count,
        SUM(pages_read) as total_pages_read,
        SUM(total_pages) as total_total_pages
      FROM reading_sessions
      GROUP BY user_id
    ) rs ON u.user_id = rs.user_id
    ORDER BY u.user_id;
  `);

  const enrichedUsers: AdminUserStats["enrichedUsers"] = [];
  const cols = enrichedRows[0]?.columns ?? [];
  for (const row of enrichedRows[0]?.values ?? []) {
    const get = (name: string) => row[cols.indexOf(name)];
    enrichedUsers.push({
      userID: get("user_id") as string,
      themeFood: (get("theme_food") as string) ?? "胡萝卜",
      firstLogin: get("first_login") === 1,
      nickname: (get("nickname") as string) ?? null,
      gender: (get("gender") as string) ?? null,
      voiceCount: (get("voice_count") as number) ?? 0,
      totalPagesRead: (get("total_pages_read") as number) ?? 0,
      totalTotalPages: (get("total_total_pages") as number) ?? 0,
      foodLogCount: (get("food_log_count") as number) ?? 0,
      avgScore: get("avg_score") != null ? Math.round((get("avg_score") as number) * 10) / 10 : null,
      bookCount: (get("book_count") as number) ?? 0,
      confirmedAt: (get("last_confirmed_at") as string) ?? null,
      lastActive: (get("last_active") as string) ?? null,
      previewCount: (get("preview_count") as number) ?? 0,
      reviewCount: (get("review_count") as number) ?? 0,
      experimentCompletedCount: (get("experiment_completed_count") as number) ?? 0,
      experimentAbortedCount: (get("experiment_aborted_count") as number) ?? 0,
      positiveFeedbackCount: (get("positive_feedback_count") as number) ?? 0,
      avgDurationMs: Math.round((get("avg_duration_ms") as number) ?? 0),
      avgInteractionCount: Math.round(((get("avg_interaction_count") as number) ?? 0) * 10) / 10,
    });
  }

  // Today's aggregate stats
  const todayRows = db.exec(`
    SELECT
      COUNT(*) as session_count,
      SUM(duration_ms) as total_duration_ms,
      SUM(interaction_count) as total_interactions,
      SUM(CASE WHEN try_level IS NOT NULL AND try_level != 'look' THEN 1 ELSE 0 END) as positive_feedback_count
    FROM reading_sessions
    WHERE DATE(created_at) = DATE('now');
  `);
  const todayRow = todayRows[0]?.values[0];
  const today = {
    sessionCount: (todayRow?.[0] as number) ?? 0,
    totalDurationMs: (todayRow?.[1] as number) ?? 0,
    totalInteractions: (todayRow?.[2] as number) ?? 0,
    positiveFeedbackCount: (todayRow?.[3] as number) ?? 0,
  };

  return {
    funnel: { totalUsers, completedAvatar, submittedFoodLog, generatedBook, confirmedBook },
    foodScores: { avgScore, distribution },
    books: { totalGenerated: totalGeneratedBooks, totalConfirmed: totalConfirmedBooks, avgRegenerateCount },
    enrichedUsers,
    today,
  };
}

export async function getHistoryBookById(
  userID: string,
  bookID: string,
): Promise<HistoryBook | null> {
  const db = await getDb();
  const stmt = db.prepare(
    `
    SELECT book_id, user_id, title, preview, description, content, confirmed_at
    FROM history_books
    WHERE user_id = $user_id AND book_id = $book_id
    LIMIT 1;
    `,
  );
  try {
    stmt.bind({ $user_id: userID, $book_id: bookID });
    if (!stmt.step()) return null;
    const row = stmt.getAsObject() as unknown as {
      book_id: string;
      user_id: string;
      title: string;
      preview: string;
      description: string;
      content: string;
      confirmed_at: string;
    };
    return {
      bookID: row.book_id,
      userID: row.user_id,
      title: row.title,
      preview: row.preview,
      description: row.description,
      content: row.content,
      confirmedAt: row.confirmed_at,
    };
  } finally {
    stmt.free();
  }
}

export async function getTempBookById(
  userID: string,
  bookID: string,
): Promise<TempBook | null> {
  const db = await getDb();
  const stmt = db.prepare(
    `
    SELECT user_id, book_id, title, preview, description, content, regenerate_count, created_at, updated_at
    FROM temp_books
    WHERE user_id = $user_id AND book_id = $book_id
    LIMIT 1;
    `,
  );
  try {
    stmt.bind({ $user_id: userID, $book_id: bookID });
    if (!stmt.step()) return null;
    const row = stmt.getAsObject() as unknown as {
      user_id: string;
      book_id: string;
      title: string;
      preview: string;
      description: string;
      content: string;
      regenerate_count: number;
      created_at: string;
      updated_at: string;
    };
    return {
      userID: row.user_id,
      bookID: row.book_id,
      title: row.title,
      preview: row.preview,
      description: row.description,
      content: row.content,
      regenerateCount: row.regenerate_count ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } finally {
    stmt.free();
  }
}

// ─── Generating state persistence ─────────────────────────────────────────────

export async function setUserGenerating(userID: string) {
  const db = await getDb();
  db.run("UPDATE users SET generating_since = datetime('now') WHERE user_id = $uid;", { $uid: userID });
  await persistDb(db);
}

export async function clearUserGenerating(userID: string) {
  const db = await getDb();
  db.run("UPDATE users SET generating_since = NULL WHERE user_id = $uid;", { $uid: userID });
  await persistDb(db);
}

export async function isUserGenerating(userID: string): Promise<boolean> {
  const db = await getDb();
  const stmt = db.prepare(
    "SELECT generating_since FROM users WHERE user_id = $uid;",
  );
  stmt.bind({ $uid: userID });
  try {
    if (!stmt.step()) return false;
    const row = stmt.getAsObject() as { generating_since: string | null };
    if (!row.generating_since) return false;
    const sinceMs = new Date(row.generating_since + "Z").getTime();
    return Date.now() - sinceMs < 5 * 60 * 1000;
  } finally {
    stmt.free();
  }
}

// ─── Admin CSV Exports ────────────────────────────────────

function execRows(db: Database, sql: string): Record<string, unknown>[] {
  const res = db.exec(sql);
  if (!res[0]) return [];
  const cols = res[0].columns;
  return res[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < cols.length; i++) obj[cols[i]] = row[i];
    return obj;
  });
}

export async function exportAllUsers(): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  return execRows(db, `
    SELECT u.user_id, u.first_login, u.theme_food,
           ua.nickname, ua.gender, ua.hair_style, ua.glasses,
           ua.top_color, ua.bottom_color, ua.created_at as avatar_created_at
    FROM users u
    LEFT JOIN user_avatars ua ON u.user_id = ua.user_id
    ORDER BY u.user_id;
  `);
}

export async function exportAllFoodLogs(): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  return execRows(db, `
    SELECT log_id, user_id, food_name, score, content, related_book_id, related_reading_session_id, related_reading_ended_at, created_at
    FROM user_food_logs
    ORDER BY created_at DESC;
  `);
}

export async function exportAllReadingSessions(): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  return execRows(db, `
    SELECT id, user_id, book_id, started_at, ended_at, duration_ms,
           total_pages, pages_read, interaction_count, completed,
           session_type, try_level, abort_reason, created_at
    FROM reading_sessions
    ORDER BY created_at DESC;
  `);
}

export async function exportAllVoiceRecordings(): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  return execRows(db, `
    SELECT id, user_id, source, context_id, page_id, transcript, duration_ms, created_at
    FROM voice_recordings
    ORDER BY created_at DESC;
  `);
}

export async function exportAllAvatars(): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  return execRows(db, `
    SELECT user_id, nickname, gender, hair_style, glasses,
           top_color, bottom_color, theme_food, created_at, updated_at
    FROM user_avatars
    ORDER BY user_id;
  `);
}
