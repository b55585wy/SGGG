import { test, expect, Page } from '@playwright/test';

const ADMIN_KEY = process.env.ADMIN_API_KEY || '6566697232';

async function loadAdmin(page: Page) {
  await page.goto('/noa/admin/users');
  await page.locator('input[type="password"]').fill(ADMIN_KEY);
  await page.locator('button').filter({ hasText: '加载数据' }).click();
  await expect(page.locator('text=用户总数')).toBeVisible({ timeout: 5_000 });
}

function getForm(page: Page) {
  return page.locator('text=创建新用户').locator('..');
}

// ─── Checkbox Toggle ─────────────────────────────────────

test.describe('管理员创建用户 — 生成绘本选项', () => {
  test('加载后显示"同时生成默认绘本"复选框', async ({ page }) => {
    await loadAdmin(page);

    await expect(page.locator('text=同时生成默认绘本')).toBeVisible();
  });

  test('复选框默认未勾选，绘本字段不显示', async ({ page }) => {
    await loadAdmin(page);

    const form = getForm(page);
    const checkbox = form.locator('input[type="checkbox"]');
    await expect(checkbox).not.toBeChecked();
    await expect(page.locator('text=姓名（昵称）')).not.toBeVisible();
    await expect(page.locator('input[placeholder="留空则使用用户ID"]')).not.toBeVisible();
    await expect(page.locator('textarea[placeholder*="恐龙"]')).not.toBeVisible();
  });

  test('勾选复选框后显示姓名/年龄/性别/自定义Prompt字段', async ({ page }) => {
    await loadAdmin(page);

    await page.locator('text=同时生成默认绘本').click();

    await expect(page.locator('text=姓名（昵称）')).toBeVisible();
    await expect(page.locator('input[placeholder="留空则使用用户ID"]')).toBeVisible();
    await expect(page.locator('text=年龄').first()).toBeVisible();
    await expect(page.locator('text=性别').first()).toBeVisible();
    await expect(page.locator('select')).toBeVisible();
    await expect(page.locator('textarea[placeholder*="恐龙"]')).toBeVisible();
  });

  test('取消勾选后绘本字段隐藏', async ({ page }) => {
    await loadAdmin(page);

    // Check then uncheck
    await page.locator('text=同时生成默认绘本').click();
    await expect(page.locator('text=姓名（昵称）')).toBeVisible();

    await page.locator('text=同时生成默认绘本').click();
    await expect(page.locator('text=姓名（昵称）')).not.toBeVisible();
  });

  test('年龄默认值为5', async ({ page }) => {
    await loadAdmin(page);
    await page.locator('text=同时生成默认绘本').click();

    const ageInput = page.locator('input[type="number"]');
    await expect(ageInput).toHaveValue('5');
  });

  test('性别默认值为男', async ({ page }) => {
    await loadAdmin(page);
    await page.locator('text=同时生成默认绘本').click();

    const genderSelect = page.locator('select');
    await expect(genderSelect).toHaveValue('male');
  });
});

// ─── API Payload Verification (mocked) ──────────────────

test.describe('管理员创建用户 — API 请求验证', () => {
  test('不勾选绘本时，请求不包含 generateBook 字段', async ({ page }) => {
    await loadAdmin(page);

    const captured: { body?: Record<string, unknown> } = {};
    await page.route('**/api/user/admin/users', async (route, request) => {
      if (request.method() === 'POST') {
        captured.body = JSON.parse(request.postData() || '{}');
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ user: { userID: 'test_no_book' }, firstLogin: true, themeFood: '胡萝卜', bookGenerating: false }),
        });
      } else {
        await route.continue();
      }
    });

    const form = getForm(page);
    await form.locator('input[placeholder="例如: child01"]').fill('test_no_book');
    await form.locator('input[placeholder="登录密码"]').fill('pw123');
    await page.locator('button').filter({ hasText: '创建' }).click();

    // Wait for the request to complete (form resets on success)
    await expect(form.locator('input[placeholder="例如: child01"]')).toHaveValue('', { timeout: 5_000 });

    expect(captured.body).toBeDefined();
    expect(captured.body!.generateBook).toBeUndefined();
    expect(captured.body!.nickname).toBeUndefined();
    expect(captured.body!.age).toBeUndefined();
    expect(captured.body!.gender).toBeUndefined();
    expect(captured.body!.customPrompt).toBeUndefined();
  });

  test('勾选绘本时，请求包含 generateBook/nickname/age/gender', async ({ page }) => {
    await loadAdmin(page);

    const captured: { body?: Record<string, unknown> } = {};
    await page.route('**/api/user/admin/users', async (route, request) => {
      if (request.method() === 'POST') {
        captured.body = JSON.parse(request.postData() || '{}');
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ user: { userID: 'test_with_book' }, firstLogin: true, themeFood: '胡萝卜', bookGenerating: true }),
        });
      } else {
        await route.continue();
      }
    });

    const form = getForm(page);
    await form.locator('input[placeholder="例如: child01"]').fill('test_with_book');
    await form.locator('input[placeholder="登录密码"]').fill('pw123');

    // Enable generateBook
    await page.locator('text=同时生成默认绘本').click();
    await form.locator('input[placeholder="留空则使用用户ID"]').fill('小明');
    // Change age to 7
    const ageInput = form.locator('input[type="number"]');
    await ageInput.fill('7');
    // Change gender to female
    await form.locator('select').selectOption('female');

    await page.locator('button').filter({ hasText: '创建' }).click();
    await expect(form.locator('input[placeholder="例如: child01"]')).toHaveValue('', { timeout: 5_000 });

    expect(captured.body).toBeDefined();
    expect(captured.body!.generateBook).toBe(true);
    expect(captured.body!.nickname).toBe('小明');
    expect(captured.body!.age).toBe(7);
    expect(captured.body!.gender).toBe('female');
  });

  test('昵称留空时默认使用用户ID', async ({ page }) => {
    await loadAdmin(page);

    const captured: { body?: Record<string, unknown> } = {};
    await page.route('**/api/user/admin/users', async (route, request) => {
      if (request.method() === 'POST') {
        captured.body = JSON.parse(request.postData() || '{}');
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ user: { userID: 'test_default_nick' }, firstLogin: true, themeFood: '胡萝卜', bookGenerating: true }),
        });
      } else {
        await route.continue();
      }
    });

    const form = getForm(page);
    await form.locator('input[placeholder="例如: child01"]').fill('test_default_nick');
    await form.locator('input[placeholder="登录密码"]').fill('pw123');
    await page.locator('text=同时生成默认绘本').click();
    // Leave nickname empty

    await page.locator('button').filter({ hasText: '创建' }).click();
    await expect(form.locator('input[placeholder="例如: child01"]')).toHaveValue('', { timeout: 5_000 });

    // Frontend sends empty string for nickname; backend fills userID
    expect(captured.body!.generateBook).toBe(true);
    expect(captured.body!.nickname).toBe('test_default_nick');
  });

  test('自定义 Prompt 可选 — 填写时发送，不填写时不发送', async ({ page }) => {
    await loadAdmin(page);

    const captured: { body?: Record<string, unknown> } = {};
    await page.route('**/api/user/admin/users', async (route, request) => {
      if (request.method() === 'POST') {
        captured.body = JSON.parse(request.postData() || '{}');
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ user: { userID: 'test_prompt' }, firstLogin: true, themeFood: '胡萝卜', bookGenerating: true }),
        });
      } else {
        await route.continue();
      }
    });

    const form = getForm(page);
    await form.locator('input[placeholder="例如: child01"]').fill('test_prompt');
    await form.locator('input[placeholder="登录密码"]').fill('pw123');
    await page.locator('text=同时生成默认绘本').click();
    await form.locator('textarea').fill('请用恐龙角色讲故事');

    await page.locator('button').filter({ hasText: '创建' }).click();
    await expect(form.locator('input[placeholder="例如: child01"]')).toHaveValue('', { timeout: 5_000 });

    expect(captured.body!.customPrompt).toBe('请用恐龙角色讲故事');
  });

  test('自定义 Prompt 为空时不包含在请求中', async ({ page }) => {
    await loadAdmin(page);

    const captured: { body?: Record<string, unknown> } = {};
    await page.route('**/api/user/admin/users', async (route, request) => {
      if (request.method() === 'POST') {
        captured.body = JSON.parse(request.postData() || '{}');
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ user: { userID: 'test_no_prompt' }, firstLogin: true, themeFood: '胡萝卜', bookGenerating: true }),
        });
      } else {
        await route.continue();
      }
    });

    const form = getForm(page);
    await form.locator('input[placeholder="例如: child01"]').fill('test_no_prompt');
    await form.locator('input[placeholder="登录密码"]').fill('pw123');
    await page.locator('text=同时生成默认绘本').click();
    // Leave prompt empty

    await page.locator('button').filter({ hasText: '创建' }).click();
    await expect(form.locator('input[placeholder="例如: child01"]')).toHaveValue('', { timeout: 5_000 });

    expect(captured.body!.customPrompt).toBeUndefined();
  });
});

// ─── Form Reset ──────────────────────────────────────────

test.describe('管理员创建用户 — 表单重置', () => {
  test('创建成功后所有绘本字段重置', async ({ page }) => {
    await loadAdmin(page);

    await page.route('**/api/user/admin/users', async (route, request) => {
      if (request.method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ user: { userID: 'test_reset' }, firstLogin: true, themeFood: '胡萝卜', bookGenerating: true }),
        });
      } else {
        await route.continue();
      }
    });

    const form = getForm(page);
    await form.locator('input[placeholder="例如: child01"]').fill('test_reset');
    await form.locator('input[placeholder="登录密码"]').fill('pw123');
    await page.locator('text=同时生成默认绘本').click();
    await form.locator('input[placeholder="留空则使用用户ID"]').fill('小红');
    await form.locator('input[type="number"]').fill('8');
    await form.locator('select').selectOption('female');
    await form.locator('textarea').fill('测试提示词');

    await page.locator('button').filter({ hasText: '创建' }).click();

    // Wait for form reset
    await expect(form.locator('input[placeholder="例如: child01"]')).toHaveValue('', { timeout: 5_000 });
    await expect(form.locator('input[placeholder="登录密码"]')).toHaveValue('');

    // Checkbox should be unchecked and book fields hidden
    const checkbox = form.locator('input[type="checkbox"]');
    await expect(checkbox).not.toBeChecked();
    await expect(page.locator('text=姓名（昵称）')).not.toBeVisible();
  });
});

// ─── Real Backend Integration ────────────────────────────

test.describe('管理员创建用户 — 后端集成', () => {
  const TEST_USER = 'e2e_book_test_' + Date.now();

  test.afterAll(async ({ browser }) => {
    // Cleanup: delete the test user
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/noa/admin/users');
    await page.locator('input[type="password"]').fill(ADMIN_KEY);
    await page.locator('button').filter({ hasText: '加载数据' }).click();

    const row = page.locator('tr').filter({ hasText: TEST_USER });
    if (await row.isVisible({ timeout: 3_000 }).catch(() => false)) {
      page.on('dialog', (d) => d.accept());
      await row.locator('button').filter({ hasText: '删除' }).click();
      await expect(row).not.toBeVisible({ timeout: 5_000 });
    }
    await ctx.close();
  });

  test('勾选绘本创建用户 — 后端返回 bookGenerating: true', async ({ page }) => {
    await loadAdmin(page);

    const form = getForm(page);
    await form.locator('input[placeholder="例如: child01"]').fill(TEST_USER);
    await form.locator('input[placeholder="登录密码"]').fill('testpw');

    await page.locator('text=同时生成默认绘本').click();
    await form.locator('input[placeholder="留空则使用用户ID"]').fill('测试宝宝');
    await form.locator('input[type="number"]').fill('6');
    await form.locator('select').selectOption('female');

    await page.locator('button').filter({ hasText: '创建' }).click();

    // User should appear in the table
    await expect(page.locator('td').filter({ hasText: TEST_USER })).toBeVisible({ timeout: 5_000 });
  });

  test('不勾选绘本创建用户 — 正常创建', async ({ page }) => {
    const user2 = TEST_USER + '_nb';
    await loadAdmin(page);

    const form = getForm(page);
    await form.locator('input[placeholder="例如: child01"]').fill(user2);
    await form.locator('input[placeholder="登录密码"]').fill('testpw');
    // Don't check generateBook

    await page.locator('button').filter({ hasText: '创建' }).click();
    await expect(page.locator('td').filter({ hasText: user2 })).toBeVisible({ timeout: 5_000 });

    // Cleanup
    page.on('dialog', (d) => d.accept());
    const row = page.locator('tr').filter({ hasText: user2 });
    await row.locator('button').filter({ hasText: '删除' }).click();
    await expect(row).not.toBeVisible({ timeout: 5_000 });
  });
});
