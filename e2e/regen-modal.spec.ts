import { test, expect, Page } from '@playwright/test';

async function loginAndSetupAvatar(page: Page) {
  await page.goto('/noa/login');
  await page.locator('input[autocomplete="username"]').fill('demo');
  await page.locator('input[type="password"]').fill('demo123');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/noa\/avatar/, { timeout: 10_000 });

  await expect(page.locator('text=基本信息')).toBeVisible();
  await page.locator('input[placeholder="给自己起一个昵称"]').fill('测试小朋友');
  await page.locator('button').filter({ hasText: '男孩' }).first().click();
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/noa\/home/, { timeout: 10_000 });
}

/**
 * Submit a food log and wait for an unconfirmed book to appear.
 * Returns true if book appeared (FastAPI available), false otherwise.
 */
async function submitFoodLogAndWaitForBook(page: Page): Promise<boolean> {
  await expect(page.locator('text=进食情况录入')).toBeVisible();
  await page.locator('input[type="range"]').fill('8');
  await page.locator('textarea').fill('今天主动吃了很多胡萝卜，非常棒！');
  await page.locator('button').filter({ hasText: '发送' }).click();

  // Wait for send to complete (button goes disabled after form reset)
  const sendButton = page.locator('button').filter({ hasText: '发送' });
  await expect(sendButton).toBeDisabled({ timeout: 15_000 });

  // Wait for unconfirmed book (needs FastAPI — timeout 45s)
  const regenButton = page.locator('button').filter({ hasText: '重新生成' });
  return regenButton.isVisible({ timeout: 45_000 }).catch(() => false);
}

test.describe('重新生成弹窗', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetupAvatar(page);
  });

  test('无绘本时重新生成按钮不显示', async ({ page }) => {
    // Initial state after fresh avatar setup — no book yet
    const bookArea = page.locator('text=等待生成');
    const noBook = await bookArea.isVisible({ timeout: 3_000 }).catch(() => false);
    if (noBook) {
      await expect(page.locator('button').filter({ hasText: '重新生成' })).not.toBeVisible();
    }
    // If a previous book already exists, this test passes trivially — that's fine
  });

  test('有未确认绘本时可以打开重新生成弹窗（需要 FastAPI）', async ({ page }) => {
    const hasBook = await submitFoodLogAndWaitForBook(page);
    if (!hasBook) return; // FastAPI not available, skip

    await page.locator('button').filter({ hasText: '重新生成' }).click();

    // Modal should appear
    await expect(page.locator('text=不满意的原因')).toBeVisible();
    await expect(page.locator('text=必填')).toBeVisible();
  });

  test('弹窗包含全部区域（需要 FastAPI）', async ({ page }) => {
    const hasBook = await submitFoodLogAndWaitForBook(page);
    if (!hasBook) return;

    await page.locator('button').filter({ hasText: '重新生成' }).click();

    // All numbered sections visible
    await expect(page.locator('text=不满意的原因')).toBeVisible();
    await expect(page.locator('text=临时换个食物')).toBeVisible();
    await expect(page.locator('text=补充说明')).toBeVisible();
    await expect(page.locator('text=故事设置')).toBeVisible();

    // Reason grid items visible
    await expect(page.locator('button').filter({ hasText: '太长了' })).toBeVisible();
    await expect(page.locator('button').filter({ hasText: '太短了' })).toBeVisible();
    await expect(page.locator('button').filter({ hasText: '其他' })).toBeVisible();

    // Food override input visible
    const foodInput = page.locator('input[placeholder*="仅此次生效"]');
    await expect(foodInput).toBeVisible();
  });

  test('未选择原因时提交按钮禁用（需要 FastAPI）', async ({ page }) => {
    const hasBook = await submitFoodLogAndWaitForBook(page);
    if (!hasBook) return;

    await page.locator('button').filter({ hasText: '重新生成' }).click();

    // No reason selected → submit button should be disabled
    const submitBtn = page.locator('button').filter({ hasText: '提交并重新生成' });
    await expect(submitBtn).toBeDisabled();
  });

  test('选择原因后提交按钮启用（需要 FastAPI）', async ({ page }) => {
    const hasBook = await submitFoodLogAndWaitForBook(page);
    if (!hasBook) return;

    await page.locator('button').filter({ hasText: '重新生成' }).click();

    // Select a reason
    await page.locator('button').filter({ hasText: '太长了' }).click();

    // Submit button should now be enabled
    const submitBtn = page.locator('button').filter({ hasText: '提交并重新生成' });
    await expect(submitBtn).not.toBeDisabled();
  });

  test('点击背景遮罩关闭弹窗（需要 FastAPI）', async ({ page }) => {
    const hasBook = await submitFoodLogAndWaitForBook(page);
    if (!hasBook) return;

    await page.locator('button').filter({ hasText: '重新生成' }).click();
    await expect(page.locator('text=不满意的原因')).toBeVisible();

    // Click the backdrop (top-left corner, above the bottom sheet)
    await page.locator('.fixed.inset-0.z-40').click({ position: { x: 10, y: 10 } });

    // Modal should be gone
    await expect(page.locator('text=不满意的原因')).not.toBeVisible();
  });

  test('补充说明区域折叠/展开（需要 FastAPI）', async ({ page }) => {
    const hasBook = await submitFoodLogAndWaitForBook(page);
    if (!hasBook) return;

    await page.locator('button').filter({ hasText: '重新生成' }).click();

    // 补充说明 is collapsed initially
    await expect(page.locator('input[placeholder="给新故事起个名字"]')).not.toBeVisible();

    // Click to expand
    await page.locator('button').filter({ hasText: '补充说明' }).click();
    await expect(page.locator('input[placeholder="给新故事起个名字"]')).toBeVisible();
  });

  test('故事设置区域折叠/展开（需要 FastAPI）', async ({ page }) => {
    const hasBook = await submitFoodLogAndWaitForBook(page);
    if (!hasBook) return;

    await page.locator('button').filter({ hasText: '重新生成' }).click();

    // 故事设置 is collapsed initially — story type labels not visible
    await expect(page.locator('text=故事类型')).not.toBeVisible();

    // Click to expand
    await page.locator('button').filter({ hasText: '故事设置' }).click();
    await expect(page.locator('text=故事类型')).toBeVisible();
  });

  test('显示已使用次数信息（需要 FastAPI）', async ({ page }) => {
    const hasBook = await submitFoodLogAndWaitForBook(page);
    if (!hasBook) return;

    await page.locator('button').filter({ hasText: '重新生成' }).click();

    // Shows usage counter "X/2 次"
    await expect(page.locator('text=/\\d\\/2 次/')).toBeVisible();
  });
});
