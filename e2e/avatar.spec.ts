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
    await expect(page.locator('text=来一起创造你在故事世界的形象吧！')).toBeVisible();
    await expect(page.locator('text=请先完成昵称与性别，再选择形象组件')).toBeVisible();
  });

  test('输入昵称、选择性别后提交跳转到 /noa/home', async ({ page }) => {
    // 等待页面加载完成（avatar options loaded）
    await expect(page.locator('text=基本信息')).toBeVisible();

    // 输入昵称
    const nicknameInput = page.locator('label').filter({ hasText: '昵称' }).locator('input');
    await nicknameInput.fill('测试小朋友');

    // 选择性别 - 点击"男"按钮
    await page.locator('label').filter({ hasText: '男' }).first().click();

    // 点击提交
    await page.locator('button[type="submit"]').filter({ hasText: '提交并进入主页面' }).click();

    // 应跳转到 /noa/home
    await expect(page).toHaveURL(/\/noa\/home/, { timeout: 10_000 });
  });
});
