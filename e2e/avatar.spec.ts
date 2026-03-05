import { test, expect, Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/noa/login');
  await page.locator('input[autocomplete="username"]').fill('demo');
  await page.locator('input[type="password"]').fill('demo123');
  await page.locator('button[type="submit"]').click();

  // 等待跳转到 avatar 或 home（两种情况都合法）
  await page.waitForURL(/\/(noa\/avatar|noa\/home)/, { timeout: 10_000 });

  if (!page.url().includes('/noa/avatar')) {
    // 已有 avatar 的用户直接跳到 home，手动导航到 avatar 页
    await page.goto('/noa/avatar');
  }
}

test.describe('虚拟形象设置', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('页面显示正确的标题', async ({ page }) => {
    // AvatarPage shows "创建你的专属形象" in the sticky header
    await expect(page.locator('text=创建你的专属形象')).toBeVisible();
    // Numbered sections for basic info and customization
    await expect(page.locator('text=基本信息')).toBeVisible();
    await expect(page.locator('text=形象定制')).toBeVisible();
  });

  test('输入昵称、选择性别后提交跳转到 /noa/home', async ({ page }) => {
    // Wait for avatar options to load
    await expect(page.locator('text=基本信息')).toBeVisible();

    // Fill nickname — input has placeholder, is NOT wrapped by a <label>
    await page.locator('input[placeholder="给自己起一个昵称"]').fill('测试小朋友');

    // Select gender — now rendered as <button> with text "男孩" / "女孩"
    await page.locator('button').filter({ hasText: '男孩' }).first().click();

    // Submit
    await page.locator('button[type="submit"]').click();

    // Should navigate to /noa/home
    await expect(page).toHaveURL(/\/noa\/home/, { timeout: 10_000 });
  });
});
