import { test, expect, type Page } from '@playwright/test';

const ADMIN_KEY = process.env.ADMIN_API_KEY || '6566697232';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loadAdmin(page: Page) {
  await page.goto('/noa/admin/users');
  await page.locator('input[type="password"]').fill(ADMIN_KEY);
  await page.locator('button').filter({ hasText: '加载数据' }).click();
  await expect(page.locator('text=用户总数')).toBeVisible({ timeout: 5_000 });
}

// ─── User-API CSV 端点 (5 个) ────────────────────────────────────────────────

const USER_API_EXPORTS = [
  { label: '用户', path: '/api/user/admin/export/users.csv', headerSubstring: 'user_id' },
  { label: '进食记录', path: '/api/user/admin/export/food_logs.csv', headerSubstring: 'log_id' },
  { label: '阅读会话', path: '/api/user/admin/export/reading_sessions.csv', headerSubstring: 'book_id' },
  { label: '语音录制', path: '/api/user/admin/export/voice_recordings.csv', headerSubstring: 'transcript' },
  { label: '虚拟形象', path: '/api/user/admin/export/avatars.csv', headerSubstring: 'nickname' },
];

test.describe('管理员导出 — User-API CSV 端点', () => {
  for (const exp of USER_API_EXPORTS) {
    test(`${exp.label} (${exp.path}) 返回有效 CSV`, async ({ page }) => {
      await page.goto('/noa/admin/users');
      const res = await page.request.get(`${exp.path}?key=${encodeURIComponent(ADMIN_KEY)}`);
      expect(res.status()).toBe(200);

      const ct = res.headers()['content-type'] ?? '';
      expect(ct).toContain('text/csv');

      const disp = res.headers()['content-disposition'] ?? '';
      expect(disp).toContain('attachment');

      const body = await res.text();
      // 即使没数据也应包含列头
      expect(body).toContain(exp.headerSubstring);
    });

    test(`${exp.label} 无 key 返回 403`, async ({ page }) => {
      await page.goto('/noa/admin/users');
      const res = await page.request.get(exp.path);
      expect(res.status()).toBe(403);
    });
  }
});

// ─── Backend CSV 端点 (5 个) ─────────────────────────────────────────────────

const BACKEND_EXPORTS = [
  { label: '后端会话', path: '/api/v1/export/admin/sessions.csv', headerSubstring: 'session_id' },
  { label: '遥测事件', path: '/api/v1/export/admin/telemetry.csv', headerSubstring: 'event_type' },
  { label: '反馈', path: '/api/v1/export/admin/feedback.csv', headerSubstring: 'try_level' },
  { label: 'SUS 问卷', path: '/api/v1/export/admin/sus.csv', headerSubstring: 'sus_score' },
  { label: '故事元数据', path: '/api/v1/export/admin/stories.csv', headerSubstring: 'story_id' },
];

test.describe('管理员导出 — Backend CSV 端点', () => {
  for (const exp of BACKEND_EXPORTS) {
    test(`${exp.label} (${exp.path}) 返回有效 CSV`, async ({ page }) => {
      await page.goto('/noa/admin/users');
      const res = await page.request.get(`${exp.path}?key=${encodeURIComponent(ADMIN_KEY)}`);
      expect(res.status()).toBe(200);

      const ct = res.headers()['content-type'] ?? '';
      expect(ct).toContain('text/csv');

      const disp = res.headers()['content-disposition'] ?? '';
      expect(disp).toContain('attachment');

      const body = await res.text();
      expect(body).toContain(exp.headerSubstring);
    });

    test(`${exp.label} 无 key 返回 403`, async ({ page }) => {
      await page.goto('/noa/admin/users');
      const res = await page.request.get(exp.path);
      expect(res.status()).toBe(403);
    });
  }
});

// ─── UI 下载按钮点击 ─────────────────────────────────────────────────────────

test.describe('管理员导出 — UI 下载按钮', () => {
  test('10 个下载按钮均可见且 href 包含 key', async ({ page }) => {
    await loadAdmin(page);
    await expect(page.locator('text=数据导出 (CSV)')).toBeVisible();

    const links = page.locator('a[download]');
    await expect(links).toHaveCount(10);

    for (let i = 0; i < 10; i++) {
      const href = await links.nth(i).getAttribute('href');
      expect(href).toContain(`key=${encodeURIComponent(ADMIN_KEY)}`);
    }
  });

  test('点击用户导出按钮触发下载', async ({ page }) => {
    await loadAdmin(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('a[download]').filter({ hasText: '用户' }).click(),
    ]);

    expect(download.suggestedFilename()).toContain('users');

    // Read downloaded content
    const filePath = await download.path();
    if (filePath) {
      const fs = await import('fs');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('user_id');
    }
  });

  test('点击进食记录导出按钮触发下载', async ({ page }) => {
    await loadAdmin(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('a[download]').filter({ hasText: '进食记录' }).click(),
    ]);

    expect(download.suggestedFilename()).toContain('food_logs');
  });

  test('点击阅读会话导出按钮触发下载', async ({ page }) => {
    await loadAdmin(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('a[download]').filter({ hasText: '阅读会话' }).click(),
    ]);

    expect(download.suggestedFilename()).toContain('reading_sessions');
  });

  test('点击语音录制导出按钮触发下载（空表也有列头）', async ({ page }) => {
    await loadAdmin(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('a[download]').filter({ hasText: '语音录制' }).click(),
    ]);

    expect(download.suggestedFilename()).toContain('voice_recordings');

    const filePath = await download.path();
    if (filePath) {
      const fs = await import('fs');
      const content = fs.readFileSync(filePath, 'utf-8');
      // Even empty table should have headers
      expect(content).toContain('transcript');
    }
  });

  test('点击虚拟形象导出按钮触发下载', async ({ page }) => {
    await loadAdmin(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('a[download]').filter({ hasText: '虚拟形象' }).click(),
    ]);

    expect(download.suggestedFilename()).toContain('avatars');
  });
});

// ─── CSV 内容完整性 ──────────────────────────────────────────────────────────

test.describe('管理员导出 — CSV 内容完整性', () => {
  test('users.csv 列头完整（10 列）', async ({ page }) => {
    await page.goto('/noa/admin/users');
    const res = await page.request.get(
      `/api/user/admin/export/users.csv?key=${encodeURIComponent(ADMIN_KEY)}`,
    );
    const body = await res.text();
    const headerLine = body.split('\n')[0];
    const columns = headerLine.split(',');
    expect(columns).toContain('user_id');
    expect(columns).toContain('theme_food');
    expect(columns).toContain('nickname');
    expect(columns).toContain('avatar_created_at');
    expect(columns.length).toBe(10);
  });

  test('food_logs.csv 列头完整（11 列）', async ({ page }) => {
    await page.goto('/noa/admin/users');
    const res = await page.request.get(
      `/api/user/admin/export/food_logs.csv?key=${encodeURIComponent(ADMIN_KEY)}`,
    );
    const body = await res.text();
    const headerLine = body.split('\n')[0];
    const columns = headerLine.split(',');
    expect(columns).toContain('log_id');
    expect(columns).toContain('food_name');
    expect(columns).toContain('score');
    expect(columns).toContain('content');
    expect(columns).toContain('feedback_text');
    expect(columns).toContain('emotion');
    expect(columns.length).toBe(11);
  });

  test('reading_sessions.csv 列头完整（14 列）', async ({ page }) => {
    await page.goto('/noa/admin/users');
    const res = await page.request.get(
      `/api/user/admin/export/reading_sessions.csv?key=${encodeURIComponent(ADMIN_KEY)}`,
    );
    const body = await res.text();
    const headerLine = body.split('\n')[0];
    const columns = headerLine.split(',');
    expect(columns).toContain('duration_ms');
    expect(columns).toContain('completed');
    expect(columns).toContain('try_level');
    expect(columns.length).toBe(14);
  });

  test('voice_recordings.csv 空表仍返回列头（8 列）', async ({ page }) => {
    await page.goto('/noa/admin/users');
    const res = await page.request.get(
      `/api/user/admin/export/voice_recordings.csv?key=${encodeURIComponent(ADMIN_KEY)}`,
    );
    const body = await res.text();
    const headerLine = body.split('\n')[0];
    const columns = headerLine.split(',');
    expect(columns).toContain('id');
    expect(columns).toContain('transcript');
    expect(columns).toContain('duration_ms');
    expect(columns.length).toBe(8);
  });

  test('avatars.csv 列头完整（10 列）', async ({ page }) => {
    await page.goto('/noa/admin/users');
    const res = await page.request.get(
      `/api/user/admin/export/avatars.csv?key=${encodeURIComponent(ADMIN_KEY)}`,
    );
    const body = await res.text();
    const headerLine = body.split('\n')[0];
    const columns = headerLine.split(',');
    expect(columns).toContain('user_id');
    expect(columns).toContain('theme_food');
    expect(columns.length).toBe(10);
  });

  test('users.csv 数据行包含 demo 用户', async ({ page }) => {
    await page.goto('/noa/admin/users');
    const res = await page.request.get(
      `/api/user/admin/export/users.csv?key=${encodeURIComponent(ADMIN_KEY)}`,
    );
    const body = await res.text();
    const lines = body.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1); // header + at least 1 data row
    expect(body).toContain('demo');
  });

  test('food_logs.csv 有数据时包含分数列', async ({ page }) => {
    await page.goto('/noa/admin/users');
    const res = await page.request.get(
      `/api/user/admin/export/food_logs.csv?key=${encodeURIComponent(ADMIN_KEY)}`,
    );
    const body = await res.text();
    const lines = body.trim().split('\n');
    if (lines.length > 1) {
      // Data rows exist — score should be a number
      const dataLine = lines[1];
      const cols = dataLine.split(',');
      // score is 4th column (index 3)
      expect(Number(cols[3])).toBeGreaterThan(0);
    }
  });

  test('stories.csv 列头完整（10 列）', async ({ page }) => {
    await page.goto('/noa/admin/users');
    const res = await page.request.get(
      `/api/v1/export/admin/stories.csv?key=${encodeURIComponent(ADMIN_KEY)}`,
    );
    const body = await res.text();
    const headerLine = body.split('\n')[0];
    const columns = headerLine.split(',');
    expect(columns).toContain('story_id');
    expect(columns).toContain('theme_food');
    expect(columns).toContain('page_count');
    expect(columns.length).toBe(10);
  });
});

// ─── 错误 key 测试 ──────────────────────────────────────────────────────────

test.describe('管理员导出 — 错误密钥', () => {
  test('user-api 端点用错误 key 返回 403', async ({ page }) => {
    await page.goto('/noa/admin/users');
    const res = await page.request.get('/api/user/admin/export/users.csv?key=wrong');
    expect(res.status()).toBe(403);
  });

  test('backend 端点用错误 key 返回 403', async ({ page }) => {
    await page.goto('/noa/admin/users');
    const res = await page.request.get('/api/v1/export/admin/sessions.csv?key=wrong');
    expect(res.status()).toBe(403);
  });
});
