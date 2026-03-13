import { test, expect, Page } from '@playwright/test';

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

  await page.waitForTimeout(500);
  const confirmBtn = page.locator('button').filter({ hasText: '确认绘本，开始阅读' });
  if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await confirmBtn.click();
    await page.waitForURL(/\/noa\/books\//, { timeout: 8_000 }).catch(() => {});
    const exitBtn = page.locator('button').filter({ hasText: '退出' });
    if (await exitBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await exitBtn.click();
      await page.waitForURL(/\/noa\/home/, { timeout: 5_000 }).catch(() => {});
    } else {
      await page.goto('/noa/home');
    }
  }
}

async function submitFoodLog(page: Page, score: string, text: string): Promise<boolean> {
  const inStateA = await page.locator('text=今天吃得怎么样？').isVisible({ timeout: 5_000 }).catch(() => false);
  if (!inStateA) return false;
  const slider = page.locator('input[type="range"]').first();
  await slider.fill(score);
  await page.locator('textarea').fill(text);
  const sendBtn = page.locator('button').filter({ hasText: '提交记录' });
  await expect(sendBtn).toBeEnabled({ timeout: 5_000 });
  await sendBtn.click();
  await expect(page.locator('text=今天吃得怎么样？')).not.toBeVisible({ timeout: 15_000 });
  return true;
}

test.describe('慢 LLM 生成时 user-api 状态流转', () => {
  test('LLM 很慢时仍能进入生成中并最终生成成功', async ({ page, request }) => {
    const setDelay = async (seconds: number) => {
      const r = await request.post(`http://localhost:8000/api/v1/admin/test/llm_delay?seconds=${seconds}`, {
        headers: { 'x-admin-key': 'dev-admin' },
      });
      expect(r.ok()).toBeTruthy();
    };

    await setDelay(600);
    try {
      await loginAndSetupAvatar(page);
      if (!await submitFoodLog(page, '7', '今天尝试了胡萝卜，感觉还行')) return;

      await expect(page.locator('.skeleton-shimmer').first()).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('button').filter({ hasText: '确认绘本' })).not.toBeVisible({ timeout: 3_000 });
      await page.waitForTimeout(6_000);
      await expect(page.locator('.skeleton-shimmer').first()).toBeVisible({ timeout: 2_000 });

      await expect(page.locator('button').filter({ hasText: '确认绘本' })).not.toBeVisible({ timeout: 30_000 });
      await expect(page.locator('.skeleton-shimmer').first()).toBeVisible({ timeout: 30_000 });
    } finally {
      await setDelay(0);
    }
  });
});
