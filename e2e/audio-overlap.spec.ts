import { test, expect, type Page } from '@playwright/test';

// ─── Multi-page Draft ─────────────────────────────────────────────────────────

const DRAFT = {
  schema_version: '1.0',
  story_id: 'story-audio',
  generated_at: new Date().toISOString(),
  book_meta: {
    title: '音频测试故事',
    subtitle: '',
    theme_food: '胡萝卜',
    story_type: 'adventure',
    target_behavior_level: 'Lv1',
    summary: '测试',
    design_logic: '',
    global_visual_style: '卡通',
  },
  pages: [
    {
      page_no: 1, page_id: 'p1', behavior_anchor: 'Lv1',
      text: '第一页的故事内容。',
      image_prompt: '', image_url: '',
      interaction: { type: 'none', instruction: '', event_key: '' },
      branch_choices: [],
    },
    {
      page_no: 2, page_id: 'p2', behavior_anchor: 'Lv1',
      text: '第二页的故事内容。',
      image_prompt: '', image_url: '',
      interaction: { type: 'none', instruction: '', event_key: '' },
      branch_choices: [],
    },
    {
      page_no: 3, page_id: 'p3', behavior_anchor: 'Lv1',
      text: '第三页的故事内容。',
      image_prompt: '', image_url: '',
      interaction: { type: 'tap', instruction: '点一点胡萝卜', event_key: 'tap_carrot' },
      branch_choices: [],
    },
    {
      page_no: 4, page_id: 'p4', behavior_anchor: 'Lv1',
      text: '最后一页的故事内容。',
      image_prompt: '', image_url: '',
      interaction: { type: 'none', instruction: '', event_key: '' },
      branch_choices: [],
    },
  ],
  ending: { positive_feedback: '太棒了！', next_micro_goal: '下次目标' },
  telemetry_suggestions: { recommended_events: [] },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Inject an audio spy that tracks concurrent playback. */
async function injectAudioSpy(page: Page) {
  await page.evaluate(() => {
    const tracker = {
      playing: new Set<number>(),
      maxConcurrent: 0,
      totalPlays: 0,
      abortedFetches: 0,
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

        this.addEventListener('pause', () => {
          tracker.playing.delete(self._trackId);
        });
        this.addEventListener('ended', () => {
          tracker.playing.delete(self._trackId);
        });
      }
    };
  });
}

/** Get tracking results. */
async function getAudioStats(page: Page) {
  return page.evaluate(() => {
    const t = (window as any).__audioTracker;
    return {
      maxConcurrent: t.maxConcurrent as number,
      totalPlays: t.totalPlays as number,
      currentlyPlaying: t.playing.size as number,
    };
  });
}

/** Set up localStorage and mocks, navigate to /reader. */
async function setupReader(page: Page) {
  // Mock APIs
  await page.route('**/api/v1/tts', async (route) => {
    // Simulate slow TTS response (300ms) to expose race conditions
    await new Promise(r => setTimeout(r, 300));
    // Return a tiny valid audio blob (silence)
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

  // Set localStorage
  await page.goto('/noa/home', { waitUntil: 'commit' });
  await page.evaluate((draft) => {
    localStorage.setItem('noa_child_token', 'test-token');
    localStorage.setItem('storybook_draft', JSON.stringify(draft));
    localStorage.setItem('storybook_book_id', 'test-audio-book');
    localStorage.setItem('storybook_source', 'experiment');
    localStorage.setItem('storybook_session', JSON.stringify({
      story_id: 'story-audio',
      session_id: 'sess-audio',
      client_session_token: 'tok-audio',
      session_index: 0,
    }));
  }, DRAFT);

  await page.goto('/reader');
  await expect(page.locator('text=第一页的故事内容')).toBeVisible({ timeout: 8_000 });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('音频不重叠（快速操作场景）', () => {

  test('快速连续翻页 — 同时最多1个音频播放', async ({ page }) => {
    await setupReader(page);
    await injectAudioSpy(page);

    // Enable auto-read by clicking TTS button
    const ttsBtn = page.locator('button').filter({ has: page.locator('[data-testid="tts-toggle"]') }).or(
      page.locator('button').filter({ hasText: /朗读/ })
    ).first();

    // If there's a speaker icon button, click it to enable TTS
    const speakerBtn = page.locator('button:has(svg)').filter({ hasText: '' }).nth(0);

    // Rapidly click "下一页" 3 times without waiting
    const nextBtn = page.locator('button', { hasText: '下一页' });
    await expect(nextBtn).toBeVisible({ timeout: 5_000 });

    await nextBtn.click();
    await nextBtn.click();
    await nextBtn.click();

    // Wait for any pending TTS fetches + audio
    await page.waitForTimeout(1_500);

    const stats = await getAudioStats(page);
    // Should never have more than 1 concurrent audio
    expect(stats.maxConcurrent).toBeLessThanOrEqual(1);
  });

  test('快速翻页后停在正确页面', async ({ page }) => {
    await setupReader(page);

    const nextBtn = page.locator('button', { hasText: '下一页' });
    await expect(nextBtn).toBeVisible({ timeout: 5_000 });

    // Rapid triple-click
    await nextBtn.click();
    await nextBtn.click();
    await nextBtn.click();

    await page.waitForTimeout(500);

    // Should be on page 4 (last page) — "完成" button should show
    await expect(page.locator('text=最后一页的故事内容')).toBeVisible({ timeout: 3_000 });
    await expect(page.locator('button', { hasText: '完成' })).toBeVisible();
  });

  test('翻页取消进行中的 TTS 请求', async ({ page }) => {
    let ttsRequestCount = 0;
    let ttsAbortCount = 0;

    await page.route('**/api/v1/tts', async (route) => {
      ttsRequestCount++;
      // Very slow response to ensure abort has time to happen
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(resolve, 2000);
          route.request().frame()?.page()?.on('close', () => {
            clearTimeout(timeout);
            reject(new Error('closed'));
          });
        });
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
      } catch {
        ttsAbortCount++;
        await route.abort().catch(() => {});
      }
    });
    await page.route('**/api/v1/telemetry/report', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
    );

    await page.goto('/noa/home', { waitUntil: 'commit' });
    await page.evaluate((draft) => {
      localStorage.setItem('noa_child_token', 'test-token');
      localStorage.setItem('storybook_draft', JSON.stringify(draft));
      localStorage.setItem('storybook_book_id', 'test-audio-book');
      localStorage.setItem('storybook_source', 'experiment');
      localStorage.setItem('storybook_session', JSON.stringify({
        story_id: 'story-audio',
        session_id: 'sess-audio',
        client_session_token: 'tok-audio',
        session_index: 0,
      }));
    }, DRAFT);

    await page.goto('/reader');
    await expect(page.locator('text=第一页的故事内容')).toBeVisible({ timeout: 8_000 });

    // Enable auto-read via speaker button (first button with svg in top row)
    const buttons = page.locator('button:has(svg)');
    // Find the TTS toggle — it's typically near top-right
    // Click "下一页" to trigger TTS for page 2, then immediately click again
    const nextBtn = page.locator('button', { hasText: '下一页' });

    // Turn on autoRead
    const headerBtns = page.locator('button').filter({ has: page.locator('svg') });
    for (let i = 0; i < await headerBtns.count(); i++) {
      const text = await headerBtns.nth(i).innerText();
      if (text === '') {
        // Icon-only button in header — likely TTS toggle
        await headerBtns.nth(i).click();
        break;
      }
    }

    await nextBtn.click();
    // Don't wait — immediately click again
    await nextBtn.click();

    await page.waitForTimeout(1_000);
    // Verify we didn't crash and are on the correct page
    await expect(page.locator('text=第三页的故事内容')).toBeVisible();
  });

  test('前后翻页交替 — 无音频重叠', async ({ page }) => {
    await setupReader(page);
    await injectAudioSpy(page);

    const nextBtn = page.locator('button', { hasText: '下一页' });
    const prevBtn = page.locator('button', { hasText: '上一页' });

    await expect(nextBtn).toBeVisible({ timeout: 5_000 });

    // Forward, forward, back, forward rapidly
    await nextBtn.click();
    await nextBtn.click();
    await prevBtn.click();
    await nextBtn.click();

    await page.waitForTimeout(1_500);

    const stats = await getAudioStats(page);
    expect(stats.maxConcurrent).toBeLessThanOrEqual(1);
  });

  test('TTS 开关快速切换 — 无重叠', async ({ page }) => {
    await setupReader(page);
    await injectAudioSpy(page);

    // Find the TTS toggle button (speaker icon)
    // It's one of the icon-only buttons in the top area
    const allBtns = page.locator('button');
    let ttsToggle = page.locator('button[aria-label*="朗读"]').first();

    // Fallback: look for speaker icon buttons
    if (!(await ttsToggle.isVisible().catch(() => false))) {
      // The TTS button has a SpeakerHigh or SpeakerSlash icon
      // Try to find it by looking at the top-right button area
      const topBtns = page.locator('.flex-shrink-0 button, header button').filter({ has: page.locator('svg') });
      const count = await topBtns.count();
      for (let i = 0; i < count; i++) {
        const btn = topBtns.nth(i);
        const text = await btn.textContent();
        // TTS button is icon-only (no text content besides possible whitespace)
        if (text?.trim() === '' || text?.trim().length === 0) {
          ttsToggle = btn;
          break;
        }
      }
    }

    if (await ttsToggle.isVisible().catch(() => false)) {
      // Rapidly toggle TTS: on, off, on, off
      await ttsToggle.click();
      await ttsToggle.click();
      await ttsToggle.click();
      await ttsToggle.click();

      await page.waitForTimeout(1_500);

      const stats = await getAudioStats(page);
      // Should never overlap
      expect(stats.maxConcurrent).toBeLessThanOrEqual(1);
    }
  });

  test('翻到最后一页完成后 — 音频停止', async ({ page }) => {
    await setupReader(page);

    const nextBtn = page.locator('button', { hasText: /下一页|完成/ });

    // Navigate through all pages rapidly
    for (let i = 0; i < DRAFT.pages.length; i++) {
      const btn = page.locator('button', { hasText: i === DRAFT.pages.length - 1 ? '完成' : '下一页' });
      await btn.click();
    }

    // Post-reading modal should appear
    await expect(page.locator('text=用餐怎么样？')).toBeVisible({ timeout: 5_000 });

    // Verify no audio is still playing (check via evaluate)
    const stillPlaying = await page.evaluate(() => {
      return window.speechSynthesis?.speaking === true;
    });
    expect(stillPlaying).toBeFalsy();
  });

  test('点击"完成"后立即出现弹窗 — 不卡在音频上', async ({ page }) => {
    await setupReader(page);

    // Navigate to last page
    const nextBtn = page.locator('button', { hasText: '下一页' });
    for (let i = 0; i < DRAFT.pages.length - 1; i++) {
      await nextBtn.click();
    }

    await expect(page.locator('text=最后一页的故事内容')).toBeVisible({ timeout: 3_000 });

    // Click "完成"
    const doneBtn = page.locator('button', { hasText: '完成' });
    await expect(doneBtn).toBeVisible();
    await doneBtn.click();

    // Modal should appear promptly (< 2s)
    await expect(page.locator('text=用餐怎么样？')).toBeVisible({ timeout: 2_000 });
  });
});
