import { test, expect, Page } from '@playwright/test';

/**
 * 登录 + 设置 avatar，到达 /noa/home
 */
async function loginAndSetupAvatar(page: Page) {
  await page.goto('/noa/login');
  await page.locator('input[autocomplete="username"]').fill('demo');
  await page.locator('input[type="password"]').fill('demo123');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/noa\/avatar/, { timeout: 10_000 });

  // 设置 avatar
  await expect(page.locator('text=基本信息')).toBeVisible();
  const nicknameInput = page.locator('label').filter({ hasText: '昵称' }).locator('input');
  await nicknameInput.fill('测试小朋友');
  await page.locator('label').filter({ hasText: '男' }).first().click();
  await page.locator('button[type="submit"]').filter({ hasText: '提交并进入主页面' }).click();

  await expect(page).toHaveURL(/\/noa\/home/, { timeout: 10_000 });
}

test.describe('主页面 + 进食记录', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetupAvatar(page);
  });

  test('主页面显示关键区域', async ({ page }) => {
    await expect(page.locator('text=主页面')).toBeVisible();
    await expect(page.locator('text=进食情况录入')).toBeVisible();
    await expect(page.locator('text=绘本封面')).toBeVisible();
    await expect(page.locator('text=历史绘本')).toBeVisible();
  });

  test('显示虚拟形象预览', async ({ page }) => {
    // 虚拟形象区域应有 img 元素
    await expect(page.locator('img[alt="base"]')).toBeVisible({ timeout: 10_000 });
  });

  test('滑动评分条 + 输入进食反馈 + 发送', async ({ page }) => {
    // 等待页面加载
    await expect(page.locator('text=进食情况录入')).toBeVisible();

    // 滑动评分条 — 用 fill 设置 range input 的值
    const slider = page.locator('input[type="range"]');
    await slider.fill('7');

    // 输入进食反馈
    const textarea = page.locator('textarea');
    await textarea.fill('今天尝试了西兰花，感觉还不错');

    // 点击发送
    await page.locator('button').filter({ hasText: '发送' }).click();

    // 等待反馈文本出现（正反馈语展示区域应该被替换为实际反馈文本）
    // 反馈文本是 feedbackText，根据 score 会显示不同消息
    await expect(
      page.locator('text=正反馈语展示区域')
    ).not.toBeVisible({ timeout: 15_000 });
  });

  test('发送按钮在未填写时禁用', async ({ page }) => {
    await expect(page.locator('text=进食情况录入')).toBeVisible();

    const sendButton = page.locator('button').filter({ hasText: '发送' });
    await expect(sendButton).toBeDisabled();
  });
});
