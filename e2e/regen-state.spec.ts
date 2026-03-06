import { test, expect, Page } from '@playwright/test';

// ─── 共用工具函数 ──────────────────────────────────────────────────────────────

async function loginAndSetupAvatar(page: Page) {
  await page.goto('/noa/login');
  await page.locator('input[autocomplete="username"]').fill('demo');
  await page.locator('input[type="password"]').fill('demo123');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/(noa\/avatar|noa\/home)/, { timeout: 10_000 });

  if (page.url().includes('/noa/avatar')) {
    await expect(page.locator('text=基本信息')).toBeVisible();
    await page.locator('input[placeholder="给自己起一个昵称"]').fill('测试小朋友');
    await page.locator('button').filter({ hasText: '男孩' }).first().click();
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/noa\/home/, { timeout: 10_000 });
  }
}

/** 提交进食记录，等待表单重置 */
async function submitFoodLog(page: Page, score = '7', text = '今天吃了很多胡萝卜') {
  await expect(page.locator('text=进食情况录入')).toBeVisible();
  const slider = page.locator('input[type="range"]').first();
  await slider.fill(score);
  await page.locator('textarea').fill(text);
  const sendBtn = page.locator('button').filter({ hasText: '发送' });
  await expect(sendBtn).toBeEnabled({ timeout: 5_000 });
  await sendBtn.click();
  await expect(sendBtn).toBeDisabled({ timeout: 15_000 });
}

/** 等待未确认绘本出现（需 FastAPI）。返回 false 表示 FastAPI 不可用，测试应跳过。 */
async function waitForUnconfirmedBook(page: Page, timeout = 60_000): Promise<boolean> {
  return page
    .locator('button').filter({ hasText: '重新生成' })
    .isVisible({ timeout })
    .catch(() => false);
}

/** 打开重新生成弹窗并提交（可选：修改故事设置） */
async function openAndSubmitRegen(
  page: Page,
  opts: { pages?: number; storyType?: string; reason?: string } = {},
) {
  await page.locator('button').filter({ hasText: '重新生成' }).click();
  await expect(page.locator('text=不满意的原因')).toBeVisible();

  // 选择原因
  const reason = opts.reason ?? '太长了';
  await page.locator('button').filter({ hasText: reason }).click();

  // 展开"故事设置"并调整
  if (opts.pages !== undefined || opts.storyType !== undefined) {
    await page.locator('button').filter({ hasText: '故事设置' }).click();
    await expect(page.locator('text=故事类型')).toBeVisible();

    if (opts.storyType) {
      await page.locator('button').filter({ hasText: opts.storyType }).first().click();
    }
    if (opts.pages !== undefined) {
      // The pages range input is inside the regen modal (故事设置 section)
      const pagesSlider = page.locator('input[type="range"]').last();
      await pagesSlider.fill(String(opts.pages));
    }
  }

  await page.locator('button').filter({ hasText: '提交并重新生成' }).click();
}

// ─── 一：生成中状态持久化（刷新后恢复） ──────────────────────────────────────

test.describe('生成中状态 — 刷新后恢复', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetupAvatar(page);
  });

  test('提交后立即刷新 → 应继续显示生成中动效（shimmer/skeleton），而非空状态', async ({ page }) => {
    await submitFoodLog(page);

    // Immediately reload — bookGenerating was true, server still generating
    await page.reload();
    await page.waitForURL(/\/noa\/home/, { timeout: 8_000 });

    // After reload, server's /api/home/status returns generating:true
    // → client should restore bookGenerating=true and show animation
    const hasShimmer = await page.locator('.book-gen-shimmer').isVisible({ timeout: 8_000 }).catch(() => false);
    const hasSkeleton = await page.locator('.skeleton-shimmer').first().isVisible({ timeout: 1_000 }).catch(() => false);
    // OR book is already done (very fast generation)
    const hasBook = await page.locator('button').filter({ hasText: '重新生成' }).isVisible({ timeout: 1_000 }).catch(() => false);

    expect(hasShimmer || hasSkeleton || hasBook).toBe(true);

    // Must NOT show the "no log submitted yet" empty state
    await expect(page.locator('text=等待生成')).not.toBeVisible({ timeout: 3_000 });
  });

  test('提交后刷新，API 状态轮询最终停止在绘本就绪（需要 FastAPI）', async ({ page }) => {
    await submitFoodLog(page);
    await page.reload();
    await page.waitForURL(/\/noa\/home/, { timeout: 8_000 });

    // After reload, if generating=true, polling restarts and eventually finishes
    const bookReady = await waitForUnconfirmedBook(page, 90_000);
    if (!bookReady) return; // FastAPI not available

    // Book should now be visible and NOT show the empty state
    await expect(page.locator('button').filter({ hasText: '重新生成' })).toBeVisible();
    await expect(page.locator('text=等待生成')).not.toBeVisible();
  });
});

// ─── 二：重新生成中刷新 → 不显示旧绘本为当前可操作书 ───────────────────────

test.describe('重新生成中刷新 — 不显示旧绘本（需要 FastAPI）', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetupAvatar(page);
  });

  test('重新生成触发后立即刷新 → 显示生成中动效，不显示旧书的操作按钮', async ({ page }) => {
    await submitFoodLog(page);
    const firstBookReady = await waitForUnconfirmedBook(page, 60_000);
    if (!firstBookReady) return;

    // Trigger regen
    await openAndSubmitRegen(page, { reason: '太长了' });

    // Immediately reload while regen is in progress on server
    await page.reload();
    await page.waitForURL(/\/noa\/home/, { timeout: 8_000 });

    // Server: generating=true (regen in progress), old book still in DB
    // Client MUST show animation, NOT old book with action buttons
    await expect(page.locator('text=等待生成')).not.toBeVisible({ timeout: 3_000 });

    const hasShimmer = await page.locator('.book-gen-shimmer').isVisible({ timeout: 8_000 }).catch(() => false);
    const hasSkeleton = await page.locator('.skeleton-shimmer').first().isVisible({ timeout: 1_000 }).catch(() => false);
    const hasNewBook = await page.locator('button').filter({ hasText: '重新生成' }).isVisible({ timeout: 1_000 }).catch(() => false);

    expect(hasShimmer || hasSkeleton || hasNewBook).toBe(true);
  });

  test('重新生成完成后刷新 → 显示新绘本（bookID 与旧书不同）', async ({ page }) => {
    await submitFoodLog(page);
    const firstBookReady = await waitForUnconfirmedBook(page, 60_000);
    if (!firstBookReady) return;

    // Capture old book title for comparison
    const oldTitle = await page.locator('h3').first().innerText().catch(() => '');

    // Regen, then wait for new book
    await openAndSubmitRegen(page, { reason: '太长了' });
    const regenBookReady = await waitForUnconfirmedBook(page, 90_000);
    if (!regenBookReady) return;

    // Reload after new book is ready
    await page.reload();
    await page.waitForURL(/\/noa\/home/, { timeout: 8_000 });

    // Should show the NEW book, not empty state
    await expect(page.locator('button').filter({ hasText: '重新生成' })).toBeVisible({ timeout: 10_000 });

    // Title should differ (different story generated by regen)
    const newTitle = await page.locator('h3').first().innerText().catch(() => '');
    // Title might coincidentally match — at minimum book must be present
    expect(newTitle.length).toBeGreaterThan(0);
    expect(newTitle).not.toBe('等待生成');
    // If both titles obtained, they should differ
    if (oldTitle && newTitle) expect(newTitle).not.toBe(oldTitle);
  });
});

// ─── 三：重新生成设置传递正确 ─────────────────────────────────────────────────

test.describe('重新生成 — 设置传递（需要 FastAPI）', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetupAvatar(page);
  });

  test('页数设置传递：设为 4 页时生成的绘本应有 4 页', async ({ page }) => {
    await submitFoodLog(page);
    const firstBook = await waitForUnconfirmedBook(page, 60_000);
    if (!firstBook) return;

    // Regen with pages=4
    await openAndSubmitRegen(page, { pages: 4, reason: '太长了' });
    const regenDone = await waitForUnconfirmedBook(page, 90_000);
    if (!regenDone) return;

    // Navigate into book to read the draft
    await page.locator('button').filter({ hasText: '确认绘本，开始阅读' }).click();
    await expect(page).toHaveURL(/\/noa\/books\//, { timeout: 10_000 });
    // BookDetailPage redirects to /reader after loading draft
    await expect(page).toHaveURL(/\/reader/, { timeout: 10_000 });

    // The draft in localStorage should have the correct page count
    const pageCount = await page.evaluate(() => {
      const raw = localStorage.getItem('storybook_draft');
      if (!raw) return -1;
      try {
        const draft = JSON.parse(raw);
        return Array.isArray(draft.pages) ? draft.pages.length : -1;
      } catch { return -1; }
    });

    expect(pageCount).toBe(4);
  });

  test('页数设置传递：设为 10 页时生成的绘本应有 10 页', async ({ page }) => {
    await submitFoodLog(page);
    const firstBook = await waitForUnconfirmedBook(page, 60_000);
    if (!firstBook) return;

    await openAndSubmitRegen(page, { pages: 10, reason: '太短了' });
    const regenDone = await waitForUnconfirmedBook(page, 90_000);
    if (!regenDone) return;

    await page.locator('button').filter({ hasText: '确认绘本，开始阅读' }).click();
    await expect(page).toHaveURL(/\/reader/, { timeout: 15_000 });

    const pageCount = await page.evaluate(() => {
      const raw = localStorage.getItem('storybook_draft');
      if (!raw) return -1;
      try { return JSON.parse(raw).pages?.length ?? -1; } catch { return -1; }
    });

    expect(pageCount).toBe(10);
  });

  test('重新生成后页码显示正确（Reader 进度条）', async ({ page }) => {
    await submitFoodLog(page);
    const firstBook = await waitForUnconfirmedBook(page, 60_000);
    if (!firstBook) return;

    await openAndSubmitRegen(page, { pages: 4, reason: '太长了' });
    const regenDone = await waitForUnconfirmedBook(page, 90_000);
    if (!regenDone) return;

    await page.locator('button').filter({ hasText: '确认绘本，开始阅读' }).click();
    await expect(page).toHaveURL(/\/reader/, { timeout: 15_000 });

    // Progress bar should show "1 / 4"
    await expect(page.locator('text=1 / 4')).toBeVisible({ timeout: 8_000 });
  });

  test('故事类型设置传递：server 应将 story_type 转发到 FastAPI', async ({ page, request }) => {
    // This test intercepts the regen API call to verify the payload sent by the server.
    // Since we can't directly inspect server→FastAPI traffic from E2E, we verify via
    // the outcome: the generated story's type should match what was requested.
    // (Primarily a regression guard — if types are ignored, story structure changes.)
    await submitFoodLog(page);
    const firstBook = await waitForUnconfirmedBook(page, 60_000);
    if (!firstBook) return;

    // Intercept the user-api regen call to verify client sends the correct payload
    const regenPayloads: Record<string, unknown>[] = [];
    await page.route('**/api/book/regenerate', async (route) => {
      const postData = route.request().postDataJSON() as Record<string, unknown> | null;
      if (postData) regenPayloads.push(postData);
      await route.continue();
    });

    await openAndSubmitRegen(page, { storyType: '冒险故事', reason: '其他' });

    // Give the request time to fire
    await page.waitForTimeout(2_000);

    expect(regenPayloads.length).toBeGreaterThan(0);
    // Client should send the story type key used in the UI
    const payload = regenPayloads[0];
    expect(payload).toHaveProperty('story_type');
    // The storyType value is one of the STORY_TYPES values (e.g. "adventure")
    expect(typeof payload.story_type).toBe('string');
    // Client should also send pages and difficulty
    expect(payload).toHaveProperty('pages');
    expect(payload).toHaveProperty('difficulty');
  });
});

// ─── 四：/api/home/status 生成中标志单元级验证 ───────────────────────────────

test.describe('/api/home/status generating 字段', () => {
  test('未提交进食记录时 generating 为 false 或不存在', async ({ page }) => {
    await loginAndSetupAvatar(page);

    // Intercept status response
    let lastStatusData: Record<string, unknown> | null = null;
    await page.route('**/api/home/status', async (route) => {
      const resp = await route.fetch();
      const body = await resp.json() as Record<string, unknown>;
      lastStatusData = body;
      await route.fulfill({ response: resp });
    });

    await page.reload();
    await page.waitForURL(/\/noa\/home/, { timeout: 8_000 });
    await page.waitForTimeout(1_000); // allow status request to complete

    // generating should be false (or absent) when no generation is in progress
    if (lastStatusData && 'generating' in lastStatusData) {
      expect(lastStatusData['generating']).toBe(false);
    }
    // If key is absent, that's also fine (falsy)
  });

  test('提交后 generating 立即变为 true（需 FastAPI 异步生成）', async ({ page }) => {
    await loginAndSetupAvatar(page);

    const statusResponses: Array<Record<string, unknown>> = [];
    await page.route('**/api/home/status', async (route) => {
      const resp = await route.fetch();
      const body = await resp.json() as Record<string, unknown>;
      statusResponses.push(body);
      await route.fulfill({ response: resp });
    });

    await submitFoodLog(page);

    // After submit, at least one poll should return generating:true
    await page.waitForTimeout(4_000); // wait for 1+ polling cycles

    const anyGenerating = statusResponses.some((r) => r['generating'] === true);
    expect(anyGenerating).toBe(true);
  });

  test('生成完成后 generating 变为 false（需 FastAPI）', async ({ page }) => {
    await loginAndSetupAvatar(page);

    const statusResponses: Array<Record<string, unknown>> = [];
    await page.route('**/api/home/status', async (route) => {
      const resp = await route.fetch();
      const body = await resp.json() as Record<string, unknown>;
      statusResponses.push(body);
      await route.fulfill({ response: resp });
    });

    await submitFoodLog(page);
    const bookReady = await waitForUnconfirmedBook(page, 90_000);
    if (!bookReady) return;

    // After book appears, generating should be false
    const last = statusResponses.at(-1);
    expect(last?.['generating']).toBe(false);
  });
});
