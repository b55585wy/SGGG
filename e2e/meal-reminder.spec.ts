import { test, expect, type Page } from '@playwright/test';

// ─── Test draft data ─────────────────────────────────────────

const TEST_DRAFT = {
  schema_version: '1.0',
  story_id: 'e2e-meal-reminder-story',
  generated_at: '2026-03-09T00:00:00Z',
  book_meta: {
    title: '西兰花的冒险',
    subtitle: '测试故事',
    theme_food: '西兰花',
    story_type: 'adventure',
    target_behaviour_level: 'Lv1',
    summary: '测试摘要',
    design_logic: '测试',
    global_visual_style: '卡通',
  },
  pages: [
    {
      page_no: 1,
      page_id: 'page-1',
      behavior_anchor: 'Lv1',
      text: '从前有一只小兔子。',
      image_prompt: '一只可爱的小兔子',
      interaction: { type: 'none', instruction: '', event_key: 'p1_none' },
      branch_choices: [],
    },
  ],
  ending: {
    positive_feedback: '太棒了！',
    next_micro_goal: '下次尝试吃西兰花',
  },
  telemetry_suggestions: { recommended_events: [] },
};

// ─── Helpers ─────────────────────────────────────────────────

async function login(page: Page) {
  await page.goto('/noa/login');
  await page.locator('input[autocomplete="username"]').fill('demo');
  await page.locator('input[type="password"]').fill('demo123');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/(noa\/avatar|noa\/home)/, { timeout: 10_000 });
  // If redirected to avatar page, fill minimal form
  if (page.url().includes('/noa/avatar')) {
    await page.locator('input[placeholder="给自己起一个昵称"]').fill('测试小朋友');
    await page.locator('button').filter({ hasText: '男孩' }).first().click();
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/noa\/home/, { timeout: 10_000 });
  }
}

async function setReminderFlag(page: Page) {
  await page.evaluate(() => localStorage.setItem('pending_meal_reminder', '1'));
}

async function clearReminderFlag(page: Page) {
  await page.evaluate(() => localStorage.removeItem('pending_meal_reminder'));
}

async function getReminderFlag(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('pending_meal_reminder'));
}

/** Mock /api/user/books/:id → returns TEST_DRAFT as confirmed book */
async function mockBookApi(page: Page, bookId = 'test-book-123') {
  await page.route(`**/api/user/books/${bookId}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        book: {
          bookID: bookId,
          title: '西兰花的冒险',
          preview: '',
          description: '',
          content: JSON.stringify(TEST_DRAFT),
          confirmed: true,
        },
      }),
    }),
  );
}

/** Mock /api/user/home/status */
async function mockHomeStatus(page: Page, themeFood = '西兰花') {
  await page.route('**/api/user/home/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ themeFood, avatarImages: [], book: null }),
    }),
  );
}

/** Mock /api/user/food/log → success */
async function mockFoodLogSuccess(page: Page) {
  await page.route('**/api/user/food/log', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ feedbackText: '记录成功！' }),
    }),
  );
}

/** Mock /api/user/food/log → failure */
async function mockFoodLogFailure(page: Page, message = '服务器错误') {
  await page.route('**/api/user/food/log', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message }),
    }),
  );
}

// ─── Phase 1: Prompt ─────────────────────────────────────────

test.describe('MealReminderModal — Phase 1（提示）', () => {
  const BOOK_ID = 'test-book-123';

  test.beforeEach(async ({ page }) => {
    await login(page);
    await mockBookApi(page, BOOK_ID);
    await mockHomeStatus(page);
    await setReminderFlag(page);
  });

  test('有 flag 时打开 BookDetail 显示提醒弹窗', async ({ page }) => {
    await page.goto(`/noa/books/${BOOK_ID}`);
    await expect(page.locator('text=上次读完有没有试着吃呢？')).toBeVisible({ timeout: 8_000 });
  });

  test('弹窗显示"记录用餐"和"还没吃，先跳过"两个按钮', async ({ page }) => {
    await page.goto(`/noa/books/${BOOK_ID}`);
    await expect(page.locator('text=上次读完有没有试着吃呢？')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('button').filter({ hasText: '记录用餐' })).toBeVisible();
    await expect(page.locator('button').filter({ hasText: '还没吃，先跳过' })).toBeVisible();
  });

  test('弹窗显示 themeFood', async ({ page }) => {
    await page.goto(`/noa/books/${BOOK_ID}`);
    await expect(page.locator('text=今日食物：西兰花')).toBeVisible({ timeout: 8_000 });
  });

  test('themeFood 为空时不显示食物提示', async ({ page }) => {
    await page.unrouteAll({ behavior: 'wait' });
    await mockBookApi(page, BOOK_ID);
    await mockHomeStatus(page, '');
    await page.goto(`/noa/books/${BOOK_ID}`);
    await expect(page.locator('text=上次读完有没有试着吃呢？')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('text=今日食物')).not.toBeVisible();
  });

  test('点击"跳过"后清除 flag', async ({ page }) => {
    await page.route('**/api/v1/tts', (route) =>
      route.fulfill({ status: 503, body: '' }),
    );
    await page.goto(`/noa/books/${BOOK_ID}`);
    await expect(page.locator('text=上次读完有没有试着吃呢？')).toBeVisible({ timeout: 8_000 });
    await page.locator('button').filter({ hasText: '还没吃，先跳过' }).click();

    const flag = await getReminderFlag(page);
    expect(flag).toBeNull();
    await expect(page.locator('text=上次读完有没有试着吃呢？')).not.toBeVisible({ timeout: 5_000 });
  });

  test('点击"记录用餐"进入 Phase 2', async ({ page }) => {
    await page.goto(`/noa/books/${BOOK_ID}`);
    await expect(page.locator('text=上次读完有没有试着吃呢？')).toBeVisible({ timeout: 8_000 });
    await page.locator('button').filter({ hasText: '记录用餐' }).click();

    await expect(page.locator('text=吃得怎么样？')).toBeVisible();
    await expect(page.locator('text=上次读完有没有试着吃呢？')).not.toBeVisible();
  });
});

// ─── No flag → no modal ──────────────────────────────────────

test.describe('MealReminderModal — 无 flag', () => {
  const BOOK_ID = 'test-book-123';

  test('没有 flag 时直接加载（不弹窗）', async ({ page }) => {
    await login(page);
    await mockBookApi(page, BOOK_ID);
    await clearReminderFlag(page);
    await page.route('**/api/v1/tts', (route) =>
      route.fulfill({ status: 503, body: '' }),
    );
    await page.goto(`/noa/books/${BOOK_ID}`);
    await expect(page.locator('text=上次读完有没有试着吃呢？')).not.toBeVisible({ timeout: 3_000 });
  });
});

// ─── Phase 2: Record ─────────────────────────────────────────

test.describe('MealReminderModal — Phase 2（记录）', () => {
  const BOOK_ID = 'test-book-123';

  test.beforeEach(async ({ page }) => {
    await login(page);
    await mockBookApi(page, BOOK_ID);
    await mockHomeStatus(page);
    await setReminderFlag(page);
    await page.goto(`/noa/books/${BOOK_ID}`);
    await expect(page.locator('text=上次读完有没有试着吃呢？')).toBeVisible({ timeout: 8_000 });
    await page.locator('button').filter({ hasText: '记录用餐' }).click();
    await expect(page.locator('text=吃得怎么样？')).toBeVisible();
  });

  test('显示 5 个爱心按钮', async ({ page }) => {
    const heartButtons = page.locator('div.flex.gap-2 button');
    await expect(heartButtons).toHaveCount(5);
  });

  test('显示 textarea 和提交/返回按钮', async ({ page }) => {
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.locator('button').filter({ hasText: '提交' })).toBeVisible();
    await expect(page.locator('button').filter({ hasText: '返回' })).toBeVisible();
  });

  test('提交按钮初始状态禁用', async ({ page }) => {
    await expect(page.locator('button').filter({ hasText: '提交' })).toBeDisabled();
  });

  test('仅选评分不输入内容 → 提交按钮仍禁用', async ({ page }) => {
    await page.locator('div.flex.gap-2 button').nth(2).click();
    await expect(page.locator('button').filter({ hasText: '提交' })).toBeDisabled();
  });

  test('仅输入内容不选评分 → 提交按钮仍禁用', async ({ page }) => {
    await page.locator('textarea').fill('吃了一点西兰花');
    await expect(page.locator('button').filter({ hasText: '提交' })).toBeDisabled();
  });

  test('选评分 + 输入内容 → 提交按钮启用', async ({ page }) => {
    await page.locator('div.flex.gap-2 button').nth(2).click();
    await page.locator('textarea').fill('吃了一点西兰花');
    await expect(page.locator('button').filter({ hasText: '提交' })).toBeEnabled();
  });

  test('点击"返回"回到 Phase 1', async ({ page }) => {
    await page.locator('button').filter({ hasText: '返回' }).click();
    await expect(page.locator('text=上次读完有没有试着吃呢？')).toBeVisible();
    await expect(page.locator('text=吃得怎么样？')).not.toBeVisible();
  });

  test('Phase 2 输入后返回再进入，输入内容保留', async ({ page }) => {
    await page.locator('div.flex.gap-2 button').nth(3).click();
    await page.locator('textarea').fill('之前输入的内容');

    await page.locator('button').filter({ hasText: '返回' }).click();
    await expect(page.locator('text=上次读完有没有试着吃呢？')).toBeVisible();

    await page.locator('button').filter({ hasText: '记录用餐' }).click();
    await expect(page.locator('text=吃得怎么样？')).toBeVisible();

    // State preserved (component not destroyed, just phase toggled)
    const textareaValue = await page.locator('textarea').inputValue();
    expect(textareaValue).toBe('之前输入的内容');
  });
});

// ─── Submit flow ─────────────────────────────────────────────

test.describe('MealReminderModal — 提交', () => {
  const BOOK_ID = 'test-book-123';

  test.beforeEach(async ({ page }) => {
    await login(page);
    await mockBookApi(page, BOOK_ID);
    await mockHomeStatus(page);
    await setReminderFlag(page);
  });

  test('提交成功 → 清除 flag、弹窗消失', async ({ page }) => {
    await mockFoodLogSuccess(page);
    await page.goto(`/noa/books/${BOOK_ID}`);
    await expect(page.locator('text=上次读完有没有试着吃呢？')).toBeVisible({ timeout: 8_000 });
    await page.locator('button').filter({ hasText: '记录用餐' }).click();
    await page.locator('div.flex.gap-2 button').nth(3).click();
    await page.locator('textarea').fill('今天吃了西兰花炒肉');
    await page.locator('button').filter({ hasText: '提交' }).click();

    await expect(page.locator('text=吃得怎么样？')).not.toBeVisible({ timeout: 5_000 });
    const flag = await getReminderFlag(page);
    expect(flag).toBeNull();
  });

  test('提交发送 skipBookGeneration: true 和正确的 score', async ({ page }) => {
    let capturedBody: Record<string, unknown> | null = null;
    await page.route('**/api/user/food/log', async (route) => {
      capturedBody = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ feedbackText: 'OK' }),
      });
    });

    await page.goto(`/noa/books/${BOOK_ID}`);
    await expect(page.locator('text=上次读完有没有试着吃呢？')).toBeVisible({ timeout: 8_000 });
    await page.locator('button').filter({ hasText: '记录用餐' }).click();
    await page.locator('div.flex.gap-2 button').nth(0).click(); // 1 heart = score 2
    await page.locator('textarea').fill('只尝了一小口');
    await page.locator('button').filter({ hasText: '提交' }).click();

    await expect(page.locator('text=吃得怎么样？')).not.toBeVisible({ timeout: 5_000 });
    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.skipBookGeneration).toBe(true);
    expect(capturedBody!.score).toBe(2);
    expect(capturedBody!.content).toBe('只尝了一小口');
  });

  test('API 失败 → 显示错误信息、flag 未清除、可重试', async ({ page }) => {
    await mockFoodLogFailure(page, '网络异常');
    await page.goto(`/noa/books/${BOOK_ID}`);
    await expect(page.locator('text=上次读完有没有试着吃呢？')).toBeVisible({ timeout: 8_000 });
    await page.locator('button').filter({ hasText: '记录用餐' }).click();
    await page.locator('div.flex.gap-2 button').nth(4).click();
    await page.locator('textarea').fill('吃了很多');
    await page.locator('button').filter({ hasText: '提交' }).click();

    await expect(page.locator('text=网络异常')).toBeVisible({ timeout: 5_000 });
    const flag = await getReminderFlag(page);
    expect(flag).toBe('1');
    await expect(page.locator('button').filter({ hasText: '提交' })).toBeEnabled();
  });

  test('API 失败后重试成功', async ({ page }) => {
    await mockFoodLogFailure(page, '服务器忙');
    await page.goto(`/noa/books/${BOOK_ID}`);
    await expect(page.locator('text=上次读完有没有试着吃呢？')).toBeVisible({ timeout: 8_000 });
    await page.locator('button').filter({ hasText: '记录用餐' }).click();
    await page.locator('div.flex.gap-2 button').nth(2).click();
    await page.locator('textarea').fill('尝试了一下');
    await page.locator('button').filter({ hasText: '提交' }).click();
    await expect(page.locator('text=服务器忙')).toBeVisible({ timeout: 5_000 });

    // Replace mock with success
    await page.unrouteAll({ behavior: 'wait' });
    await mockBookApi(page, BOOK_ID);
    await mockHomeStatus(page);
    await mockFoodLogSuccess(page);

    await page.locator('button').filter({ hasText: '提交' }).click();
    await expect(page.locator('text=吃得怎么样？')).not.toBeVisible({ timeout: 5_000 });
    const flag = await getReminderFlag(page);
    expect(flag).toBeNull();
  });
});

// ─── Heart rating scores ─────────────────────────────────────

test.describe('MealReminderModal — 爱心评分', () => {
  const BOOK_ID = 'test-book-123';

  test.beforeEach(async ({ page }) => {
    await login(page);
    await mockBookApi(page, BOOK_ID);
    await mockHomeStatus(page);
    await setReminderFlag(page);
    await page.goto(`/noa/books/${BOOK_ID}`);
    await expect(page.locator('text=上次读完有没有试着吃呢？')).toBeVisible({ timeout: 8_000 });
    await page.locator('button').filter({ hasText: '记录用餐' }).click();
    await expect(page.locator('text=吃得怎么样？')).toBeVisible();
  });

  test('点击第 1 颗心 → score=2', async ({ page }) => {
    let capturedScore: number | null = null;
    await page.route('**/api/user/food/log', async (route) => {
      capturedScore = JSON.parse(route.request().postData() || '{}').score;
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ feedbackText: 'OK' }),
      });
    });
    await page.locator('div.flex.gap-2 button').nth(0).click();
    await page.locator('textarea').fill('一点点');
    await page.locator('button').filter({ hasText: '提交' }).click();
    await expect(page.locator('text=吃得怎么样？')).not.toBeVisible({ timeout: 5_000 });
    expect(capturedScore).toBe(2);
  });

  test('点击第 5 颗心 → score=10', async ({ page }) => {
    let capturedScore: number | null = null;
    await page.route('**/api/user/food/log', async (route) => {
      capturedScore = JSON.parse(route.request().postData() || '{}').score;
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ feedbackText: 'OK' }),
      });
    });
    await page.locator('div.flex.gap-2 button').nth(4).click();
    await page.locator('textarea').fill('很多');
    await page.locator('button').filter({ hasText: '提交' }).click();
    await expect(page.locator('text=吃得怎么样？')).not.toBeVisible({ timeout: 5_000 });
    expect(capturedScore).toBe(10);
  });

  test('先选 5 再选 2 → score=4（降级）', async ({ page }) => {
    let capturedScore: number | null = null;
    await page.route('**/api/user/food/log', async (route) => {
      capturedScore = JSON.parse(route.request().postData() || '{}').score;
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ feedbackText: 'OK' }),
      });
    });
    await page.locator('div.flex.gap-2 button').nth(4).click();
    await page.locator('div.flex.gap-2 button').nth(1).click();
    await page.locator('textarea').fill('改了想法');
    await page.locator('button').filter({ hasText: '提交' }).click();
    await expect(page.locator('text=吃得怎么样？')).not.toBeVisible({ timeout: 5_000 });
    expect(capturedScore).toBe(4);
  });
});

// ─── Corner Cases ────────────────────────────────────────────

test.describe('MealReminderModal — Corner Cases', () => {
  const BOOK_ID = 'test-book-123';

  test('home/status 返回 500 时仍弹窗（无食物提示）', async ({ page }) => {
    await login(page);
    await mockBookApi(page, BOOK_ID);
    await setReminderFlag(page);
    await page.route('**/api/user/home/status', (route) =>
      route.fulfill({ status: 500, body: 'Internal Server Error' }),
    );
    await page.goto(`/noa/books/${BOOK_ID}`);
    await expect(page.locator('text=上次读完有没有试着吃呢？')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('text=今日食物')).not.toBeVisible();
  });

  test('textarea 只输入空格 → 提交按钮禁用', async ({ page }) => {
    await login(page);
    await mockBookApi(page, BOOK_ID);
    await mockHomeStatus(page);
    await setReminderFlag(page);
    await page.goto(`/noa/books/${BOOK_ID}`);
    await expect(page.locator('text=上次读完有没有试着吃呢？')).toBeVisible({ timeout: 8_000 });
    await page.locator('button').filter({ hasText: '记录用餐' }).click();
    await page.locator('div.flex.gap-2 button').nth(2).click();
    await page.locator('textarea').fill('   ');
    await expect(page.locator('button').filter({ hasText: '提交' })).toBeDisabled();
  });

  test('快速双击提交 → 只发送一次请求', async ({ page }) => {
    await login(page);
    await mockBookApi(page, BOOK_ID);
    await mockHomeStatus(page);
    await setReminderFlag(page);

    let callCount = 0;
    await page.route('**/api/user/food/log', async (route) => {
      callCount++;
      await new Promise((r) => setTimeout(r, 500));
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ feedbackText: 'OK' }),
      });
    });

    await page.goto(`/noa/books/${BOOK_ID}`);
    await expect(page.locator('text=上次读完有没有试着吃呢？')).toBeVisible({ timeout: 8_000 });
    await page.locator('button').filter({ hasText: '记录用餐' }).click();
    await page.locator('div.flex.gap-2 button').nth(2).click();
    await page.locator('textarea').fill('快速点击测试');

    const submitBtn = page.locator('button').filter({ hasText: '提交' });
    await submitBtn.click();
    // Second click may be blocked by disabled state
    await submitBtn.click({ force: true }).catch(() => {});

    await expect(page.locator('text=吃得怎么样？')).not.toBeVisible({ timeout: 8_000 });
    expect(callCount).toBe(1);
  });

  test('跳过后第二次进入不再弹窗', async ({ page }) => {
    await login(page);
    await mockBookApi(page, BOOK_ID);
    await mockHomeStatus(page);
    await setReminderFlag(page);
    await page.route('**/api/v1/tts', (route) =>
      route.fulfill({ status: 503, body: '' }),
    );

    // First visit: skip
    await page.goto(`/noa/books/${BOOK_ID}`);
    await expect(page.locator('text=上次读完有没有试着吃呢？')).toBeVisible({ timeout: 8_000 });
    await page.locator('button').filter({ hasText: '还没吃，先跳过' }).click();
    await expect(page.locator('text=上次读完有没有试着吃呢？')).not.toBeVisible({ timeout: 5_000 });

    // Second visit: no modal (flag cleared)
    await page.goto('/noa/home');
    await page.waitForURL(/\/noa\/home/, { timeout: 5_000 });
    await page.goto(`/noa/books/${BOOK_ID}`);
    await expect(page.locator('text=上次读完有没有试着吃呢？')).not.toBeVisible({ timeout: 3_000 });
  });
});

// ─── Reader sets flag ────────────────────────────────────────

test.describe('Reader — pending_meal_reminder flag', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.route('**/api/v1/tts', (route) =>
      route.fulfill({ status: 503, body: '' }),
    );
  });

  test('只读模式（无 session）完成 → 不设置 flag', async ({ page }) => {
    await clearReminderFlag(page);
    await page.evaluate((draft) => {
      localStorage.setItem('storybook_draft', JSON.stringify(draft));
      localStorage.removeItem('storybook_session');
      localStorage.setItem('storybook_source', 'review');
    }, TEST_DRAFT);

    await page.goto('/reader');
    await expect(page.locator('text=从前有一只小兔子')).toBeVisible({ timeout: 8_000 });
    await page.locator('button').filter({ hasText: '退出' }).click();
    await expect(page).toHaveURL(/\/noa\/home/, { timeout: 8_000 });

    const flag = await getReminderFlag(page);
    expect(flag).toBeNull();
  });
});
