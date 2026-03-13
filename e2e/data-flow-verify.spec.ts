import { test, expect } from "@playwright/test";

/**
 * E2E data-flow verification: user operations → admin stats consistency.
 *
 * Strategy: call APIs directly (no UI), snapshot admin stats before/after,
 * compare deltas to expected values.
 */

const ADMIN_KEY = process.env.ADMIN_API_KEY || "6566697232";
const TEST_USER = `e2e_flow_${Date.now()}`;
const TEST_PASS = "test1234";

interface AdminStats {
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
  enrichedUsers: Array<{
    userID: string;
    foodLogCount: number;
    avgScore: number | null;
    experimentCompletedCount: number;
    experimentAbortedCount: number;
    totalPagesRead: number;
    avgDurationMs: number;
    avgInteractionCount: number;
    positiveFeedbackCount: number;
  }>;
}

const adminHeaders = { "x-admin-key": ADMIN_KEY };

test.describe("Data-flow verification", () => {
  let token: string;

  async function getStats(
    request: import("@playwright/test").APIRequestContext
  ): Promise<AdminStats> {
    const res = await request.get("/api/user/admin/stats", {
      headers: adminHeaders,
    });
    expect(res.ok()).toBeTruthy();
    return res.json();
  }

  // Cleanup: always delete the test user
  test.afterAll(async ({ request }) => {
    await request.delete(`/api/user/admin/users/${TEST_USER}`, {
      headers: adminHeaders,
    });
  });

  test("user ops produce correct admin stat deltas", async ({ request }) => {
    // ── Step 0: baseline snapshot ──────────────────────────────
    const before = await getStats(request);

    // ── Step 1: create user & login ────────────────────────────
    const createRes = await request.post("/api/user/admin/users", {
      headers: adminHeaders,
      data: { userID: TEST_USER, password: TEST_PASS, themeFood: "苹果" },
    });
    expect(createRes.ok()).toBeTruthy();

    const loginRes = await request.post("/api/user/auth/login", {
      data: { userID: TEST_USER, password: TEST_PASS },
    });
    expect(loginRes.ok()).toBeTruthy();
    token = (await loginRes.json()).token;
    const authHeaders = { Authorization: `Bearer ${token}` };

    // ── Step 1b: create avatar (required for food log) ─────────
    const avatarRes = await request.post("/api/user/avatar/save", {
      headers: authHeaders,
      data: {
        nickname: "测试小孩",
        gender: "male",
        color: "blue",
        shirt: "short",
        underdress: "short",
        glasses: "no",
      },
    });
    expect(avatarRes.ok()).toBeTruthy();

    // ── Step 2: submit food log (score=8 → high) ──────────────
    const foodRes = await request.post("/api/user/food/log", {
      headers: authHeaders,
      data: { foodName: "测试食物", score: 8, content: "吃了一口" },
    });
    expect(foodRes.ok()).toBeTruthy();
    const foodBody = await foodRes.json();
    expect(foodBody.ok).toBe(true);
    expect(foodBody.score).toBe(8);

    // ── Step 3: reading session — completed ───────────────────
    const readDoneRes = await request.post("/api/user/reading/log", {
      headers: authHeaders,
      data: {
        completed: true,
        tryLevel: "bite",
        durationMs: 30000,
        pagesRead: 6,
        totalPages: 8,
        interactionCount: 2,
        sessionType: "experiment",
        skipAutoBookGeneration: true,
      },
    });
    expect(readDoneRes.ok()).toBeTruthy();

    // ── Step 4: reading session — aborted ─────────────────────
    const readAbortRes = await request.post("/api/user/reading/log", {
      headers: authHeaders,
      data: {
        completed: false,
        abortReason: "bored",
        durationMs: 5000,
        pagesRead: 1,
        totalPages: 8,
        sessionType: "experiment",
        skipAutoBookGeneration: true,
      },
    });
    expect(readAbortRes.ok()).toBeTruthy();

    // ── Step 5: after snapshot ────────────────────────────────
    const after = await getStats(request);

    // ── Step 6: verify deltas ─────────────────────────────────

    // Funnel
    expect(after.funnel.totalUsers - before.funnel.totalUsers).toBe(1);
    expect(
      after.funnel.submittedFoodLog - before.funnel.submittedFoodLog
    ).toBe(1);
    expect(
      after.funnel.completedAvatar - before.funnel.completedAvatar
    ).toBe(1);

    // Food scores — score 8 ≥ 7 → high bucket
    expect(
      after.foodScores.distribution.high - before.foodScores.distribution.high
    ).toBe(1);

    // Enriched user record
    const user = after.enrichedUsers.find((u) => u.userID === TEST_USER);
    expect(user).toBeDefined();
    expect(user!.foodLogCount).toBe(1);
    expect(user!.avgScore).toBe(8);
    expect(user!.experimentCompletedCount).toBe(1);
    expect(user!.experimentAbortedCount).toBe(1);
    expect(user!.totalPagesRead).toBe(7); // 6 + 1
    expect(user!.avgDurationMs).toBeGreaterThan(0);
    expect(user!.avgInteractionCount).toBeGreaterThan(0);
    // tryLevel "bite" ≠ "look" → positive feedback
    expect(user!.positiveFeedbackCount).toBe(1);

    // ── Step 7: CSV export validation ─────────────────────────

    // reading_sessions.csv — must contain skip_auto_book_generation column
    const sessionsCSV = await request.get(
      `/api/user/admin/export/reading_sessions.csv?key=${ADMIN_KEY}`
    );
    expect(sessionsCSV.ok()).toBeTruthy();
    const sessionsText = await sessionsCSV.text();
    const sessionsHeader = sessionsText.split("\n")[0];
    expect(sessionsHeader).toContain("skip_auto_book_generation");
    // Our completed session should appear with skip=true
    const sessionLines = sessionsText.split("\n").filter((l) =>
      l.includes(TEST_USER)
    );
    expect(sessionLines.length).toBeGreaterThanOrEqual(2);

    // food_logs.csv — test user row with correct food_name and score
    const foodCSV = await request.get(
      `/api/user/admin/export/food_logs.csv?key=${ADMIN_KEY}`
    );
    expect(foodCSV.ok()).toBeTruthy();
    const foodText = await foodCSV.text();
    const foodLines = foodText.split("\n").filter((l) =>
      l.includes(TEST_USER)
    );
    expect(foodLines.length).toBe(1);
    expect(foodLines[0]).toContain("测试食物");
    expect(foodLines[0]).toContain("8");
  });
});
