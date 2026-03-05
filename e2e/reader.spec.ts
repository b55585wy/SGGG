import { test, expect, Page } from '@playwright/test';

// ─── 测试用 draft 数据 ────────────────────────────────────────

const TEST_DRAFT = {
  schema_version: '1.0',
  story_id: 'e2e-test-story',
  generated_at: '2026-03-05T00:00:00Z',
  book_meta: {
    title: '西兰花的冒险',
    subtitle: '测试故事',
    theme_food: '西兰花',
    story_type: 'adventure',
    target_behavior_level: 'Lv1',
    summary: '测试摘要',
    design_logic: '测试',
    global_visual_style: '卡通',
  },
  pages: [
    {
      page_no: 1,
      page_id: 'page-1',
      behavior_anchor: 'Lv1',
      text: '从前有一只小兔子，它住在一片绿色的森林里。',
      image_prompt: '一只可爱的小兔子在森林里',
      interaction: { type: 'none', instruction: '', event_key: 'p1_none' },
      branch_choices: [],
    },
    {
      page_no: 2,
      page_id: 'page-2',
      behavior_anchor: 'Lv1',
      text: '小兔子看到了一颗大西兰花，它想去摸一摸。',
      image_prompt: '西兰花和小兔子',
      interaction: {
        type: 'tap',
        instruction: '伸出手指，点一点西兰花吧！',
        event_key: 'p2_tap',
      },
      branch_choices: [],
    },
    {
      page_no: 3,
      page_id: 'page-3',
      behavior_anchor: 'Lv2',
      text: '小兔子鼓起勇气，咬了一口西兰花，真好吃！',
      image_prompt: '小兔子吃西兰花',
      interaction: {
        type: 'mimic',
        instruction: '学一学小兔子，张大嘴巴！',
        event_key: 'p3_mimic',
      },
      branch_choices: [],
    },
  ],
  ending: {
    positive_feedback: '你太棒了，和小兔子一样勇敢！',
    next_micro_goal: '下次尝试咬一口西兰花',
  },
  telemetry_suggestions: { recommended_events: [] },
};

// ─── 工具函数 ─────────────────────────────────────────────────

/**
 * 登录 demo 用户，兼容 firstLogin=true（需要 avatar 设置）
 * 和 firstLogin=false（直接到 home）两种数据库状态。
 */
async function login(page: Page) {
  await page.goto('/noa/login');
  await page.locator('input[autocomplete="username"]').fill('demo');
  await page.locator('input[type="password"]').fill('demo123');
  await page.locator('button[type="submit"]').click();

  // 等待跳转到 avatar 或 home（两种情况都合法）
  await page.waitForURL(/\/(noa\/avatar|noa\/home)/, { timeout: 10_000 });

  if (page.url().includes('/noa/avatar')) {
    // 首次登录：需要完成 avatar 设置
    await expect(page.locator('text=基本信息')).toBeVisible();
    await page.locator('input[placeholder="给自己起一个昵称"]').fill('测试小朋友');
    await page.locator('button').filter({ hasText: '男孩' }).first().click();
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/noa\/home/, { timeout: 10_000 });
  }
  // 已到 home — 无需额外操作
}

/** 登录后注入 draft 并打开 Reader（只读模式，无 session） */
async function openReader(page: Page) {
  await login(page);

  // Mock TTS API：避免测试环境因无 DASHSCOPE_API_KEY 产生网络错误
  await page.route('**/api/v1/tts', (route) =>
    route.fulfill({ status: 503, body: '' }),
  );

  await page.evaluate((draft) => {
    localStorage.setItem('storybook_draft', JSON.stringify(draft));
    localStorage.removeItem('storybook_session');
  }, TEST_DRAFT);

  await page.goto('/reader');
  await expect(page.locator('text=从前有一只小兔子')).toBeVisible({ timeout: 8_000 });
}

// ─── Reader 基础显示与导航 ────────────────────────────────────

test.describe('Reader — 基础显示与导航', () => {
  test.beforeEach(async ({ page }) => {
    await openReader(page);
  });

  test('显示第一页故事文字', async ({ page }) => {
    await expect(page.locator('text=从前有一只小兔子')).toBeVisible();
  });

  test('显示进度条和页码', async ({ page }) => {
    await expect(page.locator('text=1 / 3')).toBeVisible();
  });

  test('第一页时"上一页"按钮禁用', async ({ page }) => {
    const prevBtn = page.locator('button').filter({ hasText: '上一页' });
    await expect(prevBtn).toBeDisabled();
  });

  test('点击"下一页"翻到第二页', async ({ page }) => {
    await page.locator('button').filter({ hasText: '下一页' }).click();
    await expect(page.locator('text=小兔子看到了一颗大西兰花')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=2 / 3')).toBeVisible();
  });

  test('翻到第二页后"上一页"可以返回第一页', async ({ page }) => {
    await page.locator('button').filter({ hasText: '下一页' }).click();
    await expect(page.locator('text=2 / 3')).toBeVisible({ timeout: 5_000 });

    await page.locator('button').filter({ hasText: '上一页' }).click();
    await expect(page.locator('text=1 / 3')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=从前有一只小兔子')).toBeVisible();
  });

  test('最后一页显示"完成"按钮和正反馈区', async ({ page }) => {
    await page.locator('button').filter({ hasText: '下一页' }).click();
    await expect(page.locator('text=2 / 3')).toBeVisible({ timeout: 5_000 });
    await page.locator('button').filter({ hasText: '下一页' }).click();
    await expect(page.locator('text=3 / 3')).toBeVisible({ timeout: 5_000 });

    await expect(page.locator('button').filter({ hasText: '完成' })).toBeVisible();
    await expect(page.locator('text=你太棒了，和小兔子一样勇敢！')).toBeVisible();
  });

  test('点击"退出"跳转到主页（只读模式）', async ({ page }) => {
    await page.locator('button').filter({ hasText: '退出' }).click();
    await expect(page).toHaveURL(/\/noa\/home/, { timeout: 8_000 });
  });

  test('无 draft 时重定向到 /noa/home', async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem('storybook_draft'));
    await page.goto('/reader');
    await expect(page).toHaveURL(/\/noa\/home/, { timeout: 8_000 });
  });
});

// ─── TTS 自动朗读 ─────────────────────────────────────────────

test.describe('Reader — TTS 自动朗读', () => {
  test.beforeEach(async ({ page }) => {
    await openReader(page);
  });

  test('朗读按钮默认显示"朗读"（未开启状态）', async ({ page }) => {
    await expect(page.locator('button').filter({ hasText: '朗读' })).toBeVisible();
  });

  test('点击朗读按钮后显示"朗读中"（自动朗读开启）', async ({ page }) => {
    await page.locator('button').filter({ hasText: '朗读' }).click();
    await expect(page.locator('button').filter({ hasText: '朗读中' })).toBeVisible();
  });

  test('再次点击"朗读中"按钮关闭自动朗读', async ({ page }) => {
    await page.locator('button').filter({ hasText: '朗读' }).click();
    await expect(page.locator('button').filter({ hasText: '朗读中' })).toBeVisible();

    await page.locator('button').filter({ hasText: '朗读中' }).click();
    await expect(page.locator('button').filter({ hasText: '朗读' })).toBeVisible();
  });

  test('自动朗读开启后翻页，按钮保持"朗读中"状态', async ({ page }) => {
    await page.locator('button').filter({ hasText: '朗读' }).click();
    await expect(page.locator('button').filter({ hasText: '朗读中' })).toBeVisible();

    await page.locator('button').filter({ hasText: '下一页' }).click();
    await expect(page.locator('text=小兔子看到了一颗大西兰花')).toBeVisible({ timeout: 5_000 });

    // 翻页后按钮应仍为激活状态（autoReadEnabled 持久）
    await expect(page.locator('button').filter({ hasText: '朗读中' })).toBeVisible();
  });

  test('自动朗读关闭后翻页，按钮保持"朗读"状态', async ({ page }) => {
    // 开启再关闭
    await page.locator('button').filter({ hasText: '朗读' }).click();
    await page.locator('button').filter({ hasText: '朗读中' }).click();

    await page.locator('button').filter({ hasText: '下一页' }).click();
    await expect(page.locator('text=小兔子看到了一颗大西兰花')).toBeVisible({ timeout: 5_000 });

    await expect(page.locator('button').filter({ hasText: '朗读中' })).not.toBeVisible();
    await expect(page.locator('button').filter({ hasText: '朗读' })).toBeVisible();
  });
});

// ─── 互动层 ──────────────────────────────────────────────────

test.describe('Reader — 互动层', () => {
  test.beforeEach(async ({ page }) => {
    await openReader(page);
  });

  test('第一页（无互动）不显示互动指令文字', async ({ page }) => {
    await expect(page.locator('text=伸出手指，点一点西兰花吧！')).not.toBeVisible();
    await expect(page.locator('text=学一学小兔子，张大嘴巴！')).not.toBeVisible();
  });

  test('第二页显示 tap 互动提示语', async ({ page }) => {
    await page.locator('button').filter({ hasText: '下一页' }).click();
    await expect(page.locator('text=小兔子看到了一颗大西兰花')).toBeVisible({ timeout: 5_000 });

    await expect(page.locator('text=伸出手指，点一点西兰花吧！')).toBeVisible();
  });

  test('点击 tap 圆形按钮后变为禁用（完成状态）', async ({ page }) => {
    await page.locator('button').filter({ hasText: '下一页' }).click();
    await expect(page.locator('text=伸出手指，点一点西兰花吧！')).toBeVisible({ timeout: 5_000 });

    // tap 按钮是唯一一个 rounded-full 按钮
    const tapBtn = page.locator('button[class*="rounded-full"]');
    await tapBtn.click();
    await expect(tapBtn).toBeDisabled({ timeout: 3_000 });
  });

  test('第三页显示 mimic 互动：提示语和"我做到了"按钮', async ({ page }) => {
    await page.locator('button').filter({ hasText: '下一页' }).click();
    await expect(page.locator('text=2 / 3')).toBeVisible({ timeout: 5_000 });
    await page.locator('button').filter({ hasText: '下一页' }).click();
    await expect(page.locator('text=小兔子鼓起勇气')).toBeVisible({ timeout: 5_000 });

    await expect(page.locator('text=学一学小兔子，张大嘴巴！')).toBeVisible();
    await expect(page.locator('button').filter({ hasText: '我做到了' })).toBeVisible();
  });

  test('点击"我做到了"后变为"太棒了"', async ({ page }) => {
    await page.locator('button').filter({ hasText: '下一页' }).click();
    await expect(page.locator('text=2 / 3')).toBeVisible({ timeout: 5_000 });
    await page.locator('button').filter({ hasText: '下一页' }).click();
    await expect(page.locator('text=3 / 3')).toBeVisible({ timeout: 5_000 });

    await page.locator('button').filter({ hasText: '我做到了' }).click();
    await expect(page.locator('button').filter({ hasText: '太棒了' })).toBeVisible({ timeout: 3_000 });
  });
});
