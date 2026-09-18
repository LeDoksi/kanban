# Редизайн доски (KAN-94) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Визуальный и интеракционный редизайн `web/` (эта самая доска) — новая палитра/типографика/motion поверх неизменной логики.

**Architecture:** Три переиспользуемых примитива (`Button`, `Sheet`, `panelClass`) в `web/src/ui/`, затем каждый экран (шапка доски, карточка, четыре модалки, шторка проектов, архив, экран входа) мигрирует на них по очереди. Токены и типографика меняются один раз в `styles.css`, но старые CSS-переменные (`--color-wait*`) временно остаются алиасами на новые значения, чтобы между задачами ничего не ломалось, пока не мигрируют все их потребители.

**Tech Stack:** React 19, Tailwind CSS v4 (CSS-first `@theme`), dnd-kit (`@dnd-kit/core` + `@dnd-kit/sortable`), Supabase JS, новая зависимость `motion` (React-вход `motion/react`).

**Spec:** [docs/superpowers/specs/2026-09-18-kanban-redesign-design.md](../specs/2026-09-18-kanban-redesign-design.md)

## Global Constraints

- Редизайн только в `web/` — никаких изменений в `supabase/migrations/` или `mcp/`.
- Единственная новая зависимость — `motion` (npm-пакет, React-импорт из `motion/react`). Никакого веб-шрифта — системный стек остаётся.
- Поведение (realtime-подписки, drag-and-drop reorder логика `onDragEnd`/`between()`, RLS-запросы, позиционирование) не меняется — меняется только визуально-интеракционный слой.
- Существующие 6 файлов в `web/test/` должны продолжать проходить без изменений в самих тестах (логика `swipe.ts`, `position.ts`, `epics.ts`, `guess.ts`, `slug.ts`, `done.ts` не трогается).
- `cd web && npm run lint` (oxlint) и `cd web && npm run build` (`tsc -b && vite build`) должны проходить чисто после каждой задачи.
- Аудит мёртвого кода/багов — KAN-95, вне этого плана.

---

### Task 1: Токены, типографика, meta/manifest, зависимость `motion`

**Files:**
- Modify: `web/src/styles.css`
- Modify: `web/index.html`
- Modify: `web/public/manifest.webmanifest`
- Modify: `web/package.json`, `web/package-lock.json` (через `npm install`)

**Interfaces:**
- Produces: CSS-токены `--color-ground/panel/ink/muted/line/accent/accent-ink/accent-soft/danger/danger-ink/overlay`, `--text-2xs` (используются во всех последующих задачах через `bg-(--color-x)`/`text-2xs`). Временные алиасы `--color-wait`/`--color-wait-ink` (те же значения, что `--color-accent-soft`/`--color-accent-ink`) — удаляются в Task 13, когда их последние потребители (Task 7, Task 11) мигрируют на новые имена.
- Produces: npm-пакет `motion`, используется в Task 3 (`Sheet`) и Task 7 (`Board.tsx`).

Здесь нет юнит-тестов — это CSS/конфиг, проверка через чистую сборку и последующий визуальный QA в Task 13.

- [ ] **Step 1: Переписать `web/src/styles.css`**

```css
@import "tailwindcss";

/* Тёплый контраст вместо плоского серого-на-сером. Один акцентный цвет
   (тёплый янтарно-оранжевый) — статус «ждёт тебя», главное действие,
   focus-состояния. `danger` остаётся отдельным красным. */
@theme {
  --color-ground: #fbf9f5;
  --color-panel: #f1ece1;
  --color-ink: #1c1712;
  --color-muted: #78715f;
  --color-line: #e6ddcc;
  --color-accent: #c8672a;
  --color-accent-ink: #9c5220;
  --color-accent-soft: #f7e3cd;
  --color-danger: #faecea;
  --color-danger-ink: #a32d2d;
  --color-overlay: rgb(28 23 18 / 0.45);

  /* Микро-подпись (11px) — четвёртый уровень шкалы поверх встроенных
     Tailwind text-xs/text-sm/text-base. */
  --text-2xs: 0.6875rem;
  --text-2xs--line-height: 1rem;

  /* Переходный алиас на новую акцентную палитру — убрать вместе с
     последним usage в Board.tsx (Task 7) и ProjectDrawer.tsx (Task 11). */
  --color-wait: #f7e3cd;
  --color-wait-ink: #9c5220;
}

@media (prefers-color-scheme: dark) {
  @theme {
    --color-ground: #16130f;
    --color-panel: #221d15;
    --color-ink: #f3ede1;
    --color-muted: #978d78;
    --color-line: #362f22;
    --color-accent: #e08a42;
    --color-accent-ink: #e08a42;
    --color-accent-soft: #3c2810;
    --color-danger: #3a1f1f;
    --color-danger-ink: #f0a3a3;
    --color-overlay: rgb(0 0 0 / 0.6);

    --color-wait: #3c2810;
    --color-wait-ink: #e08a42;
  }
}

body {
  background: var(--color-ground);
  color: var(--color-ink);
  font-family: ui-sans-serif, system-ui, sans-serif;
}
```

- [ ] **Step 2: Синхронизировать цвет темы в `web/index.html`**

В `web/index.html` заменить строку:
```html
    <meta name="theme-color" content="#17171a" />
```
на:
```html
    <meta name="theme-color" content="#16130f" />
```

- [ ] **Step 3: Синхронизировать `web/public/manifest.webmanifest`**

Заменить `"background_color": "#17171a"` и `"theme_color": "#17171a"` на `"#16130f"` (новый тёмный `--color-ground`).

- [ ] **Step 4: Поставить `motion`**

Run: `cd web && npm install motion`
Expected: пакет появляется в `dependencies` `package.json`, `package-lock.json` обновлён.

- [ ] **Step 5: Проверить чистую сборку**

Run: `cd web && npm run build`
Expected: сборка проходит без ошибок (компоненты пока используют старые имена токенов — `--color-wait` алиас на новые значения гарантирует, что ничего визуально не сломается).

- [ ] **Step 6: Commit**

```bash
git add web/src/styles.css web/index.html web/public/manifest.webmanifest web/package.json web/package-lock.json
git commit -m "Токены редизайна: тёплая палитра, акцент, text-2xs, motion (KAN-94)"
```

---

### Task 2: Примитив `Button`

**Files:**
- Create: `web/src/ui/Button.tsx`

**Interfaces:**
- Produces: `Button({ variant?: 'primary'|'secondary'|'ghost'|'danger', size?: 'sm'|'md', ...ButtonHTMLAttributes })` — используется в Task 5, 6, 8, 9, 11.
- Consumes: токены из Task 1 (`--color-accent`, `--color-panel`, `--color-line`, `--color-muted`, `--color-ink`, `--color-ground`, `--color-danger-ink`).

Область применения: только «коробочные» кнопки с явным фоном/рамкой/паддингом (submit, primary CTA, secondary с рамкой). Пилюли-переключатели статуса/типа и голые текстовые ссылки-мини-действия («Удалить», «В архив», «ещё N · архив») через `Button` не заворачиваются — у них другая форма (без паддинга/рамки), заворачивание сломало бы их текущую компоновку. Они получают точечный token-рефреш внутри своих задач (5–12).

- [ ] **Step 1: Создать `web/src/ui/Button.tsx`**

```tsx
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-(--color-accent) text-(--color-ground)',
  secondary: 'bg-(--color-panel) border border-(--color-line)',
  ghost: 'text-(--color-muted) hover:text-(--color-ink)',
  danger: 'text-(--color-danger-ink)',
};

const SIZE: Record<Size, string> = {
  sm: 'h-7 px-2 text-2xs',
  md: 'h-8 px-3 text-sm',
};

export function Button(
  { variant = 'secondary', size = 'md', className = '', ...props }:
    ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size },
) {
  return (
    <button
      {...props}
      className={`rounded-lg transition-colors disabled:opacity-40
                 disabled:pointer-events-none focus-visible:outline-2
                 focus-visible:outline-offset-2
                 focus-visible:outline-(--color-accent)
                 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    />
  );
}
```

- [ ] **Step 2: Проверить компиляцию типов**

Run: `cd web && npx tsc -b --noEmit`
Expected: без ошибок (компонент пока нигде не используется, но должен компилироваться сам по себе).

- [ ] **Step 3: Commit**

```bash
git add web/src/ui/Button.tsx
git commit -m "Примитив Button (KAN-94)"
```

---

### Task 3: Примитив `Sheet`

**Files:**
- Create: `web/src/ui/Sheet.tsx`

**Interfaces:**
- Produces: `Sheet({ onClose, placement?: 'center'|'left', maxWidth?: string, children })` — используется в Task 8–12 вместо пяти независимых копий overlay+Escape-key+контейнера.
- Consumes: `motion` из Task 1, токены `--color-overlay`, `--color-ground`.

Важно: `Sheet` **не** хранит своё `open`-состояние и не оборачивает себя в `AnimatePresence` сам — presence (и, соответственно, exit-анимация) управляется снаружи, на месте вызова (`<AnimatePresence>{cond && <Modal key="x" .../>}</AnimatePresence>` в `Board.tsx`, задачи 8–12). Так устроено потому, что `Board.tsx` сейчас монтирует модалки условно (`{openItem && <TaskModal/>}`) — если `AnimatePresence` жить внутри самой модалки, при `openItem => null` весь поддерево размонтируется мгновенно вместе с `AnimatePresence`, и exit-анимация никогда не успеет сыграть.

- [ ] **Step 1: Создать `web/src/ui/Sheet.tsx`**

```tsx
import { motion } from 'motion/react';
import { useEffect, type ReactNode } from 'react';

export function Sheet(
  { onClose, placement = 'center', maxWidth = 'max-w-lg', children }: {
    onClose: () => void;
    placement?: 'center' | 'left';
    maxWidth?: string;
    children: ReactNode;
  },
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const hidden = placement === 'left' ? { x: '-100%' } : { opacity: 0, scale: 0.97 };
  const visible = placement === 'left' ? { x: 0 } : { opacity: 1, scale: 1 };

  return (
    <motion.div
      className={`fixed inset-0 bg-(--color-overlay) z-50 flex ${
        placement === 'left' ? '' : 'items-center justify-center p-4'
      }`}
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className={`bg-(--color-ground) overflow-y-auto ${
          placement === 'left'
            ? 'fixed inset-y-0 left-0 w-80 max-w-[85vw] p-5'
            : `rounded-lg w-full ${maxWidth} max-h-[85vh] p-5`
        }`}
        onClick={e => e.stopPropagation()}
        initial={hidden}
        animate={visible}
        exit={hidden}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Проверить компиляцию типов**

Run: `cd web && npx tsc -b --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add web/src/ui/Sheet.tsx
git commit -m "Примитив Sheet (KAN-94)"
```

---

### Task 4: Хелпер `panelClass`

**Files:**
- Create: `web/src/ui/panel.ts`

**Interfaces:**
- Produces: `panelClass(tone?: 'default'|'accent', extra?: string): string` — используется в Task 7 для `Card`/`CardPreview` в `Board.tsx` (устраняет дублирование их разметки).
- Consumes: токены `--color-panel`, `--color-accent-soft`.

Не компонент, а функция (как `between()` в `position.ts`, `slugify()` в `slug.ts`) — единственные два потребителя (`Card`, `CardPreview`) сами знают свой корневой тег (`<article>`), полноценный полиморфный компонент здесь не нужен.

- [ ] **Step 1: Создать `web/src/ui/panel.ts`**

```ts
export type PanelTone = 'default' | 'accent';

const TONE: Record<PanelTone, string> = {
  default: 'bg-(--color-panel)',
  accent: 'bg-(--color-accent-soft)',
};

export function panelClass(tone: PanelTone = 'default', extra = ''): string {
  return `rounded-lg ${TONE[tone]} ${extra}`.trim();
}
```

- [ ] **Step 2: Проверить компиляцию типов**

Run: `cd web && npx tsc -b --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add web/src/ui/panel.ts
git commit -m "Хелпер panelClass (KAN-94)"
```

---

### Task 5: Экран входа (`App.tsx`)

**Files:**
- Modify: `web/src/App.tsx` (полная замена)

**Interfaces:**
- Consumes: `Button` из Task 2.

- [ ] **Step 1: Заменить содержимое `web/src/App.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { sb } from './supabase';
import { Board } from './Board';
import { Button } from './ui/Button';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) return null;
  if (!session) return <SignIn />;
  return <Board />;
}

function SignIn() {
  const [error, setError] = useState('');

  const signIn = async () => {
    setError('');
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    });
    if (error) setError(error.message);
  };

  return (
    <div className="min-h-dvh grid place-items-center p-6">
      <div className="w-full max-w-72 space-y-3 text-center">
        <h1 className="text-base font-medium">Канбан</h1>
        {error && <p className="text-xs text-(--color-danger-ink)">{error}</p>}
        <Button onClick={signIn} variant="primary" className="w-full">
          Войти через Google
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Проверить сборку и линт**

Run: `cd web && npm run build && npm run lint`
Expected: чисто.

- [ ] **Step 3: Ручная проверка**

Через dev-сервер (или уже открытую вкладку) выйти из аккаунта нельзя без риска потерять сессию владельца — визуально проверить экран входа можно через `preview` без выхода: убедиться сборкой/линтом, что всё компилируется; полноценный визуальный чек экрана входа — в Task 13 финальным проходом (или если сессия сама разлогинится).

- [ ] **Step 4: Commit**

```bash
git add web/src/App.tsx
git commit -m "Экран входа на Button (KAN-94)"
```

---

### Task 6: Шапка доски и заголовки колонок (`Board.tsx`)

**Files:**
- Modify: `web/src/Board.tsx`

**Interfaces:**
- Consumes: `Button` из Task 2.

- [ ] **Step 1: Добавить импорт**

В начало `web/src/Board.tsx`, рядом с остальными импортами:
```tsx
import { Button } from './ui/Button';
```

- [ ] **Step 2: Заменить кнопки шапки**

Найти:
```tsx
        <button
          onClick={() => setShowProjects(true)}
          className="h-8 px-3 rounded-lg bg-(--color-panel)
                     border border-(--color-line) text-sm"
        >
          {currentProject?.name ?? 'Проекты'}
        </button>
```
заменить на:
```tsx
        <Button variant="secondary" onClick={() => setShowProjects(true)}>
          {currentProject?.name ?? 'Проекты'}
        </Button>
```

Найти:
```tsx
        <button
          onClick={() => setShowCreate(true)}
          className="ml-auto h-8 px-3 rounded-lg bg-(--color-ink)
                     text-(--color-ground) text-sm"
        >
          Новая задача
        </button>
```
заменить на:
```tsx
        <Button variant="primary" className="ml-auto" onClick={() => setShowCreate(true)}>
          Новая задача
        </Button>
```

- [ ] **Step 3: Заголовок колонки — счётчик отдельным чипом**

Найти (внутри `Column`):
```tsx
      <h2 className="text-xs text-(--color-muted) mb-2 px-1
                     sticky top-0 bg-(--color-ground) py-1 z-10">
        {col.label} {full.length > 0 && full.length}
      </h2>
```
заменить на:
```tsx
      <h2 className="text-xs text-(--color-muted) mb-2 px-1 flex items-center gap-1.5
                     sticky top-0 bg-(--color-ground) py-1 z-10">
        {col.label}
        {full.length > 0 && (
          <span className="text-2xs px-1.5 rounded-full bg-(--color-panel)">
            {full.length}
          </span>
        )}
      </h2>
```

- [ ] **Step 4: `text-[11px]` → `text-2xs` и hover на ссылках-мини-действиях**

В `Column` заменить оба вхождения `className="text-[11px] text-(--color-muted) underline mb-1 px-1 block"` (заголовок группы эпика) и `className="text-[11px] text-(--color-muted) underline px-1 block"` (pinnedEmpty) на `className="text-2xs text-(--color-muted) hover:text-(--color-ink) underline mb-1 px-1 block"` и `className="text-2xs text-(--color-muted) hover:text-(--color-ink) underline px-1 block"` соответственно.

Найти:
```tsx
        <button
          onClick={onShowArchive}
          className="text-xs text-(--color-muted) mt-2 px-1"
        >
          ещё {hiddenDone + archivedCount} · архив
        </button>
```
заменить на:
```tsx
        <button
          onClick={onShowArchive}
          className="text-xs text-(--color-muted) hover:text-(--color-ink) mt-2 px-1"
        >
          ещё {hiddenDone + archivedCount} · архив
        </button>
```

- [ ] **Step 5: Проверить сборку и линт**

Run: `cd web && npm run build && npm run lint`
Expected: чисто.

- [ ] **Step 6: Ручная проверка**

`preview_start` с dev-сервером `web`, открыть доску: шапка — кнопки в новой акцентной/панельной стилистике; заголовки колонок — счётчик в отдельном чипе; ссылки эпика/архива подсвечиваются при наведении. Проверить в обеих темах (`resize_window` с `colorScheme: 'light'`/`'dark'`).

- [ ] **Step 7: Commit**

```bash
git add web/src/Board.tsx
git commit -m "Шапка доски и заголовки колонок на Button/токенах (KAN-94)"
```

---

### Task 7: Карточка задачи — motion drag/layout, panelClass

**Files:**
- Modify: `web/src/Board.tsx`

**Interfaces:**
- Consumes: `panelClass` из Task 4, `motion` из `motion/react`.
- Последний потребитель `--color-wait`/`--color-wait-ink` в этом файле — после этой задачи алиас остаётся нужен только `ProjectDrawer.tsx` (до Task 11).

Технический контекст: `dnd-kit`'ный `useSortable` и motion'ная layout-анимация конкурируют за CSS `transform` на одном элементе, если использовать их наивно вместе. Официальный пример интеграции dnd-kit + Framer Motion (`stories/2 - Presets/Sortable/FramerMotion.tsx` в репозитории `clauderic/dnd-kit`) решает это так: `useSortable({ transition: null })` — dnd-kit перестаёт писать свой CSS-transition сам, — а `motion.div` с `layoutId` и `animate={{x: transform.x, y: transform.y, ...}}` берёт всю анимацию позиции на себя, включая случаи, когда сам dnd-kit уже не активен (после `onDragEnd`/`reload()` — именно тот момент, когда сейчас карточка prыгает без анимации). Этот план повторяет тот же паттерн.

Свайп на телефоне (произвольный `touchmove`) — отдельная история: если отдать его motion'ному `drag`-жесту, тот слушает `pointerdown` и может подавить последующий синтетический `mousedown`/`click`, что сломает мышиный reorder-драг dnd-kit на десктопе (оба навешаны на один узел). Поэтому здесь драг остаётся на своих `onTouchStart/Move/End`, а motion применяется только к визуальному офсету (`animate={{x: dragX}}` на вложенном `motion.div`) — даёт пружинный возврат без риска конфликта с мышиным путём.

- [ ] **Step 1: Добавить импорты**

В `web/src/Board.tsx` добавить:
```tsx
import { motion } from 'motion/react';
import { panelClass } from './ui/panel';
```

- [ ] **Step 2: Заменить `CardPreview`**

Найти всю функцию `CardPreview` и заменить на:
```tsx
function CardPreview({ item }: { item: Item }) {
  const waiting = item.status === 'waiting';
  return (
    <article className={panelClass(waiting ? 'accent' : 'default', 'p-2.5 text-sm shadow-lg rotate-1')}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`text-2xs font-mono ${
          waiting ? 'text-(--color-accent-ink)' : 'text-(--color-muted)'
        }`}>
          {item.seq}
        </span>
        {item.type !== 'task' && (
          <span className="text-2xs px-1.5 py-px rounded
                           bg-(--color-danger) text-(--color-danger-ink)">
            {item.type === 'bug' ? 'баг' : 'долг'}
          </span>
        )}
      </div>
      <p className={waiting ? 'text-(--color-accent-ink)' : ''}>{item.title}</p>
    </article>
  );
}
```

- [ ] **Step 3: Заменить `Card`**

Найти всю функцию `Card` (от `function Card(` до закрывающей `}` перед `CardPreview`/концом файла) и заменить на:
```tsx
function Card(
  { item, onChanged, onError, onOpen }: {
    item: Item; onChanged: () => void; onError: (msg: string) => void;
    onOpen: (item: Item) => void;
  },
) {
  const done = item.checklist.filter(s => s.done).length;
  const waiting = item.status === 'waiting';
  // transition: null — как в официальном примере dnd-kit + Framer Motion:
  // dnd-kit больше не пишет свой CSS-transition, всю анимацию позиции
  // (в т.ч. после onDragEnd/reload(), когда сам dnd-kit уже молчит) ведёт
  // motion через layoutId.
  const { listeners, setNodeRef, transform, isDragging } =
    useSortable({ id: item.id, transition: null });

  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const swiping = touchStartX !== null;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    setDragX(e.touches[0].clientX - touchStartX);
  };
  const onTouchEnd = () => {
    if (target) move(target);
    setTouchStartX(null);
    setDragX(0);
  };

  const target = swipeTarget(item.status, dragX);
  const preview = swipePreview(item.status, dragX);
  const committed = Math.abs(dragX) > SWIPE_THRESHOLD;

  const move = async (status: Item['status']) => {
    const { error } = await setStatus(item.id, status);
    if (error) { onError(error.message); return; }
    onChanged();
  };

  return (
    <div className="relative">
      {preview && (
        <div
          aria-hidden
          className={`absolute inset-0 rounded-lg flex items-center gap-1.5 px-3
                     text-sm font-medium overflow-hidden ${
            dragX > 0 ? 'justify-start' : 'justify-end'
          } ${
            committed
              ? 'bg-(--color-ink) text-(--color-ground)'
              : 'bg-(--color-panel) text-(--color-muted)'
          }`}
        >
          <span>{dragX > 0 ? '→' : '←'}</span>
          <span>{COLUMNS.find(c => c.key === preview)?.label}</span>
        </div>
      )}
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
        }}
        transition={{ duration: isDragging ? 0 : 0.2, ease: 'easeOut' }}
        {...listeners}
        onClick={() => onOpen(item)}
        className={panelClass(waiting ? 'accent' : 'default', 'p-2.5 text-sm cursor-grab')}
      >
        <motion.div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          animate={{ x: dragX }}
          transition={swiping ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 32 }}
          className="touch-pan-y"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span className={`text-2xs font-mono ${
              waiting ? 'text-(--color-accent-ink)' : 'text-(--color-muted)'
            }`}>
              {item.seq}
            </span>
            {item.type !== 'task' && (
              <span className="text-2xs px-1.5 py-px rounded
                               bg-(--color-danger) text-(--color-danger-ink)">
                {item.type === 'bug' ? 'баг' : 'долг'}
              </span>
            )}
          </div>

          <p className={waiting ? 'text-(--color-accent-ink)' : ''}>{item.title}</p>

          {item.checklist.length > 0 && (
            <p className="text-2xs text-(--color-muted) mt-1.5">
              {done}/{item.checklist.length}
            </p>
          )}
        </motion.div>
      </motion.article>
    </div>
  );
}
```

- [ ] **Step 4: Проверить сборку, линт, существующий тест-сьют**

Run: `cd web && npm run build && npm run lint && npm test`
Expected: всё чисто; `swipe.test.ts` проходит без изменений (тестирует чистые функции `swipeTarget`/`swipePreview`, источник координаты для них не поменялся).

- [ ] **Step 5: Ручная проверка — десктоп-драг**

Через dev-сервер: зажать карточку мышью и перетащить в другую колонку. Ожидается: карточка плавно движется под курсором, при отпускании статус меняется, никаких ошибок в консоли (`read_console_messages`), после сохранения на сервер и `reload()` карточка не прыгает рывком на новое место.

- [ ] **Step 6: Ручная проверка — свайп на телефоне**

`resize_window` с `preset: 'mobile'`, эмулировать горизонтальный свайп карточки (через `computer` с `left_click_drag` или последовательность touch-подобных событий). Ожидается: позади карточки открывается панель с направлением, при свайпе дальше порога статус меняется, при недостаточном свайпе карточка плавно (пружиной) возвращается на место.

- [ ] **Step 7: Commit**

```bash
git add web/src/Board.tsx
git commit -m "Карточка: motion layout/drag вместо ручного transform, panelClass (KAN-94)"
```

---

### Task 8: `TaskModal.tsx` → Sheet

**Files:**
- Modify: `web/src/TaskModal.tsx` (полная замена)
- Modify: `web/src/Board.tsx` (обернуть вызов в `AnimatePresence`)

**Interfaces:**
- Consumes: `Sheet` из Task 3, `Button` из Task 2.

- [ ] **Step 1: Заменить содержимое `web/src/TaskModal.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { sb, setStatus } from './supabase';
import type { Item, Comment, Epic } from './supabase';
import { selectableEpics } from './epics';
import { Editable } from './Editable';
import { Sheet } from './ui/Sheet';
import { Button } from './ui/Button';

const STATUS_LABEL: Record<Item['status'], string> = {
  backlog: 'Backlog', hold: 'Hold', doing: 'В работе',
  waiting: 'Нужно от тебя', done: 'Готово',
};

const TYPE_LABEL: Record<Item['type'], string> = {
  task: 'задача', bug: 'баг', chore: 'долг',
};

export function TaskModal(
  { item, epics, allItems, onClose, onChanged, onOpenEpic }: {
    item: Item; epics: Epic[]; allItems: Item[];
    onClose: () => void; onChanged: () => void;
    onOpenEpic?: (epicId: string) => void;
  },
) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [err, setErr] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingBody, setEditingBody] = useState(false);
  const [titleDraft, setTitleDraft] = useState(item.title);
  const [bodyDraft, setBodyDraft] = useState(item.body ?? '');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    sb.from('comments').select('*')
      .eq('item_id', item.id).order('created_at')
      .then(({ data, error }) => {
        if (error) { setErr(error.message); return; }
        setComments((data ?? []) as Comment[]);
      });
  }, [item.id]);

  // Синхронизировать черновики, если доска перечиталась (Realtime,
  // правка агентом) — иначе после чужой правки инлайн-редактор будет
  // молча затирать её своим устаревшим черновиком.
  useEffect(() => {
    setTitleDraft(item.title);
    setBodyDraft(item.body ?? '');
  }, [item.id, item.title, item.body]);

  const toggleCheck = async (i: number) => {
    const { data, error: readErr } = await sb.from('items')
      .select('checklist').eq('id', item.id).single();
    if (readErr) { setErr(readErr.message); return; }
    const current = (data?.checklist ?? item.checklist) as typeof item.checklist;
    const list = current.map((s, idx) =>
      idx === i ? { ...s, done: !s.done } : s);
    const { error } = await sb.from('items')
      .update({ checklist: list }).eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
  };

  const move = async (status: Item['status']) => {
    const { error } = await setStatus(item.id, status);
    if (error) { setErr(error.message); return; }
    onChanged();
  };

  const setType = async (type: Item['type']) => {
    const { error } = await sb.from('items').update({ type }).eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
  };

  const setEpic = async (epicId: string) => {
    const { error } = await sb.from('items')
      .update({ epic_id: epicId || null }).eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
  };

  const archive = async () => {
    const { error } = await sb.from('items')
      .update({ archived_at: new Date().toISOString() }).eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
  };

  const restore = async () => {
    const { error } = await sb.from('items')
      .update({ status: 'doing', archived_at: null }).eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
  };

  const remove = async () => {
    if (!confirm(`Удалить «${item.title}» навсегда?`)) return;
    const { error } = await sb.from('items').delete().eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
    onClose();
  };

  const sendComment = async () => {
    const text = newComment.trim();
    if (!text || sending) return;
    setSending(true);
    const { error } = await sb.from('comments')
      .insert({ item_id: item.id, author: 'me', body: text });
    setSending(false);
    if (error) { setErr(error.message); return; }
    setNewComment('');
    const { data, error: readErr } = await sb.from('comments').select('*')
      .eq('item_id', item.id).order('created_at');
    if (readErr) { setErr(readErr.message); return; }
    setComments((data ?? []) as Comment[]);
  };

  const saveTitle = async () => {
    setEditingTitle(false);
    const clean = titleDraft.trim();
    if (!clean || clean === item.title) { setTitleDraft(item.title); return; }
    const { error } = await sb.from('items').update({ title: clean }).eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
  };

  const saveBody = async () => {
    setEditingBody(false);
    const clean = bodyDraft.trim() || null;
    if (clean === item.body) return;
    const { error } = await sb.from('items').update({ body: clean }).eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
  };

  return (
    <Sheet onClose={onClose} maxWidth="max-w-lg">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <span className="text-2xs font-mono text-(--color-muted)">
            {item.id}
          </span>
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); }}
              className="block w-full text-base font-medium bg-transparent
                         border-b border-(--color-line) outline-none"
            />
          ) : (
            <Editable
              as="h2"
              onEdit={() => setEditingTitle(true)}
              className="text-base font-medium cursor-text"
            >
              {item.title}
            </Editable>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Закрыть"
          className="text-(--color-muted) hover:text-(--color-ink) text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {(Object.keys(STATUS_LABEL) as Item['status'][]).map(s => (
          <button
            key={s}
            onClick={() => move(s)}
            className={`text-2xs px-2 py-1 rounded-full border ${
              item.status === s
                ? 'border-(--color-accent) text-(--color-accent-ink)'
                : 'border-(--color-line) text-(--color-muted)'
            }`}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5 mb-4">
        {(Object.keys(TYPE_LABEL) as Item['type'][]).map(t => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`text-2xs px-2 py-1 rounded-full border ${
              item.type === t
                ? 'border-(--color-accent) text-(--color-accent-ink)'
                : 'border-(--color-line) text-(--color-muted)'
            }`}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <select
          value={item.epic_id ?? ''}
          onChange={e => setEpic(e.target.value)}
          className="h-7 px-1.5 rounded text-2xs bg-transparent
                     border border-(--color-line) text-(--color-muted)"
        >
          <option value="">— без эпика —</option>
          {selectableEpics(epics, allItems, item.epic_id).map(ep => (
            <option key={ep.id} value={ep.id}>{ep.title}</option>
          ))}
        </select>
        {item.epic_id && onOpenEpic && (
          <button
            onClick={() => onOpenEpic(item.epic_id!)}
            className="text-xs text-(--color-muted) hover:text-(--color-ink) underline"
          >
            открыть эпик
          </button>
        )}
      </div>

      {err && <p className="text-sm text-(--color-danger-ink) mb-3">{err}</p>}

      {editingBody ? (
        <textarea
          autoFocus
          value={bodyDraft}
          onChange={e => setBodyDraft(e.target.value)}
          onBlur={saveBody}
          onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) saveBody(); }}
          rows={3}
          placeholder="описание"
          className="w-full p-2 mb-4 rounded-lg bg-(--color-panel) text-sm
                     border border-(--color-line) outline-none resize-none
                     focus:border-(--color-accent)"
        />
      ) : (
        <Editable
          as="p"
          onEdit={() => setEditingBody(true)}
          className="text-sm whitespace-pre-wrap mb-4 cursor-text min-h-[1.5em]"
        >
          {item.body || (
            <span className="text-(--color-muted)">описание — клик, чтобы добавить</span>
          )}
        </Editable>
      )}

      {item.blocks.length > 0 && (
        <p className="text-xs text-(--color-muted) mb-3">
          блокирует: {item.blocks.join(', ')}
        </p>
      )}

      {item.checklist.length > 0 && (
        <ul className="space-y-1.5 mb-4">
          {item.checklist.map((s, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={s.done}
                onChange={() => toggleCheck(i)}
              />
              <span className={s.done ? 'text-(--color-muted) line-through' : ''}>
                {s.text}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-(--color-line) pt-3">
        {comments.length > 0 && (
          <div className="space-y-2 mb-2">
            {comments.map(c => (
              <div key={c.id} className="text-xs">
                <span className="text-(--color-muted)">
                  {c.created_at.slice(0, 10)} {c.author}:
                </span>{' '}
                {c.body}
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') sendComment(); }}
            placeholder="комментарий"
            disabled={sending}
            className="flex-1 h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                       border border-(--color-line) outline-none
                       focus:border-(--color-accent)"
          />
          <Button variant="primary" onClick={sendComment} disabled={!newComment.trim() || sending}>
            Отправить
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-(--color-line)">
        {item.status === 'done' && !item.archived_at && (
          <button onClick={archive} className="text-xs text-(--color-muted) hover:text-(--color-ink)">
            В архив
          </button>
        )}
        {item.archived_at && (
          <button onClick={restore} className="text-xs text-(--color-muted) hover:text-(--color-ink)">
            Вернуть в работу
          </button>
        )}
        <button onClick={remove} className="text-xs text-(--color-danger-ink) ml-auto">
          Удалить
        </button>
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 2: Обернуть вызов в `Board.tsx` в `AnimatePresence`**

В `web/src/Board.tsx` добавить `AnimatePresence` в импорт из `motion/react` (сейчас там только `motion` из Task 7):
```tsx
import { AnimatePresence, motion } from 'motion/react';
```

Найти:
```tsx
      {openItem && (
        <TaskModal
          item={openItem}
          epics={epics}
          allItems={items}
          onClose={() => setOpenItem(null)}
          onChanged={() => reload(current)}
          onOpenEpic={id => { setOpenItem(null); setViewEpic(id); }}
        />
      )}
```
заменить на:
```tsx
      <AnimatePresence>
        {openItem && (
          <TaskModal
            key="task-modal"
            item={openItem}
            epics={epics}
            allItems={items}
            onClose={() => setOpenItem(null)}
            onChanged={() => reload(current)}
            onOpenEpic={id => { setOpenItem(null); setViewEpic(id); }}
          />
        )}
      </AnimatePresence>
```

- [ ] **Step 3: Проверить сборку, линт, тесты**

Run: `cd web && npm run build && npm run lint && npm test`
Expected: чисто.

- [ ] **Step 4: Ручная проверка**

Открыть карточку задачи кликом — модалка появляется с пружинной анимацией, Esc и клик по фону закрывают её с анимацией исчезновения, все действия внутри (смена статуса/типа, чек-лист, комментарий, удаление) работают как раньше.

- [ ] **Step 5: Commit**

```bash
git add web/src/TaskModal.tsx web/src/Board.tsx
git commit -m "TaskModal на Sheet (KAN-94)"
```

---

### Task 9: `CreateModal.tsx` → Sheet

**Files:**
- Modify: `web/src/CreateModal.tsx` (полная замена)
- Modify: `web/src/Board.tsx` (обернуть вызов в `AnimatePresence`)

**Interfaces:**
- Consumes: `Sheet`, `Button`, уже импортированный `AnimatePresence` из Task 8.

- [ ] **Step 1: Заменить содержимое `web/src/CreateModal.tsx`**

```tsx
import { useState } from 'react';
import { sb } from './supabase';
import type { Item, Epic } from './supabase';
import { guessType, stripPrefix } from './guess';
import { selectableEpics } from './epics';
import { Sheet } from './ui/Sheet';
import { Button } from './ui/Button';

export function CreateModal(
  { project, epics, items, onClose }: {
    project: string; epics: Epic[]; items: Item[];
    onClose: () => void;
  },
) {
  const [kind, setKind] = useState<'task' | 'epic'>('task');

  const [title, setTitle] = useState('');
  const [type, setType] = useState<Item['type']>('task');
  const [touched, setTouched] = useState(false);
  const [epicId, setEpicId] = useState('');

  const [epicTitle, setEpicTitle] = useState('');
  const [goal, setGoal] = useState('');

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onTitle = (v: string) => {
    setTitle(v);
    setError('');
    if (!touched) setType(guessType(v));
  };

  const submitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = stripPrefix(title);
    if (!clean) { setError('Напиши, что надо сделать'); return; }
    setBusy(true);

    const [{ data: seqData, error: seqErr }, { data: p, error: pErr }] = await Promise.all([
      sb.rpc('next_seq', { p_project: project, p_kind: 'item' }),
      sb.from('projects').select('prefix').eq('id', project).single(),
    ]);
    if (seqErr) { setError(seqErr.message); setBusy(false); return; }
    if (pErr || !p) { setError(pErr?.message ?? 'Проект не найден'); setBusy(false); return; }

    const { error } = await sb.from('items').insert({
      id: `${p.prefix}-${seqData}`,
      seq: seqData,
      project_id: project,
      type,
      title: clean,
      status: 'backlog',
      created_by: 'me',
      epic_id: epicId || null,
      position: seqData * 100,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    onClose();
  };

  const submitEpic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!epicTitle.trim()) { setError('Напиши заголовок эпика'); return; }
    setBusy(true);

    const [{ data: seq, error: seqErr }, { data: p, error: pErr }] = await Promise.all([
      sb.rpc('next_seq', { p_project: project, p_kind: 'epic' }),
      sb.from('projects').select('prefix').eq('id', project).single(),
    ]);
    if (seqErr) { setError(seqErr.message); setBusy(false); return; }
    if (pErr || !p) { setError(pErr?.message ?? 'Проект не найден'); setBusy(false); return; }

    const id = `${p.prefix}-E${seq}`;
    const { error } = await sb.from('epics').insert({
      id, seq, project_id: project,
      title: epicTitle.trim(), goal: goal.trim() || null,
      position: seq * 100,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    onClose();
  };

  const options = selectableEpics(epics, items);

  return (
    <Sheet onClose={onClose} maxWidth="max-w-md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1.5">
          {(['task', 'epic'] as const).map(k => (
            <button
              key={k}
              type="button"
              onClick={() => { setKind(k); setError(''); }}
              className={`text-sm px-3 py-1 rounded-full border ${
                kind === k
                  ? 'border-(--color-accent) text-(--color-accent-ink)'
                  : 'border-(--color-line) text-(--color-muted)'
              }`}
            >
              {k === 'task' ? 'Задача' : 'Эпик'}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          aria-label="Закрыть"
          className="text-(--color-muted) hover:text-(--color-ink) text-lg leading-none"
        >
          ×
        </button>
      </div>

      {kind === 'task' ? (
        <form onSubmit={submitTask} className="space-y-2">
          <textarea
            autoFocus
            value={title}
            onChange={e => onTitle(e.target.value)}
            placeholder="баг: календарь не листает в ноябрь"
            rows={2}
            className="w-full p-2 rounded-lg bg-(--color-panel) text-sm
                       border border-(--color-line) outline-none resize-none
                       focus:border-(--color-accent)"
          />
          <div className="flex gap-1.5">
            {(['task', 'bug', 'chore'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => { setType(t); setTouched(true); }}
                className={`text-2xs px-2 py-1 rounded-full border ${
                  type === t
                    ? 'border-(--color-accent) text-(--color-accent-ink)'
                    : 'border-(--color-line) text-(--color-muted)'
                }`}
              >
                {t === 'task' ? 'задача' : t === 'bug' ? 'баг' : 'долг'}
              </button>
            ))}
          </div>
          <select
            value={epicId}
            onChange={e => setEpicId(e.target.value)}
            className="w-full h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                       border border-(--color-line)"
          >
            <option value="">— без эпика —</option>
            {options.map(ep => (
              <option key={ep.id} value={ep.id}>{ep.title}</option>
            ))}
          </select>
          {error && <p className="text-xs text-(--color-danger-ink)">{error}</p>}
          <Button type="submit" variant="primary" disabled={busy} className="w-full">
            {busy ? '…' : 'В Backlog'}
          </Button>
        </form>
      ) : (
        <form onSubmit={submitEpic} className="space-y-2">
          <input
            autoFocus
            value={epicTitle}
            onChange={e => { setEpicTitle(e.target.value); setError(''); }}
            placeholder="крупная тема"
            className="w-full h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                       border border-(--color-line) outline-none
                       focus:border-(--color-accent)"
          />
          <textarea
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder="цель (необязательно)"
            rows={2}
            className="w-full p-2 rounded-lg bg-(--color-panel) text-sm
                       border border-(--color-line) outline-none resize-none
                       focus:border-(--color-accent)"
          />
          {error && <p className="text-xs text-(--color-danger-ink)">{error}</p>}
          <Button type="submit" variant="primary" disabled={busy} className="w-full">
            {busy ? '…' : 'Создать'}
          </Button>
        </form>
      )}
    </Sheet>
  );
}
```

- [ ] **Step 2: Обернуть вызов в `Board.tsx`**

Найти:
```tsx
      {showCreate && (
        <CreateModal
          project={current}
          epics={epics}
          items={items}
          onClose={() => setShowCreate(false)}
        />
      )}
```
заменить на:
```tsx
      <AnimatePresence>
        {showCreate && (
          <CreateModal
            key="create-modal"
            project={current}
            epics={epics}
            items={items}
            onClose={() => setShowCreate(false)}
          />
        )}
      </AnimatePresence>
```

- [ ] **Step 3: Проверить сборку, линт, тесты**

Run: `cd web && npm run build && npm run lint && npm test`
Expected: чисто.

- [ ] **Step 4: Ручная проверка**

Кнопка «Новая задача» открывает модалку с анимацией; переключение Задача/Эпик, создание задачи (гадание типа по `guessType`) и эпика — работает как раньше.

- [ ] **Step 5: Commit**

```bash
git add web/src/CreateModal.tsx web/src/Board.tsx
git commit -m "CreateModal на Sheet (KAN-94)"
```

---

### Task 10: `EpicModal.tsx` → Sheet

**Files:**
- Modify: `web/src/EpicModal.tsx` (полная замена)
- Modify: `web/src/Board.tsx` (обернуть вызов в `AnimatePresence`)

**Interfaces:**
- Consumes: `Sheet` из Task 3.

- [ ] **Step 1: Заменить содержимое `web/src/EpicModal.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { sb } from './supabase';
import type { Item, Epic } from './supabase';
import { epicProgress } from './epics';
import { Editable } from './Editable';
import { Sheet } from './ui/Sheet';

export function EpicModal(
  { epicId, onClose, onOpenItem }: {
    epicId: string; onClose: () => void; onOpenItem: (item: Item) => void;
  },
) {
  const [epic, setEpic] = useState<Epic | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [goalDraft, setGoalDraft] = useState('');

  useEffect(() => {
    sb.from('epics').select('*').eq('id', epicId).single()
      .then(({ data, error }) => {
        if (error) { setErr(error.message); return; }
        const e = data as Epic;
        setEpic(e);
        setTitleDraft(e.title);
        setGoalDraft(e.goal ?? '');
      });
    sb.from('items').select('*').eq('epic_id', epicId).order('position')
      .then(({ data, error }) => {
        if (error) { setErr(error.message); return; }
        setItems((data ?? []) as Item[]);
      });
  }, [epicId]);

  const saveTitle = async () => {
    setEditingTitle(false);
    const clean = titleDraft.trim();
    if (!epic || !clean || clean === epic.title) { setTitleDraft(epic?.title ?? ''); return; }
    const { error } = await sb.from('epics').update({ title: clean }).eq('id', epicId);
    if (error) { setErr(error.message); return; }
    setEpic({ ...epic, title: clean });
  };

  const saveGoal = async () => {
    setEditingGoal(false);
    if (!epic) return;
    const clean = goalDraft.trim() || null;
    if (clean === epic.goal) return;
    const { error } = await sb.from('epics').update({ goal: clean }).eq('id', epicId);
    if (error) { setErr(error.message); return; }
    setEpic({ ...epic, goal: clean });
  };

  const remove = async () => {
    const warning = items.length > 0
      ? `Удалить эпик «${epic?.title}»? Задачи (${items.length}) останутся, но потеряют привязку к нему.`
      : `Удалить эпик «${epic?.title}»?`;
    if (!confirm(warning)) return;
    const { error } = await sb.from('epics').delete().eq('id', epicId);
    if (error) { setErr(error.message); return; }
    onClose();
  };

  const { done, total } = epicProgress(epicId, items);

  return (
    <Sheet onClose={onClose} maxWidth="max-w-lg">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); }}
              className="block w-full text-lg font-medium bg-transparent
                         border-b border-(--color-line) outline-none"
            />
          ) : (
            <Editable
              as="h1"
              onEdit={() => setEditingTitle(true)}
              className="text-lg font-medium cursor-text"
            >
              {epic?.title}
            </Editable>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Закрыть"
          className="text-(--color-muted) hover:text-(--color-ink) text-lg leading-none"
        >
          ×
        </button>
      </div>

      {err && <p className="text-sm text-(--color-danger-ink) mb-3">{err}</p>}

      {editingGoal ? (
        <textarea
          autoFocus
          value={goalDraft}
          onChange={e => setGoalDraft(e.target.value)}
          onBlur={saveGoal}
          onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) saveGoal(); }}
          rows={2}
          placeholder="цель"
          className="w-full p-2 mb-3 rounded-lg bg-(--color-panel) text-sm
                     border border-(--color-line) outline-none resize-none
                     focus:border-(--color-accent)"
        />
      ) : (
        <Editable
          as="p"
          onEdit={() => setEditingGoal(true)}
          className="text-sm text-(--color-muted) mb-3 cursor-text min-h-[1.3em]"
        >
          {epic?.goal || 'цель — клик, чтобы добавить'}
        </Editable>
      )}

      <div className="flex items-center gap-3 mb-5 text-sm text-(--color-muted)">
        <span>{done}/{total}</span>
        {epic?.plan_path && (
          <a href={epic.plan_path} className="text-(--color-ink) underline">план</a>
        )}
        {epic?.spec_path && (
          <a href={epic.spec_path} className="text-(--color-ink) underline">спека</a>
        )}
      </div>

      <div className="space-y-1">
        {items.map(i => (
          <button
            key={i.id}
            onClick={() => onOpenItem(i)}
            className="w-full flex items-center gap-2 text-left text-sm
                       px-2 py-1.5 rounded hover:bg-(--color-panel)"
          >
            <span className="text-2xs font-mono text-(--color-muted) w-10">
              {i.seq}
            </span>
            <span className={i.status === 'done' ? 'text-(--color-muted)' : ''}>
              {i.title}
            </span>
            {i.checklist.length > 0 && (
              <span className="ml-auto text-2xs text-(--color-muted)">
                {i.checklist.filter(s => s.done).length}/{i.checklist.length}
              </span>
            )}
          </button>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-(--color-muted)">Пока без задач.</p>
        )}
      </div>

      <div className="flex mt-4 pt-3 border-t border-(--color-line)">
        <button onClick={remove} className="text-xs text-(--color-danger-ink) ml-auto">
          Удалить эпик
        </button>
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 2: Обернуть вызов в `Board.tsx`**

Найти:
```tsx
      {viewEpic && (
        <EpicModal
          epicId={viewEpic}
          onClose={() => setViewEpic(null)}
          onOpenItem={i => { setViewEpic(null); setOpenItem(i); }}
        />
      )}
```
заменить на:
```tsx
      <AnimatePresence>
        {viewEpic && (
          <EpicModal
            key="epic-modal"
            epicId={viewEpic}
            onClose={() => setViewEpic(null)}
            onOpenItem={i => { setViewEpic(null); setOpenItem(i); }}
          />
        )}
      </AnimatePresence>
```

- [ ] **Step 3: Проверить сборку, линт, тесты**

Run: `cd web && npm run build && npm run lint && npm test`
Expected: чисто.

- [ ] **Step 4: Ручная проверка**

Открыть эпик через ссылку в колонке — модалка с прогрессом, списком задач и правкой заголовка/цели работает как раньше, закрытие анимировано.

- [ ] **Step 5: Commit**

```bash
git add web/src/EpicModal.tsx web/src/Board.tsx
git commit -m "EpicModal на Sheet (KAN-94)"
```

---

### Task 11: `ProjectDrawer.tsx` + `NewProject.tsx` → Sheet/Button

**Files:**
- Modify: `web/src/ProjectDrawer.tsx` (полная замена)
- Modify: `web/src/NewProject.tsx` (полная замена)
- Modify: `web/src/Board.tsx` (обернуть вызов в `AnimatePresence`)

**Interfaces:**
- Consumes: `Sheet`, `Button`.
- Последний потребитель `--color-wait-ink` — после этой задачи алиас в `styles.css` можно удалять (Task 13).

- [ ] **Step 1: Заменить содержимое `web/src/ProjectDrawer.tsx`**

```tsx
import type { Project } from './supabase';
import { NewProject } from './NewProject';
import { Sheet } from './ui/Sheet';

export type ProjectRow = { project: Project; total: number; done: number; waiting: number };

export function ProjectDrawer(
  { current, rows, onSelect, onClose }: {
    current: string; rows: ProjectRow[];
    onSelect: (id: string) => void; onClose: () => void;
  },
) {
  return (
    <Sheet onClose={onClose} placement="left">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-medium">Проекты</h2>
        <button
          onClick={onClose}
          aria-label="Закрыть"
          className="text-(--color-muted) hover:text-(--color-ink) text-lg leading-none"
        >
          ×
        </button>
      </div>

      <NewProject onCreated={id => { onSelect(id); onClose(); }} />

      <div className="space-y-1 mt-4">
        {rows.map(({ project, total, done, waiting }) => (
          <button
            key={project.id}
            onClick={() => { onSelect(project.id); onClose(); }}
            className={`w-full text-left text-sm px-3 py-2 rounded
                       hover:bg-(--color-panel) ${
              project.id === current ? 'bg-(--color-panel)' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="font-medium">{project.name}</span>
              <span className="ml-auto shrink-0 text-(--color-muted)">{done}/{total}</span>
              {waiting > 0 && (
                <span className="shrink-0 text-(--color-accent-ink)">{waiting} ждёт</span>
              )}
            </div>
            {project.description && (
              <div className="text-(--color-muted) truncate mt-0.5">
                {project.description}
              </div>
            )}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 2: Заменить содержимое `web/src/NewProject.tsx`**

```tsx
import { useState } from 'react';
import { sb } from './supabase';
import { slugify, prefixify } from './slug';
import { Button } from './ui/Button';

export function NewProject({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [prefix, setPrefix] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [prefixTouched, setPrefixTouched] = useState(false);
  const [repoPath, setRepoPath] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onName = (v: string) => {
    setName(v);
    setError('');
    const auto = slugify(v);
    if (!slugTouched) setSlug(auto);
    if (!prefixTouched) setPrefix(prefixify(auto));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim() || !prefix.trim()) {
      setError('Напиши имя — слаг и префикс подставятся сами');
      return;
    }
    setBusy(true);
    const { error } = await sb.from('projects').insert({
      id: slug.trim(),
      name: name.trim(),
      prefix: prefix.trim().toUpperCase(),
      description: description.trim() || null,
      repo_path: repoPath.trim() || null,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }

    const created = slug.trim();
    setName(''); setSlug(''); setPrefix('');
    setSlugTouched(false); setPrefixTouched(false);
    setRepoPath(''); setDescription(''); setOpen(false);
    onCreated(created);
  };

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Новый проект
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="w-full space-y-2">
      <input
        autoFocus
        value={name}
        onChange={e => onName(e.target.value)}
        placeholder="имя: Семейное приложение"
        className="w-full h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                   border border-(--color-line) outline-none
                   focus:border-(--color-accent)"
      />
      <div className="flex gap-2">
        <input
          value={slug}
          onChange={e => { setSlug(e.target.value); setSlugTouched(true); setError(''); }}
          placeholder="слаг"
          className="flex-1 h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                     border border-(--color-line) outline-none
                     focus:border-(--color-accent)"
        />
        <input
          value={prefix}
          onChange={e => { setPrefix(e.target.value); setPrefixTouched(true); setError(''); }}
          placeholder="префикс"
          className="w-20 h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                     border border-(--color-line) outline-none
                     focus:border-(--color-accent)"
        />
      </div>
      <input
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="описание (необязательно)"
        className="w-full h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                   border border-(--color-line) outline-none
                   focus:border-(--color-accent)"
      />
      <input
        value={repoPath}
        onChange={e => setRepoPath(e.target.value)}
        placeholder="путь к папке на компе (необязательно)"
        className="w-full h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                   border border-(--color-line) outline-none
                   focus:border-(--color-accent)"
      />
      <p className="text-2xs text-(--color-muted)">
        Путь нужен, чтобы я сама находила проект по рабочей папке — без него
        придётся называть проект явно.
      </p>

      {error && <p className="text-xs text-(--color-danger-ink)">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={busy} className="flex-1">
          {busy ? '…' : 'Создать'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => { setOpen(false); setError(''); }}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Обернуть вызов в `Board.tsx`**

Найти:
```tsx
      {showProjects && (
        <ProjectDrawer
          current={current}
          rows={projectRows}
          onSelect={id => { setCurrent(id); reloadProjects(); }}
          onClose={() => setShowProjects(false)}
        />
      )}
```
заменить на:
```tsx
      <AnimatePresence>
        {showProjects && (
          <ProjectDrawer
            key="project-drawer"
            current={current}
            rows={projectRows}
            onSelect={id => { setCurrent(id); reloadProjects(); }}
            onClose={() => setShowProjects(false)}
          />
        )}
      </AnimatePresence>
```

- [ ] **Step 4: Проверить сборку, линт, тесты**

Run: `cd web && npm run build && npm run lint && npm test`
Expected: чисто.

- [ ] **Step 5: Ручная проверка**

Кнопка «Проекты» открывает шторку слева с анимацией въезда; «Новый проект» → форма → создание проекта работает; список проектов с прогрессом и «N ждёт» в акцентном цвете.

- [ ] **Step 6: Commit**

```bash
git add web/src/ProjectDrawer.tsx web/src/NewProject.tsx web/src/Board.tsx
git commit -m "ProjectDrawer и NewProject на Sheet/Button (KAN-94)"
```

---

### Task 12: `ArchiveList.tsx` → Sheet

**Files:**
- Modify: `web/src/ArchiveList.tsx` (полная замена)
- Modify: `web/src/Board.tsx` (обернуть вызов в `AnimatePresence`)

**Interfaces:**
- Consumes: `Sheet` из Task 3.

- [ ] **Step 1: Заменить содержимое `web/src/ArchiveList.tsx`**

```tsx
import type { Item } from './supabase';
import { Sheet } from './ui/Sheet';

function Row(
  { item, onOpen, onRestore }: {
    item: Item; onOpen: (item: Item) => void; onRestore: (item: Item) => void;
  },
) {
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded
                 hover:bg-(--color-panel)"
    >
      <button
        onClick={() => onOpen(item)}
        className="flex-1 text-left text-sm"
      >
        <span className="text-2xs font-mono text-(--color-muted) mr-2">
          {item.id}
        </span>
        {item.title}
      </button>
      {item.archived_at && (
        <button
          onClick={() => onRestore(item)}
          className="text-2xs text-(--color-muted) hover:text-(--color-ink) underline shrink-0"
        >
          вернуть в работу
        </button>
      )}
    </div>
  );
}

export function ArchiveList(
  { items, onOpen, onRestore, onClose }: {
    items: Item[]; onOpen: (item: Item) => void;
    onRestore: (item: Item) => void; onClose: () => void;
  },
) {
  const archived = items.filter(i => i.archived_at);
  const overflow = items.filter(i => !i.archived_at);

  return (
    <Sheet onClose={onClose} maxWidth="max-w-lg">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-medium">Архив</h2>
        <button
          onClick={onClose}
          aria-label="Закрыть"
          className="text-(--color-muted) hover:text-(--color-ink) text-lg leading-none"
        >
          ×
        </button>
      </div>

      {items.length === 0 && (
        <p className="text-sm text-(--color-muted)">Пусто.</p>
      )}

      {overflow.length > 0 && (
        <div className="mb-4">
          <h3 className="text-2xs text-(--color-muted) mb-1 px-1">
            Готово — не поместилось в колонку
          </h3>
          <div className="space-y-1">
            {overflow.map(i => (
              <Row key={i.id} item={i} onOpen={onOpen} onRestore={onRestore} />
            ))}
          </div>
        </div>
      )}

      {archived.length > 0 && (
        <div>
          <h3 className="text-2xs text-(--color-muted) mb-1 px-1">
            В архиве
          </h3>
          <div className="space-y-1">
            {archived.map(i => (
              <Row key={i.id} item={i} onOpen={onOpen} onRestore={onRestore} />
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}
```

- [ ] **Step 2: Обернуть вызов в `Board.tsx`**

Найти:
```tsx
      {showArchive && (
        <ArchiveList
          items={archiveItems}
          onOpen={i => { setShowArchive(false); setOpenItem(i); }}
          onRestore={async i => {
            const { error } = await sb.from('items')
              .update({ status: 'doing', archived_at: null }).eq('id', i.id);
            if (error) { setErr(error.message); return; }
            reload(current);
          }}
          onClose={() => setShowArchive(false)}
        />
      )}
```
заменить на:
```tsx
      <AnimatePresence>
        {showArchive && (
          <ArchiveList
            key="archive-list"
            items={archiveItems}
            onOpen={i => { setShowArchive(false); setOpenItem(i); }}
            onRestore={async i => {
              const { error } = await sb.from('items')
                .update({ status: 'doing', archived_at: null }).eq('id', i.id);
              if (error) { setErr(error.message); return; }
              reload(current);
            }}
            onClose={() => setShowArchive(false)}
          />
        )}
      </AnimatePresence>
```

- [ ] **Step 3: Проверить сборку, линт, тесты**

Run: `cd web && npm run build && npm run lint && npm test`
Expected: чисто.

- [ ] **Step 4: Ручная проверка**

«ещё N · архив» открывает список с анимацией, секции «не поместилось»/«в архиве» видны раздельно, восстановление задачи работает.

- [ ] **Step 5: Commit**

```bash
git add web/src/ArchiveList.tsx web/src/Board.tsx
git commit -m "ArchiveList на Sheet (KAN-94)"
```

---

### Task 13: Финальная чистка и проверка

**Files:**
- Modify: `web/src/styles.css` (убрать временные алиасы)

**Interfaces:**
- Consumes: ничего нового — финальный проход по всему, что сделали задачи 1–12.

- [ ] **Step 1: Убедиться, что алиасы больше не используются**

Run: `grep -rn "color-wait" web/src`
Expected: пусто (после Task 7 и Task 11 не осталось потребителей).

- [ ] **Step 2: Удалить алиасы из `web/src/styles.css`**

Убрать из обоих `@theme`-блоков (светлого и `prefers-color-scheme: dark`) две строки:
```css
  --color-wait: ...;
  --color-wait-ink: ...;
```

- [ ] **Step 3: Полный прогон проверок**

Run: `cd web && npm test && npm run lint && npm run build`
Expected: все 6 тестовых файлов проходят, линт чист, сборка чистая.

- [ ] **Step 4: Ручной QA-проход в браузере**

Через dev-сервер (`preview_start`), уже залогинен:
1. Доска в светлой теме (`resize_window colorScheme: 'light'`) — шапка, колонки, карточки, обе темы визуально согласованы.
2. То же в тёмной (`colorScheme: 'dark'`).
3. Десктоп: перетащить карточку между колонками мышью.
4. Мобильная ширина (`preset: 'mobile'`): свайп карточки меняет статус, панель-подсказка открывается позади карточки.
5. Открыть/закрыть по очереди: карточку задачи, создание задачи, эпик, шторку проектов, архив — у каждой анимация входа/выхода, Esc и клик по фону закрывают.
6. `read_console_messages` — без ошибок на протяжении всего прохода.

- [ ] **Step 5: Commit**

```bash
git add web/src/styles.css
git commit -m "Убраны временные color-wait алиасы (KAN-94)"
```
