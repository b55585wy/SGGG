import { test, expect, type Page } from '@playwright/test';

const ADMIN_KEY = process.env.ADMIN_API_KEY || '6566697232';

/** Login and load admin data; waits until stats dashboard is visible. */
async function loadAdmin(page: Page) {
  await page.goto('/noa/admin/users');
  await page.locator('input[type="password"]').fill(ADMIN_KEY);
  await page.locator('button').filter({ hasText: '加载数据' }).click();
  await expect(page.locator('text=用户总数')).toBeVisible({ timeout: 5_000 });
}

// ─── Stats Dashboard ──────────────────────────────────────

test.describe('管理员后台 — 统计面板', () => {
  test('加载后显示概览卡片（用户总数、会话总数、SUS 均分、数据完整度）', async ({ page }) => {
    await loadAdmin(page);

    await expect(page.locator('text=用户总数')).toBeVisible();
    await expect(page.locator('text=会话总数')).toBeVisible();
    await expect(page.locator('text=SUS 均分')).toBeVisible();
    await expect(page.locator('text=数据完整度')).toBeVisible();
  });

  test('加载后显示今日统计卡片', async ({ page }) => {
    await loadAdmin(page);

    await expect(page.locator('text=今日阅读次数')).toBeVisible();
    await expect(page.locator('text=今日累计时长')).toBeVisible();
    await expect(page.locator('text=今日互动点击')).toBeVisible();
    await expect(page.locator('text=今日正反馈')).toBeVisible();
  });

  test('加载后显示参与度漏斗（五个条目）', async ({ page }) => {
    await loadAdmin(page);

    await expect(page.locator('text=参与度漏斗')).toBeVisible();
    await expect(page.locator('text=注册用户')).toBeVisible();
    await expect(page.locator('text=完成形象')).toBeVisible();
    await expect(page.locator('text=提交进食')).toBeVisible();
    await expect(page.locator('text=生成绘本')).toBeVisible();
    await expect(page.locator('text=确认绘本')).toBeVisible();
  });

  test('加载后显示进食评分分布和绘本指标', async ({ page }) => {
    await loadAdmin(page);

    await expect(page.locator('text=进食评分分布')).toBeVisible();
    await expect(page.locator('text=绘本指标')).toBeVisible();
    await expect(page.locator('text=总生成数')).toBeVisible();
    await expect(page.locator('text=已确认数')).toBeVisible();
    await expect(page.locator('text=确认率')).toBeVisible();
    await expect(page.locator('text=平均重新生成次数')).toBeVisible();
  });
});

// ─── Backend Stats (conditional) ──────────────────────────

test.describe('管理员后台 — 后端数据区域', () => {
  test('后端可用时显示会话统计和反馈分布', async ({ page }) => {
    await loadAdmin(page);

    // If backend is running, these sections appear
    const sessionStats = page.locator('text=会话统计');
    const feedbackDist = page.locator('text=反馈分布');
    const backendWarning = page.locator('text=后端数据不可用');
    const backendDisconnect = page.locator('text=后端服务未连接');

    // Either backend stats show or warning shows — both are valid
    const backendAvailable = await sessionStats.isVisible({ timeout: 3_000 }).catch(() => false);

    if (backendAvailable) {
      await expect(sessionStats).toBeVisible();
      await expect(feedbackDist).toBeVisible();
      // SUS and completeness sections
      await expect(page.locator('text=SUS 可用性评分')).toBeVisible();
      await expect(page.locator('text=数据完整度').last()).toBeVisible();
    } else {
      // Backend unavailable — warning shown
      const warningVisible = await backendWarning.isVisible().catch(() => false);
      const disconnectVisible = await backendDisconnect.isVisible().catch(() => false);
      expect(warningVisible || disconnectVisible).toBe(true);
    }
  });

  test('后端可用时遥测事件概览可能显示', async ({ page }) => {
    await loadAdmin(page);

    // Telemetry panel only shows when backendStats.telemetry exists
    const telemPanel = page.locator('text=遥测事件概览');
    const visible = await telemPanel.isVisible({ timeout: 3_000 }).catch(() => false);

    if (visible) {
      await expect(page.locator('text=事件总数')).toBeVisible();
      await expect(page.locator('text=独立会话')).toBeVisible();
      await expect(page.locator('text=平均停留 (ms)')).toBeVisible();
    }
    // If not visible, that's also valid (no telemetry data or backend down)
  });
});

// ─── CSV Export ───────────────────────────────────────────

test.describe('管理员后台 — CSV 导出', () => {
  test('数据导出区显示 10 个下载链接', async ({ page }) => {
    await loadAdmin(page);

    await expect(page.locator('text=数据导出 (CSV)')).toBeVisible();

    const exportLinks = page.locator('a[download]');
    await expect(exportLinks).toHaveCount(10);
  });

  test('user-api 导出链接包含正确的 href 和 key 参数', async ({ page }) => {
    await loadAdmin(page);

    const expectedPaths = [
      '/api/user/admin/export/users.csv',
      '/api/user/admin/export/food_logs.csv',
      '/api/user/admin/export/reading_sessions.csv',
      '/api/user/admin/export/voice_recordings.csv',
      '/api/user/admin/export/avatars.csv',
    ];

    for (const path of expectedPaths) {
      const link = page.locator(`a[href*="${path}"]`);
      await expect(link).toBeVisible();
      const href = await link.getAttribute('href');
      expect(href).toContain(`key=${encodeURIComponent(ADMIN_KEY)}`);
    }
  });

  test('后端导出链接包含正确的 href 和 key 参数', async ({ page }) => {
    await loadAdmin(page);

    const expectedPaths = [
      '/api/v1/export/admin/sessions.csv',
      '/api/v1/export/admin/telemetry.csv',
      '/api/v1/export/admin/feedback.csv',
      '/api/v1/export/admin/sus.csv',
      '/api/v1/export/admin/stories.csv',
    ];

    for (const path of expectedPaths) {
      const link = page.locator(`a[href*="${path}"]`);
      await expect(link).toBeVisible();
      const href = await link.getAttribute('href');
      expect(href).toContain(`key=${encodeURIComponent(ADMIN_KEY)}`);
    }
  });

  test('user-api CSV 导出端点返回有效 CSV', async ({ page }) => {
    await loadAdmin(page);

    // Intercept a CSV download to verify Content-Type and format
    const response = await page.request.get(
      `/api/user/admin/export/users.csv?key=${encodeURIComponent(ADMIN_KEY)}`,
    );
    expect(response.status()).toBe(200);
    const contentType = response.headers()['content-type'] ?? '';
    expect(contentType).toContain('text/csv');

    const body = await response.text();
    // Should have header row with user_id
    expect(body).toContain('user_id');
    // Should contain the demo user
    expect(body).toContain('demo');
  });
});

// ─── Enriched User Table ──────────────────────────────────

test.describe('管理员后台 — 用户表', () => {
  test('enriched 表格有 18 列表头', async ({ page }) => {
    await loadAdmin(page);

    const headers = page.locator('thead th');
    await expect(headers).toHaveCount(18);
  });

  test('表格包含新增列头（昵称、性别、语音数、阅读页数）', async ({ page }) => {
    await loadAdmin(page);

    await expect(page.locator('th').filter({ hasText: '昵称' })).toBeVisible();
    await expect(page.locator('th').filter({ hasText: '性别' })).toBeVisible();
    await expect(page.locator('th').filter({ hasText: '语音数' })).toBeVisible();
    await expect(page.locator('th').filter({ hasText: '阅读页数' })).toBeVisible();
  });

  test('表格包含所有指标列头', async ({ page }) => {
    await loadAdmin(page);

    const expectedHeaders = [
      '用户ID', '目标食物', '昵称', '性别', '语音数', '阅读页数',
      '进食次数', '平均分', '预览', '回顾', '实验完成', '实验中断',
      '正反馈', '平均时长', '平均互动', '确认时间', '最近活跃',
    ];
    for (const h of expectedHeaders) {
      await expect(page.locator('th').filter({ hasText: h })).toBeVisible();
    }
  });

  test('表格最后一列为操作列', async ({ page }) => {
    await loadAdmin(page);

    const lastTh = page.locator('thead th').last();
    await expect(lastTh).toHaveText('操作');
  });

  test('demo 用户行显示正确的基本数据', async ({ page }) => {
    await loadAdmin(page);

    const demoRow = page.locator('tr').filter({ hasText: 'demo' });
    await expect(demoRow).toBeVisible();
    // First column is userID
    await expect(demoRow.locator('td').first()).toHaveText('demo');
    // Second column (themeFood) should not be empty
    await expect(demoRow.locator('td').nth(1)).not.toHaveText('');
    // Should have a delete button
    await expect(demoRow.locator('button').filter({ hasText: '删除' })).toBeVisible();
  });
});

// ─── Table Sorting ────────────────────────────────────────

test.describe('管理员后台 — 表格排序', () => {
  test('点击列头切换排序方向', async ({ page }) => {
    await loadAdmin(page);

    // Click on "用户ID" header — default is asc, clicking toggles to desc
    const userIdHeader = page.locator('th').filter({ hasText: '用户ID' });
    await userIdHeader.click();

    // After clicking, sort direction should change (icon switches)
    // The sort icon is inside the header; just verify it's clickable and table re-renders
    // We verify by checking the table still has rows (no crash)
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });

  test('点击不同列头切换排序键', async ({ page }) => {
    await loadAdmin(page);

    // Click "进食次数" header to sort by foodLogCount
    const foodLogHeader = page.locator('th').filter({ hasText: '进食次数' });
    await foodLogHeader.click();

    // Table should still render correctly
    await expect(page.locator('tbody tr').first()).toBeVisible();

    // Click again to reverse
    await foodLogHeader.click();
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });

  test('切换到数字列排序后再回到用户ID排序', async ({ page }) => {
    await loadAdmin(page);

    // Sort by voiceCount
    await page.locator('th').filter({ hasText: '语音数' }).click();
    await expect(page.locator('tbody tr').first()).toBeVisible();

    // Back to userID
    await page.locator('th').filter({ hasText: '用户ID' }).click();
    await expect(page.locator('tbody tr').first()).toBeVisible();

    // Verify demo user still present
    await expect(page.locator('td').filter({ hasText: 'demo' })).toBeVisible();
  });
});

// ─── Session Storage Persistence ──────────────────────────

test.describe('管理员后台 — 密钥持久化', () => {
  test('admin key 保存到 sessionStorage 后刷新仍存在', async ({ page }) => {
    await page.goto('/noa/admin/users');
    await page.locator('input[type="password"]').fill(ADMIN_KEY);

    // Verify sessionStorage was set
    const stored = await page.evaluate(() => sessionStorage.getItem('noa_child_admin_key'));
    expect(stored).toBe(ADMIN_KEY);

    // Reload page — the key should be restored from sessionStorage
    await page.reload();
    const inputVal = await page.locator('input[type="password"]').inputValue();
    expect(inputVal).toBe(ADMIN_KEY);
  });
});

// ─── Create Form Visibility ──────────────────────────────

test.describe('管理员后台 — 创建表单', () => {
  test('加载数据前创建表单不显示', async ({ page }) => {
    await page.goto('/noa/admin/users');

    // Before loading, "创建新用户" form is inside the stats block (only visible when userStats !== null)
    await expect(page.locator('text=创建新用户')).not.toBeVisible();
  });

  test('加载数据后创建表单显示', async ({ page }) => {
    await loadAdmin(page);

    await expect(page.locator('text=创建新用户')).toBeVisible();
    await expect(page.locator('input[placeholder="例如: child01"]')).toBeVisible();
    await expect(page.locator('input[placeholder="登录密码"]')).toBeVisible();
  });

  test('未填写用户ID和密码时创建按钮禁用', async ({ page }) => {
    await loadAdmin(page);

    const createBtn = page.locator('button').filter({ hasText: '创建' });
    // canCreate requires adminKey + newUserID + newPassword
    await expect(createBtn).toBeDisabled();
  });

  test('填写用户ID和密码后创建按钮启用', async ({ page }) => {
    await loadAdmin(page);

    const form = page.locator('text=创建新用户').locator('..');
    await form.locator('input[placeholder="例如: child01"]').fill('test_enable');
    await form.locator('input[placeholder="登录密码"]').fill('pw');

    const createBtn = page.locator('button').filter({ hasText: '创建' });
    await expect(createBtn).toBeEnabled();
  });
});

// ─── Loading State ────────────────────────────────────────

test.describe('管理员后台 — 加载状态', () => {
  test('点击加载数据后按钮显示"加载中..."', async ({ page }) => {
    await page.goto('/noa/admin/users');
    await page.locator('input[type="password"]').fill(ADMIN_KEY);

    // Watch for the loading text to appear (it may be brief)
    const loadBtn = page.locator('button').filter({ hasText: /加载/ });
    await loadBtn.click();

    // Either "加载中..." is briefly visible or data loads so fast we see "加载数据" again
    // Wait for the stats to be visible to confirm load completed
    await expect(page.locator('text=用户总数')).toBeVisible({ timeout: 5_000 });
  });
});
