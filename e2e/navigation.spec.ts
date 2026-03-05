import { test, expect, Page } from '@playwright/test';

const protectedRoutes = [
  '/noa/avatar',
  '/noa/home',
  '/noa/books/create',
  '/noa/books/history',
  '/noa/books/some-book-id',
  '/reader',
];

async function loginAndSetupAvatar(page: Page) {
  await page.goto('/noa/login');
  await page.locator('input[autocomplete="username"]').fill('demo');
  await page.locator('input[type="password"]').fill('demo123');
  await page.locator('button[type="submit"]').click();

  await page.waitForURL(/\/(noa\/avatar|noa\/home)/, { timeout: 10_000 });

  if (page.url().includes('/noa/avatar')) {
    await expect(page.locator('text=基本信息')).toBeVisible();
    await page.locator('input[placeholder="给自己起一个昵称"]').fill('测试小朋友');
    await page.locator('button').filter({ hasText: '男孩' }).first().click();
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/noa\/home/, { timeout: 10_000 });
  }
}

test.describe('路由守卫 — 未登录', () => {
  for (const route of protectedRoutes) {
    test(`未登录访问 ${route} → 重定向到 /noa/login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/noa\/login/);
    });
  }

  test('未知路由重定向到 /noa/login', async ({ page }) => {
    await page.goto('/some/unknown/path');
    await expect(page).toHaveURL(/\/noa\/login/);
  });
});

test.describe('导航 — 已登录', () => {
  test('登录后可以访问 /noa/home', async ({ page }) => {
    await loginAndSetupAvatar(page);
    await expect(page.locator('text=你好')).toBeVisible();
  });

  test('/noa/books/history 页面可访问', async ({ page }) => {
    await loginAndSetupAvatar(page);

    await page.locator('button').filter({ hasText: '历史绘本' }).click();
    await expect(page).toHaveURL(/\/noa\/books\/history/);
  });
});
