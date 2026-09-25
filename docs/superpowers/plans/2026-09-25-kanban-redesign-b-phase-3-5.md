# Редизайн «B», фазы 3–5 (KAN-115) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Довести редизайн «B» до конца: полная карточка и группы эпиков (фаза 3), шторки задачи и эпика на vaul с Markdown (фаза 4), создание, проекты, архив, вход (фаза 5).

**Architecture:** Фазы 1–2 уже в `main` (токены, Onest, Phosphor, `Button`, тосты, `columns.ts`/`prefs.ts`, `Card`/`Column`/`StatusMenu`, вкладки и лента, `BoardHeader`, `MotionConfig reducedMotion="user"`). Здесь: чистые модули с тестами (`cardMeta.ts`, `progress.ts`, `time.ts`, `markdown.ts`, `archive.ts`), общие UI-компоненты (`ProgressRing`, `Sheet` на vaul, `Popover`/`PropertySelect`, `Markdown`), затем экраны на них. Логика данных (запросы Supabase, `setStatus`, `between()`, realtime) не меняется, кроме встроенного счётчика комментариев.

**Tech Stack:** React 19, Vite 8, Tailwind v4, `motion`, `@dnd-kit`, Supabase JS, `@phosphor-icons/react`, `@radix-ui/react-dropdown-menu`. Новые: `vaul@1.1.2`, `@radix-ui/react-popover@1.1.23`, `marked@18.0.14`, `dompurify@3.4.16`, dev: `jsdom@30.1.1` (только для теста рендера Markdown).

**Spec:** `docs/superpowers/specs/2026-09-25-kanban-redesign-b-design.md` (разделы 3, 4, 5).

**Предыдущий план (образец формата и история решений):** `docs/superpowers/plans/2026-09-25-kanban-redesign-b-phase-1-2.md`.

## Global Constraints

- Все команды из `web/`, если не сказано иначе. Проверка каждой задачи: `npm test && npm run lint && npm run build`; новых предупреждений lint не добавлять.
- Цвета только через токены `--color-*` (`ground surface raised ink ink-2 muted line accent accent-ink on-accent accent-soft danger overlay shadow`); hex в `.tsx` запрещены. Утилиты `shadow-card`, `shadow-menu`, `text-micro/meta/body/title/title-lg`.
- Радиусы: карточка, меню, popover 16px (`rounded-2xl`); шторка снизу 24px сверху (`rounded-t-3xl`); кнопки, вкладки, чипы pill (`rounded-full`); поля 12px (`rounded-xl`).
- Иконки только `@phosphor-icons/react`.
- Анимации — `motion`; глобальный `MotionConfig reducedMotion="user"` уже в `App.tsx`. vaul анимирует сам — при `prefers-reduced-motion` полагаемся на его CSS-переходы (vaul уважает `prefers-reduced-motion` через свои стили; проверяется в приёмке).
- Поля ввода на `(pointer: coarse)` 16px — правило KAN-114 в `styles.css` не трогать.
- Все ошибки Supabase — `toasts.show(message)` из `web/src/ui/toast.ts`; локальных `err`-строк в компонентах после переделки не остаётся.
- `window.confirm` не используется нигде после фазы 4.
- Модули, которые тестирует `node --test` напрямую, импортируют другие модули времени выполнения с расширением `.ts`; в тестах нет JSX и нет глобального DOM (кроме `markdown.test.ts`, который создаёт окно через `jsdom`).
- Комментарии в коде на русском, объясняют «почему». Коммиты на русском; трейлеры:
  ```
  Co-Authored-By: Claude <модель, которая писала коммит> <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01XyNZhpjSJGfbTkzGwqtUGS
  ```
- Каждая фаза завершается задачей приёмки; PR один на ветку в конце (как в фазах 1–2), мерж — владелец.

## Review Focus

1. Markdown от агента и из комментариев содержит сырой HTML (`<img onerror>`, `<script>`, `javascript:`-ссылки) → вырезается, страница не исполняет код. Тест в Task 7 (`markdown.test.ts`).
2. Закрытие шторки жестом, тапом по подложке, Esc и кнопкой → родитель получает `onClose` ровно один раз и после анимации; повторное открытие той же задачи работает. Проверка в Task 13 (Playwright: открыть → Esc → открыть снова).
3. Клавиатура на телефоне в шторке задачи: поле комментария и описание видны над клавиатурой (vaul `repositionInputs`). Headless Chromium не эмулирует экранную клавиатуру и `visualViewport` — автоматического теста нет; пункт явно в чеклисте PR «проверить на телефоне».
4. Удаление задачи двумя шагами в меню: первый выбор не удаляет, второй удаляет; закрытие меню между шагами сбрасывает подтверждение. Тест логики в Task 12 (`confirmStep` в `deleteConfirm.ts`).
5. Поиск в архиве: регистр, `ё/е`, пробелы по краям, поиск по id (`KAN-12`). Тест в Task 16 (`archive.test.ts`).

---

# Фаза 3. Карточка

### Task 1: Счётчик комментариев и мета карточки как данные

**Files:**
- Create: `web/src/cardMeta.ts`
- Create: `web/test/cardMeta.test.ts`
- Modify: `web/src/supabase.ts` (тип `Item`)
- Modify: `web/src/Board.tsx` (запрос `reload`)
- Modify: `web/package.json` (скрипт `test`)

**Interfaces:**
- Produces:
  ```ts
  // supabase.ts
  type Item = { …как сейчас…; comments?: { count: number }[] };
  // cardMeta.ts
  type CardMeta = {
    checklist: { done: number; total: number; complete: boolean } | null;
    comments: number;
    hasBody: boolean;
  };
  function cardMeta(item: Item): CardMeta;
  ```

- [ ] **Step 1: Падающий тест**

`web/test/cardMeta.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardMeta } from '../src/cardMeta.ts';
import type { Item } from '../src/supabase.ts';

function mk(o: Partial<Item>): Item {
  return {
    id: 'K-1', seq: 1, project_id: 'k', epic_id: null, type: 'task', title: 't', body: null,
    status: 'backlog', checklist: [], blocks: [], position: 100,
    closed_at: null, archived_at: null, ...o,
  };
}

test('пустая карточка — ничего лишнего', () => {
  assert.deepEqual(cardMeta(mk({})), { checklist: null, comments: 0, hasBody: false });
});

test('чеклист: счётчик и признак «всё отмечено»', () => {
  const two = [{ text: 'a', done: true }, { text: 'b', done: false }];
  assert.deepEqual(cardMeta(mk({ checklist: two })).checklist, { done: 1, total: 2, complete: false });
  const all = [{ text: 'a', done: true }];
  assert.deepEqual(cardMeta(mk({ checklist: all })).checklist, { done: 1, total: 1, complete: true });
});

test('комментарии из встроенного счётчика; нет поля — ноль', () => {
  assert.equal(cardMeta(mk({ comments: [{ count: 3 }] })).comments, 3);
  assert.equal(cardMeta(mk({ comments: [] })).comments, 0);
  assert.equal(cardMeta(mk({})).comments, 0);
});

test('описание из одних пробелов не считается описанием', () => {
  assert.equal(cardMeta(mk({ body: '  \n ' })).hasBody, false);
  assert.equal(cardMeta(mk({ body: 'x' })).hasBody, true);
});
```

`package.json`: дописать `test/cardMeta.test.ts` в скрипт `test`.

Run: `npm test` → FAIL (нет `../src/cardMeta.ts`).

- [ ] **Step 2: Реализация**

В `web/src/supabase.ts` в тип `Item` после `archived_at: string | null;` добавить:

```ts
  // Встроенный счётчик PostgREST: select('*, comments(count)') отдаёт
  // [{ count: N }]. Необязательный — другие запросы (эпик, архив)
  // выбирают '*' без него.
  comments?: { count: number }[];
```

`web/src/cardMeta.ts`:

```ts
import type { Item } from './supabase';

// Что показывать в строке меты карточки. Отдельно от разметки, чтобы
// правила («всё отмечено», «пробелы — не описание») были проверяемы.
export type CardMeta = {
  checklist: { done: number; total: number; complete: boolean } | null;
  comments: number;
  hasBody: boolean;
};

export function cardMeta(item: Item): CardMeta {
  const total = item.checklist.length;
  const done = item.checklist.filter(s => s.done).length;
  return {
    checklist: total ? { done, total, complete: done === total } : null,
    comments: item.comments?.[0]?.count ?? 0,
    hasBody: !!item.body?.trim(),
  };
}
```

Run: `npm test` → PASS.

- [ ] **Step 3: Запрос со счётчиком**

В `Board.tsx`, `reload`: `sb.from('items').select('*')` → `sb.from('items').select('*, comments(count)')`. Остальное без изменений. (Мок `scripts/shots.mjs` уже умеет `comments(count)`.)

- [ ] **Step 4: Проверка и commit**

Run: `npm test && npm run lint && npm run build`.
Commit: «Счётчик комментариев в запросе и мета карточки как данные (KAN-115)».

---

### Task 2: `CardBody` — одна разметка для карточки, превью и скелетона

**Files:**
- Modify: `web/src/Card.tsx`
- Modify: `web/src/ui/panel.ts`

**Interfaces:**
- Consumes: `cardMeta` (Task 1), `TypeBadge`, `panelClass`.
- Produces: `CardBody({ item }: { item: Item })`, `cardTone(item: Item): PanelTone`; `PanelTone = 'default' | 'accent' | 'done'`.

- [ ] **Step 1: Тон «Готово» в `panel.ts`**

```ts
export type PanelTone = 'default' | 'accent' | 'done';

const TONE: Record<PanelTone, string> = {
  default: 'bg-(--color-surface) shadow-card',
  accent: 'bg-(--color-accent-soft) shadow-card ring-[1.5px] ring-inset ring-(--color-accent)',
  // Закрытые задачи отходят на второй план: тень слабее, текст ink-2
  // (ставит CardBody), фон тот же.
  done: 'bg-(--color-surface) shadow-[0_1px_2px_var(--color-shadow)]',
};
```

(`panelClass` без изменений.)

- [ ] **Step 2: `CardBody` и `cardTone` в `Card.tsx`**

Импорты добавить: `import { ListChecks, CheckCircle, ChatCircle, TextAlignLeft } from '@phosphor-icons/react';`, `import { cardMeta } from './cardMeta';`, `import type { PanelTone } from './ui/panel';`.

```tsx
export function cardTone(item: Item): PanelTone {
  if (item.status === 'waiting') return 'accent';
  if (item.status === 'done') return 'done';
  return 'default';
}

// Содержимое карточки — общее для самой карточки и её drag-превью, чтобы
// превью под курсором выглядело ровно как то, что тащишь.
export function CardBody({ item }: { item: Item }) {
  const meta = cardMeta(item);
  return (
    <>
      <p className={`text-body line-clamp-3 ${item.status === 'done' ? 'text-(--color-ink-2)' : ''}`}>
        {item.title}
      </p>
      <div className="flex items-center gap-2.5 mt-1.5 text-micro text-(--color-muted)">
        <span>{item.id}</span>
        <TypeBadge type={item.type} />
        {meta.checklist && (meta.checklist.complete ? (
          <span className="inline-flex items-center" aria-label="Чеклист выполнен">
            <CheckCircle size={14} />
          </span>
        ) : (
          <span className="inline-flex items-center gap-1" aria-label="Чеклист">
            <ListChecks size={14} />{meta.checklist.done}/{meta.checklist.total}
          </span>
        ))}
        {meta.comments > 0 && (
          <span className="inline-flex items-center gap-1" aria-label="Комментарии">
            <ChatCircle size={14} />{meta.comments}
          </span>
        )}
        {meta.hasBody && (
          <span className="inline-flex items-center" aria-label="Есть описание">
            <TextAlignLeft size={14} />
          </span>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Перевести `Card`, `CardPreview`, `CardSkeleton`**

- В `Card`: удалить локальные `done`, `waiting`; `className={panelClass(cardTone(item), 'group relative p-3 pr-9 cursor-grab no-callout')}`; содержимое после `<StatusMenu …/>` заменить на `<CardBody item={item} />`.
- `CardPreview`:
  ```tsx
  export function CardPreview({ item }: { item: Item }) {
    return (
      <article className={panelClass(cardTone(item), 'p-3 pr-9 shadow-menu rotate-1')}>
        <CardBody item={item} />
      </article>
    );
  }
  ```
- `CardSkeleton` оставить как есть (у него своя форма-заглушка, но тот же `panelClass('default', …)` и те же отступы `p-3`).

Run: `grep -n "line-clamp-3" src/Card.tsx` → ровно одна строка (в `CardBody`).

- [ ] **Step 4: Проверка, снимки, commit**

Run: `npm test && npm run lint && npm run build && CHROMIUM_PATH=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1) npm run shots -- p3t2`
Открыть `shots/p3t2/desktop-light-board.png`: у «Перенести главную на Astro» (фикстура) `ListChecks 1/3`, у карточек с описанием иконка описания, у «Готово» бледнее тень.
Commit: «CardBody: полная мета карточки, тон «Готово» (KAN-115)».

---

### Task 3: Кольцо прогресса и шапки групп эпиков

**Files:**
- Create: `web/src/progress.ts`
- Create: `web/test/progress.test.ts`
- Create: `web/src/ui/ProgressRing.tsx`
- Create: `web/src/EpicGroupHeader.tsx`
- Modify: `web/src/Column.tsx`
- Modify: `web/package.json` (скрипт `test`)

**Interfaces:**
- Consumes: `epicProgress` из `epics.ts`.
- Produces: `ringDash(done: number, total: number, circumference: number): number`; `ProgressRing({ done, total, size, stroke? })`; `EpicGroupHeader({ epic, allItems, onOpen })`.

- [ ] **Step 1: Падающий тест**

`web/test/progress.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ringDash } from '../src/progress.ts';

test('доля закрашенной окружности', () => {
  assert.equal(ringDash(0, 9, 100), 0);
  assert.equal(ringDash(3, 9, 90), 30);
  assert.equal(ringDash(9, 9, 100), 100);
});

test('пустой эпик и мусор — ноль, больше целого не бывает', () => {
  assert.equal(ringDash(0, 0, 100), 0);
  assert.equal(ringDash(5, 3, 100), 100);
  assert.equal(ringDash(-1, 3, 100), 0);
});
```

`package.json`: дописать `test/progress.test.ts`. Run: `npm test` → FAIL.

- [ ] **Step 2: `progress.ts`**

```ts
// Длина закрашенной дуги кольца прогресса. Пустой эпик — пустое кольцо,
// а не деление на ноль; больше целого круга не рисуем.
export function ringDash(done: number, total: number, circumference: number): number {
  if (total <= 0) return 0;
  const f = Math.min(1, Math.max(0, done / total));
  return f * circumference;
}
```

Run: `npm test` → PASS.

- [ ] **Step 3: `ui/ProgressRing.tsx`**

```tsx
import { ringDash } from '../progress';

// Кольцо рисуется двумя окружностями SVG: дорожка цвета line и дуга
// accent. Это не иконка, а геометрия — библиотечного аналога нет.
export function ProgressRing(
  { done, total, size, stroke = 2.5 }: { done: number; total: number; size: number; stroke?: number },
) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="var(--color-accent)" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${ringDash(done, total, c)} ${c}`}
      />
    </svg>
  );
}
```

- [ ] **Step 4: `EpicGroupHeader.tsx`**

```tsx
import { CaretRight } from '@phosphor-icons/react';
import type { Epic, Item } from './supabase';
import { epicProgress } from './epics';
import { ProgressRing } from './ui/ProgressRing';

// Шапка группы эпика — строка-кнопка на всю ширину. Раньше это была
// подчёркнутая ссылка по центру, переносившаяся на 2–3 строки.
export function EpicGroupHeader(
  { epic, allItems, onOpen }: { epic: Epic; allItems: Item[]; onOpen: (id: string) => void },
) {
  const { done, total } = epicProgress(epic.id, allItems);
  return (
    <button
      onClick={() => onOpen(epic.id)}
      className="w-full flex items-center gap-2 h-8 px-1 rounded-xl text-meta text-(--color-ink-2)
                 hover:bg-(--color-raised) active:scale-[0.99] transition-transform"
    >
      <ProgressRing done={done} total={total} size={14} />
      <span className="flex-1 min-w-0 truncate text-left">{epic.title}</span>
      <span className="text-micro text-(--color-muted)">{done}/{total}</span>
      <CaretRight size={14} className="text-(--color-muted)" />
    </button>
  );
}
```

- [ ] **Step 5: Колонка на новых шапках**

В `Column.tsx`:
1. Импорт `import { EpicGroupHeader } from './EpicGroupHeader';`; убрать `epicProgress` из импорта `./epics`.
2. `<div className="space-y-3">` (корень списка) → `<div className="space-y-5">`.
3. Кнопку-ссылку эпика внутри группы заменить на `<EpicGroupHeader epic={epic} allItems={allItems} onOpen={onOpenEpic} />`.
4. Кнопки `pinnedEmpty.map(...)` заменить на `pinnedEmpty.map(epic => <EpicGroupHeader key={epic.id} epic={epic} allItems={allItems} onOpen={onOpenEpic} />)`.
5. Блок `ungrouped` — перед списком, если `groups.length + pinnedEmpty.length > 0`, подзаголовок:
   ```tsx
   <h3 className="px-1 pb-1 text-meta text-(--color-muted)">Без эпика</h3>
   ```

- [ ] **Step 6: Проверка, снимки, commit**

Run: `npm test && npm run lint && npm run build && … npm run shots -- p3t3`. На `phone-light-board.png` и `desktop-light-board.png` шапки групп одной строкой с кольцом, «Без эпика» перед задачами без эпика.
Commit: «Кольцо прогресса и шапки групп эпиков строкой (KAN-115)».

---

### Task 4: «Архив · N», хвосты фазы 2

**Files:**
- Modify: `web/src/Column.tsx`, `web/src/Lane.tsx`, `web/src/useLongPress.ts`, `web/src/useMedia.ts`, `web/src/Board.tsx`, `web/src/Card.tsx`

**Interfaces:** без новых.

- [ ] **Step 1: Кнопка-пилюля архива** (`Column.tsx`)

Кнопку «ещё N · архив» заменить на:

```tsx
<Button variant="secondary" size="sm" onClick={onShowArchive} className="mt-3">
  <Archive size={16} />
  Архив · {hiddenDone + archivedCount}
</Button>
```

Импорты: `import { Archive } from '@phosphor-icons/react';`, `import { Button } from './ui/Button';`.

- [ ] **Step 2: Тени соседней колонки у левого края ленты** (`Lane.tsx`)

Слот колонки `<div className="snap-start shrink-0 h-full …">` получает `overflow-x-clip`, а в `Column.tsx` у прокручиваемого блока `-mx-1 px-1` заменить на `px-1` (тени карточек остаются внутри слота). Проверка: на `shots/…/phone-light-board.png` у левого края нет вертикальных штрихов.

- [ ] **Step 3: Таймер долгого нажатия при размонтировании** (`useLongPress.ts`)

Добавить `useEffect` (импорт из `react`):

```ts
  // Карточка может исчезнуть посреди нажатия (realtime-перезагрузка) —
  // таймер не должен потом вибрировать и дёргать состояние.
  useEffect(() => () => clearTimeout(timer.current), []);
```

- [ ] **Step 4: `useMedia` без переподписки** (`useMedia.ts`)

```ts
import { useCallback, useSyncExternalStore } from 'react';

export function useMedia(query: string): boolean {
  const subscribe = useCallback((notify: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener('change', notify);
    return () => mq.removeEventListener('change', notify);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
```

- [ ] **Step 5: Первое открытие без анимации и без записи колонки** (`Lane.tsx`, `Board.tsx`)

Сейчас `mounted` в `Lane` становится `true` до загрузки задач, поэтому к стартовой колонке лента едет с анимацией, а `scrollend` после этой прокрутки пишет её в `lastColumn`, как будто выбрал пользователь.
- `Lane` получает проп `ready: boolean`. Эффект «активная → прокрутка» ставит `mounted.current = true` только когда `ready`; пока `!ready` — прокручивает `instant`.
- В `Board` передать `ready={loaded}`.
- В `Lane` запоминать программную цель: `programmatic.current = active` перед `scrollTo`; в `settle`, если вычисленный индекс равен `programmatic.current`, сбросить `programmatic.current = null` и **не** вызывать `onActiveChange` (значение и так активно). Пользовательский свайп (`programmatic.current === null`) идёт как раньше.

- [ ] **Step 6: Смена статуса из меню — сразу на экране** (`Card.tsx`, `Board.tsx`)

`Card` получает проп `onLocalPatch: (id: string, patch: Partial<Item>) => void`; в `move` перед `await setStatus(...)`:

```ts
    // Как при перетаскивании: карточка переезжает сразу, а не после
    // круга до сервера и перезагрузки.
    onLocalPatch(item.id, { status, closed_at: closedAtFor(status) });
```

(импорт `closedAtFor` из `./supabase`). `Column` пробрасывает проп; `Board` передаёт `onLocalPatch={(id, patch) => setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))}`. В ветке ошибки `setStatus` добавить `onChanged()` перед `return`: перезагрузка вернёт карточку на место, раз сервер правку не принял.

- [ ] **Step 7: Проверка, commit**

Run: `npm test && npm run lint && npm run build && CHROMIUM_PATH=… node scripts/longpress-check.mjs` (OK).
Commit по шагу или один: «Архив пилюлей и хвосты фазы 2: тени у края ленты, таймер, useMedia, первое открытие, мгновенная смена статуса (KAN-115)».

---

### Task 5: Приёмка фазы 3

- [ ] `npm test && npm run lint && npm run build`; размер JS (gz): `for f in dist/assets/*.js; do gzip -c $f | wc -c; done | awk '{s+=$1} END {print s}'` — записать рядом с 229.0 КБ.
- [ ] `npm run shots -- phase3`; сравнить с `shots/phase2`: карточка (мета, тон «Готово»), шапки групп, «Без эпика», «Архив · N», нет штрихов у края ленты. Проблемы — списком в отчёт.
- [ ] `node scripts/longpress-check.mjs` → OK.
- [ ] Commit не требуется (если ничего не правилось).

---

# Фаза 4. Шторки

### Task 6: Зависимости и относительное время

**Files:**
- Modify: `web/package.json`
- Create: `web/src/time.ts`
- Create: `web/test/time.test.ts`

**Interfaces:**
- Produces: `relTime(iso: string, now: Date): string`, `fullDate(iso: string): string`.

- [ ] **Step 1: Установить**

Run: `npm i vaul@1.1.2 @radix-ui/react-popover@1.1.23 marked@18.0.14 dompurify@3.4.16 && npm i -D jsdom@30.1.1`

- [ ] **Step 2: Падающий тест**

`web/test/time.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relTime } from '../src/time.ts';

const now = new Date('2026-09-25T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

test('секунды и будущее — «только что»', () => {
  assert.equal(relTime(ago(20_000), now), 'только что');
  assert.equal(relTime(new Date(now.getTime() + 5_000).toISOString(), now), 'только что');
});

test('минуты и часы', () => {
  assert.equal(relTime(ago(5 * 60_000), now), '5 мин назад');
  assert.equal(relTime(ago(2 * 3600_000), now), '2 ч назад');
});

test('вчера и дальше — дата', () => {
  assert.equal(relTime(ago(26 * 3600_000), now), 'вчера');
  assert.equal(relTime('2026-09-01T10:00:00Z', now), '1 сент.');
  assert.equal(relTime('2025-12-31T10:00:00Z', now), '31 дек. 2025');
});
```

`package.json`: дописать `test/time.test.ts`. Run → FAIL.

- [ ] **Step 3: `time.ts`**

```ts
const MONTHS = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];

// Время комментария «по-человечески». Своя функция, а не Intl.RelativeTimeFormat:
// «2 ч назад» и «вчера» короче, чем «2 часа назад» / «1 день назад», а
// строка стоит в мелкой подписи. Дата — по UTC, как хранится в базе.
export function relTime(iso: string, now: Date): string {
  const t = new Date(iso);
  const s = (now.getTime() - t.getTime()) / 1000;
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 24 * 3600) return `${Math.floor(s / 3600)} ч назад`;
  if (s < 48 * 3600) return 'вчера';
  const d = `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`;
  return t.getUTCFullYear() === now.getUTCFullYear() ? d : `${d} ${t.getUTCFullYear()}`;
}

export function fullDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU');
}
```

Run → PASS. Commit: «Зависимости шторок и относительное время комментариев (KAN-115)».

---

### Task 7: Рендер Markdown с очисткой

**Files:**
- Create: `web/src/markdown.ts`
- Create: `web/src/ui/Markdown.tsx`
- Create: `web/test/markdown.test.ts`
- Modify: `web/src/styles.css` (типографика `.md`)
- Modify: `web/package.json` (скрипт `test`)

**Interfaces:**
- Produces: `makeRenderer(win: Window & typeof globalThis): (src: string) => string`; `Markdown({ text, className? })` (грузит рендерер лениво).

- [ ] **Step 1: Падающий тест**

`web/test/markdown.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { makeRenderer } from '../src/markdown.ts';

const render = makeRenderer(new JSDOM('').window as unknown as Window & typeof globalThis);

test('разметка: жирный, код, списки, переносы строк', () => {
  const html = render('**Files:**\n- `a.ts`\nстрока');
  assert.match(html, /<strong>Files:<\/strong>/);
  assert.match(html, /<code>a\.ts<\/code>/);
});

test('вырезает скрипты, обработчики и javascript:-ссылки', () => {
  const html = render('<img src=x onerror=alert(1)><script>alert(2)</script>[x](javascript:alert(3))');
  assert.doesNotMatch(html, /onerror|<script|javascript:/i);
});

test('ссылки открываются в новой вкладке без доступа к opener', () => {
  const html = render('[сайт](https://example.com)');
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
});
```

`package.json`: дописать `test/markdown.test.ts`. Run → FAIL.

- [ ] **Step 2: `markdown.ts`**

```ts
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Описания и комментарии пишет агент в Markdown (**Files:**, списки, код) —
// раньше они показывались сырыми звёздочками. HTML после marked всегда
// проходит DOMPurify: текст приходит из базы, куда пишут и MCP-агент, и
// люди. Окно передаётся снаружи, чтобы тест мог подставить jsdom.
export function makeRenderer(win: Window & typeof globalThis): (src: string) => string {
  const purify = DOMPurify(win);
  purify.addHook('afterSanitizeAttributes', node => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  return src => purify.sanitize(marked.parse(src, { async: false, gfm: true, breaks: true }) as string);
}
```

Run → PASS.

- [ ] **Step 3: `ui/Markdown.tsx` с ленивой загрузкой**

```tsx
import { useEffect, useState } from 'react';

// marked + DOMPurify (~20 КБ gz) нужны только в открытой шторке — грузим
// их отдельным чанком при первом показе, а до загрузки показываем текст
// как есть (pre-wrap), без мигания пустоты.
let loader: Promise<(src: string) => string> | null = null;
const loadRenderer = () =>
  (loader ??= import('../markdown').then(m => m.makeRenderer(window)));

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  const [render, setRender] = useState<((s: string) => string) | null>(null);
  useEffect(() => {
    let alive = true;
    loadRenderer().then(r => { if (alive) setRender(() => r); });
    return () => { alive = false; };
  }, []);
  if (!render) return <div className={`whitespace-pre-wrap ${className}`}>{text}</div>;
  // Вывод DOMPurify — единственный источник HTML в приложении.
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: render(text) }} />;
}
```

- [ ] **Step 4: Типографика `.md`** (в конец `styles.css`)

```css
/* Markdown из описаний и комментариев: компактно, в шкале приложения. */
.md > * + * { margin-top: 0.5em; }
.md ul, .md ol { padding-left: 1.25em; list-style: revert; }
.md code { font-size: 0.9em; padding: 0.1em 0.35em; border-radius: 6px; background: var(--color-raised); }
.md pre { padding: 0.75em; border-radius: 12px; background: var(--color-raised); overflow-x: auto; }
.md pre code { padding: 0; background: none; }
.md a { color: var(--color-accent-ink); text-decoration: underline; }
.md h1, .md h2, .md h3 { font-weight: 600; }
```

- [ ] **Step 5: Проверка, commit**

Run: `npm test && npm run lint && npm run build`; в выводе сборки отдельный чанк с `markdown`.
Commit: «Markdown с очисткой DOMPurify, ленивая загрузка (KAN-115)».

---

### Task 8: `Sheet` на vaul

**Files:**
- Modify: `web/src/ui/Sheet.tsx`
- Modify: `web/src/TaskModal.tsx`, `web/src/EpicModal.tsx`, `web/src/CreateModal.tsx`, `web/src/ArchiveList.tsx`, `web/src/ProjectDrawer.tsx` (новый проп `title`)

**Interfaces:**
- Produces:
  ```ts
  function Sheet(props: {
    title: string;                 // для screen reader (Drawer.Title), визуально скрыт
    onClose: () => void;           // зовётся один раз, после анимации закрытия
    side?: 'auto' | 'left';        // auto: снизу <1024px, справа ≥1024px; left: слева ≥1024px, снизу <1024px
    center?: boolean;              // только ≥1024px: окно по центру (motion), для создания задачи
    children: ReactNode;
  }): JSX.Element;
  // children получают закрытие через контекст:
  function useSheetClose(): () => void;
  ```

- [ ] **Step 1: Переписать `Sheet.tsx`**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Drawer } from 'vaul';
import { motion } from 'motion/react';
import { useMedia } from '../useMedia';

const CloseCtx = createContext<() => void>(() => {});
// Кнопки «Закрыть» внутри шторки закрывают её через vaul (с анимацией),
// а не размонтируют сразу.
export const useSheetClose = () => useContext(CloseCtx);

export function Sheet(
  { title, onClose, side = 'auto', center = false, children }: {
    title: string; onClose: () => void; side?: 'auto' | 'left'; center?: boolean; children: ReactNode;
  },
) {
  const desktop = useMedia('(min-width: 1024px)');
  const [open, setOpen] = useState(true);

  if (center && desktop) return <CenterSheet title={title} onClose={onClose}>{children}</CenterSheet>;

  const direction = !desktop ? 'bottom' : side === 'left' ? 'left' : 'right';
  const close = () => setOpen(false);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={setOpen}
      direction={direction}
      // Родитель размонтирует шторку только когда она доехала: иначе
      // закрытие обрывалось бы на середине анимации.
      onAnimationEnd={isOpen => { if (!isOpen) onClose(); }}
      // Поле ввода внутри шторки поднимается над клавиатурой (KAN-112).
      repositionInputs
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-(--color-overlay)" />
        <Drawer.Content
          className={`fixed z-50 flex flex-col bg-(--color-surface) outline-none ${
            direction === 'bottom'
              ? 'inset-x-0 bottom-0 h-[92dvh] rounded-t-3xl'
              : direction === 'right'
                ? 'inset-y-0 right-0 w-[480px] max-w-full'
                : 'inset-y-0 left-0 w-[400px] max-w-full'
          }`}
        >
          <Drawer.Title className="sr-only">{title}</Drawer.Title>
          {direction === 'bottom' && (
            <Drawer.Handle className="mt-2.5 mb-1 !w-10 !h-1.5 !bg-(--color-line)" />
          )}
          <CloseCtx.Provider value={close}>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3">
              {children}
            </div>
          </CloseCtx.Provider>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

// Окно по центру для создания задачи на десктопе: vaul не умеет
// центрированный режим, отдельный Radix Dialog ради одного окна не нужен.
function CenterSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-(--color-overlay)"
      onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div
        role="dialog" aria-modal="true" aria-label={title}
        className="w-full max-w-[480px] max-h-[85vh] overflow-y-auto rounded-2xl bg-(--color-surface) shadow-menu p-5"
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      >
        <CloseCtx.Provider value={onClose}>{children}</CloseCtx.Provider>
      </motion.div>
    </motion.div>
  );
}
```

(`useVisualViewport` удаляется: его роль берёт `repositionInputs`.)

- [ ] **Step 2: Пользователи `Sheet`**

- Кнопка закрытия должна закрывать шторку через vaul (с анимацией), а `useSheetClose()` работает только в компонентах внутри `Sheet` — поэтому она становится отдельным компонентом в `ui/Sheet.tsx`:
  ```tsx
  export function SheetCloseButton() {
    const close = useSheetClose();
    return (
      <Button variant="ghost" size="icon" onClick={close} aria-label="Закрыть" className="-mr-2 -mt-1">
        <X size={20} />
      </Button>
    );
  }
  ```
  (импорты `X` и `Button` в `Sheet.tsx`). Во всех пяти файлах кнопку закрытия заменить на `<SheetCloseButton />` и убрать ставший ненужным импорт `X`.
- `TaskModal`: `<Sheet title={item.title} onClose={onClose}>`.
- `EpicModal`: `<Sheet title={epic?.title ?? 'Эпик'} onClose={onClose}>`.
- `CreateModal`: `<Sheet title="Новая задача" onClose={onClose} center>`.
- `ArchiveList`: `<Sheet title="Архив" onClose={onClose}>`.
- `ProjectDrawer`: `<Sheet title="Проекты" onClose={onClose} side="left">`. После выбора проекта остаётся прямой вызов `onClose()` (шторка закрывается без анимации): при смене проекта доска всё равно перерисовывается целиком, анимация закрытия там не видна.

- [ ] **Step 3: Проверка**

Run: `npm test && npm run lint && npm run build && … npm run shots -- p4t8`. На `phone-light-task.png` — шторка снизу с ручкой, скруглённая сверху; на `desktop-light-task.png` — панель справа, доска видна под затемнением; `desktop-light-create.png` — окно по центру.
Commit: «Sheet на vaul: снизу на телефоне, справа/слева на десктопе (KAN-115)».

---

### Task 9: `Popover` и `PropertySelect`

**Files:**
- Create: `web/src/ui/PropertySelect.tsx`

**Interfaces:**
- Produces:
  ```ts
  type Option<V extends string> = { value: V; label: string; icon?: Icon };
  function PropertySelect<V extends string>(props: {
    label: string;            // подпись строки: «Статус»
    value: V;
    options: Option<V>[];
    onChange: (v: V) => void;
    trailing?: ReactNode;     // например кнопка «Открыть эпик»
  }): JSX.Element;
  ```

- [ ] **Step 1: Компонент**

```tsx
import * as Popover from '@radix-ui/react-popover';
import { useState, type ReactNode } from 'react';
import { CaretDown, Check, type Icon } from '@phosphor-icons/react';

export type Option<V extends string> = { value: V; label: string; icon?: Icon };

// Строка свойства «подпись — значение», как в Linear/Notion. Значение —
// кнопка, по которой открывается список; вместо пяти чипов статуса и трёх
// чипов типа, которые раньше лежали одной кучей.
export function PropertySelect<V extends string>(
  { label, value, options, onChange, trailing }: {
    label: string; value: V; options: Option<V>[]; onChange: (v: V) => void; trailing?: ReactNode;
  },
) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);
  const CurIcon = current?.icon;
  return (
    <div className="flex items-center gap-3 min-h-10">
      <span className="w-24 shrink-0 text-meta text-(--color-muted)">{label}</span>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button className="min-w-0 flex items-center gap-2 h-9 px-3 rounded-full text-body
                             hover:bg-(--color-raised) data-[state=open]:bg-(--color-raised)">
            {CurIcon && <CurIcon size={16} className="text-(--color-muted)" />}
            <span className="truncate">{current?.label ?? '—'}</span>
            <CaretDown size={14} className="text-(--color-muted)" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start" sideOffset={6} collisionPadding={12}
            className="z-[60] min-w-56 max-h-72 overflow-y-auto rounded-2xl bg-(--color-surface) shadow-menu p-1.5"
          >
            {options.map(o => {
              const OIcon = o.icon;
              return (
                <button
                  key={o.value}
                  onClick={() => { setOpen(false); if (o.value !== value) onChange(o.value); }}
                  className="w-full flex items-center gap-2.5 h-10 px-3 rounded-xl text-body text-left
                             hover:bg-(--color-raised) focus-visible:bg-(--color-raised) outline-none"
                >
                  {OIcon && <OIcon size={18} className="text-(--color-muted)" />}
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.value === value && <Check size={16} className="text-(--color-accent-ink)" />}
                </button>
              );
            })}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {trailing}
    </div>
  );
}
```

(`z-[60]` — выше шторки vaul `z-50`.)

- [ ] **Step 2: Проверка, commit**

Run: `npm run lint && npm run build`. Commit: «PropertySelect: строка свойства с выпадающим списком (KAN-115)».

---

### Task 10: Шторка задачи, часть 1 — шапка, заголовок, свойства, описание

**Files:**
- Modify: `web/src/TaskModal.tsx` (переименование файла не делаем — меньше шума в истории; компонент остаётся `TaskModal`)
- Create: `web/src/ui/AutoTextarea.tsx`

**Interfaces:**
- Consumes: `Sheet`, `SheetCloseButton` (Task 8), `PropertySelect` (Task 9), `Markdown` (Task 7), `STATUS_ICON`, `COLUMNS`, `selectableEpics`, `toasts`.
- Produces: `AutoTextarea(props: TextareaHTMLAttributes & { value: string })` — высота по содержимому.

- [ ] **Step 1: `AutoTextarea`**

```tsx
import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

// Поле, которое растёт по тексту: заголовок и описание редактируются
// «на месте», без прокрутки внутри крошечного textarea.
export function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={1} {...props} className={`resize-none overflow-hidden ${props.className ?? ''}`} />;
}
```

- [ ] **Step 2: Шапка и заголовок**

В `TaskModal`:
1. Удалить `err`/`setErr` и `{err && …}`; все `setErr(x.message)` → `toasts.show(x.message)` (импорт `toasts`).
2. Удалить `editingTitle`/`Editable` для заголовка. Верх шторки:
   ```tsx
   <div className="flex items-center gap-2 mb-1">
     <button
       onClick={() => { navigator.clipboard?.writeText(item.id).then(() => toasts.show('Скопировано'), () => {}); }}
       className="text-micro font-mono text-(--color-muted) hover:text-(--color-ink)"
       aria-label={`Скопировать ${item.id}`}
     >
       {item.id}
     </button>
     <div className="ml-auto flex items-center gap-1">
       <TaskActions item={item} onChanged={onChanged} onClose={onClose} />
       <span className="hidden lg:inline-flex"><SheetCloseButton /></span>
     </div>
   </div>
   <AutoTextarea
     value={titleDraft}
     onChange={e => setTitleDraft(e.target.value)}
     onBlur={saveTitle}
     onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
     aria-label="Заголовок"
     className="w-full text-title bg-transparent rounded-xl px-2 -mx-2 py-1 outline-none
                hover:bg-(--color-raised) focus:bg-(--color-raised)"
   />
   ```
   `saveTitle` больше не трогает `editingTitle` (удалить `setEditingTitle(false)`); Enter делает blur, а сохраняет только `onBlur` — ровно один вызов (урок Task 12 фаз 1–2).
   `TaskActions` — заглушка до Task 12: `function TaskActions(_: { item: Item; onChanged: () => void; onClose: () => void }) { return null; }` в том же файле.
3. Чипы статуса и типа и блок `select` эпика удалить. Вместо них:
   ```tsx
   <div className="mt-3 mb-4 space-y-1">
     <PropertySelect
       label="Статус" value={item.status}
       options={COLUMNS.map(c => ({ value: c.key, label: c.label, icon: STATUS_ICON[c.key] }))}
       onChange={move}
     />
     <PropertySelect
       label="Тип" value={item.type}
       options={[
         { value: 'task', label: 'Задача', icon: CheckSquare },
         { value: 'bug', label: 'Баг', icon: Bug },
         { value: 'chore', label: 'Долг', icon: Wrench },
       ]}
       onChange={setType}
     />
     <PropertySelect
       label="Эпик" value={item.epic_id ?? ''}
       options={[{ value: '', label: 'Без эпика' },
         ...selectableEpics(epics, allItems, item.epic_id).map(ep => ({ value: ep.id, label: ep.title }))]}
       onChange={setEpic}
       trailing={item.epic_id && onOpenEpic ? (
         <Button variant="ghost" size="icon" aria-label="Открыть эпик" onClick={() => onOpenEpic(item.epic_id!)}>
           <ArrowSquareOut size={18} />
         </Button>
       ) : null}
     />
     {item.blocks.length > 0 && (
       <div className="flex items-center gap-3 min-h-10">
         <span className="w-24 shrink-0 text-meta text-(--color-muted)">Блокирует</span>
         <div className="flex flex-wrap gap-1.5">
           {item.blocks.map(b => (
             <span key={b} className="px-2.5 h-7 inline-flex items-center rounded-full bg-(--color-raised) text-micro font-mono">{b}</span>
           ))}
         </div>
       </div>
     )}
   </div>
   ```
   Импорты: `CheckSquare, Bug, Wrench, ArrowSquareOut` из Phosphor, `COLUMNS` из `./columns`, `STATUS_ICON` из `./statusIcons`, `PropertySelect`, `Button`, `AutoTextarea`, `SheetCloseButton`. Удалить `STATUS_LABEL`, `TYPE_LABEL`, старый блок «блокирует: …», импорт `Editable`, если больше не используется.

- [ ] **Step 3: Описание**

Заменить блок `editingBody ? <textarea> : <Editable>` на:

```tsx
<section className="mb-5">
  <div className="flex items-center justify-between mb-1.5">
    <h3 className="text-meta text-(--color-muted)">Описание</h3>
    {item.body && !editingBody && (
      <Button variant="ghost" size="sm" onClick={() => setEditingBody(true)}>Изменить</Button>
    )}
  </div>
  {editingBody ? (
    <AutoTextarea
      autoFocus
      value={bodyDraft}
      onChange={e => setBodyDraft(e.target.value)}
      onBlur={saveBody}
      onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.blur(); }}
      placeholder="Добавить описание"
      className="w-full min-h-24 p-3 rounded-xl bg-(--color-raised) text-body outline-none
                 focus:ring-2 focus:ring-(--color-accent)"
    />
  ) : item.body ? (
    <Markdown text={item.body} className="text-body" />
  ) : (
    <button onClick={() => setEditingBody(true)} className="text-body text-(--color-muted) hover:text-(--color-ink)">
      Добавить описание
    </button>
  )}
</section>
```

- [ ] **Step 4: Проверка, снимки, commit**

Run: `npm test && npm run lint && npm run build && … npm run shots -- p4t10`. На `phone-light-task.png`: id, заголовок крупно, три строки свойств, описание с жирным «Files:» и списком (фикстура PF-8), без чипов.
Commit: «Шторка задачи: заголовок на месте, свойства строками, Markdown в описании (KAN-115)».

---

### Task 11: Шторка задачи, часть 2 — чеклист и комментарии

**Files:**
- Modify: `web/src/TaskModal.tsx`

**Interfaces:**
- Consumes: `relTime`, `fullDate` (Task 6), `Markdown` (Task 7).

- [ ] **Step 1: Чеклист**

Заменить список `<ul>` на:

```tsx
{item.checklist.length > 0 && (
  <section className="mb-5">
    <h3 className="text-meta text-(--color-muted) mb-1.5">
      Чеклист · {item.checklist.filter(s => s.done).length} из {item.checklist.length}
    </h3>
    <ul className="space-y-0.5">
      {item.checklist.map((s, i) => (
        <li key={i}>
          <button
            role="checkbox" aria-checked={s.done}
            onClick={() => toggleCheck(i)}
            className="w-full flex items-start gap-2.5 py-1.5 px-1 rounded-xl text-left text-body hover:bg-(--color-raised)"
          >
            {s.done
              ? <CheckCircle size={20} weight="fill" className="shrink-0 text-(--color-accent)" />
              : <Circle size={20} className="shrink-0 text-(--color-muted)" />}
            <span className={s.done ? 'text-(--color-muted) line-through' : ''}>{s.text}</span>
          </button>
        </li>
      ))}
    </ul>
  </section>
)}
```

Импорт `CheckCircle, Circle`.

- [ ] **Step 2: Комментарии и поле ввода внизу**

Заменить блок комментариев на:

```tsx
<section className="pb-20">
  <h3 className="text-meta text-(--color-muted) mb-2">Комментарии</h3>
  {comments.length === 0 && <p className="text-meta text-(--color-muted)">Пока нет.</p>}
  <ul className="space-y-3">
    {comments.map(c => (
      <li key={c.id}>
        <div className="flex items-baseline gap-2 text-micro text-(--color-muted)">
          <span className="font-semibold text-(--color-ink-2)">{c.author === 'claude' ? 'Claude' : 'Ты'}</span>
          <time dateTime={c.created_at} title={fullDate(c.created_at)}>{relTime(c.created_at, new Date())}</time>
        </div>
        <Markdown text={c.body} className="text-body mt-0.5" />
      </li>
    ))}
  </ul>
</section>

{/* Поле комментария прилипает к низу шторки: писать можно, не
    проматывая длинное описание. */}
<div className="sticky bottom-0 -mx-5 px-5 pt-2 pb-1 bg-(--color-surface) border-t border-(--color-line)">
  <form
    onSubmit={e => { e.preventDefault(); sendComment(); }}
    className="flex items-end gap-2"
  >
    <AutoTextarea
      value={newComment}
      onChange={e => setNewComment(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); } }}
      placeholder="комментарий"
      aria-label="Комментарий"
      disabled={sending}
      className="flex-1 min-w-0 max-h-40 py-2 px-3 rounded-xl bg-(--color-raised) text-body outline-none
                 focus:ring-2 focus:ring-(--color-accent)"
    />
    <Button type="submit" variant="primary" size="icon" aria-label="Отправить"
            disabled={!newComment.trim() || sending} className="shrink-0">
      <PaperPlaneRight size={18} weight="fill" />
    </Button>
  </form>
</div>
```

Импорт `PaperPlaneRight`, `relTime`, `fullDate`, `Markdown`. Старый нижний блок «В архив / Вернуть / Удалить» удалить (переезжает в меню действий, Task 12). Placeholder «комментарий» оставить — на нём держится `scripts/longpress-check.mjs`.

- [ ] **Step 3: Проверка, снимки, commit**

Run: `npm test && npm run lint && npm run build && node scripts/longpress-check.mjs && … npm run shots -- p4t11`. На `phone-light-task.png` комментарии «Claude · 5 ч назад», Markdown-жирный, поле с круглой кнопкой внизу.
Commit: «Шторка задачи: круглый чеклист, комментарии с временем и Markdown, поле внизу (KAN-115)».

---

### Task 12: Меню действий задачи и удаление в два шага

**Files:**
- Create: `web/src/deleteConfirm.ts`
- Create: `web/test/deleteConfirm.test.ts`
- Modify: `web/src/TaskModal.tsx` (`TaskActions`)
- Modify: `web/package.json` (скрипт `test`)

**Interfaces:**
- Produces: `confirmStep(state: 'idle' | 'confirm', event: 'delete' | 'close'): { state: 'idle' | 'confirm'; perform: boolean }`.

- [ ] **Step 1: Падающий тест**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmStep } from '../src/deleteConfirm.ts';

test('первое «Удалить» только просит подтверждения', () => {
  assert.deepEqual(confirmStep('idle', 'delete'), { state: 'confirm', perform: false });
});

test('второе «Удалить» удаляет', () => {
  assert.deepEqual(confirmStep('confirm', 'delete'), { state: 'idle', perform: true });
});

test('закрытие меню сбрасывает подтверждение', () => {
  assert.deepEqual(confirmStep('confirm', 'close'), { state: 'idle', perform: false });
});
```

`package.json`: дописать `test/deleteConfirm.test.ts`. Run → FAIL.

- [ ] **Step 2: `deleteConfirm.ts`**

```ts
// Удаление в два шага внутри меню вместо window.confirm: первый выбор
// превращает пункт в «Удалить навсегда?», второй удаляет. Закрыл меню —
// начинай сначала, чтобы случайный второй тап через минуту не удалил.
export function confirmStep(
  state: 'idle' | 'confirm', event: 'delete' | 'close',
): { state: 'idle' | 'confirm'; perform: boolean } {
  if (event === 'close') return { state: 'idle', perform: false };
  return state === 'idle' ? { state: 'confirm', perform: false } : { state: 'idle', perform: true };
}
```

Run → PASS.

- [ ] **Step 3: `TaskActions`**

Заменить заглушку в `TaskModal.tsx`:

```tsx
function TaskActions({ item, onChanged, onClose }: { item: Item; onChanged: () => void; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'idle' | 'confirm'>('idle');

  const run = async (patch: Partial<Item>) => {
    const { error } = await sb.from('items').update(patch).eq('id', item.id);
    if (error) { toasts.show(error.message); return; }
    onChanged();
  };

  const onDelete = async (e: Event) => {
    const next = confirmStep(step, 'delete');
    setStep(next.state);
    // Первый шаг не закрывает меню — пункт меняется на подтверждение.
    if (!next.perform) { e.preventDefault(); return; }
    const { error } = await sb.from('items').delete().eq('id', item.id);
    if (error) { toasts.show(error.message); return; }
    onChanged();
    onClose();
  };

  return (
    <Menu.Root open={open} onOpenChange={o => { setOpen(o); if (!o) setStep(confirmStep(step, 'close').state); }}>
      <Menu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="Действия с задачей"><DotsThree size={20} weight="bold" /></Button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className="z-[60] min-w-56 rounded-2xl bg-(--color-surface) shadow-menu p-1.5">
          {item.status === 'done' && !item.archived_at && (
            <Menu.Item onSelect={() => run({ archived_at: new Date().toISOString() })} className={itemCls}>
              <Archive size={18} className="text-(--color-muted)" />В архив
            </Menu.Item>
          )}
          {item.archived_at && (
            <Menu.Item onSelect={() => run({ status: 'doing', archived_at: null })} className={itemCls}>
              <ArrowCounterClockwise size={18} className="text-(--color-muted)" />Вернуть в работу
            </Menu.Item>
          )}
          <Menu.Item onSelect={onDelete} className={`${itemCls} text-(--color-danger)`}>
            <Trash size={18} />{step === 'confirm' ? 'Удалить навсегда?' : 'Удалить'}
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

const itemCls = `flex items-center gap-2.5 h-10 px-3 rounded-xl outline-none cursor-pointer text-body
                 data-[highlighted]:bg-(--color-raised)`;
```

Импорты: `import * as Menu from '@radix-ui/react-dropdown-menu';`, `DotsThree, Archive, ArrowCounterClockwise, Trash`, `confirmStep`. Удалить функции `archive`, `restore`, `remove` из `TaskModal`, если остались. Run: `grep -rn "confirm(" src || echo clean` → в `TaskModal.tsx` только `confirmStep`.

- [ ] **Step 4: Проверка, commit**

Run: `npm test && npm run lint && npm run build`.
Commit: «Меню действий задачи, удаление в два шага без window.confirm (KAN-115)».

---

### Task 13: Шторка эпика и приёмка фазы 4

**Files:**
- Modify: `web/src/EpicModal.tsx`
- Create: `web/scripts/sheet-check.mjs`

**Interfaces:**
- Consumes: `Sheet`, `SheetCloseButton`, `ProgressRing`, `Markdown`, `AutoTextarea`, `STATUS_ICON`, `COLUMNS`, `confirmStep`, `toasts`.

- [ ] **Step 1: `EpicModal` на новом каркасе**

1. `err` → тосты; `window.confirm` удаления эпика → меню `DotsThree` с двухшаговым «Удалить эпик» / «Удалить навсегда?» (как `TaskActions`, текст предупреждения «Задачи останутся без эпика» — строкой под пунктом при `step === 'confirm'`).
2. Заголовок — `AutoTextarea` как в задаче (Enter → blur, сохраняет `onBlur`).
3. Цель — `Markdown` + «Изменить», пустая — «Добавить цель» (как описание задачи).
4. Прогресс: `<ProgressRing done={done} total={total} size={48} stroke={4} />` и рядом «{done} из {total}» (text-title) + ссылки «План» / «Спека», если есть.
5. Список задач сгруппировать по `COLUMNS` (только непустые группы): подзаголовок `text-meta muted` с названием колонки, строки: иконка `STATUS_ICON[i.status]`, заголовок `truncate`, id `text-micro font-mono muted` справа; тап — `onOpenItem(i)`.

- [ ] **Step 2: Проверка закрытия шторки в браузере**

`web/scripts/sheet-check.mjs` — по образцу `longpress-check.mjs` (свой порт 5197, те же моки и фейковая сессия, десктоп 1440×900 и телефон 390×844):
- открыть карточку «Фильтр кейсов» кликом → шторка видна (`getByRole('dialog')`);
- `Escape` → через 600 мс шторки нет; снова кликнуть ту же карточку → шторка снова видна;
- на телефоне: тап по подложке (`page.mouse.click(10, 10)`) → шторки нет;
- печатает `{ desktopReopen, phoneOverlayClose }` и `OK`/`FAIL` (exit 1).

Run: `CHROMIUM_PATH=… node scripts/sheet-check.mjs` → OK.

- [ ] **Step 3: Приёмка фазы 4**

- `npm test && npm run lint && npm run build`; размер JS gz (всё вместе и отдельно чанк markdown).
- `node scripts/longpress-check.mjs` → OK; `node scripts/sheet-check.mjs` → OK.
- `npm run shots -- phase4`; посмотреть `*-task.png` обеих тем и размеров, `desktop-light-board.png` (доска видна под панелью задачи на десктопе не снимается — ок). Проблемы списком.
- Commit: «Шторка эпика: кольцо прогресса, задачи по статусам; проверка закрытия шторок (KAN-115)».

---

# Фаза 5. Остальные экраны

### Task 14: Создание задачи

**Files:**
- Modify: `web/src/CreateModal.tsx`

**Interfaces:**
- Consumes: `Sheet` с `center`, `SheetCloseButton`, `PropertySelect`, `AutoTextarea`, `guessType`/`stripPrefix`, `selectableEpics`, `toasts`.

- [ ] **Step 1: Переделка**

1. Верх: сегментный переключатель «Задача / Эпик» — `div role="tablist"` с двумя `button role="tab"` в пилюле `bg-(--color-raised) p-1 rounded-full`, активный — `bg-(--color-surface) shadow-card`; справа `SheetCloseButton`.
2. Задача: `AutoTextarea autoFocus` для заголовка (`text-title`, placeholder «Что сделать?»); под ним ряд чипов типа (`задача / баг / долг`, активный `bg-(--color-accent-soft) text-(--color-accent-ink)`), угаданный через `guessType` подсвечен до ручного выбора (логика `touched` без изменений); `PropertySelect label="Эпик"` (как в задаче); кнопка во всю ширину `Button variant="primary"` «Создать в Backlog».
3. Эпик: `AutoTextarea autoFocus` «Название эпика», `AutoTextarea` «Цель (необязательно)», кнопка «Создать эпик».
4. `Ctrl/Cmd+Enter` в любом поле формы отправляет (`onKeyDown` на `<form>`).
5. Ошибки — тосты; `setError` удалить, «Напиши, что надо сделать» тоже тостом.

- [ ] **Step 2: Проверка, commit**

Run: `npm test && npm run lint && npm run build && … npm run shots -- p5t14` (`*-create.png`: на телефоне шторка снизу, на десктопе окно по центру).
Commit: «Создание задачи: сегмент Задача/Эпик, тип чипом, эпик списком, Ctrl+Enter (KAN-115)».

---

### Task 15: Шторка проектов

**Files:**
- Modify: `web/src/ProjectDrawer.tsx`, `web/src/NewProject.tsx`, `web/src/Board.tsx`

**Interfaces:**
- Consumes: `ProgressRing`, `Sheet side="left"`, `toasts`, `Menu` (Radix dropdown).
- Produces: `ProjectDrawer` получает пропы `onSaveDescription: (id: string, text: string | null) => void`, `onArchive: (id: string) => void`.

- [ ] **Step 1: Строки проектов**

Строка — кнопка выбора: `ProgressRing size={28}` слева, название (text-body, 500), описание `truncate text-meta muted`, справа: `Check` для текущего, «{waiting} ждёт» (`accent-ink`) при `waiting > 0`, и `DotsThree` (Radix dropdown, `stopPropagation` как в `StatusMenu`) с пунктами «Изменить описание» и «В архив».
- «Изменить описание» переключает строку в режим правки: `AutoTextarea autoFocus`, сохранение по blur/Enter (ref-флаг «уже обработано», как в `BoardHeader`), Esc — отмена.
- «В архив» — двухшаговое подтверждение через `confirmStep` (Task 12).

- [ ] **Step 2: Board**

- `onSaveDescription={(id, d) => …update projects…}` (переиспользовать тело `saveDescription`, параметр `id`).
- `onArchive={async id => { update projects set archived_at = now … ; если id === current → setCurrent('') и reloadProjects(false) (выберется другой проект), иначе reloadProjects() }}`.

- [ ] **Step 3: NewProject шагом внутри шторки**

Кнопка «Новый проект» внизу списка (`Button variant="secondary"` во всю ширину, иконка `Plus`); форма открывается на месте списка (список скрывается), вверху «← Проекты» (`ArrowLeft`) возвращает к списку. Ошибки — тосты. Поля — `rounded-xl bg-(--color-raised) h-10`.

- [ ] **Step 4: Проверка, commit**

Run: `npm test && npm run lint && npm run build && … npm run shots -- p5t15` (`*-projects.png`).
Commit: «Шторка проектов: кольца прогресса, правка описания и архив из меню, новый проект шагом (KAN-115)».

---

### Task 16: Архив с поиском и экран входа

**Files:**
- Create: `web/src/archive.ts`
- Create: `web/test/archive.test.ts`
- Modify: `web/src/ArchiveList.tsx`, `web/src/App.tsx`
- Modify: `web/package.json` (скрипт `test`)

**Interfaces:**
- Produces: `filterArchive(items: Item[], query: string): Item[]`.

- [ ] **Step 1: Падающий тест**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterArchive } from '../src/archive.ts';
import type { Item } from '../src/supabase.ts';

const mk = (id: string, title: string) => ({
  id, seq: 1, project_id: 'k', epic_id: null, type: 'task', title, body: null, status: 'done',
  checklist: [], blocks: [], position: 1, closed_at: null, archived_at: null,
}) as Item;
const items = [mk('KAN-12', 'Ёлка на главной'), mk('KAN-3', 'Меню кофейни')];

test('пустой запрос — всё', () => {
  assert.equal(filterArchive(items, '  ').length, 2);
});

test('без учёта регистра и ё/е', () => {
  assert.deepEqual(filterArchive(items, 'ЕЛКА').map(i => i.id), ['KAN-12']);
});

test('по id', () => {
  assert.deepEqual(filterArchive(items, 'kan-3').map(i => i.id), ['KAN-3']);
});
```

`package.json`: дописать `test/archive.test.ts`. Run → FAIL.

- [ ] **Step 2: `archive.ts`**

```ts
import type { Item } from './supabase';

// Поиск по архиву на клиенте: там 100+ закрытых задач, а искать приходится
// по памяти — «что-то про ёлку». ё и е не различаем, id ищется так же.
const norm = (s: string) => s.toLowerCase().replaceAll('ё', 'е').trim();

export function filterArchive(items: Item[], query: string): Item[] {
  const q = norm(query);
  if (!q) return items;
  return items.filter(i => norm(i.title).includes(q) || norm(i.id).includes(q));
}
```

Run → PASS.

- [ ] **Step 3: `ArchiveList`**

- Сверху поле поиска (`MagnifyingGlass` слева внутри, `rounded-full bg-(--color-raised) h-10`), фильтр `filterArchive` на обе секции.
- Строка: id моноширинным `muted`, заголовок `truncate`, справа `Button variant="ghost" size="sm"` «Вернуть» (иконка `ArrowCounterClockwise`) только для архивных.
- Секции «Готово, не поместилось в колонку» и «В архиве» — подзаголовки `text-meta muted`.
- Пусто по поиску: «Ничего не нашлось».

- [ ] **Step 4: Экран входа** (`App.tsx`, `SignIn`)

```tsx
<div className="min-h-dvh grid place-items-center p-6 bg-(--color-ground)">
  <div className="w-full max-w-80 flex flex-col items-center gap-4 text-center">
    <h1 className="text-title-lg">Канбан</h1>
    <p className="text-body text-(--color-muted)">Личная доска задач по проектам</p>
    {error && <p className="text-meta text-(--color-danger)">{error}</p>}
    <Button onClick={signIn} variant="primary" className="w-full justify-center h-11">
      <GoogleLogo size={18} weight="bold" />
      Войти через Google
    </Button>
  </div>
</div>
```

- [ ] **Step 5: Проверка, commit**

Run: `npm test && npm run lint && npm run build`.
Commit: «Архив с поиском, экран входа в стиле B (KAN-115)».

---

### Task 17: Финальная приёмка и документы

**Files:**
- Modify: `docs/superpowers/specs/2026-09-25-kanban-redesign-b-design.md` (статус, фактические отличия)
- Modify: `web/scripts/shots.mjs` (сцена архива и входа)

- [ ] **Step 1: Сцены снимков**

В `shots.mjs` добавить сцену «архив» (клик по кнопке «Архив · N» в «Готово» на десктопе) и «вход» (контекст без `sb-fake-auth-token`).

- [ ] **Step 2: Полная проверка**

- `npm test && npm run lint && npm run build`; размер JS gz относительно 188.8 КБ (до редизайна) — записать.
- `node scripts/longpress-check.mjs`, `node scripts/sheet-check.mjs` → OK.
- `npm run shots -- final`; пройти все снимки в обеих темах; сравнить с `shots/before`.
- Эмуляция `prefers-reduced-motion: reduce` (Playwright `reducedMotion: 'reduce'`): открыть шторку задачи — появляется без анимации заметной длительности (скриншот сразу после клика уже с открытой шторкой).
- `npm test` содержит `contrast.test.ts` — все пары AA (новые токены не добавлялись).

- [ ] **Step 3: Спека**

В спеке: статус «реализовано (фазы 1–5)»; в разделе 5 «Тосты» заменить `Toast.tsx + useToast()` на фактические `ui/toast.ts` (стор) + `ui/Toaster.tsx`; раздел 4 «Контейнер Sheet» — дописать, что клавиатуру обслуживает vaul `repositionInputs` вместо `useVisualViewport`; «Проверка» — перечислить `longpress-check.mjs`, `sheet-check.mjs`.

- [ ] **Step 4: Commit**

«Финальная приёмка редизайна B, спека по факту (KAN-115)».
