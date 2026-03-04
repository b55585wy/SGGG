import { test, expect } from '@playwright/test';

test.describe('登录流程', () => {
  test('访问 / 重定向到 /noa/login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/noa\/login/);
  });

  test('未登录访问 /noa/home 重定向到 /noa/login', async ({ page }) => {
    await page.goto('/noa/home');
    await expect(page).toHaveURL(/\/noa\/login/);
  });

  test('登录页面显示正确的表单', async ({ page }) => {
    await page.goto('/noa/login');

    await expect(page.locator('h1')).toHaveText('登录');
    await expect(page.locator('text=用户ID')).toBeVisible();
    await expect(page.locator('text=密码')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toHaveText('登录');
  });

  test('输入错误密码显示错误消息', async ({ page }) => {
    await page.goto('/noa/login');

    await page.locator('input[autocomplete="username"]').fill('demo');
    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('text=账号或密码错误')).toBeVisible();
  });

  test('使用 demo/demo123 登录成功跳转到 /noa/avatar', async ({ page }) => {
    await page.goto('/noa/login');

    await page.locator('input[autocomplete="username"]').fill('demo');
    await page.locator('input[type="password"]').fill('demo123');
    await page.locator('button[type="submit"]').click();

    // demo 用户 firstLogin=true，应跳转到 /noa/avatar
    await expect(page).toHaveURL(/\/noa\/avatar/, { timeout: 10_000 });
  });
});
