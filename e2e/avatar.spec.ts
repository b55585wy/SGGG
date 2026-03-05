import { test, expect, Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/noa/login');
  await page.locator('input[autocomplete="username"]').fill('demo');
  await page.locator('input[type="password"]').fill('demo123');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/noa\/avatar/, { timeout: 10_000 });
}

test.describe('虚拟形象设置', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('页面显示正确的标题', async ({ page }) => {
    // New AvatarPage shows "创建形象" in the sticky header
    await expect(page.locator('text=创建形象')).toBeVisible();
    // Numbered sections for basic info and customization
    await expect(page.locator('text=基本信息')).toBeVisible();
    await expect(page.locator('text=形象定制')).toBeVisible();
  });

  test('输入昵称、选择性别后提交跳转到 /noa/home', async ({ page }) => {
    // Wait for avatar options to load
    await expect(page.locator('text=基本信息')).toBeVisible();

    // Fill nickname — input has placeholder, is NOT wrapped by a <label>
    await page.locator('input[placeholder="给自己起一个名字"]').fill('测试小朋友');

    // Select gender — now rendered as <button> with text "男孩" / "女孩"
    await page.locator('button').filter({ hasText: '男孩' }).first().click();

    // Submit
    await page.locator('button[type="submit"]').filter({ hasText: '提交并进入主页面' }).click();

    // Should navigate to /noa/home
    await expect(page).toHaveURL(/\/noa\/home/, { timeout: 10_000 });
  });
});
