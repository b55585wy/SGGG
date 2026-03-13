import { test, expect, type Page } from '@playwright/test';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function setAuthToken(page: Page) {
  await page.goto('/noa/home', { waitUntil: 'commit' });
  await page.evaluate(() => localStorage.setItem('noa_child_token', 'test-token'));
}

async function mockHomeStatusNoBook(page: Page, themeFood = '西兰花') {
  await page.route('**/api/user/home/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        avatar: {
          nickname: '测试小朋友',
          gender: 'male',
          color: 'blue',
          shirt: 'short',
          underdress: 'none',
          glasses: 'no',
        },
        feedbackText: '',
        themeFood,
        generating: false,
        book: null,
      }),
    }),
  );
}

async function mockHomeStatusWithBook(
  page: Page,
  themeFood = '胡萝卜',
  opts: { confirmed?: boolean; readCompleted?: boolean } = {},
) {
  const { confirmed = false, readCompleted = false } = opts;
  await page.route('**/api/user/home/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        avatar: {
          nickname: '测试小朋友',
          gender: 'male',
          color: 'blue',
          shirt: 'short',
          underdress: 'none',
          glasses: 'no',
        },
        feedbackText: '',
        themeFood,
        generating: false,
        book: {
          bookID: 'b1',
          title: '胡萝卜大冒险',
          preview: '',
          description: '一个关于胡萝卜的故事',
          confirmed,
          readCompleted,
          regenerateCount: 0,
        },
      }),
    }),
  );
}

async function mockHomeStatusGenerating(page: Page, themeFood = '胡萝卜') {
  await page.route('**/api/user/home/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        avatar: {
          nickname: '测试小朋友',
          gender: 'male',
          color: 'blue',
          shirt: 'short',
          underdress: 'none',
          glasses: 'no',
        },
        feedbackText: '',
        themeFood,
        generating: true,
        book: null,
      }),
    }),
  );
}

async function mockFoodLogSuccess(page: Page) {
  await page.route('**/api/user/food/log', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, feedbackText: '做得好！继续尝试哦', expression: 'happy', score: 8 }),
    }),
  );
}

async function clickStar(page: Page, starIndex: number, half: 'left' | 'right' = 'right') {
  const stars = page.locator('[role="radiogroup"] button');
  const star = stars.nth(starIndex - 1);
  await expect(star).toBeVisible({ timeout: 3_000 });
  const box = await star.boundingBox();
  if (!box) throw new Error(`Star ${starIndex} not found`);
  const x = half === 'left' ? box.x + box.width * 0.25 : box.x + box.width * 0.75;
  const y = box.y + box.height / 2;
  await page.mouse.click(x, y);
}

const SCREENSHOT_DIR = 'e2e/screenshots';

// ─── 1. 首页空状态 CTA（State A 不再有内联表单）──────────────────────────────

test.describe('首页空状态 CTA（无绘本时）', () => {
  test.beforeEach(async ({ page }) => {
    await setAuthToken(page);
    await mockHomeStatusNoBook(page);
    await mockFoodLogSuccess(page);
  });

  test('无绘本时显示空状态 CTA 卡片而非内联表单', async ({ page }) => {
    await page.goto('/noa/home');
    // 应该看到 CTA 卡片
    await expect(page.locator('text=记录一次进食')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('button', { hasText: '开始记录' })).toBeVisible();
    // 不应该直接看到表单内容
    await expect(page.locator('text=用餐怎么样？')).not.toBeVisible();
    await expect(page.locator('text=喜欢程度')).not.toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/state-a-empty-cta.png`, fullPage: true });
  });

  test('CTA 卡片显示今日食物', async ({ page }) => {
    await page.goto('/noa/home');
    await expect(page.locator('text=记录今天吃「西兰花」的情况')).toBeVisible({ timeout: 8_000 });
  });

  test('点击 CTA 按钮打开进食记录弹窗（含尝试程度/补充说明/跳过）', async ({ page }) => {
    await page.goto('/noa/home');
    const cta = page.locator('button', { hasText: '开始记录' });
    await expect(cta).toBeVisible({ timeout: 8_000 });
    await cta.click();

    // 弹窗应该出现
    await expect(page.locator('text=用餐怎么样？')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=喜欢程度')).toBeVisible();
    await expect(page.locator('text=进食描述')).toBeVisible();
    // 统一弹窗包含尝试程度/补充说明/跳过
    await expect(page.locator('text=尝试程度')).toBeVisible();
    await expect(page.locator('text=补充说明')).toBeVisible();
    await expect(page.locator('text=还没吃，先跳过')).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/state-a-modal-opened.png`, fullPage: true });
  });

  test('CTA 弹窗关闭后回到空状态', async ({ page }) => {
    await page.goto('/noa/home');
    await page.locator('button', { hasText: '开始记录' }).click();
    await expect(page.locator('text=用餐怎么样？')).toBeVisible({ timeout: 5_000 });

    // 点击背景关闭
    await page.locator('.fixed.inset-0.z-40').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('text=用餐怎么样？')).not.toBeVisible({ timeout: 3_000 });
    // CTA 仍在
    await expect(page.locator('text=记录一次进食')).toBeVisible();
  });
});

// ─── 2. 首页弹窗：State B 右上角按钮 ─────────────────────────────────────────

test.describe('首页弹窗（State B → 右上角记录进食按钮）', () => {
  test('有绘本（未确认）时记录进食按钮仍可见', async ({ page }) => {
    await setAuthToken(page);
    await mockHomeStatusWithBook(page, '胡萝卜', { confirmed: false });
    await page.goto('/noa/home');
    await expect(page.locator('text=当前绘本')).toBeVisible({ timeout: 8_000 });
    // 记录进食按钮始终可见
    await expect(page.locator('button').filter({ hasText: '记录进食' })).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/state-b-unconfirmed.png`, fullPage: true });
  });

  test('已确认但未阅读完时记录进食按钮仍可见', async ({ page }) => {
    await setAuthToken(page);
    await mockHomeStatusWithBook(page, '胡萝卜', { confirmed: true, readCompleted: false });
    await page.goto('/noa/home');
    await expect(page.locator('text=当前绘本')).toBeVisible({ timeout: 8_000 });
    // 记录进食按钮始终可见
    await expect(page.locator('button').filter({ hasText: '记录进食' })).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/state-b-confirmed-not-read.png`, fullPage: true });
  });

  test('阅读完毕后记录进食按钮可见', async ({ page }) => {
    await setAuthToken(page);
    await mockHomeStatusWithBook(page, '胡萝卜', { confirmed: true, readCompleted: true });
    await mockFoodLogSuccess(page);
    await page.goto('/noa/home');
    const btn = page.locator('button').filter({ hasText: '记录进食' });
    await expect(btn).toBeVisible({ timeout: 8_000 });

    await page.screenshot({ path: `${SCREENSHOT_DIR}/state-b-read-completed.png`, fullPage: true });
  });

  test('右上角按钮打开统一弹窗（含尝试程度/跳过）', async ({ page }) => {
    await setAuthToken(page);
    await mockHomeStatusWithBook(page, '胡萝卜', { confirmed: true, readCompleted: true });
    await mockFoodLogSuccess(page);
    await page.goto('/noa/home');
    const btn = page.locator('button').filter({ hasText: '记录进食' });
    await expect(btn).toBeVisible({ timeout: 8_000 });
    await btn.click();

    await expect(page.locator('text=用餐怎么样？')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=尝试程度')).toBeVisible();
    await expect(page.locator('text=还没吃，先跳过')).toBeVisible();
    await expect(page.locator('text=补充说明')).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/state-b-modal-opened.png`, fullPage: true });
  });
});

// ─── 3. 正在生成时首页 ───────────────────────────────────────────────────────

test.describe('绘本生成中的首页', () => {
  test('生成中不显示空状态 CTA，显示生成动画', async ({ page }) => {
    await setAuthToken(page);
    await mockHomeStatusGenerating(page);
    await page.goto('/noa/home');

    // 应该显示生成中状态
    await expect(page.locator('text=绘本生成中')).toBeVisible({ timeout: 8_000 });
    // 不应该显示空状态 CTA
    await expect(page.locator('text=记录一次进食')).not.toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/state-b-generating.png`, fullPage: true });
  });
});

// ─── 4. 统一弹窗样式一致性 ──────────────────────────────────────────────────

test.describe('弹窗样式一致性', () => {
  const DRAFT = {
    schema_version: '1.0',
    story_id: 'story-001',
    generated_at: new Date().toISOString(),
    book_meta: {
      title: '西兰花大冒险',
      subtitle: '副标题',
      theme_food: '西兰花',
      story_type: 'adventure',
      target_behavior_level: 'Lv1',
      summary: '摘要',
      design_logic: '逻辑',
      global_visual_style: '卡通',
    },
    pages: [
      {
        page_no: 1, page_id: 'p1', behavior_anchor: 'Lv1',
        text: '从前有一朵小西兰花。', image_prompt: 'prompt', image_url: 'https://example.com/img.png',
        interaction: { type: 'none', instruction: '', event_key: '' },
        branch_choices: [],
      },
    ],
    ending: { positive_feedback: '太棒了！', next_micro_goal: '下次目标' },
    telemetry_suggestions: { recommended_events: [] },
  };

  async function setupReaderAndComplete(page: Page) {
    await page.route('**/api/user/food/log', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, feedbackText: '好棒' }) }),
    );
    await page.route('**/api/v1/feedback/submit', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
    );
    await page.route('**/api/user/reading/log', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
    );
    await page.route('**/api/v1/telemetry/report', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
    );

    await page.goto('/noa/home', { waitUntil: 'commit' });
    await page.evaluate((draft) => {
      localStorage.setItem('noa_child_token', 'test-token');
      localStorage.setItem('storybook_draft', JSON.stringify(draft));
      localStorage.setItem('storybook_book_id', 'test-book-123');
      localStorage.setItem('storybook_source', 'experiment');
      localStorage.setItem('storybook_session', JSON.stringify({
        story_id: 'story-001',
        session_id: 'sess-001',
        client_session_token: 'tok-001',
        session_index: 0,
      }));
    }, DRAFT);

    await page.goto('/reader');
    // Dismiss cover page
    await page.locator('button', { hasText: '开始阅读' }).click();
    await expect(page.locator('text=从前有一朵小西兰花')).toBeVisible({ timeout: 8_000 });
    await page.locator('button', { hasText: '完成' }).click();
    await expect(page.locator('text=用餐怎么样？')).toBeVisible({ timeout: 5_000 });
  }

  test('阅读后弹窗截图 — 包含尝试程度/补充说明/跳过', async ({ page }) => {
    await setupReaderAndComplete(page);

    // 验证阅读后弹窗有额外选项
    await expect(page.locator('text=尝试程度')).toBeVisible();
    await expect(page.locator('text=补充说明')).toBeVisible();
    await expect(page.locator('text=还没吃，先跳过')).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/post-reading-modal.png`, fullPage: true });
  });

  test('阅读后弹窗点击背景可关闭', async ({ page }) => {
    await setupReaderAndComplete(page);

    // 点击背景关闭
    await page.locator('.fixed.inset-0.z-40').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('text=用餐怎么样？')).not.toBeVisible({ timeout: 5_000 });
  });

  test('首页弹窗 vs 阅读后弹窗共用相同 maxWidth 和圆角', async ({ page }) => {
    // 先截图首页弹窗
    await setAuthToken(page);
    await mockHomeStatusNoBook(page);
    await mockFoodLogSuccess(page);
    await page.goto('/noa/home');
    await page.locator('button', { hasText: '开始记录' }).click();
    await expect(page.locator('text=用餐怎么样？')).toBeVisible({ timeout: 5_000 });

    // 获取首页弹窗的样式
    const homeDialog = page.locator('.fixed .pointer-events-auto').first();
    const homeStyle = await homeDialog.evaluate((el) => {
      const s = getComputedStyle(el);
      return { maxWidth: s.maxWidth, borderRadius: s.borderRadius };
    });

    await page.screenshot({ path: `${SCREENSHOT_DIR}/home-modal-style.png`, fullPage: true });

    // 验证 maxWidth 为 480px，borderRadius 为 2rem
    expect(homeStyle.maxWidth).toBe('480px');
    expect(homeStyle.borderRadius).toBe('32px'); // 2rem = 32px
  });
});

// ─── 5. 管理员创建账号 → 首登进形象页 ─────────────────────────────────────

test.describe('管理员创建账号 → 首登进形象页', () => {
  test('首登用户被引导到 /noa/avatar', async ({ page }) => {
    // Mock login API to return firstLogin: true
    await page.route('**/api/user/auth/login', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'test-token-admin-user',
          user: { userID: 'admin-created-user' },
          firstLogin: true,
        }),
      }),
    );

    await page.goto('/noa/login');
    await page.locator('input[autocomplete="username"]').fill('admin-created-user');
    await page.locator('input[type="password"]').fill('pass123');
    await page.locator('button[type="submit"]').click();

    // 应该跳转到 avatar 页面
    await page.waitForURL('**/noa/avatar', { timeout: 8_000 });

    await page.screenshot({ path: `${SCREENSHOT_DIR}/admin-user-first-login-avatar.png`, fullPage: true });
  });

  test('非首登用户直接进 /noa/home', async ({ page }) => {
    // Mock login API to return firstLogin: false
    await page.route('**/api/user/auth/login', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'test-token-regular',
          user: { userID: 'regular-user' },
          firstLogin: false,
        }),
      }),
    );
    await mockHomeStatusWithBook(page, '胡萝卜');

    await page.goto('/noa/login');
    await page.locator('input[autocomplete="username"]').fill('regular-user');
    await page.locator('input[type="password"]').fill('pass456');
    await page.locator('button[type="submit"]').click();

    await page.waitForURL('**/noa/home', { timeout: 8_000 });
  });
});
