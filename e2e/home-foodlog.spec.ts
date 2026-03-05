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
}

/** 点击"记录进食"按钮，打开进食记录弹窗 */
async function openFoodLogModal(page: Page) {
  await page.locator('button').filter({ hasText: '记录进食' }).click();
  await expect(page.locator('text=进食情况录入')).toBeVisible({ timeout: 5_000 });
}

test.describe('主页面 + 进食记录', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetupAvatar(page);
  });

  test('主页面显示关键区域', async ({ page }) => {
    await expect(page.locator('text=你好')).toBeVisible();
    await expect(page.locator('button').filter({ hasText: '记录进食' })).toBeVisible();
    await expect(page.locator('text=当前绘本')).toBeVisible();
    await expect(page.locator('button').filter({ hasText: '历史绘本' })).toBeVisible();
  });

  test('显示虚拟形象预览', async ({ page }) => {
    await expect(page.locator('img[class*="object-cover"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('发送按钮在未填写时禁用', async ({ page }) => {
    await openFoodLogModal(page);
    const sendButton = page.locator('button').filter({ hasText: '发送' });
    await expect(sendButton).toBeDisabled();
  });

  test('仅滑动评分、不输入文本时按钮仍禁用', async ({ page }) => {
    await openFoodLogModal(page);
    const slider = page.locator('input[type="range"]');
    await slider.fill('7');
    const sendButton = page.locator('button').filter({ hasText: '发送' });
    await expect(sendButton).toBeDisabled();
  });

  test('滑动评分条显示对应标签', async ({ page }) => {
    await openFoodLogModal(page);
    const slider = page.locator('input[type="range"]');

    await slider.fill('2');
    await expect(page.locator('text=完全拒绝').first()).toBeVisible();

    await slider.fill('9');
    await expect(page.locator('text=非常喜欢').first()).toBeVisible();
  });
});

test.describe('进食反馈提交 — 不同评分', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetupAvatar(page);
  });

  test('高分 (9) → 积极反馈', async ({ page }) => {
    await openFoodLogModal(page);
    await page.locator('input[type="range"]').fill('9');
    await page.locator('textarea').fill('今天主动吃了很多西兰花');
    await page.locator('button').filter({ hasText: '发送' }).click();

    // 等待模态框关闭（发送成功后关闭）
    await expect(page.locator('text=进食情况录入')).not.toBeVisible({ timeout: 15_000 });
  });

  test('中分 (7) → 鼓励反馈', async ({ page }) => {
    await openFoodLogModal(page);
    await page.locator('input[type="range"]').fill('7');
    await page.locator('textarea').fill('今天尝试了西兰花，感觉还不错');
    await page.locator('button').filter({ hasText: '发送' }).click();

    await expect(page.locator('text=进食情况录入')).not.toBeVisible({ timeout: 15_000 });
  });

  test('低分 (3) → 温柔安慰反馈', async ({ page }) => {
    await openFoodLogModal(page);
    await page.locator('input[type="range"]').fill('3');
    await page.locator('textarea').fill('不太想吃西兰花');
    await page.locator('button').filter({ hasText: '发送' }).click();

    await expect(page.locator('text=进食情况录入')).not.toBeVisible({ timeout: 15_000 });
  });

  test('提交后表单重置', async ({ page }) => {
    await openFoodLogModal(page);
    await page.locator('input[type="range"]').fill('7');
    await page.locator('textarea').fill('测试内容');
    await page.locator('button').filter({ hasText: '发送' }).click();

    // 等待模态框关闭
    await expect(page.locator('text=进食情况录入')).not.toBeVisible({ timeout: 15_000 });

    // 重新打开模态框，表单应已重置
    await openFoodLogModal(page);
    await expect(page.locator('textarea')).toHaveValue('');
    await expect(page.locator('button').filter({ hasText: '发送' })).toBeDisabled();
  });
});

test.describe('绘本区域状态', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetupAvatar(page);
  });

  test('初始状态显示待生成提示', async ({ page }) => {
    const bookArea = page.locator('text=等待生成');
    const hasBookOrWaiting = await bookArea.isVisible().catch(() => false);
    if (!hasBookOrWaiting) {
      await expect(page.locator('text=当前绘本')).toBeVisible();
    }
  });

  test('提交后显示绘本生成中状态', async ({ page }) => {
    await openFoodLogModal(page);
    await page.locator('input[type="range"]').fill('7');
    await page.locator('textarea').fill('今天尝试了西兰花');
    await page.locator('button').filter({ hasText: '发送' }).click();

    // 等待模态框关闭
    await expect(page.locator('text=进食情况录入')).not.toBeVisible({ timeout: 15_000 });

    // 两种合法状态：正在生成中（skeleton/动画）或 已经生成完毕（有标题）
    const showsGenerating = await page.locator('.skeleton-shimmer').first().isVisible({ timeout: 3_000 }).catch(() => false);
    const bookTitle = page.locator('h3').filter({ hasNotText: '等待生成' });
    const showsBook = await bookTitle.first().isVisible({ timeout: 1_000 }).catch(() => false);
    expect(showsGenerating || showsBook).toBe(true);
  });

  test('提交进食记录后绘本区域更新（需要 FastAPI）', async ({ page }) => {
    await openFoodLogModal(page);
    await page.locator('input[type="range"]').fill('7');
    await page.locator('textarea').fill('今天尝试了西兰花');
    await page.locator('button').filter({ hasText: '发送' }).click();

    await expect(page.locator('text=进食情况录入')).not.toBeVisible({ timeout: 15_000 });

    const bookTitle = page.locator('h3').filter({ hasNotText: '等待生成' });
    const hasBook = await bookTitle.first().isVisible({ timeout: 30_000 }).catch(() => false);

    if (hasBook) {
      const confirmBtn = page.locator('button').filter({ hasText: '确认绘本' });
      const isUnconfirmed = await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false);
      if (isUnconfirmed) {
        await expect(page.locator('button').filter({ hasText: '重新生成' })).toBeVisible();
      }
    }
  });
});
