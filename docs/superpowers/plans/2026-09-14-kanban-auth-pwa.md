# Вход и установка как приложение — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сайт можно поставить на экран «Домой» на iPhone с иконкой, и
войти в него можно изнутри установленного приложения — 6-значным кодом
из письма, без перехода в Safari.

**Architecture:** Статический `manifest.webmanifest` + сгенерированные
PNG-иконки (монограмма «K», через `sharp`) делают сайт устанавливаемым.
`SignIn` в `App.tsx` переходит с magic-link на `verifyOtp` с кодом —
весь вход происходит на одной странице, без внешнего перехода, поэтому
работает одинаково в браузере и в standalone-режиме.

**Tech Stack:** React 19, TypeScript strict, Vite 8 (`base: '/kanban/'`),
`@supabase/supabase-js` Auth (OTP), `sharp` (dev-инструмент, генерация
иконок, в продакшен-бандл не попадает).

**Spec:** `docs/superpowers/specs/2026-09-14-kanban-auth-pwa-design.md`
(родительская: `docs/superpowers/specs/2026-09-11-kanban-design.md`).

## Global Constraints

- Тарифы: только бесплатные — `sharp` не добавляет платных сервисов.
- Доступ: RLS не меняется, эта работа не трогает данные, только форму
  входа и статические файлы.
- Сервисный ключ Supabase никогда не попадает в репозиторий и в
  браузер — `verifyOtp` идёт через уже используемый анонимный ключ.
- Тесты — эта работа не создаёт чистых функций, юнит-тестов не будет
  (обе задачи требуют живой проверки — форма и реальное письмо).
- Язык: комментарии в коде и тексты интерфейса — по-русски.
- Цвет несёт смысл. Иконка и мета-теги используют существующий тон
  `--color-ink`/`--color-ground` — новых цветов не заводим.

**Обязательный ручной шаг вне кода** (не входит ни в одну задачу —
делает владелец сам, до живой проверки Task 2): Supabase Dashboard →
Authentication → Email Templates → **Magic Link** → добавить в тело
письма `{{ .Token }}`. Без этого шага код никогда не появится в письме,
и `verifyOtp` будет нечего проверять — сам вызов при этом отработает
корректно, просто взять код будет неоткуда.

---

### Task 1: PWA — манифест, иконки, мета-теги

**Files:**
- Create: `web/scripts/generate-icons.mjs`
- Create (генерируются скриптом, не руками): `web/public/icons/apple-touch-icon.png`,
  `web/public/icons/icon-192.png`, `web/public/icons/icon-512.png`
- Create: `web/public/manifest.webmanifest`
- Modify: `web/index.html`
- Modify: `web/package.json`

**Interfaces:** нет — статические файлы, ни на что не влияют внутри кода.

- [ ] **Step 1: Поставить `sharp` как dev-зависимость**

Run: `cd web && npm install --save-dev sharp`

- [ ] **Step 2: Написать генератор иконок**

Создать `web/scripts/generate-icons.mjs`:

```js
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#1a1a18"/>
  <text x="${size / 2}" y="${size / 2}" font-family="system-ui, sans-serif"
        font-size="${size * 0.55}" font-weight="600" fill="#ffffff"
        text-anchor="middle" dominant-baseline="central">K</text>
</svg>`;

const sizes = [
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
];

await mkdir('public/icons', { recursive: true });

for (const { name, size } of sizes) {
  await sharp(Buffer.from(svg(size))).png().toFile(`public/icons/${name}`);
  console.log(`сгенерировано: public/icons/${name}`);
}
```

- [ ] **Step 3: Прогнать генератор**

Run (из `web/`): `node scripts/generate-icons.mjs`
Expected: три строки «сгенерировано: ...», файлы появились в
`web/public/icons/`. Открыть `apple-touch-icon.png` и убедиться, что
буква «K» по центру, не обрезана и не съехала.

- [ ] **Step 4: Написать `manifest.webmanifest`**

Создать `web/public/manifest.webmanifest` (пути с `/kanban/` — этот
файл не проходит через Vite и не разворачивается автоматически, в
отличие от `index.html`):

```json
{
  "name": "Канбан",
  "short_name": "Канбан",
  "start_url": "/kanban/",
  "scope": "/kanban/",
  "display": "standalone",
  "background_color": "#17171a",
  "theme_color": "#17171a",
  "icons": [
    { "src": "/kanban/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/kanban/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 5: Подключить манифест и иконку в `index.html`**

В `web/index.html` найти:
```html
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>web</title>
```
Заменить на:
```html
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="theme-color" content="#17171a" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>web</title>
```

Пути записаны так же, как уже работающая строка `favicon.svg` (корневой
абсолютный путь без `/kanban/`) — Vite сам добавляет `base` к таким
ссылкам в распознаваемых тегах (`link[href]`) при сборке, тот же
механизм, что уже держит рабочим фавикон.

- [ ] **Step 6: Добавить скрипт пересборки иконок в `package.json`**

В `web/package.json` найти:
```json
    "test": "node --test test/guess.test.ts test/position.test.ts test/epics.test.ts test/slug.test.ts"
```
Заменить на:
```json
    "icons": "node scripts/generate-icons.mjs",
    "test": "node --test test/guess.test.ts test/position.test.ts test/epics.test.ts test/slug.test.ts"
```

- [ ] **Step 7: Проверить сборку**

Run: `cd web && npm run build`
Expected: чисто; `dist/manifest.webmanifest` и `dist/icons/*.png`
присутствуют после сборки (публичные файлы копируются как есть).

- [ ] **Step 8: Коммит**

```bash
git add web/scripts/generate-icons.mjs web/public/icons web/public/manifest.webmanifest web/index.html web/package.json web/package-lock.json
git commit -m "PWA: манифест, иконка-монограмма, мета-теги — сайт можно поставить на экран «Домой»"
```

Живая проверка (реальная установка на iPhone через «Поделиться» →
«На экран «Домой»», иконка и заставка корректны) — ручной шаг владельца
после деплоя, не проверяется в этой задаче.

---

### Task 2: Вход — код из письма вместо ссылки

**Files:**
- Modify: `web/src/App.tsx` (функция `SignIn` переписывается целиком; `App` не трогается)

**Interfaces:**
- Consumes: `sb.auth` из `supabase.ts` (без изменений).
- Produces: без изменений — `SignIn` как была без пропсов, используется
  только внутри `App`, тип компонента не публикуется.

- [ ] **Step 1: Переписать `SignIn` в `web/src/App.tsx`**

Найти:
```tsx
function SignIn() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Введите почту'); return; }
    setError('');
    setState('sending');
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.href },
    });
    if (error) { setError(error.message); setState('idle'); return; }
    setState('sent');
  };

  if (state === 'sent') {
    return (
      <div className="min-h-dvh grid place-items-center p-6">
        <p className="text-sm text-(--color-muted) text-center">
          Ссылка ушла на {email}.<br />Открой её на этом устройстве.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh grid place-items-center p-6">
      <form onSubmit={send} className="w-full max-w-72 space-y-3">
        <h1 className="text-base font-medium">Канбан</h1>
        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setError(''); }}
          placeholder="name@example.com"
          className="w-full h-9 px-3 rounded-lg bg-(--color-panel)
                     border border-(--color-line) text-sm outline-none
                     focus:border-(--color-muted)"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={state === 'sending'}
          className="w-full h-9 rounded-lg bg-(--color-ink)
                     text-(--color-ground) text-sm"
        >
          {state === 'sending' ? 'Отправляю…' : 'Прислать ссылку'}
        </button>
      </form>
    </div>
  );
}
```
Заменить на:
```tsx
function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'code' | 'verifying'>('idle');
  const [error, setError] = useState('');

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Введите почту'); return; }
    setError('');
    setState('sending');
    const { error } = await sb.auth.signInWithOtp({ email: email.trim() });
    if (error) { setError(error.message); setState('idle'); return; }
    setState('code');
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) { setError('Введите код из письма'); return; }
    setError('');
    setState('verifying');
    const { error } = await sb.auth.verifyOtp({
      email: email.trim(), token: code.trim(), type: 'email',
    });
    if (error) { setError(error.message); setState('code'); return; }
  };

  if (state === 'code' || state === 'verifying') {
    return (
      <div className="min-h-dvh grid place-items-center p-6">
        <form onSubmit={verify} className="w-full max-w-72 space-y-3">
          <h1 className="text-base font-medium">Канбан</h1>
          <p className="text-sm text-(--color-muted)">
            Код ушёл на {email}.
          </p>
          <input
            autoFocus
            value={code}
            onChange={e => { setCode(e.target.value); setError(''); }}
            placeholder="123456"
            inputMode="numeric"
            maxLength={6}
            className="w-full h-9 px-3 rounded-lg bg-(--color-panel)
                       border border-(--color-line) text-sm outline-none
                       focus:border-(--color-muted)"
          />
          {error && <p className="text-xs text-(--color-danger-ink)">{error}</p>}
          <button
            type="submit"
            disabled={state === 'verifying'}
            className="w-full h-9 rounded-lg bg-(--color-ink)
                       text-(--color-ground) text-sm"
          >
            {state === 'verifying' ? 'Проверяю…' : 'Войти'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-dvh grid place-items-center p-6">
      <form onSubmit={send} className="w-full max-w-72 space-y-3">
        <h1 className="text-base font-medium">Канбан</h1>
        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setError(''); }}
          placeholder="name@example.com"
          className="w-full h-9 px-3 rounded-lg bg-(--color-panel)
                     border border-(--color-line) text-sm outline-none
                     focus:border-(--color-muted)"
        />
        {error && <p className="text-xs text-(--color-danger-ink)">{error}</p>}
        <button
          type="submit"
          disabled={state === 'sending'}
          className="w-full h-9 rounded-lg bg-(--color-ink)
                     text-(--color-ground) text-sm"
        >
          {state === 'sending' ? 'Отправляю…' : 'Прислать код'}
        </button>
      </form>
    </div>
  );
}
```

Заодно поправлен цвет ошибки: было `text-red-600` (сырой цвет Tailwind,
оставшийся от плана №1, до того как в проекте закрепился токен
`--color-danger-ink`), стало `text-(--color-danger-ink)` — тот же
токен, что уже используют `TaskModal`/`EpicModal`/`NewProject`. Правка
бесплатна раз уж эта функция и так переписывается целиком, но не
относится к сути задачи — не расширять на другие файлы в этом плане.

- [ ] **Step 2: Проверить сборку**

Run: `cd web && npm run build`
Expected: чисто.

- [ ] **Step 3: Коммит**

```bash
git add web/src/App.tsx
git commit -m "Вход: 6-значный код из письма вместо magic-link — работает и в установленном приложении"
```

Живая проверка (реальный email, реальный код, включая проверку внутри
установленного на iPhone приложения) — требует, чтобы владелец сначала
выполнил ручной шаг с шаблоном письма (см. начало плана). Без него
письмо придёт без кода, и проверить будет нечего — это не баг кода
задачи, а незавершённый ручной шаг. Откладывается на владельца после
деплоя.

---

## Порядок и живая проверка

Задачи независимы друг от друга (разные файлы, ни одна не зависит от
интерфейса другой) — можно выполнять в любом порядке, план держит их
последовательно просто для единообразия с предыдущими планами. После
обеих задач и ручного шага с шаблоном письма — владелец сам: открывает
сайт на iPhone в Safari, ставит на экран «Домой», открывает
установленное приложение, вводит почту, получает письмо с кодом,
вводит код, проверяет что попал на доску без перехода в Safari.
