// Проверка закрытия шторки (KAN-115): кнопка «×», Esc и тап по подложке
// должны каждый раз реально звать onClose родителя — иначе шторка
// открытая через setOpen(false) без честного onAnimationEnd от vaul
// зависает закрытой визуально, но незакрытой в состоянии Board, и ту же
// карточку было не открыть снова.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { projects, epics, items } from './fixture.mjs';

process.env.VITE_SUPABASE_URL = 'https://fake.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'fake';
const server = await createServer({ server: { port: 5197, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });

const session = {
  access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 36000,
  user: { id: 'u', email: 'o@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' },
};
const tables = { projects, epics, items };

async function open({ mobile }) {
  const ctx = await browser.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } },
  );
  await ctx.addInitScript(s => {
    localStorage.setItem('sb-fake-auth-token', JSON.stringify(s));
    localStorage.setItem('kanban:lastProject', 'folio');
    localStorage.setItem('kanban:lastColumn:folio', 'backlog');
  }, session);
  await ctx.route('https://fake.supabase.co/**', route => {
    const u = new URL(route.request().url());
    let list = [...(tables[u.pathname.split('/').pop()] ?? [])];
    for (const [k, v] of u.searchParams) if (v.startsWith('eq.')) list = list.filter(r => String(r[k]) === v.slice(3));
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(list) });
  });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5197/kanban/');
  await page.waitForTimeout(1500);
  return { ctx, page };
}

// --- Десктоп: × закрывает, карточку можно открыть снова; Esc закрывает,
// карточку тоже можно открыть снова. ---
let desktopReopen = false;
{
  const { ctx, page } = await open({ mobile: false });
  const card = page.locator('article').filter({ hasText: 'Фильтр кейсов' }).first();

  await card.click();
  await page.waitForTimeout(500);
  const openedFirst = await page.getByRole('dialog').isVisible();

  await page.getByRole('button', { name: 'Закрыть' }).click();
  await page.waitForTimeout(600);
  const closedAfterX = !(await page.getByRole('dialog').isVisible().catch(() => false));

  await card.click();
  await page.waitForTimeout(500);
  const reopenedAfterX = await page.getByRole('dialog').isVisible().catch(() => false);

  // Esc — честный путь vaul (closeDrawer -> setIsOpen), тоже должен
  // отпускать шторку и давать её открыть заново.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const closedAfterEsc = !(await page.getByRole('dialog').isVisible().catch(() => false));

  await card.click();
  await page.waitForTimeout(500);
  const reopenedAfterEsc = await page.getByRole('dialog').isVisible().catch(() => false);

  desktopReopen = openedFirst && closedAfterX && reopenedAfterX && closedAfterEsc && reopenedAfterEsc;
  await ctx.close();
}

// --- Телефон: тап по подложке закрывает шторку. ---
let phoneOverlayClose = false;
{
  const { ctx, page } = await open({ mobile: true });
  const card = page.locator('article').filter({ hasText: 'Фильтр кейсов' }).first();
  await card.click();
  await page.waitForTimeout(500);
  const opened = await page.getByRole('dialog').isVisible();

  await page.mouse.click(10, 10);
  await page.waitForTimeout(600);
  const closed = !(await page.getByRole('dialog').isVisible().catch(() => false));

  phoneOverlayClose = opened && closed;
  await ctx.close();
}

console.log({ desktopReopen, phoneOverlayClose });
await browser.close();
await server.close();
if (!desktopReopen || !phoneOverlayClose) { console.error('FAIL'); process.exit(1); }
console.log('OK');
