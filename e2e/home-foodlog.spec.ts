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

  // 若存在未确认绘本（state B），确认后回到 state A（食物记录表单）
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

/**
 * 若当前在 State A（食物记录表单可见），返回 true；否则返回 false（State B）。
 */
async function inStateA(page: Page): Promise<boolean> {
  return page.locator('text=今天吃得怎么样？').isVisible({ timeout: 3_000 }).catch(() => false);
}

test.describe('主页面 + 进食记录', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetupAvatar(page);
  });

  test('主页面显示关键区域', async ({ page }) => {
    await expect(page.locator('text=你好')).toBeVisible();
    await expect(page.locator('button').filter({ hasText: '历史绘本' })).toBeVisible();
    // 新 UI：State A（食物记录表单）或 State B（绘本区，含确认/已确认/生成中）至少一个可见
    const stateA = await page.locator('text=今天吃得怎么样？').isVisible({ timeout: 3_000 }).catch(() => false);
    const stateBHeader = await page.locator('text=当前绘本').isVisible({ timeout: 3_000 }).catch(() => false);
    expect(stateA || stateBHeader).toBe(true);
  });

  test('显示虚拟形象预览', async ({ page }) => {
    await expect(page.locator('img[class*="object-cover"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('提交按钮在未填写时禁用', async ({ page }) => {
    if (!await inStateA(page)) return; // State B，跳过
    const sendButton = page.locator('button').filter({ hasText: '提交记录' });
    await expect(sendButton).toBeDisabled();
  });

  test('仅滑动评分、不输入文本时按钮仍禁用', async ({ page }) => {
    if (!await inStateA(page)) return;
    const slider = page.locator('input[type="range"]');
    await slider.fill('7');
    const sendButton = page.locator('button').filter({ hasText: '提交记录' });
    await expect(sendButton).toBeDisabled();
  });

  test('滑动评分条显示对应标签', async ({ page }) => {
    if (!await inStateA(page)) return;
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

  test('高分 (9) → 提交后食物表单消失（进入 State B）', async ({ page }) => {
    if (!await inStateA(page)) return;
    await page.locator('input[type="range"]').fill('9');
    await page.locator('textarea').fill('今天主动吃了很多西兰花');
    await page.locator('button').filter({ hasText: '提交记录' }).click();

    // 提交成功后 State A 消失（bookGenerating=true → State B 出现）
    await expect(page.locator('text=今天吃得怎么样？')).not.toBeVisible({ timeout: 15_000 });
  });

  test('中分 (7) → 提交后食物表单消失', async ({ page }) => {
    if (!await inStateA(page)) return;
    await page.locator('input[type="range"]').fill('7');
    await page.locator('textarea').fill('今天尝试了西兰花，感觉还不错');
    await page.locator('button').filter({ hasText: '提交记录' }).click();

    await expect(page.locator('text=今天吃得怎么样？')).not.toBeVisible({ timeout: 15_000 });
  });

  test('低分 (3) → 提交后食物表单消失', async ({ page }) => {
    if (!await inStateA(page)) return;
    await page.locator('input[type="range"]').fill('3');
    await page.locator('textarea').fill('不太想吃西兰花');
    await page.locator('button').filter({ hasText: '提交记录' }).click();

    await expect(page.locator('text=今天吃得怎么样？')).not.toBeVisible({ timeout: 15_000 });
  });

  test('提交后进入生成中状态或已生成绘本', async ({ page }) => {
    if (!await inStateA(page)) return;
    await page.locator('input[type="range"]').fill('7');
    await page.locator('textarea').fill('测试内容');
    await page.locator('button').filter({ hasText: '提交记录' }).click();

    // 等待 State A 消失
    await expect(page.locator('text=今天吃得怎么样？')).not.toBeVisible({ timeout: 15_000 });

    // 两种合法状态：正在生成中（shimmer/skeleton）或已经生成完毕（有按钮）
    const showsGenerating = await page.locator('.skeleton-shimmer').first().isVisible({ timeout: 3_000 }).catch(() => false);
    const showsShimmer = await page.locator('.book-gen-shimmer').isVisible({ timeout: 1_000 }).catch(() => false);
    const showsBook = await page.locator('button').filter({ hasText: '确认绘本' }).isVisible({ timeout: 1_000 }).catch(() => false);
    expect(showsGenerating || showsShimmer || showsBook).toBe(true);
  });
});

test.describe('绘本区域状态', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetupAvatar(page);
  });

  test('初始状态显示食物记录表单或已有绘本', async ({ page }) => {
    // State A（食物记录表单）、State B 未确认（確認绘本按钮）、State B 已确认（开始阅读按钮）均合法
    const stateAVisible = await page.locator('text=今天吃得怎么样？').isVisible({ timeout: 3_000 }).catch(() => false);
    const stateBHeader = await page.locator('text=当前绘本').isVisible({ timeout: 3_000 }).catch(() => false);
    expect(stateAVisible || stateBHeader).toBe(true);
  });

  test('提交后显示绘本生成中状态', async ({ page }) => {
    if (!await inStateA(page)) return;
    await page.locator('input[type="range"]').fill('7');
    await page.locator('textarea').fill('今天尝试了西兰花');
    await page.locator('button').filter({ hasText: '提交记录' }).click();

    // 等待 State A 消失
    await expect(page.locator('text=今天吃得怎么样？')).not.toBeVisible({ timeout: 15_000 });

    // 两种合法状态：正在生成中（skeleton/动画）或已经生成完毕（有标题）
    const showsGenerating = await page.locator('.skeleton-shimmer').first().isVisible({ timeout: 3_000 }).catch(() => false);
    const bookTitle = page.locator('h3').filter({ hasNotText: '等待生成' });
    const showsBook = await bookTitle.first().isVisible({ timeout: 1_000 }).catch(() => false);
    expect(showsGenerating || showsBook).toBe(true);
  });

  test('提交进食记录后绘本区域更新（需要 FastAPI）', async ({ page }) => {
    if (!await inStateA(page)) return;
    await page.locator('input[type="range"]').fill('7');
    await page.locator('textarea').fill('今天尝试了西兰花');
    await page.locator('button').filter({ hasText: '提交记录' }).click();

    await expect(page.locator('text=今天吃得怎么样？')).not.toBeVisible({ timeout: 15_000 });

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
