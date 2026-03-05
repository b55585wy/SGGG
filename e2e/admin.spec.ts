import { test, expect } from '@playwright/test';

const ADMIN_KEY = process.env.ADMIN_API_KEY || '6566697232';

test.describe('管理员后台', () => {
  test('页面加载显示正确的标题和表单', async ({ page }) => {
    await page.goto('/noa/admin/users');

    await expect(page.locator('h1')).toHaveText('管理员后台');
    await expect(page.locator('text=管理员密钥')).toBeVisible();
    await expect(page.getByRole('button', { name: '加载数据' })).toBeVisible();
  });

  test('未输入密钥时，加载数据按钮禁用', async ({ page }) => {
    await page.goto('/noa/admin/users');

    const queryBtn = page.locator('button').filter({ hasText: '加载数据' });
    await expect(queryBtn).toBeDisabled();
  });

  test('空表格显示"暂无数据"', async ({ page }) => {
    await page.goto('/noa/admin/users');

    await expect(page.locator('text=暂无数据')).toBeVisible();
  });

  test('输入错误密钥加载数据显示错误', async ({ page }) => {
    await page.goto('/noa/admin/users');

    await page.locator('input[type="password"]').fill('wrong-key');
    await page.locator('button').filter({ hasText: '加载数据' }).click();

    await expect(page.locator('text=无权限')).toBeVisible({ timeout: 5_000 });
  });

  test('输入正确密钥加载统计和用户列表', async ({ page }) => {
    await page.goto('/noa/admin/users');

    await page.locator('input[type="password"]').fill(ADMIN_KEY);
    await page.locator('button').filter({ hasText: '加载数据' }).click();

    // 统计卡片应显示
    await expect(page.locator('text=用户总数')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=参与度漏斗')).toBeVisible();

    // demo 用户应在表格中
    await expect(page.locator('td').filter({ hasText: 'demo' })).toBeVisible();
  });

  test('创建新用户并在列表中显示', async ({ page }) => {
    await page.goto('/noa/admin/users');

    // 先输入管理员密钥并加载
    await page.locator('input[type="password"]').fill(ADMIN_KEY);
    await page.locator('button').filter({ hasText: '加载数据' }).click();
    await expect(page.locator('td').filter({ hasText: 'demo' })).toBeVisible({ timeout: 5_000 });

    // 填写创建表单
    const form = page.locator('text=创建新用户').locator('..');
    await form.locator('input[placeholder="例如: child01"]').fill('e2e_test_user');
    await form.locator('input[placeholder="登录密码"]').fill('pass123');
    await form.locator('input[placeholder="胡萝卜"]').clear();
    await form.locator('input[placeholder="胡萝卜"]').fill('西兰花');

    await page.locator('button').filter({ hasText: '创建' }).click();

    // 新用户应出现在列表中
    await expect(page.locator('td').filter({ hasText: 'e2e_test_user' })).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('td').filter({ hasText: '西兰花' })).toBeVisible();
  });

  test('删除用户后从列表中消失', async ({ page }) => {
    await page.goto('/noa/admin/users');

    // 加载
    await page.locator('input[type="password"]').fill(ADMIN_KEY);
    await page.locator('button').filter({ hasText: '加载数据' }).click();
    await expect(page.locator('td').filter({ hasText: 'e2e_test_user' })).toBeVisible({ timeout: 5_000 });

    // 处理 confirm 弹窗
    page.on('dialog', (dialog) => dialog.accept());

    // 找到 e2e_test_user 行的删除按钮并点击
    const row = page.locator('tr').filter({ hasText: 'e2e_test_user' });
    await row.locator('button').filter({ hasText: '删除' }).click();

    // 用户应从列表中消失
    await expect(page.locator('td').filter({ hasText: 'e2e_test_user' })).not.toBeVisible({ timeout: 5_000 });
  });

  test('创建重复用户显示错误', async ({ page }) => {
    await page.goto('/noa/admin/users');

    await page.locator('input[type="password"]').fill(ADMIN_KEY);

    // 先加载数据让创建表单出现在 stats 区域内
    await page.locator('button').filter({ hasText: '加载数据' }).click();
    await expect(page.locator('text=用户总数')).toBeVisible({ timeout: 5_000 });

    // 尝试创建已存在的 demo 用户
    const form = page.locator('text=创建新用户').locator('..');
    await form.locator('input[placeholder="例如: child01"]').fill('demo');
    await form.locator('input[placeholder="登录密码"]').fill('whatever');

    await page.locator('button').filter({ hasText: '创建' }).click();

    await expect(page.locator('text=用户已存在')).toBeVisible({ timeout: 5_000 });
  });
});
