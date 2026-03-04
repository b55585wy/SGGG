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
    CREATE TABLE IF NOT EXISTS user_avatars (
      user_id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      gender TEXT NOT NULL,
      skin_color TEXT DEFAULT 'f2d3b1',
      hair TEXT DEFAULT 'short01',
      hair_color TEXT DEFAULT '0e0e0e',
      theme_food TEXT DEFAULT '胡萝卜',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS user_food_logs (
      log_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      content TEXT NOT NULL,
      voice_data TEXT,
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
  if (!columns.has("skin_color")) {
    db.run("ALTER TABLE user_avatars ADD COLUMN skin_color TEXT DEFAULT 'f2d3b1';");
  }
  if (!columns.has("hair")) {
    db.run("ALTER TABLE user_avatars ADD COLUMN hair TEXT DEFAULT 'short01';");
  }
  if (!columns.has("hair_color")) {
    db.run("ALTER TABLE user_avatars ADD COLUMN hair_color TEXT DEFAULT '0e0e0e';");
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

// DiceBear avatar — options generated client-side, only base config stored in DB

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
      ensureSeedData(db);
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

export async function saveUserAvatar(params: {
  userID: string;
  nickname: string;
  gender: string;
  skinColor?: string;
  hair?: string;
  hairColor?: string;
}) {
  const db = await getDb();
  const now = new Date().toISOString();
  const themeFood = await getUserThemeFood(params.userID);
  db.run(
    `
    INSERT INTO user_avatars (
      user_id, nickname, gender,
      skin_color, hair, hair_color,
      theme_food,
      created_at, updated_at
    )
    VALUES (
      $user_id, $nickname, $gender,
      $skin_color, $hair, $hair_color,
      $theme_food,
      $created_at, $updated_at
    )
    ON CONFLICT(user_id) DO UPDATE SET
      nickname = $nickname,
      gender = $gender,
      skin_color = $skin_color,
      hair = $hair,
      hair_color = $hair_color,
      theme_food = $theme_food,
      updated_at = $updated_at;
    `,
    {
      $user_id: params.userID,
      $nickname: params.nickname,
      $gender: params.gender,
      $skin_color: params.skinColor ?? "f2d3b1",
      $hair: params.hair ?? "short01",
      $hair_color: params.hairColor ?? "0e0e0e",
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
  skinColor: string;
  hair: string;
  hairColor: string;
  themeFood: string;
  createdAt: string;
  updatedAt: string;
};

export async function getUserAvatar(userID: string): Promise<UserAvatar | null> {
  const db = await getDb();
  const stmt = db.prepare(
    `
    SELECT user_id, nickname, gender, skin_color, hair, hair_color, theme_food, created_at, updated_at
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
      skin_color: string | null;
      hair: string | null;
      hair_color: string | null;
      theme_food: string | null;
      created_at: string;
      updated_at: string;
    };
    return {
      userID: row.user_id,
      nickname: row.nickname,
      gender: row.gender,
      skinColor: row.skin_color || "f2d3b1",
      hair: row.hair || "short01",
      hairColor: row.hair_color || "0e0e0e",
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
  score: number;
  content: string;
  voiceData?: string | null;
}) {
  const db = await getDb();
  const now = new Date().toISOString();
  db.run(
    `
    INSERT INTO user_food_logs (log_id, user_id, score, content, voice_data, created_at)
    VALUES ($log_id, $user_id, $score, $content, $voice_data, $created_at);
    `,
    {
      $log_id: crypto.randomUUID(),
      $user_id: params.userID,
      $score: params.score,
      $content: params.content,
      $voice_data: params.voiceData ?? null,
      $created_at: now,
    },
  );
  await persistDb(db);
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
    foodLogCount: number;
    avgScore: number | null;
    bookCount: number;
    lastActive: string | null;
  }>;
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
      COALESCE(fl.cnt, 0) as food_log_count,
      fl.avg_score,
      COALESCE(hb.cnt, 0) as book_count,
      COALESCE(fl.last_at, ua.updated_at) as last_active
    FROM users u
    LEFT JOIN (
      SELECT user_id, COUNT(*) as cnt, AVG(score) as avg_score, MAX(created_at) as last_at
      FROM user_food_logs GROUP BY user_id
    ) fl ON u.user_id = fl.user_id
    LEFT JOIN (
      SELECT user_id, COUNT(*) as cnt FROM history_books GROUP BY user_id
    ) hb ON u.user_id = hb.user_id
    LEFT JOIN user_avatars ua ON u.user_id = ua.user_id
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
      foodLogCount: (get("food_log_count") as number) ?? 0,
      avgScore: get("avg_score") != null ? Math.round((get("avg_score") as number) * 10) / 10 : null,
      bookCount: (get("book_count") as number) ?? 0,
      lastActive: (get("last_active") as string) ?? null,
    });
  }

  return {
    funnel: { totalUsers, completedAvatar, submittedFoodLog, generatedBook, confirmedBook },
    foodScores: { avgScore, distribution },
    books: { totalGenerated: totalGeneratedBooks, totalConfirmed: totalConfirmedBooks, avgRegenerateCount },
    enrichedUsers,
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
