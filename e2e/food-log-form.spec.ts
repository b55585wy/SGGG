import { test, expect, type Page } from '@playwright/test';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Set auth token so the app doesn't redirect to login. */
async function setAuthToken(page: Page) {
  await page.goto('/noa/home', { waitUntil: 'commit' });
  await page.evaluate(() => localStorage.setItem('noa_child_token', 'test-token'));
}

/** Mock the home status API so HomePage renders State A (no book). */
async function mockHomeStatusNoBook(page: Page, themeFood = '西兰花') {
  await page.route('**/api/user/home/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        avatar: {
          nickname: '测试',
          baseImage: null,
          hairImage: '',
          glassesImage: '',
          topImage: '',
          bottomImage: '',
        },
        feedbackText: '',
        themeFood,
        generating: false,
        book: null,
      }),
    }),
  );
}

/** Mock home status with a confirmed book (State B, confirmed=true for 记录进食 button). */
async function mockHomeStatusWithBook(page: Page, themeFood = '胡萝卜') {
  await page.route('**/api/user/home/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        avatar: {
          nickname: '测试',
          baseImage: null,
          hairImage: '',
          glassesImage: '',
          topImage: '',
          bottomImage: '',
        },
        feedbackText: '',
        themeFood,
        generating: false,
        book: {
          bookID: 'b1',
          title: '胡萝卜故事',
          preview: '预览',
          description: '描述',
          confirmed: true,
          regenerateCount: 0,
        },
      }),
    }),
  );
}

/** Mock food log API to succeed. Optionally capture posted body. */
async function mockFoodLogSuccess(page: Page, capture?: { body: Record<string, unknown> | null }) {
  await page.route('**/api/user/food/log', async (route) => {
    if (capture) {
      capture.body = JSON.parse(route.request().postData() || '{}');
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, feedbackText: '做得好！', expression: 'happy', score: 8 }),
    });
  });
}

/** Mock voice transcribe API. */
async function mockVoiceTranscribe(page: Page, text = '我吃了一小口西兰花') {
  await page.route('**/api/user/voice/transcribe', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ text }),
    }),
  );
}

/** Navigate to home (State A = empty CTA), click CTA to open food log modal. */
async function goToHomeFoodLog(page: Page) {
  await page.goto('/noa/home');
  // State A now shows a CTA card instead of inline form
  const cta = page.locator('button', { hasText: '开始记录' });
  await expect(cta).toBeVisible({ timeout: 8_000 });
  await cta.click();
  await expect(page.locator('text=用餐怎么样？')).toBeVisible({ timeout: 5_000 });
}

/** Click the nth star at left or right half. */
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

// ─── Tests: StarRating 组件 ──────────────────────────────────────────────────

test.describe('StarRating 半星评分', () => {
  test.beforeEach(async ({ page }) => {
    await setAuthToken(page);
    await mockHomeStatusNoBook(page);
    await mockFoodLogSuccess(page);
    await goToHomeFoodLog(page);
  });

  test('初始状态无评分显示', async ({ page }) => {
    // Score display should not show before any rating
    const scoreDisplay = page.locator('text=/\\d+ \\/ 10/');
    await expect(scoreDisplay).not.toBeVisible();
  });

  test('点击第3颗星右半 → score 6', async ({ page }) => {
    await clickStar(page, 3, 'right');
    await expect(page.locator('text=6 / 10')).toBeVisible();
  });

  test('点击第3颗星左半 → score 5 (半星)', async ({ page }) => {
    await clickStar(page, 3, 'left');
    await expect(page.locator('text=5 / 10')).toBeVisible();
  });

  test('点击第1颗星左半 → score 1 (最低半星)', async ({ page }) => {
    await clickStar(page, 1, 'left');
    await expect(page.locator('text=1 / 10')).toBeVisible();
  });

  test('点击第5颗星右半 → score 10 (满分)', async ({ page }) => {
    await clickStar(page, 5, 'right');
    await expect(page.locator('text=10 / 10')).toBeVisible();
  });

  test('切换评分：先3星再1星', async ({ page }) => {
    await clickStar(page, 3, 'right');
    await expect(page.locator('text=6 / 10')).toBeVisible();
    await clickStar(page, 1, 'right');
    await expect(page.locator('text=2 / 10')).toBeVisible();
  });
});

// ─── Tests: 首页 FoodLogForm (通过 CTA 弹窗) ─────────────────────────────────

test.describe('首页 FoodLogForm 弹窗（State A → CTA → Modal）', () => {
  test.beforeEach(async ({ page }) => {
    await setAuthToken(page);
    await mockHomeStatusNoBook(page);
    await mockFoodLogSuccess(page);
    await goToHomeFoodLog(page);
  });

  test('显示今日食物标签', async ({ page }) => {
    await expect(page.locator('text=今日食物：西兰花')).toBeVisible();
  });

  test('未评分和未填写时提交按钮禁用', async ({ page }) => {
    const btn = page.locator('button', { hasText: '提交记录，生成绘本' });
    await expect(btn).toBeDisabled();
  });

  test('仅评分不填描述时提交按钮仍禁用', async ({ page }) => {
    await clickStar(page, 4, 'right');
    const btn = page.locator('button', { hasText: '提交记录，生成绘本' });
    await expect(btn).toBeDisabled();
  });

  test('评分 + 描述 + 尝试程度后提交按钮启用', async ({ page }) => {
    await clickStar(page, 4, 'right');
    await page.locator('textarea').fill('吃了一小口');
    // tryLevel is now required since modal is unified
    await page.locator('button', { hasText: '咬一口' }).click();
    const btn = page.locator('button', { hasText: '提交记录，生成绘本' });
    await expect(btn).toBeEnabled();
  });

  test('提交发送正确的 score 和 content', async ({ page }) => {
    const capture = { body: null as Record<string, unknown> | null };
    await page.unrouteAll({ behavior: 'wait' });
    await mockHomeStatusNoBook(page);
    await mockFoodLogSuccess(page, capture);
    await goToHomeFoodLog(page);

    await clickStar(page, 2, 'left'); // score = 3
    await page.locator('textarea').fill('尝了一口');
    await page.locator('button', { hasText: '咬一口' }).click(); // tryLevel required
    await page.locator('button', { hasText: '提交记录，生成绘本' }).click();

    await page.waitForTimeout(1_500);
    expect(capture.body).not.toBeNull();
    expect(capture.body!.score).toBe(3);
    expect(capture.body!.content).toBe('尝了一口');
    // No skipBookGeneration for home form
    expect(capture.body!.skipBookGeneration).toBeUndefined();
  });

  test('显示尝试程度和跳过按钮（统一弹窗）', async ({ page }) => {
    await expect(page.locator('text=尝试程度')).toBeVisible();
    await expect(page.locator('text=还没吃，先跳过')).toBeVisible();
  });

  test('显示补充说明（统一弹窗）', async ({ page }) => {
    await expect(page.locator('text=补充说明')).toBeVisible();
  });
});

// ─── Tests: 首页弹窗 FoodLogForm (State B → 右上角按钮) ─────────────────────

test.describe('首页弹窗 FoodLogForm（State B → 右上角按钮）', () => {
  test.beforeEach(async ({ page }) => {
    await setAuthToken(page);
    await mockHomeStatusWithBook(page);
    await mockFoodLogSuccess(page);
    await page.goto('/noa/home');
    // Click the "记录进食" button in header
    const btn = page.locator('button').filter({ hasText: '记录进食' });
    await expect(btn).toBeVisible({ timeout: 8_000 });
    await btn.click();
    await expect(page.locator('.fixed >> text=用餐怎么样？')).toBeVisible({ timeout: 5_000 });
  });

  test('弹窗显示今日食物', async ({ page }) => {
    await expect(page.locator('text=今日食物：胡萝卜')).toBeVisible();
  });

  test('点击背景关闭弹窗', async ({ page }) => {
    // Click backdrop (the fixed overlay behind the modal)
    await page.locator('.fixed.inset-0.z-40').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('.fixed >> text=用餐怎么样？')).not.toBeVisible({ timeout: 3_000 });
  });

  test('提交后弹窗关闭', async ({ page }) => {
    await clickStar(page, 3, 'right');
    await page.locator('.fixed textarea').first().fill('吃了一些');
    await page.locator('button', { hasText: '咬一口' }).click(); // tryLevel required
    await page.locator('.fixed button', { hasText: '提交记录，生成绘本' }).click();
    await expect(page.locator('.fixed >> text=用餐怎么样？')).not.toBeVisible({ timeout: 5_000 });
  });
});

// ─── Tests: 语音转写 ─────────────────────────────────────────────────────────

test.describe('语音转写', () => {
  test('点击麦克风按钮填充文本', async ({ page }) => {
    await setAuthToken(page);
    await mockHomeStatusNoBook(page);
    await mockFoodLogSuccess(page);
    await mockVoiceTranscribe(page, '语音识别的内容');
    await goToHomeFoodLog(page);

    // Find the voice button (adjacent to textarea)
    const voiceBtn = page.locator('textarea ~ button').first();
    await expect(voiceBtn).toBeVisible();
    await voiceBtn.click();

    await expect(page.locator('textarea')).toHaveValue('语音识别的内容', { timeout: 5_000 });
  });
});

// ─── Tests: PostReadingModal (阅读后统一弹窗) ────────────────────────────────

test.describe('PostReadingModal 阅读后弹窗', () => {
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

  /** Set up localStorage and navigate directly to /reader in experiment mode. */
  async function setupAndCompleteReading(page: Page) {
    // Set up mocks
    await page.route('**/api/user/food/log', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, feedbackText: '好棒' }),
      }),
    );
    await page.route('**/api/v1/feedback/submit', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      }),
    );
    await page.route('**/api/user/reading/log', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
    );
    await page.route('**/api/v1/telemetry/report', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
    );

    // Set localStorage directly then navigate to /reader
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
    await expect(page.locator('text=从前有一朵小西兰花')).toBeVisible({ timeout: 8_000 });

    // Click "完成" (single page story)
    await page.locator('button', { hasText: '完成' }).click();

    // PostReadingModal should appear
    await expect(page.locator('text=用餐怎么样？')).toBeVisible({ timeout: 5_000 });
  }

  test('读完故事后弹出统一弹窗', async ({ page }) => {
    await setupAndCompleteReading(page);
    await expect(page.locator('text=用餐怎么样？')).toBeVisible();
  });

  test('弹窗显示尝试程度选项', async ({ page }) => {
    await setupAndCompleteReading(page);
    await expect(page.locator('text=尝试程度')).toBeVisible();
    await expect(page.locator('text=看了看')).toBeVisible();
    await expect(page.locator('text=吞下去了')).toBeVisible();
  });

  test('弹窗显示补充说明', async ({ page }) => {
    await setupAndCompleteReading(page);
    await expect(page.locator('text=补充说明')).toBeVisible();
  });

  test('弹窗显示跳过按钮', async ({ page }) => {
    await setupAndCompleteReading(page);
    await expect(page.locator('text=还没吃，先跳过')).toBeVisible();
  });

  test('弹窗显示食物名称', async ({ page }) => {
    await setupAndCompleteReading(page);
    await expect(page.locator('text=今日食物：西兰花')).toBeVisible();
  });

  test('未选尝试程度时提交按钮禁用', async ({ page }) => {
    await setupAndCompleteReading(page);
    await clickStar(page, 3, 'right');
    await page.locator('textarea').first().fill('吃了一些');
    const btn = page.locator('button', { hasText: '提交反馈' });
    await expect(btn).toBeDisabled();
  });

  test('选择尝试程度 + 评分 + 描述后可提交', async ({ page }) => {
    await setupAndCompleteReading(page);
    await page.locator('button', { hasText: '咬一口' }).click();
    await clickStar(page, 4, 'right');
    await page.locator('textarea').first().fill('咬了一口西兰花');
    const btn = page.locator('button', { hasText: '提交反馈' });
    await expect(btn).toBeEnabled();
  });

  test('提交发送 food/log 带 skipBookGeneration: true', async ({ page }) => {
    const capture = { body: null as Record<string, unknown> | null };
    await page.route('**/api/user/food/log', async (route) => {
      capture.body = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, feedbackText: '好棒' }),
      });
    });
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
    await expect(page.locator('text=从前有一朵小西兰花')).toBeVisible({ timeout: 8_000 });
    await page.locator('button', { hasText: '完成' }).click();
    await expect(page.locator('text=用餐怎么样？')).toBeVisible({ timeout: 5_000 });

    await page.locator('button', { hasText: '嚼了嚼' }).click();
    await clickStar(page, 4, 'left'); // score = 7
    await page.locator('textarea').first().fill('嚼了嚼西兰花');
    await page.locator('button', { hasText: '提交反馈' }).click();

    await page.waitForTimeout(2_000);
    expect(capture.body).not.toBeNull();
    expect(capture.body!.skipBookGeneration).toBe(true);
    expect(capture.body!.score).toBe(7);
    expect(capture.body!.content).toBe('嚼了嚼西兰花');
  });

  test('点击跳过后弹窗关闭并导航', async ({ page }) => {
    await setupAndCompleteReading(page);
    await page.locator('text=还没吃，先跳过').click();
    await expect(page.locator('text=用餐怎么样？')).not.toBeVisible({ timeout: 5_000 });
  });

  test('点击 X 后弹窗关闭并导航', async ({ page }) => {
    await setupAndCompleteReading(page);
    // The X button is a sibling of the title wrapper inside the header div (2 levels up from h2)
    const headerDiv = page.locator('text=用餐怎么样？').locator('..').locator('..');
    const xBtn = headerDiv.locator('button').first();
    await xBtn.click();
    await expect(page.locator('text=用餐怎么样？')).not.toBeVisible({ timeout: 5_000 });
  });
});

// ─── Tests: pending_meal_reminder 已移除 ─────────────────────────────────────

test.describe('pending_meal_reminder 已移除', () => {
  test('首页提交不再操作 pending_meal_reminder', async ({ page }) => {
    await setAuthToken(page);
    await page.evaluate(() => localStorage.setItem('pending_meal_reminder', '1'));
    await mockHomeStatusNoBook(page);
    await mockFoodLogSuccess(page);
    await goToHomeFoodLog(page);

    await clickStar(page, 3, 'right');
    await page.locator('textarea').fill('测试');
    await page.locator('button', { hasText: '咬一口' }).click(); // tryLevel required
    await page.locator('button', { hasText: '提交记录，生成绘本' }).click();
    await page.waitForTimeout(1_500);

    // Flag should still be there (no longer removed by HomePage)
    const flag = await page.evaluate(() => localStorage.getItem('pending_meal_reminder'));
    expect(flag).toBe('1');
  });
});
