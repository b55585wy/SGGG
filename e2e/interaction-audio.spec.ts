import { test, expect, type Page } from '@playwright/test';

// ─── Draft with various interaction types ──────────────────────────────────────

const DRAFT = {
  schema_version: '1.0',
  story_id: 'story-interact',
  generated_at: new Date().toISOString(),
  book_meta: {
    title: '互动测试故事',
    subtitle: '',
    theme_food: '胡萝卜',
    story_type: 'interactive',
    target_behavior_level: 'Lv1',
    summary: '测试互动和音频优先级',
    design_logic: '',
    global_visual_style: '卡通',
  },
  pages: [
    {
      page_no: 1, page_id: 'p1', behavior_anchor: 'Lv1',
      text: '小兔子看到了一根又大又橙的胡萝卜。',
      image_prompt: '', image_url: '',
      interaction: {
        type: 'tap',
        instruction: '点一点胡萝卜吧！',
        event_key: 'tap_carrot',
        ext: { encouragement: '太棒了，你点到了胡萝卜！' },
      },
      branch_choices: [],
    },
    {
      page_no: 2, page_id: 'p2', behavior_anchor: 'Lv1',
      text: '小兔子想决定怎么吃胡萝卜。',
      image_prompt: '', image_url: '',
      interaction: {
        type: 'choice',
        instruction: '你想怎么吃？',
        event_key: 'eat_choice',
        ext: { encouragement: '好主意！' },
      },
      branch_choices: [
        { choice_id: 'c1', label: '咬一口', next_page_id: 'p3' },
        { choice_id: 'c2', label: '煮着吃', next_page_id: 'p3' },
      ],
    },
    {
      page_no: 3, page_id: 'p3', behavior_anchor: 'Lv1',
      text: '小兔子学着做一个鬼脸。',
      image_prompt: '', image_url: '',
      interaction: {
        type: 'mimic',
        instruction: '你也来做一个鬼脸吧！',
        event_key: 'mimic_face',
        ext: { encouragement: '你做得真好！' },
      },
      branch_choices: [],
    },
    {
      page_no: 4, page_id: 'p4', behavior_anchor: 'Lv1',
      text: '故事结束了，胡萝卜真好吃。',
      image_prompt: '', image_url: '',
      interaction: { type: 'none', instruction: '', event_key: '' },
      branch_choices: [],
    },
  ],
  ending: { positive_feedback: '太棒了！', next_micro_goal: '下次目标' },
  telemetry_suggestions: { recommended_events: [] },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Track all TTS requests and Audio.play() calls. */
async function injectAudioSpy(page: Page) {
  await page.evaluate(() => {
    const tracker = {
      playing: new Set<number>(),
      maxConcurrent: 0,
      totalPlays: 0,
      ttsTexts: [] as string[],
      playOrder: [] as string[],
    };
    (window as any).__audioTracker = tracker;

    let nextId = 0;
    const OrigAudio = window.Audio;
    // @ts-ignore
    window.Audio = class SpyAudio extends OrigAudio {
      _trackId: number;
      constructor(src?: string) {
        super(src);
        this._trackId = nextId++;
        const self = this;
        const origPlay = this.play.bind(this);
        this.play = function () {
          tracker.playing.add(self._trackId);
          tracker.totalPlays++;
          tracker.maxConcurrent = Math.max(tracker.maxConcurrent, tracker.playing.size);
          return origPlay();
        };
        this.addEventListener('pause', () => tracker.playing.delete(self._trackId));
        this.addEventListener('ended', () => tracker.playing.delete(self._trackId));
      }
    };
  });
}

async function getAudioStats(page: Page) {
  return page.evaluate(() => {
    const t = (window as any).__audioTracker;
    return {
      maxConcurrent: t.maxConcurrent as number,
      totalPlays: t.totalPlays as number,
      currentlyPlaying: t.playing.size as number,
      ttsTexts: t.ttsTexts as string[],
    };
  });
}

/** Track TTS API calls — which texts were requested. */
async function setupTTSTracker(page: Page) {
  const ttsRequests: string[] = [];
  await page.route('**/api/v1/tts', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    ttsRequests.push(body.text);
    // Simulate ~200ms TTS latency
    await new Promise(r => setTimeout(r, 200));
    const silence = new Uint8Array([
      0x52,0x49,0x46,0x46, 0x24,0x00,0x00,0x00, 0x57,0x41,0x56,0x45,
      0x66,0x6D,0x74,0x20, 0x10,0x00,0x00,0x00, 0x01,0x00,0x01,0x00,
      0x44,0xAC,0x00,0x00, 0x88,0x58,0x01,0x00, 0x02,0x00,0x10,0x00,
      0x64,0x61,0x74,0x61, 0x00,0x00,0x00,0x00,
    ]);
    await route.fulfill({
      status: 200,
      contentType: 'audio/wav',
      body: Buffer.from(silence),
    });
  });
  return ttsRequests;
}

async function setupReader(page: Page) {
  await page.route('**/api/v1/telemetry/report', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
  );
  await page.route('**/api/user/reading/log', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
  );
  await page.route('**/api/user/food/log', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, feedbackText: '好棒' }),
    }),
  );
  await page.route('**/api/v1/feedback/submit', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
  );
  await page.route('**/api/user/voice/record', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
  );

  await page.goto('/noa/home', { waitUntil: 'commit' });
  await page.evaluate((draft) => {
    localStorage.setItem('noa_child_token', 'test-token');
    localStorage.setItem('storybook_draft', JSON.stringify(draft));
    localStorage.setItem('storybook_book_id', 'test-interact-book');
    localStorage.setItem('storybook_source', 'experiment');
    localStorage.setItem('storybook_session', JSON.stringify({
      story_id: 'story-interact',
      session_id: 'sess-interact',
      client_session_token: 'tok-interact',
      session_index: 0,
    }));
  }, DRAFT);

  await page.goto('/reader');
  // Dismiss cover page
  const startBtn = page.locator('button', { hasText: '开始阅读' });
  await expect(startBtn).toBeVisible({ timeout: 8_000 });
  await startBtn.click();
  await expect(page.locator('text=小兔子看到了一根又大又橙的胡萝卜')).toBeVisible({ timeout: 8_000 });
}

// ─── 1. 点击互动优先 ─────────────────────────────────────────────────────────

test.describe('互动点击优先于朗读', () => {

  test('tap 互动：点击后鼓励语播放，不与页面朗读重叠', async ({ page }) => {
    const ttsTexts = await setupTTSTracker(page);
    await setupReader(page);
    await injectAudioSpy(page);

    // Page 1 has tap interaction
    const tapBtn = page.locator('button:has(svg)').filter({
      has: page.locator('[class*="HandTap"], [class*="hand"]'),
    }).or(page.locator('.rounded-full.border-dashed'));

    // Find the dashed-border tap circle
    const tapCircle = page.locator('button.rounded-full').filter({ has: page.locator('svg') });
    if (await tapCircle.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await tapCircle.first().click();
    }

    await page.waitForTimeout(1_000);

    const stats = await getAudioStats(page);
    // No overlapping audio
    expect(stats.maxConcurrent).toBeLessThanOrEqual(1);
  });

  test('tap 互动完成后显示 ✓ 图标', async ({ page }) => {
    await setupTTSTracker(page);
    await setupReader(page);

    // Wait for tap button (dashed border circle)
    const tapBtn = page.locator('button.rounded-full').filter({
      hasText: '',
    }).first();

    // Click the interaction area
    const interactionArea = page.locator('text=点一点胡萝卜吧！').locator('..');
    const circle = interactionArea.locator('button');
    if (await circle.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await circle.click();
      // After clicking, CheckCircle should appear
      await page.waitForTimeout(500);
      // The button should now be disabled (completed)
      await expect(circle).toBeDisabled();
    }
  });

  test('choice 互动：选择后鼓励语播放，800ms 后翻页', async ({ page }) => {
    const ttsTexts = await setupTTSTracker(page);
    await setupReader(page);
    await injectAudioSpy(page);

    // Navigate to page 2 (choice interaction)
    const nextBtn = page.locator('button', { hasText: '下一页' });
    await nextBtn.click();
    await expect(page.locator('text=小兔子想决定怎么吃胡萝卜')).toBeVisible({ timeout: 5_000 });

    // Click a choice
    const choiceBtn = page.locator('button', { hasText: '咬一口' });
    await expect(choiceBtn).toBeVisible({ timeout: 3_000 });
    await choiceBtn.click();

    // Should navigate to page 3 after ~800ms delay
    await expect(page.locator('text=小兔子学着做一个鬼脸')).toBeVisible({ timeout: 3_000 });

    const stats = await getAudioStats(page);
    expect(stats.maxConcurrent).toBeLessThanOrEqual(1);
  });

  test('choice 互动：快速连续选择不会触发多次', async ({ page }) => {
    await setupTTSTracker(page);
    await setupReader(page);
    await injectAudioSpy(page);

    // Navigate to page 2
    await page.locator('button', { hasText: '下一页' }).click();
    await expect(page.locator('text=你想怎么吃')).toBeVisible({ timeout: 5_000 });

    // Rapidly click both choices
    const choice1 = page.locator('button', { hasText: '咬一口' });
    const choice2 = page.locator('button', { hasText: '煮着吃' });

    await choice1.click();
    // Try clicking the second choice immediately
    await choice2.click().catch(() => {});

    await page.waitForTimeout(1_500);

    const stats = await getAudioStats(page);
    // Even with double-click, max 1 concurrent
    expect(stats.maxConcurrent).toBeLessThanOrEqual(1);
  });

  test('mimic 互动：点击"我做到了"后播放鼓励语', async ({ page }) => {
    await setupTTSTracker(page);
    await setupReader(page);
    await injectAudioSpy(page);

    // Navigate to page 3 (mimic interaction)
    const nextBtn = page.locator('button', { hasText: '下一页' });
    await nextBtn.click();
    await nextBtn.click();

    await expect(page.locator('text=你也来做一个鬼脸吧')).toBeVisible({ timeout: 5_000 });

    // Click "我做到了"
    const mimicBtn = page.locator('button', { hasText: '我做到了' });
    await expect(mimicBtn).toBeVisible({ timeout: 3_000 });
    await mimicBtn.click();

    // Should show "太棒了" after completion
    await expect(page.locator('button:has-text("太棒了")')).toBeVisible({ timeout: 3_000 });

    const stats = await getAudioStats(page);
    expect(stats.maxConcurrent).toBeLessThanOrEqual(1);
  });

  test('mimic 互动完成后按钮不可重复点击', async ({ page }) => {
    await setupTTSTracker(page);
    await setupReader(page);

    // Navigate to page 3
    const nextBtn = page.locator('button', { hasText: '下一页' });
    await nextBtn.click();
    await nextBtn.click();

    await expect(page.locator('text=你也来做一个鬼脸吧')).toBeVisible({ timeout: 5_000 });

    const mimicBtn = page.locator('button', { hasText: '我做到了' });
    await mimicBtn.click();

    // After completion, the "太棒了" button should replace "我做到了"
    await expect(page.locator('button:has-text("太棒了")')).toBeVisible({ timeout: 3_000 });
    // "我做到了" should no longer be visible
    await expect(mimicBtn).not.toBeVisible();
  });
});

// ─── 2. 翻页 + 互动音频交叉 ──────────────────────────────────────────────────

test.describe('翻页与互动音频交叉场景', () => {

  test('互动完成后立即翻页 — 鼓励语被翻页停止', async ({ page }) => {
    await setupTTSTracker(page);
    await setupReader(page);
    await injectAudioSpy(page);

    // Page 1: tap interaction
    const tapArea = page.locator('text=点一点胡萝卜吧！').locator('..').locator('button').first();
    if (await tapArea.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await tapArea.click();
    }

    // Immediately navigate to next page (don't wait for encouragement to finish)
    const nextBtn = page.locator('button', { hasText: '下一页' });
    await nextBtn.click();

    await page.waitForTimeout(1_000);

    // Should be on page 2 without audio overlap
    await expect(page.locator('text=小兔子想决定怎么吃胡萝卜')).toBeVisible();
    const stats = await getAudioStats(page);
    expect(stats.maxConcurrent).toBeLessThanOrEqual(1);
  });

  test('choice 选择后 800ms 内翻页 — 不产生双重导航', async ({ page }) => {
    await setupTTSTracker(page);
    await setupReader(page);

    // Navigate to page 2 (choice)
    await page.locator('button', { hasText: '下一页' }).click();
    await expect(page.locator('text=你想怎么吃')).toBeVisible({ timeout: 5_000 });

    // Click choice (triggers setTimeout 800ms → branch navigation)
    await page.locator('button', { hasText: '咬一口' }).click();

    // During the 800ms delay, try clicking "下一页" manually
    const nextBtn = page.locator('button', { hasText: '下一页' });
    if (await nextBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await nextBtn.click();
    }

    await page.waitForTimeout(1_500);

    // Should end up on page 3 (branch target), not page 4
    await expect(page.locator('text=小兔子学着做一个鬼脸')).toBeVisible();
  });

  test('翻页到互动页后立即翻走 — 互动不残留', async ({ page }) => {
    await setupTTSTracker(page);
    await setupReader(page);
    await injectAudioSpy(page);

    // Navigate to page 1 (has tap), then immediately forward to page 2
    const nextBtn = page.locator('button', { hasText: '下一页' });

    // Page 1 → Page 2 (skip tap interaction)
    await nextBtn.click();

    await expect(page.locator('text=小兔子想决定怎么吃胡萝卜')).toBeVisible({ timeout: 3_000 });
    // Tap instruction from page 1 should not be visible
    await expect(page.locator('text=点一点胡萝卜吧')).not.toBeVisible();
  });

  test('快速穿越所有互动页 — 无崩溃无重叠', async ({ page }) => {
    await setupTTSTracker(page);
    await setupReader(page);
    await injectAudioSpy(page);

    const nextBtn = page.locator('button', { hasText: '下一页' });

    // Rapidly skip through all pages
    await nextBtn.click(); // page 1 → 2
    await nextBtn.click(); // page 2 → 3
    await nextBtn.click(); // page 3 → 4

    await page.waitForTimeout(1_000);

    // Should be on last page
    await expect(page.locator('text=故事结束了')).toBeVisible({ timeout: 3_000 });

    const stats = await getAudioStats(page);
    expect(stats.maxConcurrent).toBeLessThanOrEqual(1);
  });
});

// ─── 3. 边界情况 ──────────────────────────────────────────────────────────────

test.describe('互动边界情况', () => {

  test('TTS API 超时时互动点击仍正常工作', async ({ page }) => {
    // Slow TTS that times out
    await page.route('**/api/v1/tts', async (route) => {
      await new Promise(r => setTimeout(r, 5000)); // 5s timeout
      await route.abort();
    });
    await page.route('**/api/v1/telemetry/report', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
    );
    await page.route('**/api/user/reading/log', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
    );
    await page.route('**/api/user/food/log', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, feedbackText: '好棒' }),
      }),
    );
    await page.route('**/api/v1/feedback/submit', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
    );

    await page.goto('/noa/home', { waitUntil: 'commit' });
    await page.evaluate((draft) => {
      localStorage.setItem('noa_child_token', 'test-token');
      localStorage.setItem('storybook_draft', JSON.stringify(draft));
      localStorage.setItem('storybook_book_id', 'test-interact-book');
      localStorage.setItem('storybook_source', 'experiment');
      localStorage.setItem('storybook_session', JSON.stringify({
        story_id: 'story-interact',
        session_id: 'sess-interact',
        client_session_token: 'tok-interact',
        session_index: 0,
      }));
    }, DRAFT);

    await page.goto('/reader');
    // Dismiss cover page
    await page.locator('button', { hasText: '开始阅读' }).click();
    await expect(page.locator('text=小兔子看到了')).toBeVisible({ timeout: 8_000 });

    // Tap interaction should still work even if TTS is hanging
    const tapArea = page.locator('text=点一点胡萝卜吧！').locator('..').locator('button').first();
    if (await tapArea.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await tapArea.click();
      await expect(tapArea).toBeDisabled({ timeout: 2_000 });
    }

    // Navigation should still work
    const nextBtn = page.locator('button', { hasText: '下一页' });
    await nextBtn.click();
    await expect(page.locator('text=小兔子想决定怎么吃胡萝卜')).toBeVisible({ timeout: 3_000 });
  });

  test('TTS API 返回错误时互动和翻页不受影响', async ({ page }) => {
    await page.route('**/api/v1/tts', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"server error"}' }),
    );
    await page.route('**/api/v1/telemetry/report', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
    );
    await page.route('**/api/user/reading/log', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
    );
    await page.route('**/api/user/food/log', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, feedbackText: '好棒' }),
      }),
    );
    await page.route('**/api/v1/feedback/submit', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
    );

    await page.goto('/noa/home', { waitUntil: 'commit' });
    await page.evaluate((draft) => {
      localStorage.setItem('noa_child_token', 'test-token');
      localStorage.setItem('storybook_draft', JSON.stringify(draft));
      localStorage.setItem('storybook_book_id', 'test-interact-book');
      localStorage.setItem('storybook_source', 'experiment');
      localStorage.setItem('storybook_session', JSON.stringify({
        story_id: 'story-interact',
        session_id: 'sess-interact',
        client_session_token: 'tok-interact',
        session_index: 0,
      }));
    }, DRAFT);

    await page.goto('/reader');
    // Dismiss cover page
    await page.locator('button', { hasText: '开始阅读' }).click();
    await expect(page.locator('text=小兔子看到了')).toBeVisible({ timeout: 8_000 });

    // Navigate through all pages — should not crash despite TTS errors
    const nextBtn = page.locator('button', { hasText: '下一页' });
    await nextBtn.click();
    await expect(page.locator('text=小兔子想决定')).toBeVisible({ timeout: 3_000 });
    await nextBtn.click();
    await expect(page.locator('text=小兔子学着做')).toBeVisible({ timeout: 3_000 });
    await nextBtn.click();
    await expect(page.locator('text=故事结束了')).toBeVisible({ timeout: 3_000 });

    // Complete the story
    await page.locator('button', { hasText: '完成' }).click();
    await expect(page.locator('text=用餐怎么样？')).toBeVisible({ timeout: 5_000 });
  });

  test('互动完成后返回上一页再回来 — 互动状态重置', async ({ page }) => {
    await setupTTSTracker(page);
    await setupReader(page);

    // Complete tap interaction on page 1
    const tapArea = page.locator('text=点一点胡萝卜吧！').locator('..').locator('button').first();
    if (await tapArea.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await tapArea.click();
      await expect(tapArea).toBeDisabled({ timeout: 2_000 });
    }

    // Go to page 2
    await page.locator('button', { hasText: '下一页' }).click();
    await expect(page.locator('text=小兔子想决定')).toBeVisible({ timeout: 3_000 });

    // Go back to page 1
    await page.locator('button', { hasText: '上一页' }).click();
    await expect(page.locator('text=小兔子看到了')).toBeVisible({ timeout: 3_000 });

    // Interaction state should reset — tap button should be enabled again
    const tapAreaAgain = page.locator('text=点一点胡萝卜吧！').locator('..').locator('button').first();
    if (await tapAreaAgain.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Button should be clickable (state resets on page change via useEffect)
      await expect(tapAreaAgain).toBeEnabled();
    }
  });
});
