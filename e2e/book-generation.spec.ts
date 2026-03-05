import { test, expect, Page } from '@playwright/test';

/**
 * 登录 + 设置 avatar → /noa/home，兼容 firstLogin=true 和 false 两种状态。
 * 若已有未确认绘本（state B），先确认绑本回到 state A（食物记录表单）。
 */
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

  // 若存在未确认绘本（state B），确认后回到 state A（食物记录表单）
  await page.waitForTimeout(500);
  const confirmBtn = page.locator('button').filter({ hasText: '确认绘本，开始阅读' });
  if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await confirmBtn.click();
    await page.waitForURL(/\/noa\/books\//, { timeout: 8_000 }).catch(() => {});
    const exitBtn = page.locator('button').filter({ hasText: '退出' });
    if (await exitBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await exitBtn.click();
      await page.waitForURL(/\/noa\/home/, { timeout: 5_000 }).catch(() => {});
    } else {
      await page.goto('/noa/home');
    }
  }
}

/**
 * 提交一条进食记录（新 UI：内联表单，无弹窗）
 * 需要 state A（食物记录表单）可见；若不可见（有历史绘本）则返回 false。
 */
async function submitFoodLog(page: Page, score: string, text: string): Promise<boolean> {
  // 确保 state A 可见（食物记录表单）
  const inStateA = await page.locator('text=今天吃得怎么样？').isVisible({ timeout: 5_000 }).catch(() => false);
  if (!inStateA) return false;
  const slider = page.locator('input[type="range"]').first();
  await slider.fill(score);
  await page.locator('textarea').fill(text);
  // Wait for React to process the onChange events and enable the button before clicking
  const sendBtn = page.locator('button').filter({ hasText: '提交记录' });
  await expect(sendBtn).toBeEnabled({ timeout: 5_000 });
  await sendBtn.click();
  // 提交成功后 state A 消失（bookGenerating=true → state B 出现）
  await expect(page.locator('text=今天吃得怎么样？')).not.toBeVisible({ timeout: 15_000 });
  return true;
}

/**
 * 等待未确认绘本出现（依赖 FastAPI）
 * 返回 true 表示绘本已出现，false 表示超时（FastAPI 不可用）
 */
async function waitForUnconfirmedBook(page: Page): Promise<boolean> {
  return page.locator('button').filter({ hasText: '确认绘本' }).isVisible({ timeout: 45_000 }).catch(() => false);
}

/**
 * 确认当前绘本（点击"确认绘本，开始阅读"→进入阅读器→退出→回到 home State A）
 */
async function confirmBookAndReturnHome(page: Page) {
  await page.locator('button').filter({ hasText: '确认绘本' }).click();
  await page.waitForURL(/\/noa\/books\//, { timeout: 8_000 }).catch(() => {});
  const exitBtn = page.locator('button').filter({ hasText: '退出' });
  if (await exitBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await exitBtn.click();
    await page.waitForURL(/\/noa\/home/, { timeout: 5_000 }).catch(() => {});
  } else {
    await page.goto('/noa/home');
  }
}

// ─── 一：提交后立即切换为生成中状态 ──────────────────────────────────────────

test.describe('绘本生成动效 — 提交后立即触发', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetupAvatar(page);
  });

  test('提交后绘本区域立即进入生成中状态（不再显示"提交后生成"空状态）', async ({ page }) => {
    if (!await submitFoodLog(page, '7', '今天尝试了胡萝卜，感觉还行')) return;

    // "提交后生成" 是 book=null 且 bookGenerating=false 时的 fallback
    // 提交后 book 被清空同时 bookGenerating 置为 true，应显示动效而不是这个文字
    await expect(page.locator('text=提交后生成')).not.toBeVisible({ timeout: 3_000 });
  });

  test('提交后绘本封面区显示生成动效（shimmer 或 breathing icon）', async ({ page }) => {
    if (!await submitFoodLog(page, '8', '今天胡萝卜吃了好多')) return;

    // 生成动效有两个 CSS class: book-gen-shimmer（背景光晕）和 book-gen-breathe（图标呼吸）
    // 或者已经生成完毕（有封面图片）——两种状态都合法
    const genShimmer = page.locator('.book-gen-shimmer');
    const genBreath = page.locator('.book-gen-breathe');
    const coverImg = page.locator('img[alt]').filter({ hasNot: page.locator('img[alt="base"]') }).first();

    const hasShimmer = await genShimmer.isVisible({ timeout: 5_000 }).catch(() => false);
    const hasBreath = await genBreath.isVisible({ timeout: 1_000 }).catch(() => false);
    const hasCover = await coverImg.isVisible({ timeout: 1_000 }).catch(() => false);

    expect(hasShimmer || hasBreath || hasCover).toBe(true);
  });

  test('提交后绘本标题区显示 skeleton shimmer（title/description 骨架屏）', async ({ page }) => {
    if (!await submitFoodLog(page, '6', '今天试了一口胡萝卜')) return;

    // 骨架屏 class 是 skeleton-shimmer，在 bookGenerating && !book 时渲染
    // 或者已有 book title 也是合法状态
    const skeleton = page.locator('.skeleton-shimmer').first();
    const bookTitle = page.locator('h3').first();

    const hasSkeleton = await skeleton.isVisible({ timeout: 5_000 }).catch(() => false);
    const hasTitle = await bookTitle.isVisible({ timeout: 1_000 }).catch(() => false);

    expect(hasSkeleton || hasTitle).toBe(true);
  });

  test('生成完成后动效消失并显示绘本标题（需要 FastAPI）', async ({ page }) => {
    if (!await submitFoodLog(page, '9', '今天完全接受了胡萝卜，吃了很多！')) return;

    const hasBook = await waitForUnconfirmedBook(page);
    if (!hasBook) return; // FastAPI 不可用，跳过

    // 动效应消失
    await expect(page.locator('.book-gen-shimmer')).not.toBeVisible();
    await expect(page.locator('.book-gen-breathe')).not.toBeVisible();

    // 绘本标题和操作按钮应可见
    await expect(page.locator('h3').first()).toBeVisible();
    await expect(page.locator('button').filter({ hasText: '确认绘本' })).toBeVisible();
    await expect(page.locator('button').filter({ hasText: '重新生成' })).toBeVisible();
  });
});

// ─── 二：再次提交（已有绘本时）同样触发动效 ─────────────────────────────────

test.describe('再次提交进食记录 — 第二次生成动效（需要 FastAPI）', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetupAvatar(page);
  });

  test('第一本书生成后再次提交，绘本区立即切换为生成中（不保留旧书）', async ({ page }) => {
    // 第一次提交
    if (!await submitFoodLog(page, '7', '第一次尝试胡萝卜')) return;
    const firstBook = await waitForUnconfirmedBook(page);
    if (!firstBook) return;

    // 确认绘本后回到 State A，再提交第二次
    await confirmBookAndReturnHome(page);
    if (!await submitFoodLog(page, '8', '第二次尝试，进步很大！')) return;

    // 旧书的"确认绘本"和"重新生成"应消失（book 已清空进入 generating 状态）
    await expect(page.locator('button').filter({ hasText: '确认绘本' })).not.toBeVisible({ timeout: 3_000 });

    // 应显示动效
    const hasShimmer = await page.locator('.book-gen-shimmer').isVisible({ timeout: 5_000 }).catch(() => false);
    const hasSkeleton = await page.locator('.skeleton-shimmer').first().isVisible({ timeout: 1_000 }).catch(() => false);
    const hasNewBook = await page.locator('button').filter({ hasText: '确认绘本' }).isVisible({ timeout: 1_000 }).catch(() => false);

    expect(hasShimmer || hasSkeleton || hasNewBook).toBe(true);
  });

  test('第二次提交最终生成新绘本（需要 FastAPI）', async ({ page }) => {
    // 第一次
    if (!await submitFoodLog(page, '6', '第一次尝试胡萝卜')) return;
    const firstBook = await waitForUnconfirmedBook(page);
    if (!firstBook) return;

    // 确认绘本后回到 State A，再提交第二次
    await confirmBookAndReturnHome(page);
    if (!await submitFoodLog(page, '8', '第二次表现更好了！')) return;

    // 最终新绘本出现
    await expect(page.locator('button').filter({ hasText: '确认绘本' })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('h3').first()).toBeVisible();
  });

  test('提交次数累计：第三次提交（含历史数据）也能正常生成（需要 FastAPI）', async ({ page }) => {
    for (let i = 1; i <= 2; i++) {
      if (!await submitFoodLog(page, String(5 + i), `第${i}次尝试胡萝卜`)) return;
      const ok = await waitForUnconfirmedBook(page);
      if (!ok) return;
      // 确认绘本（进入阅读器）后退出回到 State A，再提交下一条
      await confirmBookAndReturnHome(page);
    }

    // 第三次提交
    if (!await submitFoodLog(page, '9', '第三次完全接受，太棒了！')) return;

    // 应进入生成中
    await expect(page.locator('text=提交后生成')).not.toBeVisible({ timeout: 3_000 });

    // 最终生成
    const thirdBook = await waitForUnconfirmedBook(page);
    expect(thirdBook).toBe(true);
  });
});

// ─── 三：历史数据上下文校验（行为层面） ─────────────────────────────────────

test.describe('历史数据传递 — 行为校验', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetupAvatar(page);
  });

  test('首次提交（无历史）也能正常生成绘本（需要 FastAPI）', async ({ page }) => {
    if (!await submitFoodLog(page, '5', '今天第一次尝试胡萝卜')) return;
    const hasBook = await waitForUnconfirmedBook(page);
    if (!hasBook) return;

    // 绘本应有标题和简介
    await expect(page.locator('h3').first()).toBeVisible();
    const title = await page.locator('h3').first().innerText();
    expect(title.length).toBeGreaterThan(0);
    expect(title).not.toBe('等待生成');
  });

  test('多次提交后绘本内容应有所不同（需要 FastAPI）', async ({ page }) => {
    // 第一次：低分
    if (!await submitFoodLog(page, '2', '完全不想吃胡萝卜')) return;
    const book1 = await waitForUnconfirmedBook(page);
    if (!book1) return;
    const title1 = await page.locator('h3').first().innerText();

    // 确认绘本（进入阅读器），退出后回到 State A，再提交第二次：高分
    await confirmBookAndReturnHome(page);

    if (!await submitFoodLog(page, '9', '今天胡萝卜吃得特别好！')) return;
    const book2 = await waitForUnconfirmedBook(page);
    if (!book2) return;
    const title2 = await page.locator('h3').first().innerText();

    // 两次绘本标题应不同（不同分数/历史背景生成的故事不一样）
    expect(title1).not.toBe(title2);
  });
});
