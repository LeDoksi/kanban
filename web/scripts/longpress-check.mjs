// Долгое нажатие на карточку на телефоне: меню статусов открылось,
// шторка задачи — нет (click после отпускания пальца должен быть
// проглочен). Касания шлются через CDP: Playwright-овский tap короткий.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { projects, epics, items } from './fixture.mjs';

process.env.VITE_SUPABASE_URL = 'https://fake.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'fake';
const server = await createServer({ server: { port: 5198, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const session = { access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 36000,
  user: { id: 'u', email: 'o@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } };
await ctx.addInitScript(s => {
  localStorage.setItem('sb-fake-auth-token', JSON.stringify(s));
  localStorage.setItem('kanban:lastProject', 'folio');
  localStorage.setItem('kanban:lastColumn:folio', 'backlog');
}, session);
const tables = { projects, epics, items };
await ctx.route('https://fake.supabase.co/**', route => {
  const u = new URL(route.request().url());
  let list = [...(tables[u.pathname.split('/').pop()] ?? [])];
  for (const [k, v] of u.searchParams) if (v.startsWith('eq.')) list = list.filter(r => String(r[k]) === v.slice(3));
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify(list) });
});
const page = await ctx.newPage();
await page.goto('http://localhost:5198/kanban/');
await page.waitForTimeout(1500);

// Карточка рисуется как <article> (см. Card.tsx); текст ищем по фикстуре.
const card = page.locator('article').filter({ hasText: 'Фильтр кейсов' }).first();
const box = await card.boundingBox();
const cdp = await ctx.newCDPSession(page);
const point = { x: box.x + 40, y: box.y + 20 };
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
await page.waitForTimeout(700);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(500);

const menu = await page.getByRole('menu').isVisible();
const openItem = await page.getByRole('menuitem', { name: 'Открыть' }).isVisible();
const taskOpened = await page.getByPlaceholder('комментарий').isVisible().catch(() => false);
console.log({ menu, openItem, taskOpened });
await browser.close();
await server.close();
if (!menu || taskOpened) { console.error('FAIL'); process.exit(1); }
console.log('OK');
