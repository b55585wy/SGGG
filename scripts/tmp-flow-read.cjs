const { chromium } = require('playwright');

const ADMIN_KEY = process.env.ADMIN_API_KEY || 'noah';
const USER_API = 'http://127.0.0.1:3001';
const FRONTEND = 'http://127.0.0.1:5173';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BOOK_TIMEOUT_MS = 12 * 60 * 1000;

async function api(path, options = {}) {
  const response = await fetch(`${USER_API}${path}`, options);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { response, json, text };
}

async function createUser(userID, password) {
  await api(`/api/admin/users/${userID}`, {
    method: 'DELETE',
    headers: { 'x-admin-key': ADMIN_KEY },
  }).catch(() => {});

  const { response, text } = await api('/api/admin/users', {
    method: 'POST',
    headers: {
      'x-admin-key': ADMIN_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      userID,
      password,
      firstLogin: true,
      themeFood: '胡萝卜',
    }),
  });
  if (!response.ok) {
    throw new Error(`create user failed ${response.status}: ${text}`);
  }
}

async function deleteUser(userID) {
  await api(`/api/admin/users/${userID}`, {
    method: 'DELETE',
    headers: { 'x-admin-key': ADMIN_KEY },
  }).catch(() => {});
}

async function waitForReadyBook(page, timeoutMs) {
  const confirmButton = page.locator('button').filter({ hasText: '确认绘本，开始阅读' });
  await confirmButton.waitFor({ state: 'visible', timeout: timeoutMs });
  await page.waitForFunction(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const button = buttons.find((el) => el.textContent && el.textContent.includes('确认绘本，开始阅读'));
    return !!button && !button.disabled;
  }, { timeout: timeoutMs });
}

async function clickIfVisible(locator) {
  if (await locator.isVisible({ timeout: 700 }).catch(() => false)) {
    await locator.click();
    return true;
  }
  return false;
}

async function performVisibleInteraction(page) {
  if (await clickIfVisible(page.locator('button').filter({ hasText: '我做到了' }))) return true;
  if (await clickIfVisible(page.locator('button').filter({ hasText: '录音' }))) {
    await page.waitForTimeout(1000);
    await clickIfVisible(page.locator('button').filter({ hasText: '停止' }));
    return true;
  }
  const tapButton = page.locator('button[class*="w-20"]').first();
  if (await tapButton.isVisible({ timeout: 700 }).catch(() => false)) {
    await tapButton.click();
    return true;
  }
  return false;
}

async function finishReading(page) {
  for (let i = 0; i < 14; i += 1) {
    await performVisibleInteraction(page);
    const completeButton = page.locator('button').filter({ hasText: '完成' });
    if (await completeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await completeButton.click();
      return;
    }
    await page.locator('button').filter({ hasText: '下一页' }).click();
  }
  throw new Error('reader did not reach completion within 14 pages');
}

async function main() {
  const suffix = Date.now().toString().slice(-8);
  const userID = `flow_${suffix}`;
  const password = 'pass123';
  let browser;

  try {
    console.log(`STEP 1 register user ${userID}`);
    await createUser(userID, password);

    browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: true,
    });
    const context = await browser.newContext({ permissions: ['microphone'] });
    const page = await context.newPage();

    console.log('STEP 2 login and setup avatar');
    await page.goto(`${FRONTEND}/noa/login`);
    await page.locator('input[autocomplete="username"]').fill(userID);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/(noa\/avatar|noa\/home)/, { timeout: 20000 });
    if (page.url().includes('/noa/avatar')) {
      await page.locator('input[placeholder="给自己起一个昵称"]').fill('流程用户');
      await page.locator('button').filter({ hasText: '女' }).first().click();
      await page.locator('button').filter({ hasText: '红' }).first().click();
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/\/noa\/home/, { timeout: 20000 });
    }

    console.log('STEP 3 wait first book and regenerate disliked one');
    await waitForReadyBook(page, BOOK_TIMEOUT_MS);
    await page.locator('button').filter({ hasText: '重新生成' }).click();
    await page.locator('button').filter({ hasText: '太短了' }).click();
    const regenResponsePromise = page.waitForResponse((res) =>
      res.url().includes('/api/book/regenerate') && res.request().method() === 'POST'
    );
    await page.locator('button').filter({ hasText: '提交并重新生成' }).click();
    const regenResponse = await regenResponsePromise;
    const regenJson = await regenResponse.json();
    console.log(`INFO regenerated book id=${regenJson?.book?.bookID || ''}`);

    console.log('STEP 4 wait regenerated book and start reading');
    await waitForReadyBook(page, BOOK_TIMEOUT_MS);
    await page.locator('button').filter({ hasText: '确认绘本，开始阅读' }).click();
    await page.waitForURL(/\/reader/, { timeout: 60000 });

    console.log('STEP 5 interact, finish, and exit reader');
    await finishReading(page);
    await page.locator('button').filter({ hasText: '吞下去了' }).click();
    await page.locator('button').filter({ hasText: '提交反馈' }).click();
    await page.waitForURL(/\/noa\/home/, { timeout: 30000 });

    console.log('DONE flow completed');
    await context.close();
    await browser.close();
  } catch (error) {
    console.error('FLOW FAILED', error);
    if (browser) {
      const pages = browser.contexts().flatMap((ctx) => ctx.pages());
      if (pages[0]) {
        await pages[0].screenshot({ path: 'tmp-flow-read-failure.png', fullPage: true }).catch(() => {});
      }
      await browser.close().catch(() => {});
    }
    throw error;
  } finally {
    await deleteUser(userID);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
