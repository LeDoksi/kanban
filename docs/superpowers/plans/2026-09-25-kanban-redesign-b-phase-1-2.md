# Редизайн «B», фазы 1–2 (KAN-115) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести `web/` на визуальную систему «B» (фаза 1) и новый каркас доски: вкладки + лента колонок на телефоне, колонки на десктопе, меню статусов вместо свайпа, память проекта и вкладки (фаза 2).

**Architecture:** Фаза 1 меняет только токены, шрифт, иконки, кнопки и способ показа ошибок; раскладка прежняя. Фаза 2 выносит `Card` и `Column` из `Board.tsx` в свои файлы, добавляет чистые модули (`columns.ts`, `prefs.ts`, `longpress.ts`, `lane.ts`) с тестами и собирает из них новый каркас. Каждая фаза заканчивается отдельным PR и деплоем.

**Tech Stack:** React 19, Vite 8, Tailwind v4 (`@theme`), `motion`, `@dnd-kit`, Supabase JS. Новые: `@fontsource/onest`, `@phosphor-icons/react`, `@radix-ui/react-dropdown-menu`, `playwright-core` (dev). Тесты: `node --test` на `.ts` файлах без JSX.

**Spec:** `docs/superpowers/specs/2026-09-25-kanban-redesign-b-design.md` (разделы 1, 2 и меню статусов из раздела 3).

## Global Constraints

- Все команды запускаются из `web/`, если не сказано иначе.
- Цвета только через токены `--color-*` из `web/src/styles.css`; литералы hex в `.tsx` запрещены.
- Токены (светлая / тёмная): `ground #eef0f2/#15171a`, `surface #ffffff/#1f2327`, `raised #e4e7ea/#2a2e33`, `ink #1d2226/#eef0f2`, `ink-2 #3a4148/#cdd2d7`, `muted #5b646e/#949da6`, `line #dde1e5/#2c3136`, `accent #c4532d/#e2744f`, `accent-ink #a9441f/#e8805d`, `on-accent #ffffff/#15171a`, `accent-soft #f6e4dc/#3a2419`, `danger #c0392b/#f07a6c`, `overlay rgb(29 34 38 / .40)/rgb(0 0 0 / .60)`, `shadow rgb(40 50 60 / .08)/rgb(0 0 0 / .45)`.
- Шрифт Onest 400/500/600 через `@fontsource/onest`, фолбэк `ui-sans-serif, system-ui, sans-serif`.
- Шкала: micro 12/500, meta 13/500, body 15/400 (lh 1.4), title 18/600, title-lg 20/600. Цифры `tabular-nums`.
- Радиусы: карточка и меню 16px (`rounded-2xl`), кнопки/вкладки/чипы pill (`rounded-full`), поля 12px (`rounded-xl`).
- Иконки только `@phosphor-icons/react`, начертание по умолчанию (Regular).
- Поля ввода на `(pointer: coarse)` остаются 16px (правило KAN-114 в `styles.css` не трогать).
- Анимации через `motion` и отключаются при `prefers-reduced-motion` (`useReducedMotion`).
- Каждое чтение/запись `localStorage` в `try/catch`.
- Комментарии в коде на русском, в стиле существующих (объясняют «почему»).
- Коммиты на русском, в конце каждого:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

## Review Focus

1. `localStorage` бросает исключение (приватный режим Safari) → доска всё равно грузится, открывается первый проект. Тест в Task 8 (`prefs.test.ts`, «падающий Storage»).
2. Сохранённый проект удалён или в архиве → открывается первый проект, а не пустая доска. Тест в Task 8 (`pickProject`).
3. Долгое нажатие открыло меню → отпускание пальца не должно открыть задачу. Проверка в Task 14 (Playwright + CDP touch).
4. «Отменить» после переноса из «Готово» возвращает прежний `closed_at`, а не текущее время. Тест в Task 10 (`undoPatch`).
5. Поворот телефона / изменение ширины → лента остаётся на активной колонке. Тест дробных и граничных значений в Task 11 (`indexFromScroll`) + `ResizeObserver` в `Lane`.

---

# Фаза 1. Основа

### Task 1: Скрипт скриншотов с синтетическими данными

Нужен до любых изменений: делает снимки «до», потом «после» каждой фазы.

**Files:**
- Create: `web/scripts/fixture.mjs`
- Create: `web/scripts/shots.mjs`
- Modify: `web/package.json` (devDependency `playwright-core`, скрипт `shots`)
- Modify: `web/.gitignore` или корневой `.gitignore` (папка `shots/`)

**Interfaces:**
- Produces: `npm run shots -- <label>` пишет PNG в `web/shots/<label>/`. Переменная `CHROMIUM_PATH` указывает бинарник Chromium.

- [ ] **Step 1: Установить playwright-core**

Run: `npm i -D playwright-core@1.56.1`
Expected: `package.json` содержит `"playwright-core": "1.56.1"` в devDependencies.

- [ ] **Step 2: Написать фикстуру**

`web/scripts/fixture.mjs`:

```js
// Синтетические данные для снимков. Настоящую доску сюда не кладём:
// репозиторий публичный, а задачи личные.
const now = Date.parse('2026-09-25T10:00:00Z');
const ago = h => new Date(now - h * 3600_000).toISOString();

export const projects = [
  { id: 'cafe', name: 'Кофейня', prefix: 'CAF', description: 'Сайт и меню для кофейни у дома', position: 100, archived_at: null },
  { id: 'folio', name: 'Портфолио', prefix: 'PF', description: 'Личный сайт-портфолио с кейсами, блогом и формой связи. Статика на GitHub Pages.', position: 200, archived_at: null },
];

export const epics = [
  { id: 'PF-E1', seq: 1, project_id: 'folio', title: 'Раздел кейсов: сетка, фильтры, страница кейса', goal: 'Показать **пять** лучших проектов', plan_path: null, spec_path: null, status: 'active', position: 100 },
  { id: 'PF-E2', seq: 2, project_id: 'folio', title: 'Блог', goal: null, plan_path: null, spec_path: null, status: 'active', position: 200 },
  { id: 'PF-E3', seq: 3, project_id: 'folio', title: 'Перенос на Astro', goal: null, plan_path: null, spec_path: null, status: 'active', position: 300 },
];

let seq = 0;
const item = (project_id, prefix, status, title, extra = {}) => {
  seq += 1;
  return {
    id: `${prefix}-${seq}`, seq, project_id, epic_id: null, type: 'task', title, body: null,
    status, checklist: [], blocks: [], position: seq * 100, created_by: 'me',
    created_at: ago(200 - seq), updated_at: ago(100 - seq),
    closed_at: status === 'done' ? ago(seq) : null, archived_at: null, ...extra,
  };
};

export const items = [
  item('cafe', 'CAF', 'backlog', 'Меню на доске у кассы'),
  item('cafe', 'CAF', 'doing', 'Фото зала для главной'),
  item('cafe', 'CAF', 'waiting', 'Согласовать цены на сезонные напитки'),
  item('cafe', 'CAF', 'done', 'Купить домен'),

  item('folio', 'PF', 'hold', 'Тёмная тема для блога', { epic_id: 'PF-E2' }),
  item('folio', 'PF', 'backlog', 'Сетка кейсов: две колонки на планшете, одна на телефоне', { epic_id: 'PF-E1', checklist: [{ text: 'Сетка', done: true }, { text: 'Планшет', done: false }] }),
  item('folio', 'PF', 'backlog', 'Фильтр кейсов по типу работы', { epic_id: 'PF-E1' }),
  item('folio', 'PF', 'backlog', 'Страница кейса: обложка, задача, решение, результат в цифрах и отзыв клиента, плюс галерея скриншотов с подписями', { epic_id: 'PF-E1', body: '**Files:**\n- `src/pages/case/[slug].astro`\n- `src/components/Gallery.astro`' }),
  item('folio', 'PF', 'backlog', 'баг: форма связи отправляет пустое письмо', { type: 'bug' }),
  item('folio', 'PF', 'backlog', 'Убрать неиспользуемые шрифты из сборки', { type: 'chore' }),
  item('folio', 'PF', 'backlog', 'RSS для блога', { epic_id: 'PF-E2' }),
  item('folio', 'PF', 'backlog', 'Открытые графы для соцсетей', {}),
  item('folio', 'PF', 'doing', 'Перенести главную на Astro', { epic_id: 'PF-E3', checklist: [{ text: 'Шапка', done: true }, { text: 'Кейсы', done: false }, { text: 'Подвал', done: false }] }),
  item('folio', 'PF', 'doing', 'Скорость: картинки в AVIF', {}),
  item('folio', 'PF', 'waiting', 'Какие пять кейсов показываем первыми?', { epic_id: 'PF-E1', created_by: 'claude' }),
  item('folio', 'PF', 'done', 'Настроить GitHub Pages', {}),
  item('folio', 'PF', 'done', 'Логотип в SVG', {}),
  item('folio', 'PF', 'done', 'Шрифты: подключить локально', { type: 'chore' }),
];

export const comments = [
  { id: 1, item_id: '*', author: 'claude', body: 'Сделал черновик, посмотри **сетку** на телефоне.', created_at: ago(5) },
  { id: 2, item_id: '*', author: 'me', body: 'Ок, на планшете две колонки мало', created_at: ago(2) },
];
```

- [ ] **Step 3: Написать скрипт**

`web/scripts/shots.mjs`:

```js
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

await browser.close();
await server.close();
console.log(`shots → ${out}`);
```

- [ ] **Step 4: Подключить скрипт и игнор**

В `web/package.json` в `"scripts"` добавить:

```json
"shots": "node scripts/shots.mjs"
```

В корневой `.gitignore` добавить строку:

```
web/shots/
```

- [ ] **Step 5: Снять «до»**

Run (в этом облачном окружении Chromium лежит в `/opt/pw-browsers`):

```bash
CHROMIUM_PATH=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1) npm run shots -- before
ls shots/before
```

Expected: 16 файлов `phone-light-board.png` … `desktop-dark-projects.png`. Открыть `shots/before/phone-light-board.png` и убедиться, что видна доска «Портфолио» с карточками (не экран входа).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json scripts/fixture.mjs scripts/shots.mjs ../.gitignore
git commit -m "Скрипт скриншотов доски на синтетических данных (KAN-115)"
```

---

### Task 2: Токены «B» и тест контраста

**Files:**
- Create: `web/src/contrast.ts`
- Create: `web/test/contrast.test.ts`
- Modify: `web/src/styles.css` (блоки `@theme` и тёмный `:root`)
- Modify: `web/package.json` (скрипт `test`)

**Interfaces:**
- Produces: `contrast(a: string, b: string): number`, `parseTokens(css: string): { light: Record<string, string>; dark: Record<string, string> }` из `web/src/contrast.ts`. Токены `--color-ground … --color-shadow`, `--shadow-card`, `--shadow-menu` в `styles.css`.

- [ ] **Step 1: Написать падающий тест**

`web/test/contrast.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrast, parseTokens } from '../src/contrast.ts';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const tokens = parseTokens(css);

const TEXT = ['ink', 'ink-2', 'muted', 'accent-ink'];
const BG = ['ground', 'surface', 'raised', 'accent-soft'];
const PAIRS: [string, string][] = [
  ...TEXT.flatMap(fg => BG.map(bg => [fg, bg] as [string, string])),
  ['on-accent', 'accent'],
  ['danger', 'surface'],
  ['danger', 'ground'],
];

test('contrast: чёрное на белом 21, одинаковые цвета 1', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21);
  assert.equal(contrast('#c4532d', '#c4532d'), 1);
});

for (const theme of ['light', 'dark'] as const) {
  for (const [fg, bg] of PAIRS) {
    test(`${theme}: ${fg} на ${bg} ≥ 4.5`, () => {
      const a = tokens[theme][fg];
      const b = tokens[theme][bg];
      assert.ok(a && b, `нет токена ${fg} или ${bg}`);
      assert.ok(contrast(a, b) >= 4.5, `${fg} ${a} на ${bg} ${b}: ${contrast(a, b).toFixed(2)}`);
    });
  }
}
```

В `web/package.json` дописать `test/contrast.test.ts` в конец списка файлов скрипта `test`.

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/contrast.ts'`.

- [ ] **Step 3: Реализовать `contrast.ts`**

```ts
// Контраст WCAG 2.x. Нужен тесту, который держит все пары токенов
// «текст на фоне» не ниже AA: палитру легко сдвинуть на глаз и не
// заметить, что подписи стали нечитаемыми.
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => channel(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function hexTokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)) out[m[1]] = m[2];
  return out;
}

// Светлая тема — блок @theme, тёмная — :root внутри
// @media (prefers-color-scheme: dark), поверх светлой.
export function parseTokens(css: string) {
  const light = hexTokens(css.match(/@theme\s*\{([\s\S]*?)\n\}/)?.[1] ?? '');
  const darkBlock = css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([\s\S]*?)\}/)?.[1] ?? '';
  return { light, dark: { ...light, ...hexTokens(darkBlock) } };
}
```

- [ ] **Step 4: Запустить: тест пар должен падать на старых токенах**

Run: `npm test`
Expected: тест `contrast: чёрное на белом…` PASS; тесты пар FAIL (нет токенов `surface`, `raised`, `ink-2`, `on-accent`).

- [ ] **Step 5: Заменить токены в `styles.css`**

Заменить содержимое блока `@theme { … }` (оставив комментарий над ним про тёмную тему) на:

```css
@theme {
  --color-ground: #eef0f2;
  --color-surface: #ffffff;
  --color-raised: #e4e7ea;
  --color-ink: #1d2226;
  --color-ink-2: #3a4148;
  --color-muted: #5b646e;
  --color-line: #dde1e5;
  --color-accent: #c4532d;
  --color-accent-ink: #a9441f;
  --color-on-accent: #ffffff;
  --color-accent-soft: #f6e4dc;
  --color-danger: #c0392b;
  --color-overlay: rgb(29 34 38 / 0.40);
  --color-shadow: rgb(40 50 60 / 0.08);

  /* Карточки без рамок: объект от фона отделяет тень в тон фона. */
  --shadow-card: 0 1px 2px var(--color-shadow), 0 4px 14px -6px var(--color-shadow);
  --shadow-menu: 0 2px 6px var(--color-shadow), 0 12px 32px -8px var(--color-shadow);

  --text-2xs: 0.6875rem;
  --text-2xs--line-height: 1rem;
}
```

Заменить тёмный блок на:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-ground: #15171a;
    --color-surface: #1f2327;
    --color-raised: #2a2e33;
    --color-ink: #eef0f2;
    --color-ink-2: #cdd2d7;
    --color-muted: #949da6;
    --color-line: #2c3136;
    --color-accent: #e2744f;
    --color-accent-ink: #e8805d;
    --color-on-accent: #15171a;
    --color-accent-soft: #3a2419;
    --color-danger: #f07a6c;
    --color-overlay: rgb(0 0 0 / 0.60);
    --color-shadow: rgb(0 0 0 / 0.45);
  }
}
```

Комментарий в начале файла («Тёплый контраст вместо плоского серого…») заменить на:

```css
/* Стиль «B» (KAN-115): холодный серый фон, один тёплый акцент (терракота)
   на главном действии и на «Нужно от тебя». danger — отдельный красный,
   баг всегда несёт иконку, чтобы не путаться с акцентом.

   Тёмная тема — через обычный :root в @media, а не вложенный @theme:
   Tailwind v4 схлопывает @theme внутри @media в один :root и теряет
   медиа-запрос при сборке (проверено на собранном CSS). Обычный,
   не-layer'ный :root всегда перебивает @layer theme по правилам
   cascade layers, независимо от порядка источников. */
```

`--text-2xs` пока остаётся: его заменит Task 4.

- [ ] **Step 6: Запустить тесты**

Run: `npm test`
Expected: PASS все, включая 38 тестов пар (19 пар × 2 темы).

- [ ] **Step 7: Commit**

```bash
git add src/contrast.ts test/contrast.test.ts src/styles.css package.json
git commit -m "Токены стиля B и тест контраста AA для всех пар (KAN-115)"
```

---

### Task 3: Перевести разметку на новые токены

Старых токенов `panel` и `danger-ink` больше нет: без этой задачи сборка пройдёт, но фоны и цвет багов пропадут.

**Files:**
- Modify: `web/src/ui/panel.ts`
- Modify: все `web/src/*.tsx`, `web/src/ui/*.tsx`, где встречаются `color-panel`, `color-danger-ink`, `bg-(--color-danger)`

**Interfaces:**
- Produces: `panelClass(tone, extra)` возвращает `rounded-2xl bg-(--color-surface) shadow-card …` (default) или `rounded-2xl bg-(--color-accent-soft) shadow-card ring-[1.5px] ring-inset ring-(--color-accent) …` (accent).

- [ ] **Step 1: Переписать `panel.ts`**

```ts
export type PanelTone = 'default' | 'accent';

// Карточка отделяется от фона тенью, а не рамкой. «Нужно от тебя»
// дополнительно получает тёплый фон и тонкое акцентное кольцо — это
// единственное, что на доске должно бросаться в глаза.
const TONE: Record<PanelTone, string> = {
  default: 'bg-(--color-surface) shadow-card',
  accent: 'bg-(--color-accent-soft) shadow-card ring-[1.5px] ring-inset ring-(--color-accent)',
};

export function panelClass(tone: PanelTone = 'default', extra = ''): string {
  return `rounded-2xl ${TONE[tone]} ${extra}`.trim();
}
```

- [ ] **Step 2: Механическая замена классов**

Run:

```bash
cd src
sed -i 's/bg-(--color-danger) text-(--color-danger-ink)/text-(--color-danger)/g' *.tsx ui/*.tsx
sed -i 's/--color-danger-ink/--color-danger/g' *.tsx ui/*.tsx
sed -i 's/--color-panel/--color-raised/g' *.tsx ui/*.tsx
sed -i 's/text-(--color-ground)/text-(--color-on-accent)/g' ui/Button.tsx
cd ..
```

- [ ] **Step 3: Проверить, что старых токенов не осталось**

Run: `grep -rn "color-panel\|color-danger-ink\|bg-(--color-danger)" src || echo clean`
Expected: `clean`.

- [ ] **Step 4: Сборка и тесты**

Run: `npm test && npm run build`
Expected: PASS, сборка без ошибок.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "Разметка на токенах B: карточки на тени, danger без фона (KAN-115)"
```

---

### Task 4: Шрифт Onest и шкала текста

**Files:**
- Modify: `web/package.json` (`@fontsource/onest`)
- Modify: `web/src/main.tsx`
- Modify: `web/src/styles.css`
- Modify: все `web/src/**/*.tsx` (классы размеров текста)

**Interfaces:**
- Produces: утилиты `text-micro`, `text-meta`, `text-body`, `text-title`, `text-title-lg`; `font-sans` = Onest. `text-2xs` удаляется.

- [ ] **Step 1: Установить шрифт**

Run: `npm i @fontsource/onest@5.3.1`

- [ ] **Step 2: Подключить веса в `main.tsx`**

Над строкой `import './styles.css';` добавить:

```ts
// Onest лежит в сборке: без запросов к Google и без подмены шрифта при
// плохой сети. unicode-range в этих CSS грузит только нужные подмножества
// (кириллица, латиница).
import '@fontsource/onest/400.css';
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
```

- [ ] **Step 3: Шкала и шрифт в `styles.css`**

В `@theme` заменить две строки `--text-2xs…` на:

```css
  --font-sans: "Onest", ui-sans-serif, system-ui, sans-serif;

  /* Пять ступеней вместо разрозненных text-xs/sm/base. */
  --text-micro: 0.75rem;
  --text-micro--line-height: 1rem;
  --text-micro--font-weight: 500;
  --text-meta: 0.8125rem;
  --text-meta--line-height: 1.125rem;
  --text-meta--font-weight: 500;
  --text-body: 0.9375rem;
  --text-body--line-height: 1.4;
  --text-title: 1.125rem;
  --text-title--line-height: 1.5rem;
  --text-title--font-weight: 600;
  --text-title-lg: 1.25rem;
  --text-title-lg--line-height: 1.75rem;
  --text-title-lg--font-weight: 600;
```

В правиле `body` заменить `font-family: ui-sans-serif, system-ui, sans-serif;` на:

```css
  font-family: var(--font-sans);
  font-variant-numeric: tabular-nums;
```

- [ ] **Step 4: Механическая замена размеров**

Run:

```bash
cd src
sed -i -E 's/\btext-2xs\b/text-micro/g; s/\btext-xs\b/text-meta/g; s/\btext-sm\b/text-body/g; s/\btext-base\b/text-title/g' *.tsx ui/*.tsx
cd ..
grep -rnE "\btext-(2xs|xs|sm|base)\b" src || echo clean
```

Expected: `clean`.

- [ ] **Step 5: Сборка, тесты, проверка шрифта в бандле**

Run: `npm test && npm run build && ls dist/assets | grep -i onest | head -3`
Expected: PASS; в `dist/assets` есть файлы `onest-cyrillic-400-normal-*.woff2` и латиница.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src
git commit -m "Onest локально и пятиступенчатая шкала текста (KAN-115)"
```

---

### Task 5: Иконки Phosphor и кнопки-пилюли

**Files:**
- Modify: `web/package.json` (`@phosphor-icons/react`)
- Modify: `web/src/ui/Button.tsx`
- Modify: `web/src/TaskModal.tsx`, `web/src/CreateModal.tsx`, `web/src/EpicModal.tsx`, `web/src/ArchiveList.tsx`, `web/src/ProjectDrawer.tsx` (кнопка закрытия)
- Modify: `web/src/Board.tsx` (стрелки в панели свайпа, бейдж типа в `Card` и `CardPreview`)

**Interfaces:**
- Produces: `Button` с `variant: 'primary' | 'secondary' | 'ghost' | 'danger'` и `size: 'sm' | 'md' | 'icon'`. Компонент `TypeBadge({ type })` в `web/src/ui/TypeBadge.tsx`.

- [ ] **Step 1: Установить иконки**

Run: `npm i @phosphor-icons/react@2.1.10`

- [ ] **Step 2: Переписать `Button.tsx`**

```tsx
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'icon';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-(--color-accent) text-(--color-on-accent) font-medium',
  secondary: 'bg-(--color-raised) text-(--color-ink)',
  ghost: 'text-(--color-muted) hover:text-(--color-ink) hover:bg-(--color-raised)',
  danger: 'text-(--color-danger) hover:bg-(--color-raised)',
};

const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-meta',
  md: 'h-10 px-4 text-body',
  icon: 'size-10 justify-center',
};

// Все кнопки — пилюли. Нажатие чуть проседает (scale 0.98): на телефоне
// это единственный отклик до ответа сети.
export function Button(
  { variant = 'secondary', size = 'md', className = '', ...props }:
    ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size },
) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 rounded-full
                 transition-[transform,background-color,color] duration-150
                 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none
                 focus-visible:outline-2 focus-visible:outline-offset-2
                 focus-visible:outline-(--color-accent)
                 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    />
  );
}
```

- [ ] **Step 3: Кнопка закрытия в пяти файлах**

В каждом из файлов `TaskModal.tsx`, `CreateModal.tsx`, `EpicModal.tsx`, `ArchiveList.tsx`, `ProjectDrawer.tsx` найти кнопку, внутри которой стоит символ `×` (атрибуты `onClick={onClose}` и `aria-label="Закрыть"`), и заменить её целиком на:

```tsx
<Button variant="ghost" size="icon" onClick={onClose} aria-label="Закрыть" className="-mr-2 -mt-1">
  <X size={20} />
</Button>
```

В каждый из пяти файлов добавить импорты (если `Button` уже импортирован, добавить только `X`):

```tsx
import { X } from '@phosphor-icons/react';
import { Button } from './ui/Button';
```

Run: `grep -rn "×" src || echo clean`
Expected: `clean`.

- [ ] **Step 4: `TypeBadge`**

`web/src/ui/TypeBadge.tsx`:

```tsx
import { Bug, Wrench } from '@phosphor-icons/react';
import type { Item } from '../supabase';

// Баг и акцент близки по тону, поэтому тип всегда несёт иконку, а не
// только цвет. Обычная задача бейджа не получает.
export function TypeBadge({ type }: { type: Item['type'] }) {
  if (type === 'task') return null;
  const bug = type === 'bug';
  const Icon = bug ? Bug : Wrench;
  return (
    <span className={`inline-flex items-center gap-1 text-micro ${
      bug ? 'text-(--color-danger)' : 'text-(--color-muted)'
    }`}>
      <Icon size={13} />
      {bug ? 'баг' : 'долг'}
    </span>
  );
}
```

В `Board.tsx` и в `CardPreview`, и в `Card` заменить блок

```tsx
{item.type !== 'task' && (
  <span className="text-micro px-1.5 py-px rounded
                   text-(--color-danger)">
    {item.type === 'bug' ? 'баг' : 'долг'}
  </span>
)}
```

(отступы внутри className могут отличаться) на `<TypeBadge type={item.type} />` и добавить импорт `import { TypeBadge } from './ui/TypeBadge';`.

- [ ] **Step 5: Стрелки панели свайпа**

В `Board.tsx` заменить `<span>{dragX > 0 ? '→' : '←'}</span>` на `{dragX > 0 ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}` и добавить импорт `import { ArrowLeft, ArrowRight } from '@phosphor-icons/react';`. (Сама панель уйдёт в Task 10; до тех пор она должна жить на иконках.)

- [ ] **Step 6: Проверка**

Run: `npm test && npm run lint && npm run build`
Expected: PASS; lint без новых ошибок (предупреждения `set-state-in-effect` в `Board.tsx`/`TaskModal.tsx` существовали и до плана).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src
git commit -m "Иконки Phosphor, кнопки-пилюли, бейдж типа с иконкой (KAN-115)"
```

---

### Task 6: Тосты вместо текста ошибки в шапке

**Files:**
- Create: `web/src/ui/toast.ts`
- Create: `web/src/ui/Toaster.tsx`
- Create: `web/test/toast.test.ts`
- Modify: `web/src/App.tsx` (смонтировать `Toaster`)
- Modify: `web/src/Board.tsx` (убрать `err`, `setErr` → `toasts.show`)
- Modify: `web/package.json` (скрипт `test`)

**Interfaces:**
- Produces:
  ```ts
  type ToastAction = { label: string; run: () => void };
  type Toast = { id: number; text: string; action?: ToastAction };
  function createToastStore(timers?: { set: typeof setTimeout; clear: typeof clearTimeout }): {
    show(text: string, action?: ToastAction, ms?: number): void;
    dismiss(): void;
    get(): Toast | null;
    subscribe(fn: () => void): () => void;
  };
  const toasts: ReturnType<typeof createToastStore>;
  ```
  Компонент `<Toaster />`.

- [ ] **Step 1: Падающий тест**

`web/test/toast.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToastStore } from '../src/ui/toast.ts';

function fakeTimers() {
  let fn: (() => void) | null = null;
  return {
    timers: {
      set: ((cb: () => void) => { fn = cb; return 1; }) as unknown as typeof setTimeout,
      clear: (() => { fn = null; }) as unknown as typeof clearTimeout,
    },
    fire: () => fn?.(),
  };
}

test('show → get возвращает тост, по таймеру исчезает', () => {
  const t = fakeTimers();
  const s = createToastStore(t.timers);
  s.show('Ошибка сети');
  assert.equal(s.get()?.text, 'Ошибка сети');
  t.fire();
  assert.equal(s.get(), null);
});

test('новый тост заменяет старый, у каждого свой id', () => {
  const s = createToastStore(fakeTimers().timers);
  s.show('первый');
  const a = s.get()!.id;
  s.show('второй');
  assert.equal(s.get()?.text, 'второй');
  assert.notEqual(s.get()!.id, a);
});

test('подписчик получает уведомление, отписка работает', () => {
  const s = createToastStore(fakeTimers().timers);
  let n = 0;
  const off = s.subscribe(() => { n += 1; });
  s.show('a');
  s.dismiss();
  off();
  s.show('b');
  assert.equal(n, 2);
});
```

В `package.json` дописать `test/toast.test.ts` в скрипт `test`.

- [ ] **Step 2: Запустить**

Run: `npm test`
Expected: FAIL, модуль `../src/ui/toast.ts` не найден.

- [ ] **Step 3: Реализация стора**

`web/src/ui/toast.ts`:

```ts
// Один тост за раз, снизу по центру. Ошибки раньше выводились текстом в
// шапке доски и тонули среди кнопок; тост заметен и сам уходит. Стор без
// React, чтобы его можно было звать из любого обработчика и тестировать
// в node.
export type ToastAction = { label: string; run: () => void };
export type Toast = { id: number; text: string; action?: ToastAction };

export function createToastStore(
  timers: { set: typeof setTimeout; clear: typeof clearTimeout } = { set: setTimeout, clear: clearTimeout },
) {
  let current: Toast | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(fn => fn());

  const dismiss = () => {
    timers.clear(timer);
    current = null;
    emit();
  };

  return {
    show(text: string, action?: ToastAction, ms = 4000) {
      timers.clear(timer);
      seq += 1;
      current = { id: seq, text, action };
      timer = timers.set(dismiss, ms);
      emit();
    },
    dismiss,
    get: () => current,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}

export const toasts = createToastStore();
```

- [ ] **Step 4: Запустить**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Компонент `Toaster`**

`web/src/ui/Toaster.tsx`:

```tsx
import { useSyncExternalStore } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { toasts } from './toast';

export function Toaster() {
  const toast = useSyncExternalStore(toasts.subscribe, toasts.get);
  const reduce = useReducedMotion();
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 z-[60] flex justify-center px-4 pointer-events-none
                 bottom-[calc(88px+env(safe-area-inset-bottom))] lg:bottom-6"
    >
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="pointer-events-auto flex items-center gap-3 max-w-md rounded-full
                       bg-(--color-ink) text-(--color-ground) shadow-menu
                       pl-4 pr-2 min-h-11 text-meta"
          >
            <span className="py-2">{toast.text}</span>
            {toast.action && (
              <button
                onClick={() => { toast.action!.run(); toasts.dismiss(); }}
                className="h-8 px-3 rounded-full font-semibold text-(--color-ground)
                           hover:bg-(--color-ink-2)"
              >
                {toast.action.label}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

Проверка контраста тоста: текст `ground` на `ink` — та же пара, что `ink` на `ground` (14.0 / 15.7), проходит.

- [ ] **Step 6: Смонтировать и перевести `Board` на тосты**

В `App.tsx`: импорт `import { Toaster } from './ui/Toaster';`, а в `App` вернуть обёртку:

```tsx
  if (!ready) return null;
  return (
    <>
      {session ? <Board /> : <SignIn />}
      <Toaster />
    </>
  );
```

(заменяет две строки `if (!session) return <SignIn />;` и `return <Board />;`).

В `Board.tsx`:
1. Добавить импорт `import { toasts } from './ui/toast';`.
2. Удалить `const [err, setErr] = useState('');`, эффект таймера очистки `err` (блок `useEffect(() => { if (!err) return; … }, [err]);`) и комментарии над ним.
3. Удалить строку `{err && <span …>{err}</span>}` в шапке.
4. Run: `sed -i 's/setErr(\([a-zA-Z]*\)\.message)/toasts.show(\1.message)/g' src/Board.tsx`
5. В JSX колонки заменить `onError={setErr}` на `onError={msg => toasts.show(msg)}`.

Run: `grep -n "setErr\|\berr\b" src/Board.tsx || echo clean`
Expected: `clean`.

- [ ] **Step 7: Проверка**

Run: `npm test && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src test package.json
git commit -m "Тосты для ошибок доски (KAN-115)"
```

---

### Task 7: Приёмка фазы 1

**Files:** без изменений кода, кроме исправлений по найденному.

- [ ] **Step 1: Полная проверка**

Run: `npm test && npm run lint && npm run build && du -b dist/assets/*.js | awk '{s+=$1} END {print s}'`
Expected: PASS. Записать размер JS.

Размер до фазы — сборка `origin/main` во временной папке:

```bash
git worktree add /tmp/base origin/main
(cd /tmp/base/web && npm ci && npm run build && du -b dist/assets/*.js | awk '{s+=$1} END {print s}')
git worktree remove /tmp/base --force
```

Прибавка за фазу 1 ожидается в основном от шрифта (woff2 лежат отдельными файлами, не в JS) и иконок (несколько КБ: импортируются по одной).

- [ ] **Step 2: Снимки «после»**

Run: `CHROMIUM_PATH=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1) npm run shots -- phase1`
Открыть попарно `shots/before/*-board.png` и `shots/phase1/*-board.png`, `*-task.png` в обеих темах. Проверить: фон холодный серый, карточки белые на тени без рамок, Onest, иконки вместо `×`, у бага иконка жука, кнопка «Новая задача» терракотовая.

- [ ] **Step 3: Push и PR**

```bash
git push -u origin <ветка>
```

PR в `main` с заголовком «Редизайн B, фаза 1: основа (KAN-115)», в описании: что сделано, размер бандла до/после, 2–4 снимка «до/после», список проверок.

---

# Фаза 2. Каркас

### Task 8: Колонки как данные и память проекта

**Files:**
- Create: `web/src/columns.ts`
- Create: `web/src/prefs.ts`
- Create: `web/test/prefs.test.ts`
- Modify: `web/src/Board.tsx` (`COLUMNS` из `columns.ts`, выбор проекта через `prefs`)
- Modify: `web/package.json` (скрипт `test`)

**Interfaces:**
- Produces (`columns.ts`):
  ```ts
  type Status = Item['status'];
  const COLUMNS: readonly { key: Status; label: string }[];
  const STATUS_ORDER: Status[];
  function columnLabel(s: Status): string;
  const EMPTY_TEXT: Record<Status, string>;
  function undoPatch(item: Item): Pick<Item, 'status' | 'position' | 'closed_at'>;
  ```
- Produces (`prefs.ts`):
  ```ts
  type Store = Pick<Storage, 'getItem' | 'setItem'> | null;
  function storage(): Store;
  function readLastProject(s: Store): string | null;
  function writeLastProject(s: Store, id: string): void;
  function readLastColumn(s: Store, project: string): Status | null;
  function writeLastColumn(s: Store, project: string, status: Status): void;
  function pickProject(projects: { id: string }[], saved: string | null): string | null;
  function startColumn(items: Item[], saved: Status | null): Status;
  ```

- [ ] **Step 1: `columns.ts`**

```ts
import type { Item } from './supabase';

export type Status = Item['status'];

// Порядок колонок на доске и во вкладках. Раньше жил в Board.tsx и
// swipe.ts по отдельности.
export const COLUMNS = [
  { key: 'hold', label: 'Hold' },
  { key: 'backlog', label: 'Backlog' },
  { key: 'doing', label: 'В работе' },
  { key: 'waiting', label: 'Нужно от тебя' },
  { key: 'done', label: 'Готово' },
] as const satisfies readonly { key: Status; label: string }[];

export const STATUS_ORDER: Status[] = COLUMNS.map(c => c.key);

export const columnLabel = (s: Status): string =>
  COLUMNS.find(c => c.key === s)?.label ?? s;

export const EMPTY_TEXT: Record<Status, string> = {
  hold: 'Здесь то, что отложено',
  backlog: 'Новых задач нет',
  doing: 'Сейчас ничего не в работе',
  waiting: 'Когда Claude будет ждать твоего ответа, задача появится здесь',
  done: 'Закрытых задач пока нет',
};

// Что вернуть по «Отменить» после смены статуса. closed_at берётся
// исходный: иначе задача, случайно унесённая из «Готово», вернулась бы
// с датой закрытия «сейчас» и переехала бы в начало колонки.
export function undoPatch(item: Item): Pick<Item, 'status' | 'position' | 'closed_at'> {
  return { status: item.status, position: item.position, closed_at: item.closed_at };
}
```

- [ ] **Step 2: Падающий тест `prefs.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readLastProject, writeLastProject, readLastColumn, writeLastColumn,
  pickProject, startColumn,
} from '../src/prefs.ts';
import type { Item } from '../src/supabase.ts';

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
}
const broken = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
};
function mkItem(o: Partial<Item>): Item {
  return {
    id: 'X-1', seq: 1, project_id: 'p', epic_id: null, type: 'task', title: 't', body: null,
    status: 'backlog', checklist: [], blocks: [], position: 100,
    closed_at: null, archived_at: null, ...o,
  };
}

test('проект: запись и чтение', () => {
  const s = mem();
  writeLastProject(s, 'kanban');
  assert.equal(readLastProject(s), 'kanban');
});

test('колонка: своя для каждого проекта, мусор игнорируется', () => {
  const s = mem();
  writeLastColumn(s, 'a', 'doing');
  writeLastColumn(s, 'b', 'done');
  assert.equal(readLastColumn(s, 'a'), 'doing');
  assert.equal(readLastColumn(s, 'b'), 'done');
  s.setItem('kanban:lastColumn:c', 'nonsense');
  assert.equal(readLastColumn(s, 'c'), null);
});

test('падающий Storage и null не ломают чтение и запись', () => {
  assert.doesNotThrow(() => writeLastProject(broken, 'x'));
  assert.doesNotThrow(() => writeLastColumn(broken, 'x', 'doing'));
  assert.equal(readLastProject(broken), null);
  assert.equal(readLastColumn(broken, 'x'), null);
  assert.equal(readLastProject(null), null);
});

test('pickProject: сохранённый, если он есть в списке, иначе первый', () => {
  const ps = [{ id: 'a' }, { id: 'b' }];
  assert.equal(pickProject(ps, 'b'), 'b');
  assert.equal(pickProject(ps, 'gone'), 'a');
  assert.equal(pickProject(ps, null), 'a');
  assert.equal(pickProject([], 'a'), null);
});

test('startColumn: сохранённая важнее; иначе «В работе», если там есть живые задачи', () => {
  const doing = [mkItem({ status: 'doing' })];
  const archivedDoing = [mkItem({ status: 'doing', archived_at: '2026-01-01' })];
  assert.equal(startColumn(doing, 'done'), 'done');
  assert.equal(startColumn(doing, null), 'doing');
  assert.equal(startColumn(archivedDoing, null), 'backlog');
  assert.equal(startColumn([], null), 'backlog');
});
```

`package.json`: дописать `test/prefs.test.ts` в скрипт `test`.

- [ ] **Step 3: Запустить**

Run: `npm test`
Expected: FAIL, нет `../src/prefs.ts`.

- [ ] **Step 4: `prefs.ts`**

```ts
import type { Item } from './supabase';
// Расширение .ts обязательно: node --test запускает этот файл напрямую,
// без сборщика, и не угадывает расширения у импортов времени выполнения.
import { STATUS_ORDER, type Status } from './columns.ts';

// Память между заходами: последний проект и последняя вкладка на
// телефоне. Раньше после перезагрузки всегда открывался первый проект.
// Хранилище может отсутствовать или бросать (приватный режим, запрет
// cookies) — тогда просто ничего не помним.
export type Store = Pick<Storage, 'getItem' | 'setItem'> | null;

const PROJECT_KEY = 'kanban:lastProject';
const columnKey = (project: string) => `kanban:lastColumn:${project}`;

export function storage(): Store {
  try { return window.localStorage; } catch { return null; }
}

function read(s: Store, key: string): string | null {
  try { return s?.getItem(key) ?? null; } catch { return null; }
}

function write(s: Store, key: string, value: string): void {
  try { s?.setItem(key, value); } catch { /* память — удобство, не данные */ }
}

export const readLastProject = (s: Store) => read(s, PROJECT_KEY);
export const writeLastProject = (s: Store, id: string) => write(s, PROJECT_KEY, id);

export function readLastColumn(s: Store, project: string): Status | null {
  const v = read(s, columnKey(project));
  return STATUS_ORDER.includes(v as Status) ? (v as Status) : null;
}

export const writeLastColumn = (s: Store, project: string, status: Status) =>
  write(s, columnKey(project), status);

export function pickProject(projects: { id: string }[], saved: string | null): string | null {
  if (saved && projects.some(p => p.id === saved)) return saved;
  return projects[0]?.id ?? null;
}

export function startColumn(items: Item[], saved: Status | null): Status {
  if (saved) return saved;
  return items.some(i => i.status === 'doing' && !i.archived_at) ? 'doing' : 'backlog';
}
```

- [ ] **Step 5: Запустить**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Подключить в `Board.tsx`**

1. Удалить локальную константу `COLUMNS` (`const COLUMNS = [ … ] as const;`) и добавить импорты:
   ```ts
   import { COLUMNS } from './columns';
   import { storage, readLastProject, writeLastProject, pickProject } from './prefs';
   ```
2. В `reloadProjects` заменить две строки
   ```ts
   if (!keepCurrent && ps.length) setCurrent(ps[0].id);
   if (keepCurrent && !current && ps.length) setCurrent(ps[0].id);
   ```
   на
   ```ts
   if (!keepCurrent || !current) {
     const id = pickProject(ps, readLastProject(storage()));
     if (id) setCurrent(id);
   }
   ```
3. Добавить эффект сразу после объявления `current`:
   ```ts
   useEffect(() => { if (current) writeLastProject(storage(), current); }, [current]);
   ```

- [ ] **Step 7: Проверка и commit**

Run: `npm test && npm run lint && npm run build`
Expected: PASS.

```bash
git add src test package.json
git commit -m "Колонки в columns.ts, память последнего проекта (KAN-115)"
```

---

### Task 9: Вынести `Card` и `Column` из `Board.tsx`

Чистый перенос без изменения поведения: следующие задачи правят карточку и колонку, а `Board.tsx` уже 600+ строк.

**Files:**
- Create: `web/src/Card.tsx` (функции `CardPreview` и `Card` из `Board.tsx`)
- Create: `web/src/Column.tsx` (функция `Column` из `Board.tsx`)
- Modify: `web/src/Board.tsx`

**Interfaces:**
- Produces: `export function Card(props: { item: Item; onChanged: () => void; onError: (msg: string) => void; onOpen: (item: Item) => void })`, `export function CardPreview({ item }: { item: Item })`, `export function Column(props)` с теми же props, что сейчас у локальной `Column`.

- [ ] **Step 1: Перенести код**

1. Вырезать из `Board.tsx` функции `CardPreview` и `Card` целиком (от комментария «Плывущий клон под курсором…» до конца файла) и вставить в новый `src/Card.tsx`, добавив `export` перед обеими функциями и импорты, которые они используют:
   ```tsx
   import { useState } from 'react';
   import { useSortable } from '@dnd-kit/sortable';
   import { motion } from 'motion/react';
   import { ArrowLeft, ArrowRight } from '@phosphor-icons/react';
   import { setStatus } from './supabase';
   import type { Item } from './supabase';
   import { swipeTarget, swipePreview, SWIPE_THRESHOLD } from './swipe';
   import { COLUMNS } from './columns';
   import { panelClass } from './ui/panel';
   import { TypeBadge } from './ui/TypeBadge';
   ```
2. Вырезать функцию `Column` целиком и вставить в `src/Column.tsx` с `export` и импортами:
   ```tsx
   import { useDroppable } from '@dnd-kit/core';
   import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
   import type { Item, Epic } from './supabase';
   import { groupItemsByEpic, emptyEpics, epicProgress } from './epics';
   import { DONE_SHOWN, recentDone } from './done';
   import { COLUMNS } from './columns';
   import { Card } from './Card';
   ```
3. В `Board.tsx` добавить `import { CardPreview } from './Card';` и `import { Column } from './Column';` (`Card` в `Board` не нужен: его использует только `Column`). Удалить из `Board.tsx` ставшие неиспользуемыми импорты (`useDroppable`, `SortableContext`, `useSortable`, `verticalListSortingStrategy`, `swipe`, `epicProgress`, `groupItemsByEpic`, `emptyEpics`, `DONE_SHOWN`, `recentDone`, `motion`, `panelClass`, `TypeBadge`, стрелки) — ориентир: `npm run build` с `noUnusedLocals` назовёт каждый.

- [ ] **Step 2: Проверка**

Run: `npm test && npm run lint && npm run build`
Expected: PASS. `wc -l src/Board.tsx` меньше 400.

- [ ] **Step 3: Commit**

```bash
git add src
git commit -m "Card и Column в отдельных файлах, без изменения поведения (KAN-115)"
```

---

### Task 10: Меню статусов по долгому нажатию, «Отменить», удаление свайпа

**Files:**
- Create: `web/src/longpress.ts`
- Create: `web/src/useLongPress.ts`
- Create: `web/src/statusIcons.tsx`
- Create: `web/src/StatusMenu.tsx`
- Create: `web/test/longpress.test.ts`
- Create: `web/test/columns.test.ts`
- Delete: `web/src/swipe.ts`, `web/test/swipe.test.ts`
- Modify: `web/src/Card.tsx`, `web/src/Column.tsx`, `web/src/Board.tsx`, `web/src/styles.css`
- Modify: `web/package.json` (`@radix-ui/react-dropdown-menu`, скрипт `test`)

**Interfaces:**
- Consumes: `COLUMNS`, `columnLabel`, `undoPatch` (Task 8); `toasts` (Task 6); `setStatus`, `sb` из `supabase.ts`.
- Produces:
  - `longpress.ts`: `LONG_PRESS_MS = 450`, `MOVE_TOLERANCE = 10`, `movedTooFar(dx: number, dy: number): boolean`.
  - `useLongPress(onFire: () => void): { handlers: { onTouchStart; onTouchMove; onTouchEnd; onTouchCancel }; consumeClick: () => boolean }`.
  - `STATUS_ICON: Record<Status, Icon>`.
  - `StatusMenu({ item, open, onOpenChange, onMove, onOpen, onArchive })`.
  - `Card` больше не принимает `onError` (ошибки идут в тосты).

- [ ] **Step 1: Падающие тесты**

`web/test/longpress.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movedTooFar, MOVE_TOLERANCE, LONG_PRESS_MS } from '../src/longpress.ts';

test('дрожание пальца не отменяет долгое нажатие', () => {
  assert.equal(movedTooFar(3, 4), false);
  assert.equal(movedTooFar(0, MOVE_TOLERANCE), false);
});

test('движение дальше допуска — это прокрутка, нажатие отменяется', () => {
  assert.equal(movedTooFar(0, MOVE_TOLERANCE + 1), true);
  assert.equal(movedTooFar(-8, 8), true);
});

test('порог времени — 450 мс', () => {
  assert.equal(LONG_PRESS_MS, 450);
});
```

`web/test/columns.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS_ORDER, columnLabel, undoPatch } from '../src/columns.ts';
import type { Item } from '../src/supabase.ts';

test('порядок колонок', () => {
  assert.deepEqual(STATUS_ORDER, ['hold', 'backlog', 'doing', 'waiting', 'done']);
  assert.equal(columnLabel('waiting'), 'Нужно от тебя');
});

test('undoPatch сохраняет исходный closed_at задачи из «Готово»', () => {
  const item = {
    id: 'K-1', seq: 1, project_id: 'k', epic_id: null, type: 'task', title: 't', body: null,
    status: 'done', checklist: [], blocks: [], position: 350,
    closed_at: '2026-09-01T10:00:00Z', archived_at: null,
  } satisfies Item;
  assert.deepEqual(undoPatch(item), { status: 'done', position: 350, closed_at: '2026-09-01T10:00:00Z' });
});
```

В `package.json` в скрипте `test` заменить `test/swipe.test.ts` на `test/longpress.test.ts test/columns.test.ts`.

Run: `npm test`
Expected: FAIL, нет `../src/longpress.ts`.

- [ ] **Step 2: `longpress.ts`**

```ts
// Долгое нажатие на карточку открывает меню статусов. Горизонтальный
// свайп карточки больше не используется: он конфликтовал бы со свайпом
// ленты колонок. Движение дальше допуска — это прокрутка, не нажатие
// (тот же урок, что в KAN-113).
export const LONG_PRESS_MS = 450;
export const MOVE_TOLERANCE = 10;

export function movedTooFar(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > MOVE_TOLERANCE;
}
```

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Удалить свайп**

Run: `git rm src/swipe.ts test/swipe.test.ts`

- [ ] **Step 4: `useLongPress.ts`**

```ts
import { useRef } from 'react';
import { LONG_PRESS_MS, movedTooFar } from './longpress';

export function useLongPress(onFire: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  // После срабатывания браузер всё равно пришлёт click при отпускании
  // пальца — его надо проглотить, иначе вместе с меню откроется задача.
  const fired = useRef(false);

  const cancel = () => {
    clearTimeout(timer.current);
    start.current = null;
  };

  return {
    handlers: {
      onTouchStart: (e: React.TouchEvent) => {
        fired.current = false;
        start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          fired.current = true;
          navigator.vibrate?.(10);
          onFire();
        }, LONG_PRESS_MS);
      },
      onTouchMove: (e: React.TouchEvent) => {
        if (!start.current) return;
        const dx = e.touches[0].clientX - start.current.x;
        const dy = e.touches[0].clientY - start.current.y;
        if (movedTooFar(dx, dy)) cancel();
      },
      onTouchEnd: cancel,
      onTouchCancel: cancel,
    },
    consumeClick: () => {
      if (!fired.current) return false;
      fired.current = false;
      return true;
    },
  };
}
```

- [ ] **Step 5: `statusIcons.tsx`**

```tsx
import { PauseCircle, Tray, CircleHalf, BellRinging, CheckCircle, type Icon } from '@phosphor-icons/react';
import type { Status } from './columns';

export const STATUS_ICON: Record<Status, Icon> = {
  hold: PauseCircle,
  backlog: Tray,
  doing: CircleHalf,
  waiting: BellRinging,
  done: CheckCircle,
};
```

- [ ] **Step 6: Установить Radix и написать `StatusMenu.tsx`**

Run: `npm i @radix-ui/react-dropdown-menu@2.1.24`

```tsx
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Archive, ArrowSquareOut, Check, DotsThree } from '@phosphor-icons/react';
import type { Item } from './supabase';
import { COLUMNS, type Status } from './columns';
import { STATUS_ICON } from './statusIcons';

// Меню живёт в портале, но React-события из портала всплывают по дереву
// компонентов — до карточки, где висят onClick (открыть задачу),
// обработчики dnd-kit и долгого нажатия. Поэтому содержимое меню гасит
// всплытие всего, что карточка слушает.
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

const itemClass = `flex items-center gap-2.5 h-10 px-3 rounded-xl outline-none cursor-pointer
                   text-body text-(--color-ink) data-[highlighted]:bg-(--color-raised)`;

export function StatusMenu(
  { item, open, onOpenChange, onMove, onOpen, onArchive }: {
    item: Item;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onMove: (status: Status) => void;
    onOpen: () => void;
    onArchive: () => void;
  },
) {
  return (
    <Menu.Root open={open} onOpenChange={onOpenChange}>
      {/* Триггер — кнопка «⋯» в углу карточки. На мыши видна при наведении
          и фокусе; на сенсорных экранах невидима и не ловит касания, но
          остаётся в раскладке: меню, открытое долгим нажатием, якорится
          к ней. display:none дал бы нулевой прямоугольник в (0,0). */}
      <Menu.Trigger asChild>
        <button
          aria-label="Действия с задачей"
          onClick={stop}
          onMouseDown={stop}
          onPointerDown={stop}
          className="absolute right-1.5 top-1.5 size-8 grid place-items-center rounded-full
                     text-(--color-muted) hover:bg-(--color-raised) hover:text-(--color-ink)
                     opacity-0 group-hover:opacity-100 focus-visible:opacity-100
                     data-[state=open]:opacity-100
                     [@media(hover:none)]:pointer-events-none"
        >
          <DotsThree size={18} weight="bold" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          onClick={stop}
          onMouseDown={stop}
          onPointerDown={stop}
          onTouchStart={stop}
          className="z-50 min-w-56 rounded-2xl bg-(--color-surface) shadow-menu p-1.5"
        >
          {COLUMNS.map(c => {
            const Icon = STATUS_ICON[c.key];
            const current = c.key === item.status;
            return (
              <Menu.Item key={c.key} onSelect={() => onMove(c.key)} className={itemClass}>
                <Icon size={18} className="text-(--color-muted)" />
                <span className="flex-1">{c.label}</span>
                {current && <Check size={16} className="text-(--color-accent-ink)" />}
              </Menu.Item>
            );
          })}
          <Menu.Separator className="h-px my-1 mx-2 bg-(--color-line)" />
          <Menu.Item onSelect={onOpen} className={itemClass}>
            <ArrowSquareOut size={18} className="text-(--color-muted)" />
            Открыть
          </Menu.Item>
          {item.status === 'done' && !item.archived_at && (
            <Menu.Item onSelect={onArchive} className={itemClass}>
              <Archive size={18} className="text-(--color-muted)" />
              В архив
            </Menu.Item>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
```

- [ ] **Step 7: Переписать `Card` в `Card.tsx`**

Заменить функцию `Card` целиком на:

```tsx
export function Card(
  { item, onChanged, onOpen }: {
    item: Item; onChanged: () => void; onOpen: (item: Item) => void;
  },
) {
  const done = item.checklist.filter(s => s.done).length;
  const waiting = item.status === 'waiting';
  const [menuOpen, setMenuOpen] = useState(false);
  const { handlers, consumeClick } = useLongPress(() => setMenuOpen(true));
  // transition: null — всю анимацию позиции ведёт motion через layoutId.
  const { listeners, setNodeRef, transform, isDragging } =
    useSortable({ id: item.id, transition: null });

  const move = async (status: Status) => {
    if (status === item.status) return;
    const prev = undoPatch(item);
    const { error } = await setStatus(item.id, status);
    // Молчаливый отказ выглядел бы как «карточка сама вернулась назад».
    if (error) { toasts.show(error.message); return; }
    onChanged();
    toasts.show(`Перенесено в «${columnLabel(status)}»`, {
      label: 'Отменить',
      run: async () => {
        const { error: undoErr } = await sb.from('items').update(prev).eq('id', item.id);
        if (undoErr) { toasts.show(undoErr.message); return; }
        onChanged();
      },
    });
  };

  const archive = async () => {
    const { error } = await sb.from('items')
      .update({ archived_at: new Date().toISOString() }).eq('id', item.id);
    if (error) { toasts.show(error.message); return; }
    onChanged();
  };

  return (
    <motion.article
      ref={setNodeRef}
      layoutId={item.id}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(item); }
      }}
      animate={{
        x: transform?.x ?? 0,
        y: transform?.y ?? 0,
        zIndex: isDragging ? 10 : 0,
        opacity: isDragging ? 0.5 : 1,
        scale: menuOpen ? 1.02 : 1,
      }}
      transition={{ duration: isDragging ? 0 : 0.2, ease: 'easeOut' }}
      {...listeners}
      {...handlers}
      onClick={() => { if (!consumeClick()) onOpen(item); }}
      onContextMenu={e => { e.preventDefault(); setMenuOpen(true); }}
      className={panelClass(waiting ? 'accent' : 'default',
        'group relative p-3 pr-9 cursor-grab no-callout')}
    >
      <StatusMenu
        item={item}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onMove={move}
        onOpen={() => onOpen(item)}
        onArchive={archive}
      />
      <p className="text-body line-clamp-3">{item.title}</p>
      <div className="flex items-center gap-2.5 mt-1.5 text-micro text-(--color-muted)">
        <span>{item.id}</span>
        <TypeBadge type={item.type} />
        {item.checklist.length > 0 && <span>{done}/{item.checklist.length}</span>}
      </div>
    </motion.article>
  );
}
```

Импорты `Card.tsx` заменить на:

```tsx
import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { motion } from 'motion/react';
import { sb, setStatus } from './supabase';
import type { Item } from './supabase';
import { columnLabel, undoPatch, type Status } from './columns';
import { useLongPress } from './useLongPress';
import { StatusMenu } from './StatusMenu';
import { toasts } from './ui/toast';
import { panelClass } from './ui/panel';
import { TypeBadge } from './ui/TypeBadge';
```

(Мета карточки в полном виде — иконки чеклиста и комментариев — делается в фазе 3; здесь id, тип и счётчик чеклиста как сейчас.)

В `CardPreview` заменить разметку на ту же внешнюю форму, чтобы превью при перетаскивании совпадало с карточкой:

```tsx
export function CardPreview({ item }: { item: Item }) {
  const waiting = item.status === 'waiting';
  return (
    <article className={panelClass(waiting ? 'accent' : 'default', 'p-3 pr-9 shadow-menu rotate-1')}>
      <p className="text-body line-clamp-3">{item.title}</p>
      <div className="flex items-center gap-2.5 mt-1.5 text-micro text-(--color-muted)">
        <span>{item.id}</span>
        <TypeBadge type={item.type} />
      </div>
    </article>
  );
}
```

В `styles.css` в конец добавить:

```css
/* Долгое нажатие на карточку открывает наше меню; системное меню iOS
   (выделить, поделиться) и выделение текста ему мешали бы. */
.no-callout {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
```

- [ ] **Step 8: Убрать `onError` из `Column` и `Board`**

В `Column.tsx` удалить `onError` из типа props, из деструктуризации и из обоих `<Card … onError={onError} …/>`. В `Board.tsx` удалить `onError={msg => toasts.show(msg)}` у `<Column>`.

Run: `grep -rn "onError\|swipe" src || echo clean`
Expected: `clean`.

- [ ] **Step 9: Проверка**

Run: `npm test && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add -A src test package.json package-lock.json
git commit -m "Меню статусов по долгому нажатию и правому клику, «Отменить» вместо свайпа (KAN-115)"
```

---

### Task 11: Вкладки и лента колонок на телефоне, сетка на десктопе

**Files:**
- Create: `web/src/lane.ts`
- Create: `web/test/lane.test.ts`
- Create: `web/src/useMedia.ts`
- Create: `web/src/ColumnTabs.tsx`
- Create: `web/src/Lane.tsx`
- Modify: `web/src/Column.tsx`, `web/src/Board.tsx`
- Modify: `web/package.json` (скрипт `test`)

**Interfaces:**
- Consumes: `COLUMNS`, `STATUS_ORDER`, `Status` (Task 8); `storage`, `readLastColumn`, `writeLastColumn`, `startColumn` (Task 8).
- Produces:
  - `indexFromScroll(scrollLeft: number, step: number, count: number): number`.
  - `useMedia(query: string): boolean`.
  - `ColumnTabs({ counts, active, onSelect }: { counts: Record<Status, number>; active: Status; onSelect: (s: Status) => void })`.
  - `Lane({ active, onActiveChange, children }: { active: number; onActiveChange: (i: number) => void; children: React.ReactNode[] })`.
  - `Column` получает проп `bare: boolean` (true — без заголовка, для ленты).

- [ ] **Step 1: Падающий тест**

`web/test/lane.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexFromScroll } from '../src/lane.ts';

test('индекс по прокрутке округляется к ближайшей колонке', () => {
  assert.equal(indexFromScroll(0, 378, 5), 0);
  assert.equal(indexFromScroll(378, 378, 5), 1);
  assert.equal(indexFromScroll(560, 378, 5), 1);
  assert.equal(indexFromScroll(570, 378, 5), 2);
});

test('за краями и при нулевом шаге — в пределах 0..count-1', () => {
  assert.equal(indexFromScroll(-40, 378, 5), 0);
  assert.equal(indexFromScroll(99999, 378, 5), 4);
  assert.equal(indexFromScroll(500, 0, 5), 0);
  assert.equal(indexFromScroll(500, 378, 0), 0);
});
```

`package.json`: дописать `test/lane.test.ts` в скрипт `test`.

Run: `npm test`
Expected: FAIL, нет `../src/lane.ts`.

- [ ] **Step 2: `lane.ts`**

```ts
// Какая колонка ленты сейчас на экране. step — расстояние между началами
// соседних колонок (ширина + зазор): меряется по DOM, поэтому после
// поворота телефона пересчитывается сам.
export function indexFromScroll(scrollLeft: number, step: number, count: number): number {
  if (step <= 0 || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / step)));
}
```

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: `useMedia.ts`**

```ts
import { useSyncExternalStore } from 'react';

export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    notify => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', notify);
      return () => mq.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
  );
}
```

- [ ] **Step 4: `ColumnTabs.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { COLUMNS, type Status } from './columns';

export function ColumnTabs(
  { counts, active, onSelect }: {
    counts: Record<Status, number>; active: Status; onSelect: (s: Status) => void;
  },
) {
  const refs = useRef<Partial<Record<Status, HTMLButtonElement | null>>>({});
  const reduce = useReducedMotion();

  // Пять вкладок в 390px не влезают: активная сама подкручивается в видимую
  // зону, когда её выбрали свайпом ленты.
  useEffect(() => {
    refs.current[active]?.scrollIntoView({
      inline: 'nearest', block: 'nearest', behavior: reduce ? 'auto' : 'smooth',
    });
  }, [active, reduce]);

  return (
    <div
      role="tablist"
      aria-label="Колонки"
      className="flex gap-1 overflow-x-auto px-3 pb-2 no-scrollbar"
    >
      {COLUMNS.map(c => {
        const on = c.key === active;
        const n = counts[c.key];
        const hot = c.key === 'waiting' && n > 0;
        return (
          <button
            key={c.key}
            ref={el => { refs.current[c.key] = el; }}
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(c.key)}
            className={`relative shrink-0 h-9 px-3.5 rounded-full inline-flex items-center gap-1.5
                       text-meta transition-colors ${
              on ? 'text-(--color-ink)' : 'text-(--color-muted)'
            }`}
          >
            {on && (
              <motion.span
                layoutId="column-tab"
                className="absolute inset-0 rounded-full bg-(--color-raised)"
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{c.label}</span>
            {n > 0 && (
              <span className={`relative text-micro ${hot ? 'text-(--color-accent-ink) font-semibold' : ''}`}>
                {n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

В `styles.css` в конец добавить:

```css
.no-scrollbar { scrollbar-width: none; }
.no-scrollbar::-webkit-scrollbar { display: none; }
```

- [ ] **Step 5: `Lane.tsx`**

```tsx
import { Children, useEffect, useRef, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { indexFromScroll } from './lane';

// Лента колонок на телефоне: листание и доводку делает браузер
// (scroll-snap), своих обработчиков жеста нет — поэтому она не спорит с
// вертикальной прокруткой колонок.
export function Lane(
  { active, onActiveChange, children }: {
    active: number; onActiveChange: (i: number) => void; children: ReactNode;
  },
) {
  const ref = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const mounted = useRef(false);
  const reduce = useReducedMotion();

  const step = () => {
    const el = ref.current;
    if (!el || el.children.length < 2) return el?.clientWidth ?? 0;
    return (el.children[1] as HTMLElement).offsetLeft - (el.children[0] as HTMLElement).offsetLeft;
  };

  // Прокрутка → активная вкладка. scrollend приходит один раз, когда
  // доводка закончилась; где его нет — scroll, прорежённый rAF.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const settle = () => onActiveChange(indexFromScroll(el.scrollLeft, step(), el.children.length));
    if ('onscrollend' in window) {
      el.addEventListener('scrollend', settle);
      return () => el.removeEventListener('scrollend', settle);
    }
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(settle); };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { cancelAnimationFrame(raf); el.removeEventListener('scroll', onScroll); };
  }, [onActiveChange]);

  // Активная вкладка → прокрутка. Первый раз без анимации: открываемся
  // сразу на сохранённой колонке.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const left = active * step();
    if (Math.abs(el.scrollLeft - left) > 2) {
      el.scrollTo({ left, behavior: mounted.current && !reduce ? 'smooth' : 'instant' });
    }
    mounted.current = true;
  }, [active, reduce]);

  // Поворот или изменение ширины — вернуться точно на активную колонку.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      el.scrollTo({ left: activeRef.current * step(), behavior: 'instant' });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="flex-1 min-h-0 flex gap-3 overflow-x-auto overscroll-x-contain
                 snap-x snap-mandatory scroll-px-3 px-3 no-scrollbar"
    >
      {Children.map(children, child => (
        <div className="snap-start shrink-0 h-full w-[calc(100%-24px)] md:w-[calc(50%-6px)]">
          {child}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: `Column` без рамок, со своей прокруткой**

В `Column.tsx`:
1. Добавить в props `bare: boolean`.
2. Заменить корневой `<section ref={setNodeRef} className="rounded-lg border border-(--color-line) p-2">` на:
   ```tsx
   <section ref={setNodeRef} className="h-full min-h-0 flex flex-col">
   ```
3. Заголовок колонки `<h2 …>` показывать только когда `!bare`, с классами:
   ```tsx
   {!bare && (
     <h2 className="flex items-center gap-2 px-1 pb-3 text-meta text-(--color-muted)">
       {col.label}
       {full.length > 0 && <span className="text-micro">{full.length}</span>}
     </h2>
   )}
   ```
4. Обернуть `<SortableContext …>…</SortableContext>` и кнопку архива в
   ```tsx
   <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain pb-28 lg:pb-6 -mx-1 px-1 pt-1">
     …
   </div>
   ```
   (отступ снизу 28 держит последнюю карточку над круглой кнопкой `+` на телефоне; `pt-1` и `-mx-1 px-1` не дают тени карточек обрезаться краем прокрутки).
5. Рамку группы эпика `<div key={epic.id} className="rounded-lg border border-(--color-line) p-1.5">` заменить на `<div key={epic.id} className="space-y-2">`; кнопку-заголовок эпика оставить как есть (её перерисовывает фаза 3).

- [ ] **Step 7: Раскладка в `Board.tsx`**

1. Импорты:
   ```ts
   import { useCallback, useRef } from 'react';   // добавить к существующему импорту из 'react'
   import { COLUMNS, STATUS_ORDER, type Status } from './columns';
   import { storage, readLastProject, writeLastProject, pickProject,
            readLastColumn, writeLastColumn, startColumn } from './prefs';
   import { useMedia } from './useMedia';
   import { ColumnTabs } from './ColumnTabs';
   import { Lane } from './Lane';
   ```
2. Состояние (рядом с остальными `useState`):
   ```ts
   const isDesktop = useMedia('(min-width: 1024px)');
   const [activeColumn, setActiveColumn] = useState<Status>('backlog');
   // Стартовая колонка выбирается один раз на проект — по первой загрузке
   // его задач, а не при каждом realtime-обновлении.
   const columnPicked = useRef<string | null>(null);
   const selectColumn = useCallback((s: Status) => {
     setActiveColumn(s);
     if (columnPicked.current) writeLastColumn(storage(), columnPicked.current, s);
   }, []);
   const selectColumnIndex = useCallback((i: number) => selectColumn(STATUS_ORDER[i]), [selectColumn]);
   ```
3. В `reload(project)` после `setItems(list);` добавить:
   ```ts
   if (columnPicked.current !== project) {
     columnPicked.current = project;
     setActiveColumn(startColumn(list, readLastColumn(storage(), project)));
   }
   ```
4. Счётчики вкладок (рядом с `archivedCount`):
   ```ts
   const counts = Object.fromEntries(STATUS_ORDER.map(s =>
     [s, items.filter(i => i.status === s && !i.archived_at).length])) as Record<Status, number>;
   ```
5. Корневой `<div className="min-h-dvh p-4 md:p-6 max-w-6xl mx-auto">` заменить на
   ```tsx
   <div className="h-dvh flex flex-col max-w-[1440px] mx-auto">
   ```
   а `<header …>` получить отступы `px-4 pt-3 pb-2 lg:px-6 lg:pt-5 lg:pb-4` вместо `mb-5` (содержимое шапки меняет Task 12).
6. Блок `<DndContext …> <div className="grid gap-3 md:grid-cols-5"> {COLUMNS.map(…)} </div> <DragOverlay>…</DragOverlay> </DndContext>` заменить на:
   ```tsx
   <DndContext
     sensors={sensors}
     onDragStart={e => setActiveId(e.active.id as string)}
     onDragEnd={onDragEnd}
     onDragCancel={() => setActiveId(null)}
   >
     {isDesktop ? (
       <div className="flex-1 min-h-0 grid grid-cols-5 gap-4 px-6">
         {COLUMNS.map(col => renderColumn(col, false))}
       </div>
     ) : (
       <>
         <ColumnTabs counts={counts} active={activeColumn} onSelect={selectColumn} />
         <Lane active={STATUS_ORDER.indexOf(activeColumn)} onActiveChange={selectColumnIndex}>
           {COLUMNS.map(col => renderColumn(col, true))}
         </Lane>
       </>
     )}
     <DragOverlay>
       {activeItem && <CardPreview item={activeItem} />}
     </DragOverlay>
   </DndContext>
   ```
   и перед `return (` объявить:
   ```tsx
   const renderColumn = (col: typeof COLUMNS[number], bare: boolean) => (
     <Column
       key={col.key}
       col={col}
       bare={bare}
       items={items.filter(i => i.status === col.key && !i.archived_at)}
       epics={epics}
       allItems={items}
       archivedCount={archivedCount}
       onChanged={() => reload(current)}
       onOpen={setOpenItem}
       onOpenEpic={id => setViewEpic(id)}
       onShowArchive={() => setShowArchive(true)}
     />
   );
   ```

- [ ] **Step 8: Проверка**

Run: `npm test && npm run lint && npm run build`
Expected: PASS.

Run: `CHROMIUM_PATH=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1) npm run shots -- task11`
Открыть `shots/task11/phone-light-board.png`: сверху вкладки, под ними одна колонка «В работе» (в фикстуре «Портфолио» в работе две задачи), справа виден край следующей колонки. `desktop-light-board.png`: пять колонок без рамок.

- [ ] **Step 9: Commit**

```bash
git add src test package.json
git commit -m "Вкладки и лента колонок на телефоне, сетка без рамок на десктопе (KAN-115)"
```

---

### Task 12: Шапка и круглая кнопка «Новая задача»

**Files:**
- Create: `web/src/BoardHeader.tsx`
- Modify: `web/src/Board.tsx`

**Interfaces:**
- Consumes: `Button` (Task 5), `Project` из `supabase.ts`.
- Produces: `BoardHeader({ project, done, total, onOpenProjects, onCreate, onSaveDescription }: { project: Project | null; done: number; total: number; onOpenProjects: () => void; onCreate: () => void; onSaveDescription: (text: string | null) => void })`.

- [ ] **Step 1: `BoardHeader.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { CaretDown, Plus } from '@phosphor-icons/react';
import type { Project } from './supabase';
import { Button } from './ui/Button';
import { Editable } from './Editable';

// Телефон: одна строка — переключатель проекта и прогресс; описание на
// доске не показывается (до трёх строк над колонками). Десктоп: описание
// в одну строку с правкой по клику и кнопка «Новая задача».
export function BoardHeader(
  { project, done, total, onOpenProjects, onCreate, onSaveDescription }: {
    project: Project | null; done: number; total: number;
    onOpenProjects: () => void; onCreate: () => void;
    onSaveDescription: (text: string | null) => void;
  },
) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project?.description ?? '');

  // Сбрасывать черновик при смене проекта или при обновлении описания
  // с сервера — иначе в поле мог бы остаться текст другого проекта.
  useEffect(() => {
    setEditing(false);
    setDraft(project?.description ?? '');
  }, [project?.id, project?.description]);

  const save = () => {
    setEditing(false);
    const clean = draft.trim() || null;
    if (project && clean !== project.description) onSaveDescription(clean);
  };

  return (
    <header className="flex items-center gap-3 px-4 pt-3 pb-2 lg:px-6 lg:pt-5 lg:pb-4">
      <button
        onClick={onOpenProjects}
        aria-label={`Проект: ${project?.name ?? 'не выбран'}. Сменить`}
        className="inline-flex items-center gap-1.5 min-w-0 -ml-1 px-1 rounded-lg
                   text-title-lg text-(--color-ink) active:scale-[0.98] transition-transform"
      >
        <span className="truncate">{project?.name ?? 'Проекты'}</span>
        <CaretDown size={16} className="shrink-0 text-(--color-muted)" />
      </button>

      {project && (
        <div className="hidden lg:block min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={save}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
              placeholder="описание проекта"
              className="w-full h-9 px-3 rounded-xl bg-(--color-raised) text-body outline-none
                         focus:ring-2 focus:ring-(--color-accent)"
            />
          ) : (
            <Editable
              onEdit={() => setEditing(true)}
              className="block truncate text-body text-(--color-muted) cursor-text"
            >
              {project.description || 'Добавить описание'}
            </Editable>
          )}
        </div>
      )}

      <span className="ml-auto shrink-0 text-meta text-(--color-muted)">
        {done} из {total}
      </span>

      <Button variant="primary" onClick={onCreate} className="hidden lg:inline-flex">
        <Plus size={18} weight="bold" />
        Новая задача
      </Button>

      <button
        onClick={onCreate}
        aria-label="Новая задача"
        className="lg:hidden fixed z-40 right-4 bottom-[calc(16px+env(safe-area-inset-bottom))]
                   size-14 rounded-full grid place-items-center shadow-menu
                   bg-(--color-accent) text-(--color-on-accent)
                   active:scale-95 transition-transform"
      >
        <Plus size={26} weight="bold" />
      </button>
    </header>
  );
}
```

- [ ] **Step 2: Подключить в `Board.tsx`**

1. Импорт `import { BoardHeader } from './BoardHeader';`.
2. Удалить из `Board` состояние и эффект описания (`editingDescription`, `descriptionDraft`, эффект сброса черновика) и функцию `saveDescription`, заменив её на:
   ```ts
   const saveDescription = async (description: string | null) => {
     const { error } = await sb.from('projects').update({ description }).eq('id', current);
     if (error) { toasts.show(error.message); return; }
     reloadProjects();
   };
   ```
3. Весь `<header>…</header>` заменить на:
   ```tsx
   <BoardHeader
     project={currentProject}
     done={items.filter(i => i.status === 'done').length}
     total={items.length}
     onOpenProjects={() => setShowProjects(true)}
     onCreate={() => setShowCreate(true)}
     onSaveDescription={saveDescription}
   />
   ```
4. Удалить ставшие неиспользуемыми импорты (`Editable`, `Button`, если больше не нужны) — `npm run build` их назовёт.

- [ ] **Step 3: Поправить скрипт снимков**

Кнопка проекта теперь называется «Проект: … Сменить». В `scripts/shots.mjs` в функции `switchTo` и в сцене проектов регулярки `/Кофейня|Портфолио|Проекты/` и `/Портфолио/` продолжают совпадать с `aria-label` (он содержит имя проекта) — проверить запуском в Step 4.

- [ ] **Step 4: Проверка**

Run: `npm test && npm run lint && npm run build && CHROMIUM_PATH=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1) npm run shots -- task12`
Expected: PASS; на `phone-light-board.png` шапка в одну строку «Портфолио ⌄ … 3 из 15», круглая терракотовая `+` внизу справа; на `desktop-light-board.png` описание в одну строку и кнопка «Новая задача».

- [ ] **Step 5: Commit**

```bash
git add src scripts
git commit -m "Шапка в одну строку и круглая кнопка «Новая задача» на телефоне (KAN-115)"
```

---

### Task 13: Пустые колонки и скелетоны загрузки

**Files:**
- Modify: `web/src/Card.tsx` (`CardSkeleton`)
- Modify: `web/src/Column.tsx` (проп `loading`, пустое состояние)
- Modify: `web/src/Board.tsx` (флаг загрузки)

**Interfaces:**
- Consumes: `EMPTY_TEXT` (Task 8), `STATUS_ICON` (Task 10).
- Produces: `CardSkeleton()`; `Column` получает проп `loading: boolean`.

- [ ] **Step 1: `CardSkeleton` в `Card.tsx`**

```tsx
// Форма настоящей карточки, без шиммера: при медленной сети видно, что
// доска грузится и какой она будет, а не пустые колонки.
export function CardSkeleton() {
  return (
    <div aria-hidden className={panelClass('default', 'p-3 space-y-2.5')}>
      <div className="h-3.5 w-4/5 rounded-full bg-(--color-raised)" />
      <div className="h-3.5 w-3/5 rounded-full bg-(--color-raised)" />
      <div className="h-3 w-14 rounded-full bg-(--color-raised)" />
    </div>
  );
}
```

- [ ] **Step 2: `Column`: загрузка и пусто**

1. Добавить в props `loading: boolean`; импорты `import { CardSkeleton } from './Card';`, `import { EMPTY_TEXT } from './columns';`, `import { STATUS_ICON } from './statusIcons';`.
2. Внутри прокручиваемого `div` (Task 11, Step 6.4) первым делом:
   ```tsx
   {loading ? (
     <div className="space-y-2">
       <CardSkeleton /><CardSkeleton /><CardSkeleton />
     </div>
   ) : list.length === 0 && pinnedEmpty.length === 0 ? (
     <EmptyColumn status={col.key} />
   ) : (
     /* существующий <SortableContext>…</SortableContext> */
   )}
   ```
   Кнопка «ещё N · архив» остаётся после этого блока без изменений.
3. В конец `Column.tsx` добавить:
   ```tsx
   function EmptyColumn({ status }: { status: Item['status'] }) {
     const Icon = STATUS_ICON[status];
     return (
       <div className="flex flex-col items-center gap-2 text-center px-6 py-12 text-(--color-muted)">
         <Icon size={28} />
         <p className="text-meta max-w-60">{EMPTY_TEXT[status]}</p>
       </div>
     );
   }
   ```

- [ ] **Step 3: Флаг загрузки в `Board.tsx`**

1. Состояние: `const [loaded, setLoaded] = useState(false);`.
2. В эффекте по `[current]` первой строкой: `setLoaded(false);`.
3. В `reload(project)` после `setItems(list);`: `setLoaded(true);`.
4. В `renderColumn` передать `loading={!loaded}`.

- [ ] **Step 4: Проверка**

Run: `npm test && npm run lint && npm run build && CHROMIUM_PATH=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1) npm run shots -- task13`
Expected: PASS; на `desktop-light-board.png` проекта «Портфолио» все колонки с задачами; для проверки пустой колонки открыть `shots/task13/phone-light-board.png` после переключения вкладки нельзя — достаточно десктопного снимка «Кофейни»: в ней нет Hold, в колонке Hold иконка паузы и «Здесь то, что отложено». Для этого в `scripts/shots.mjs` после цикла по темам добавить одну сцену:
```js
{
  const { ctx, page } = await open({ ...viewports.desktop });
  await switchTo(page, 'Кофейня');
  await page.screenshot({ path: `${out}desktop-light-empty.png` });
  await ctx.close();
}
```

- [ ] **Step 5: Commit**

```bash
git add src scripts
git commit -m "Пустые колонки с подсказкой и скелетоны при загрузке (KAN-115)"
```

---

### Task 14: Приёмка фазы 2

**Files:**
- Create: `web/scripts/longpress-check.mjs`

- [ ] **Step 1: Проверка долгого нажатия в браузере**

`web/scripts/longpress-check.mjs` — самостоятельный скрипт со своим сервером на порту 5198 и своими моками:

```js
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
```

Run: `CHROMIUM_PATH=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1) node scripts/longpress-check.mjs`
Expected: `{ menu: true, openItem: true, taskOpened: false }` и `OK`.

- [ ] **Step 2: Полная проверка и размер**

Run: `npm test && npm run lint && npm run build && du -b dist/assets/*.js | awk '{s+=$1} END {print s}'`
Expected: PASS. Записать размер JS рядом с цифрой фазы 1.

- [ ] **Step 3: Снимки**

Run: `CHROMIUM_PATH=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1) npm run shots -- phase2`
Сравнить `shots/before/*` и `shots/phase2/*` в обеих темах и на обоих размерах. Проверить по спеке раздел 2: шапка, вкладки (активная на плашке, счётчик «Нужно от тебя» акцентный), одна колонка + край соседней, круглая `+`, десктоп без рамок.

- [ ] **Step 4: Commit, push, PR**

```bash
git add scripts/longpress-check.mjs
git commit -m "Проверка долгого нажатия в браузере (KAN-115)"
git push -u origin <ветка>
```

PR «Редизайн B, фаза 2: каркас (KAN-115)»: что сделано, размер бандла, снимки «до/после» телефона и десктопа, вывод `longpress-check`, отдельным пунктом «проверить на живом телефоне: свайп ленты, долгое нажатие, вкладки, кнопка +».
