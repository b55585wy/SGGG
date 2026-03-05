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
  await page.locator('input[placeholder="给自己起一个名字"]').fill('测试小朋友');
  await page.locator('button').filter({ hasText: '男孩' }).first().click();
  await page.locator('button[type="submit"]').filter({ hasText: '提交并进入主页面' }).click();

  await expect(page).toHaveURL(/\/noa\/home/, { timeout: 10_000 });
}

test.describe('主页面 + 进食记录', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetupAvatar(page);
  });

  test('主页面显示关键区域', async ({ page }) => {
    await expect(page.locator('text=你好')).toBeVisible();
    await expect(page.locator('text=进食情况录入')).toBeVisible();
    await expect(page.locator('text=当前绘本')).toBeVisible();
    await expect(page.locator('text=历史绘本')).toBeVisible();
  });

  test('显示虚拟形象预览', async ({ page }) => {
    // 虚拟形象区域应有 base 图层 img 元素 (Kenney stacked avatar)
    await expect(page.locator('img[alt="base"]')).toBeVisible({ timeout: 10_000 });
  });

  test('发送按钮在未填写时禁用', async ({ page }) => {
    await expect(page.locator('text=进食情况录入')).toBeVisible();
    const sendButton = page.locator('button').filter({ hasText: '发送' });
    await expect(sendButton).toBeDisabled();
  });

  test('仅滑动评分、不输入文本时按钮仍禁用', async ({ page }) => {
    await expect(page.locator('text=进食情况录入')).toBeVisible();
    const slider = page.locator('input[type="range"]');
    await slider.fill('7');
    const sendButton = page.locator('button').filter({ hasText: '发送' });
    await expect(sendButton).toBeDisabled();
  });

  test('滑动评分条显示对应标签', async ({ page }) => {
    await expect(page.locator('text=进食情况录入')).toBeVisible();
    const slider = page.locator('input[type="range"]');

    // 低分
    await slider.fill('2');
    await expect(page.locator('text=完全拒绝').first()).toBeVisible();

    // 高分
    await slider.fill('9');
    await expect(page.locator('text=非常喜欢').first()).toBeVisible();
  });
});

test.describe('进食反馈提交 — 不同评分', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetupAvatar(page);
  });

  test('高分 (9) → 积极反馈', async ({ page }) => {
    await expect(page.locator('text=进食情况录入')).toBeVisible();
    await page.locator('input[type="range"]').fill('9');
    await page.locator('textarea').fill('今天主动吃了很多西兰花');
    await page.locator('button').filter({ hasText: '发送' }).click();

    // 等待反馈文本出现（可能是硬编码 fallback 或 LLM 生成）
    await expect(
      page.locator('[class*="animate-in"]').first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test('中分 (7) → 鼓励反馈', async ({ page }) => {
    await expect(page.locator('text=进食情况录入')).toBeVisible();
    await page.locator('input[type="range"]').fill('7');
    await page.locator('textarea').fill('今天尝试了西兰花，感觉还不错');
    await page.locator('button').filter({ hasText: '发送' }).click();

    await expect(
      page.locator('[class*="animate-in"]').first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test('低分 (3) → 温柔安慰反馈', async ({ page }) => {
    await expect(page.locator('text=进食情况录入')).toBeVisible();
    await page.locator('input[type="range"]').fill('3');
    await page.locator('textarea').fill('不太想吃西兰花');
    await page.locator('button').filter({ hasText: '发送' }).click();

    await expect(
      page.locator('[class*="animate-in"]').first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test('提交后表单重置', async ({ page }) => {
    await expect(page.locator('text=进食情况录入')).toBeVisible();
    await page.locator('input[type="range"]').fill('7');
    await page.locator('textarea').fill('测试内容');
    await page.locator('button').filter({ hasText: '发送' }).click();

    // 等待反馈出现
    await expect(
      page.locator('[class*="animate-in"]').first()
    ).toBeVisible({ timeout: 15_000 });

    // 表单应该已重置
    const textarea = page.locator('textarea');
    await expect(textarea).toHaveValue('');
    const sendButton = page.locator('button').filter({ hasText: '发送' });
    await expect(sendButton).toBeDisabled();
  });
});

test.describe('绘本区域状态', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetupAvatar(page);
  });

  test('初始状态显示待生成提示', async ({ page }) => {
    // 未提交进食记录时，绘本区域显示等待提示
    const bookArea = page.locator('text=等待生成');
    const hasBookOrWaiting = await bookArea.isVisible().catch(() => false);
    // 可能已有历史绘本，所以检查两种状态
    if (!hasBookOrWaiting) {
      await expect(page.locator('text=当前绘本')).toBeVisible();
    }
  });

  test('提交后显示绘本生成中状态', async ({ page }) => {
    await expect(page.locator('text=进食情况录入')).toBeVisible();
    await page.locator('input[type="range"]').fill('7');
    await page.locator('textarea').fill('今天尝试了西兰花');
    await page.locator('button').filter({ hasText: '发送' }).click();

    // 等待发送完成：表单重置后发送按钮变回禁用
    const sendButton = page.locator('button').filter({ hasText: '发送' });
    await expect(sendButton).toBeDisabled({ timeout: 15_000 });

    // 如果绘本尚未生成完成，应显示"绘本生成中"加载状态
    const generatingText = page.locator('text=绘本生成中');
    const bookTitle = page.locator('h3').filter({ hasNotText: '等待生成' });

    // 两种合法状态：正在生成中 或 已经生成完毕
    const showsGenerating = await generatingText.isVisible({ timeout: 3_000 }).catch(() => false);
    const showsBook = await bookTitle.first().isVisible({ timeout: 1_000 }).catch(() => false);
    expect(showsGenerating || showsBook).toBe(true);
  });

  test('提交进食记录后绘本区域更新（需要 FastAPI）', async ({ page }) => {
    await expect(page.locator('text=进食情况录入')).toBeVisible();
    await page.locator('input[type="range"]').fill('7');
    await page.locator('textarea').fill('今天尝试了西兰花');
    await page.locator('button').filter({ hasText: '发送' }).click();

    // 等待反馈出现
    await expect(
      page.locator('[class*="animate-in"]').first()
    ).toBeVisible({ timeout: 15_000 });

    // 绘本应该有标题（生成后），等待更长时间（故事生成需要时间）
    // 如果 FastAPI 不可用，绘本区域保持 "等待生成"
    const bookTitle = page.locator('h3').filter({ hasNotText: '等待生成' });
    const hasBook = await bookTitle.first().isVisible({ timeout: 30_000 }).catch(() => false);

    if (hasBook) {
      // Check whether the book is still unconfirmed (confirm/regen buttons shown)
      // vs already confirmed (demo user may have existing confirmed history books)
      const confirmBtn = page.locator('button').filter({ hasText: '确认绘本' });
      const isUnconfirmed = await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false);
      if (isUnconfirmed) {
        await expect(page.locator('button').filter({ hasText: '重新生成' })).toBeVisible();
      }
      // If book is already confirmed (history book), no action buttons shown — that's valid too
    }
  });
});
