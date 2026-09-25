// Снимки доски без настоящего Supabase: фейковая сессия в localStorage и
// ответы REST из fixture.mjs. Запуск: npm run shots -- <метка>.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { projects, epics, items, comments } from './fixture.mjs';

const label = process.argv[2] ?? 'current';
const out = new URL(`../shots/${label}/`, import.meta.url).pathname;
await mkdir(out, { recursive: true });

process.env.VITE_SUPABASE_URL = 'https://fake.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'fake';
const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();

const tables = { projects, epics, items };
const session = {
  access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 36000,
  user: { id: 'u', email: 'owner@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' },
};

function rows(url) {
  const u = new URL(url);
  const table = u.pathname.split('/').pop();
  if (table === 'comments') {
    const id = u.searchParams.get('item_id')?.slice(3);
    return comments.map(c => ({ ...c, item_id: id }));
  }
  let list = [...(tables[table] ?? [])];
  for (const [k, v] of u.searchParams) {
    if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
    if (v.startsWith('eq.')) list = list.filter(r => String(r[k]) === v.slice(3));
    else if (v === 'is.null') list = list.filter(r => r[k] == null);
  }
  const ord = u.searchParams.get('order');
  if (ord) { const [f, dir] = ord.split('.'); list.sort((a, b) => (a[f] > b[f] ? 1 : -1) * (dir === 'desc' ? -1 : 1)); }
  // Встроенный счётчик комментариев (фаза 3): select=*,comments(count).
  if ((u.searchParams.get('select') ?? '').includes('comments(count)')) {
    list = list.map(r => ({ ...r, comments: [{ count: r.id.endsWith('3') ? 2 : 0 }] }));
  }
  return list;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });

async function open({ width, height, dark, mobile }) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2,
    colorScheme: dark ? 'dark' : 'light', isMobile: !!mobile, hasTouch: !!mobile,
  });
  await ctx.addInitScript(s => localStorage.setItem('sb-fake-auth-token', JSON.stringify(s)), session);
  await ctx.route('https://fake.supabase.co/**', route => {
    const req = route.request();
    if (req.url().includes('/rest/v1/') && req.method() === 'GET') {
      const list = rows(req.url());
      const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(single ? list[0] ?? null : list) });
    }
    return route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5199/kanban/');
  await page.waitForTimeout(1200);
  return { ctx, page };
}

async function switchTo(page, name) {
  await page.getByRole('button', { name: /Кофейня|Портфолио|Проекты/ }).first().click();
  await page.waitForTimeout(400);
  await page.getByText(name, { exact: true }).last().click();
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

const viewports = {
  phone: { width: 390, height: 844, mobile: true },
  desktop: { width: 1440, height: 900 },
};

for (const [vp, opt] of Object.entries(viewports)) {
  for (const dark of [false, true]) {
    const tag = `${vp}-${dark ? 'dark' : 'light'}`;
    const { ctx, page } = await open({ ...opt, dark });
    await switchTo(page, 'Портфолио');
    await page.screenshot({ path: `${out}${tag}-board.png` });
    await page.locator('article').first().click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}${tag}-task.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Новая задача' }).click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}${tag}-create.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Портфолио/ }).first().click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}${tag}-projects.png` });
    await ctx.close();
  }
}

{
  const { ctx, page } = await open({ ...viewports.desktop });
  await switchTo(page, 'Кофейня');
  await page.screenshot({ path: `${out}desktop-light-empty.png` });
  await ctx.close();
}

await browser.close();
await server.close();
console.log(`shots → ${out}`);
