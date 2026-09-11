# План №2: видимость и сущности канбан-доски

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть дыры, найденные за первые дни использования плана №1 (нельзя прочитать закрытую задачу, нельзя завести проект и эпик без ручного SQL), затем — экран эпика, мобильный свайп, перетаскивание, живое обновление, экран «все проекты», упаковка сервера в `.mcpb`.

**Architecture:** Никаких новых слоёв. Модалка задачи и архив читают ту же таблицу `items`, что уже грузит `Board`. Новый MCP-инструмент `project` и расширение `add` следуют тому же паттерну, что и остальные пять — тонкая обёртка над `supabase-js`, живая проверка вместо моков. Drag-and-drop и Realtime — единственные два по-настоящему новых механизма, оба стандартные библиотеки поверх уже существующей модели `position`/`status`.

**Tech Stack:** То же, что в плане №1(Node 24, TypeScript, React 19 + Vite + Tailwind 4, Supabase), плюс `@dnd-kit/core` и `@dnd-kit/sortable` для перетаскивания.

**Spec:** [`docs/superpowers/specs/2026-09-11-kanban-design.md`](../specs/2026-09-11-kanban-design.md) (секция «План №2 — удобство»)

## Global Constraints

- **Тарифы:** только бесплатные (без изменений от плана №1).
- **Доступ:** RLS остаётся единственной проверкой прав, новых сущностей без политики не заводим.
- **Сервисный ключ Supabase никогда не попадает в репозиторий и в браузер.**
- **Токен-экономика:** новый инструмент `project` добавляется, потому что ни один из шести существующих не может взять на себя администрирование проекта — это осознанное расширение, а не по умолчанию. Описание — не длиннее 15 слов, ответ — одна строка.
- **Тесты — только на чистые функции** (`format.ts`, `position.ts`). Компоненты веб-интерфейса и обёртки над `supabase-js` проверяются живьём, без моков — тот же принцип, что и в плане №1.
- **Язык:** комментарии в коде, тексты интерфейса и сообщения коммитов — по-русски.
- **Цвет несёт смысл.** Новые элементы интерфейса используют уже существующие токены (`--color-panel`, `--color-line`, `--color-muted`, `--color-danger-ink`, `--color-wait`) — новых цветов не заводим без явной причины.

---

## Структура файлов

```
канбан/
  supabase/
    migrations/
      20260912000000_project_description.sql   projects.description
      20260912000001_enable_realtime.sql        publication для items/epics
  mcp/
    src/
      db.ts        + description в Project
      format.ts     + description в шапке board
      tools.ts      + инструмент project, + эпик-объект в add
    test/
      format.test.ts   + тесты на шапку с описанием
  web/
    src/
      supabase.ts   + Epic, Comment, description в Project
      position.ts   between() — дробная позиция между соседями (новый)
      Board.tsx     + модалка, архив-ссылка, кнопки создания, drag-and-drop, Realtime, свайп
      TaskModal.tsx    модалка задачи: тело/чеклист/комментарии (новый)
      ArchiveList.tsx  список архива, открывает TaskModal (новый)
      NewProject.tsx   форма создания проекта (новый)
      NewEpic.tsx      форма создания эпика (новый)
      EpicScreen.tsx   плоский список задач эпика с прогрессом (новый)
      AllProjects.tsx  по строке на проект (новый)
    test/
      position.test.ts   тесты на between() (новый)
    package.json    + @dnd-kit/core, @dnd-kit/sortable
```

Каждый новый компонент — один файл, одна ответственность: `TaskModal` не знает про архив, `ArchiveList` не знает про чеклисты. `Board.tsx` остаётся точкой сборки — она решает, что показать (доска / эпик / все проекты) и какая модалка открыта, но не содержит логику самих экранов.

---

### Task 1: Описание проекта — миграция и MCP-инструмент

**Files:**
- Create: `supabase/migrations/20260912000000_project_description.sql`
- Modify: `mcp/src/db.ts` (добавить `description` в тип `Project`)
- Modify: `mcp/src/format.ts` (шапка `board` показывает описание)
- Modify: `mcp/test/format.test.ts`
- Modify: `mcp/src/tools.ts` (новый инструмент `project`, `board` передаёт описание)

**Interfaces:**
- Produces: колонка `projects.description text NULL`; `Project.description: string | null` в `db.ts`; `BoardHead.description?: string | null` в `format.ts`; инструмент `project(id, name?, prefix?, description?)`

- [ ] **Step 1: Написать миграцию**

Создать `supabase/migrations/20260912000000_project_description.sql`:

```sql
-- Короткое описание проекта — что это вообще такое. Показывается в
-- шапке board() и в веб-интерфейсе, если задано.
alter table projects add column description text;
```

- [ ] **Step 2: Применить миграцию**

Через MCP-инструмент Supabase `apply_migration` с именем `project_description` и телом файла из Step 1.

- [ ] **Step 3: Обновить тип `Project` в `db.ts`**

В `mcp/src/db.ts` найти:

```ts
export type Project = {
  id: string; name: string; prefix: string; repo_path: string | null;
};
```

Заменить на:

```ts
export type Project = {
  id: string; name: string; prefix: string; description: string | null;
  repo_path: string | null;
};
```

- [ ] **Step 4: Написать падающий тест на шапку с описанием**

В `mcp/test/format.test.ts` добавить после теста `'шапка показывает проект, эпик и прогресс'`:

```ts
test('шапка показывает описание проекта, если оно задано', () => {
  const out = formatBoard([], {
    project: 'family-app',
    description: 'трекер свиданий пары',
    done: 0, total: 0,
  });
  assert.equal(out.split('\n')[0], 'family-app — трекер свиданий пары (0/0)');
});

test('шапка с описанием и эпиком одновременно', () => {
  const out = formatBoard([], {
    project: 'family-app',
    description: 'трекер свиданий пары',
    epic: { id: 'FAM-E1', title: 'Firestore' },
    done: 7, total: 15,
  });
  assert.equal(
    out.split('\n')[0],
    'family-app — трекер свиданий пары · E1 Firestore (7/15)',
  );
});

test('без описания шапка как раньше, без лишнего тире', () => {
  const out = formatBoard([], { project: 'kanban', done: 0, total: 0 });
  assert.equal(out.split('\n')[0], 'kanban (0/0)');
});
```

- [ ] **Step 5: Прогнать тест — должен падать**

Run: `cd mcp && npm test`
Expected: FAIL — новые три теста красные (старая шапка не содержит описание), остальные 19 зелёные.

- [ ] **Step 6: Добавить описание в `formatBoard`**

В `mcp/src/format.ts` найти:

```ts
export type BoardHead = {
  project: string;
  epic?: { id: string; title: string } | null;
  done: number;
  total: number;
};
```

Заменить на:

```ts
export type BoardHead = {
  project: string;
  description?: string | null;
  epic?: { id: string; title: string } | null;
  done: number;
  total: number;
};
```

Найти:

```ts
export function formatBoard(items: Item[], head: BoardHead): string {
  // Эпик печатается коротким хвостом id: "FAM-E1" → "E1".
  const epic = head.epic
    ? ` · ${head.epic.id.split('-').pop()} ${head.epic.title}`
    : '';
  const lines = [`${head.project}${epic} (${head.done}/${head.total})`];
```

Заменить на:

```ts
export function formatBoard(items: Item[], head: BoardHead): string {
  // Эпик печатается коротким хвостом id: "FAM-E1" → "E1".
  const epic = head.epic
    ? ` · ${head.epic.id.split('-').pop()} ${head.epic.title}`
    : '';
  // Описание — одной строкой с проектом, не отдельной строкой:
  // компактность важнее структуры для формата, который читает агент.
  const desc = head.description ? ` — ${head.description}` : '';
  const lines = [`${head.project}${desc}${epic} (${head.done}/${head.total})`];
```

- [ ] **Step 7: Прогнать тесты — должны пройти**

Run: `cd mcp && npm test`
Expected: PASS, 22 теста (19 из плана №1 + 3 новых).

- [ ] **Step 8: Передать описание из `board` в `formatBoard`**

В `mcp/src/tools.ts` найти внутри инструмента `board`:

```ts
    return text(formatBoard(items, {
      project: p.id,
      epic: head ? { id: head.id, title: head.title } : null,
      done: items.filter(i => i.status === 'done').length,
      total: items.length,
    }));
```

Заменить на:

```ts
    return text(formatBoard(items, {
      project: p.id,
      description: p.description,
      epic: head ? { id: head.id, title: head.title } : null,
      done: items.filter(i => i.status === 'done').length,
      total: items.length,
    }));
```

- [ ] **Step 9: Написать инструмент `project`**

В `mcp/src/tools.ts` добавить внутрь `registerTools`, после инструмента `import_plan` (в самом конце функции, перед закрывающей `}`):

```ts

  server.registerTool('project', {
    description: 'Создать проект или обновить его имя/префикс/описание',
    inputSchema: {
      id: z.string(),
      name: z.string().optional(),
      prefix: z.string().optional(),
      description: z.string().optional(),
    },
  }, async ({ id, name, prefix, description }) => {
    const existing = await sb.from('projects').select('id').eq('id', id).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);

    if (existing.data) {
      const patch: Record<string, unknown> = {};
      if (name !== undefined) patch.name = name;
      if (prefix !== undefined) patch.prefix = prefix;
      if (description !== undefined) patch.description = description;
      if (!Object.keys(patch).length) return text(`${id}: нечего менять`);
      const up = await sb.from('projects').update(patch).eq('id', id);
      if (up.error) throw new Error(up.error.message);
      return text(`${id} обновлён`);
    }

    if (!name || !prefix) {
      throw new Error(`Проект "${id}" не найден. Для создания нужны name и prefix.`);
    }
    // repo_path — текущая папка: агент создаёт проект, уже работая в ней,
    // так что автоопределение по cwd сразу заработает при следующем вызове.
    const ins = await sb.from('projects').insert({
      id, name, prefix, description: description ?? null,
      repo_path: process.cwd(),
    });
    if (ins.error) throw new Error(ins.error.message);
    return text(`${id} создан`);
  });
```

- [ ] **Step 10: Перезапустить сессию и проверить `project` живьём**

Через агента: вызвать `project` с новым `id`, без `name`/`prefix` — ожидать ошибку с понятным текстом. Затем вызвать снова с `name`/`prefix` — ожидать `<id> создан`. Затем вызвать ещё раз с только `description` — ожидать `<id> обновлён`. Проверить `board` — шапка должна показывать описание.

Заархивировать тестовый проект после проверки (`update` через SQL — MCP-инструмента archive для проектов нет и не планируется: `archived_at` у проектов уже существует, но управление им — редкая ручная операция).

- [ ] **Step 11: Коммит**

```bash
git add supabase/migrations/20260912000000_project_description.sql mcp/src/db.ts mcp/src/format.ts mcp/test/format.test.ts mcp/src/tools.ts
git commit -m "Описание проекта: миграция, шапка board, инструмент project"
```

---

### Task 2: `add` создаёт эпик объектом

**Files:**
- Modify: `mcp/src/tools.ts`

**Interfaces:**
- Consumes: `nextSeq` (уже в файле)
- Produces: `add(project?, epic?: string | {title, goal?}, items[])` — новый необязательный параметр верхнего уровня `epic`

- [ ] **Step 1: Расширить схему и обработчик `add`**

В `mcp/src/tools.ts` найти:

```ts
  server.registerTool('add', {
    description: 'Создать задачи. Принимает массив — весь план одним вызовом',
    inputSchema: {
      project: z.string().optional(),
      items: z.array(z.object({
        title: z.string(),
        body: z.string().optional(),
        type: TYPE.default('task'),
        status: STATUS.default('backlog'),
        epic: z.string().optional(),
        checklist: z.array(z.string()).optional(),
        blocks: z.array(z.string()).optional(),
      })).min(1),
    },
  }, async ({ project, items }) => {
    const p = await resolveProject(project);

    // Номера берутся по одному: next_seq держит блокировку строки проекта,
    // поэтому параллельные сессии не получат одинаковый номер.
    const rows = [];
    for (const it of items) {
      const seq = await nextSeq(p.id, 'item');
      const row = {
        id: `${p.prefix}-${seq}`,
        seq,
        project_id: p.id,
        epic_id: it.epic ?? null,
```

Заменить на:

```ts
  server.registerTool('add', {
    description: 'Создать задачи, при желании — новый эпик для них одним вызовом',
    inputSchema: {
      project: z.string().optional(),
      // Строка — ссылка на существующий эпик. Объект — создать новый эпик
      // и прикрепить к нему все задачи этого вызова, у которых нет своего
      // items[].epic. Так «крупная тема без готового плана» заводится
      // одним вызовом, без похода в import_plan.
      epic: z.union([
        z.string(),
        z.object({ title: z.string(), goal: z.string().optional() }),
      ]).optional(),
      items: z.array(z.object({
        title: z.string(),
        body: z.string().optional(),
        type: TYPE.default('task'),
        status: STATUS.default('backlog'),
        epic: z.string().optional(),
        checklist: z.array(z.string()).optional(),
        blocks: z.array(z.string()).optional(),
      })).min(1),
    },
  }, async ({ project, epic, items }) => {
    const p = await resolveProject(project);

    let defaultEpicId: string | undefined;
    if (epic && typeof epic === 'object') {
      const eseq = await nextSeq(p.id, 'epic');
      defaultEpicId = `${p.prefix}-E${eseq}`;
      const e = await sb.from('epics').insert({
        id: defaultEpicId, seq: eseq, project_id: p.id,
        title: epic.title, goal: epic.goal ?? null,
        position: eseq * 100,
      });
      if (e.error) throw new Error(e.error.message);
    } else if (typeof epic === 'string') {
      defaultEpicId = epic;
    }

    // Номера берутся по одному: next_seq держит блокировку строки проекта,
    // поэтому параллельные сессии не получат одинаковый номер.
    const rows = [];
    for (const it of items) {
      const seq = await nextSeq(p.id, 'item');
      const row = {
        id: `${p.prefix}-${seq}`,
        seq,
        project_id: p.id,
        epic_id: it.epic ?? defaultEpicId ?? null,
```

Строки после `epic_id: it.epic ?? defaultEpicId ?? null,` (тип, title, body и так далее) не трогать — они идут без изменений сразу за этой строкой в существующем коде.

- [ ] **Step 2: Проверить, что модуль резолвится**

Run: `cd mcp && npx tsc --noEmit`
Expected: чисто, без ошибок типов.

Run: `cd mcp && node -e "import('./src/tools.ts').catch(e=>console.log('expected:',e.message))"`
Expected: `expected: Нужны переменные SUPABASE_URL и SUPABASE_SERVICE_KEY` (граф модулей резолвится, реального подключения не будет).

- [ ] **Step 3: Проверить живьём**

Через агента: вызвать `add` с `epic: { title: "Пробный эпик" }` и двумя задачами без своего `epic`. Ожидать: ответ вида `<PREFIX>-N..<PREFIX>-M создано (2)`. Проверить `board` с фильтром по новому эпику — обе задачи должны быть в нём. Проверить, что обычный вызов `add` без `epic` по-прежнему работает как раньше (без эпика).

Заархивировать созданные тестовые задачи и эпик после проверки (эпик — через SQL, `update epics set status='archived'`, как в плане №1).

- [ ] **Step 4: Коммит**

```bash
git add mcp/src/tools.ts
git commit -m "add: эпик можно создать объектом, не только сослаться строкой"
```

---

### Task 3: Типы веб-клиента для модалки и архива

**Files:**
- Modify: `web/src/supabase.ts`

**Interfaces:**
- Produces: `Comment` (новый экспортируемый тип), `Epic` (новый экспортируемый тип), `Project.description`, `Item.body`/`Item.blocks` (уже существуют в базе, но не были в типе веб-клиента — модалке нужны оба)

- [ ] **Step 1: Дополнить типы**

В `web/src/supabase.ts` найти:

```ts
export type Item = {
  id: string; seq: number; project_id: string; epic_id: string | null;
  type: 'task' | 'bug' | 'chore'; title: string; body: string | null;
  status: 'backlog' | 'doing' | 'waiting' | 'done';
  checklist: Check[]; position: number; archived_at: string | null;
};

export type Project = { id: string; name: string; prefix: string };
```

Заменить на:

```ts
export type Item = {
  id: string; seq: number; project_id: string; epic_id: string | null;
  type: 'task' | 'bug' | 'chore'; title: string; body: string | null;
  status: 'backlog' | 'doing' | 'waiting' | 'done';
  checklist: Check[]; blocks: string[]; position: number;
  closed_at: string | null; archived_at: string | null;
};

export type Comment = {
  id: number; item_id: string; author: 'me' | 'claude';
  body: string; created_at: string;
};

export type Epic = {
  id: string; seq: number; project_id: string; title: string;
  goal: string | null; plan_path: string | null; spec_path: string | null;
  status: string; position: number;
};

export type Project = {
  id: string; name: string; prefix: string; description: string | null;
};
```

- [ ] **Step 2: Проверить сборку**

Run: `cd web && npm run build`
Expected: чисто — `Item.blocks`/`closed_at` пока нигде не читаются, но добавление полей в тип не ломает существующий код, который их не использует.

- [ ] **Step 3: Коммит**

```bash
git add web/src/supabase.ts
git commit -m "Типы веб-клиента: Comment, Epic, description и недостающие поля Item"
```

---

### Task 4: Модалка задачи

**Files:**
- Create: `web/src/TaskModal.tsx`
- Modify: `web/src/Board.tsx` (клик по карточке открывает модалку)

**Interfaces:**
- Consumes: `sb`, `Item`, `Comment` из `supabase.ts` (Task 3)
- Produces: компонент `TaskModal({ item, onClose, onChanged })`

- [ ] **Step 1: Написать `web/src/TaskModal.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { sb } from './supabase';
import type { Item, Comment } from './supabase';

const STATUS_LABEL: Record<Item['status'], string> = {
  backlog: 'Backlog', doing: 'В работе',
  waiting: 'Нужно от тебя', done: 'Готово',
};

export function TaskModal(
  { item, onClose, onChanged }: {
    item: Item; onClose: () => void; onChanged: () => void;
  },
) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [err, setErr] = useState('');

  // Комментарии грузятся только при открытии одной задачи, а не для
  // всех карточек доски сразу — тот же принцип, что у get() в MCP.
  useEffect(() => {
    sb.from('comments').select('*')
      .eq('item_id', item.id).order('created_at')
      .then(({ data, error }) => {
        if (error) { setErr(error.message); return; }
        setComments((data ?? []) as Comment[]);
      });
  }, [item.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleCheck = async (i: number) => {
    const list = item.checklist.map((s, idx) =>
      idx === i ? { ...s, done: !s.done } : s);
    const { error } = await sb.from('items')
      .update({ checklist: list }).eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
  };

  const move = async (status: Item['status']) => {
    const { error } = await sb.from('items').update({
      status, closed_at: status === 'done' ? new Date().toISOString() : null,
    }).eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-(--color-ground) rounded-lg max-w-lg w-full max-h-[85vh]
                   overflow-y-auto p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <span className="text-[11px] font-mono text-(--color-muted)">
              {item.id}
            </span>
            <h2 className="text-base font-medium">{item.title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="text-(--color-muted) text-lg leading-none"
          >
            ×
          </button>
        </div>

        <select
          value={item.status}
          onChange={e => move(e.target.value as Item['status'])}
          onClick={e => e.stopPropagation()}
          aria-label="Статус"
          className="h-8 px-2 rounded-lg bg-(--color-panel)
                     border border-(--color-line) text-sm mb-4"
        >
          {(Object.keys(STATUS_LABEL) as Item['status'][]).map(s => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>

        {err && <p className="text-sm text-(--color-danger-ink) mb-3">{err}</p>}

        {item.body && (
          <p className="text-sm whitespace-pre-wrap mb-4">{item.body}</p>
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

        {comments.length > 0 && (
          <div className="space-y-2 border-t border-(--color-line) pt-3">
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
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Подключить к доске**

В `web/src/Board.tsx` добавить импорт после `import { NewTask } from './NewTask';`:

```tsx
import { TaskModal } from './TaskModal';
```

В компоненте `Board()` добавить состояние сразу после `const [err, setErr] = useState('');`:

```tsx
  const [openItem, setOpenItem] = useState<Item | null>(null);
```

В конце JSX компонента `Board`, прямо перед закрывающим `</div>` самого внешнего `<div className="min-h-dvh...">`, добавить:

```tsx
      {openItem && (
        <TaskModal
          item={openItem}
          onClose={() => setOpenItem(null)}
          onChanged={() => { reload(current); setOpenItem(null); }}
        />
      )}
```

В компоненте `Card` добавить проп `onOpen` и вызвать его по клику на карточку. Найти:

```tsx
function Card(
  { item, onChanged, onError }: {
    item: Item; onChanged: () => void; onError: (msg: string) => void;
  },
) {
```

Заменить на:

```tsx
function Card(
  { item, onChanged, onError, onOpen }: {
    item: Item; onChanged: () => void; onError: (msg: string) => void;
    onOpen: (item: Item) => void;
  },
) {
```

Найти открывающий тег карточки:

```tsx
    <article
      className={`rounded-lg p-2.5 text-sm ${
        waiting ? 'bg-(--color-wait)' : 'bg-(--color-panel)'
      }`}
    >
```

Заменить на:

```tsx
    <article
      onClick={() => onOpen(item)}
      className={`rounded-lg p-2.5 text-sm cursor-pointer ${
        waiting ? 'bg-(--color-wait)' : 'bg-(--color-panel)'
      }`}
    >
```

Найти `<select>` статуса внутри `Card` и добавить остановку всплытия клика, чтобы выбор статуса не открывал модалку:

```tsx
      <select
        value={item.status}
        onChange={e => move(e.target.value as Item['status'])}
        aria-label={`Статус задачи ${item.title}`}
```

Заменить на:

```tsx
      <select
        value={item.status}
        onChange={e => move(e.target.value as Item['status'])}
        onClick={e => e.stopPropagation()}
        aria-label={`Статус задачи ${item.title}`}
```

Наконец, найти место использования `<Card>` внутри `Board` и передать новый проп:

```tsx
                {list.map(i => (
                  <Card
                    key={i.id}
                    item={i}
                    onChanged={() => reload(current)}
                    onError={setErr}
                  />
                ))}
```

Заменить на:

```tsx
                {list.map(i => (
                  <Card
                    key={i.id}
                    item={i}
                    onChanged={() => reload(current)}
                    onError={setErr}
                    onOpen={setOpenItem}
                  />
                ))}
```

- [ ] **Step 3: Проверить сборку**

Run: `cd web && npm run build`
Expected: чисто.

- [ ] **Step 4: Проверить живьём**

Открыть сайт, кликнуть по любой карточке — должна открыться модалка с телом/чеклистом/комментариями (если есть). Кликнуть чекбокс — должен отметиться и сохраниться (проверить перезагрузкой страницы). Сменить статус в модалке — карточка должна переместиться в другую колонку. Нажать Escape и кликнуть по фону — оба должны закрывать модалку. Кликнуть по выпадающему списку статуса НА карточке (не в модалке) — модалка не должна открываться.

- [ ] **Step 5: Коммит**

```bash
git add web/src/TaskModal.tsx web/src/Board.tsx
git commit -m "Модалка задачи: клик по любой карточке открывает тело, чеклист, комментарии"
```

---

### Task 5: Архив

**Files:**
- Create: `web/src/ArchiveList.tsx`
- Modify: `web/src/Board.tsx` (ссылка «ещё N · архив», состояние архива)

**Interfaces:**
- Consumes: `Item` из `supabase.ts`; `TaskModal` из Task 4
- Produces: компонент `ArchiveList({ items, onOpen, onClose })`

- [ ] **Step 1: Написать `web/src/ArchiveList.tsx`**

```tsx
import type { Item } from './supabase';

export function ArchiveList(
  { items, onOpen, onClose }: {
    items: Item[]; onOpen: (item: Item) => void; onClose: () => void;
  },
) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-(--color-ground) rounded-lg max-w-lg w-full max-h-[85vh]
                   overflow-y-auto p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-medium">Архив</h2>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="text-(--color-muted) text-lg leading-none"
          >
            ×
          </button>
        </div>

        {items.length === 0 && (
          <p className="text-sm text-(--color-muted)">Пусто.</p>
        )}

        <div className="space-y-1">
          {items.map(i => (
            <button
              key={i.id}
              onClick={() => onOpen(i)}
              className="w-full text-left text-sm px-2 py-1.5 rounded
                         hover:bg-(--color-panel)"
            >
              <span className="text-[11px] font-mono text-(--color-muted) mr-2">
                {i.id}
              </span>
              {i.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Подключить к доске**

В `web/src/Board.tsx` добавить импорт:

```tsx
import { ArchiveList } from './ArchiveList';
```

Добавить состояние рядом с `openItem`:

```tsx
  const [showArchive, setShowArchive] = useState(false);
```

Задать предел показа для колонки «Готово» — константу перед компонентом `Board`:

```tsx
const DONE_SHOWN = 5;
```

Найти рендер колонок:

```tsx
      <div className="grid gap-3 md:grid-cols-4">
        {COLUMNS.map(col => {
          const list = items.filter(
            i => i.status === col.key && !i.archived_at);
          return (
            <section key={col.key}>
              <h2 className="text-xs text-(--color-muted) mb-2 px-1">
                {col.label} {list.length > 0 && list.length}
              </h2>
              <div className="space-y-2">
                {list.map(i => (
                  <Card
                    key={i.id}
                    item={i}
                    onChanged={() => reload(current)}
                    onError={setErr}
                    onOpen={setOpenItem}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
```

Заменить на:

```tsx
      <div className="grid gap-3 md:grid-cols-4">
        {COLUMNS.map(col => {
          const inColumn = items.filter(
            i => i.status === col.key && !i.archived_at);
          // «Готово» — единственная колонка, которая обрезается: открытые
          // задачи не должны прятаться, а закрытых со временем становится
          // много. Сортируем по дате закрытия — «последние несколько»
          // значит недавно завершённые, а не недавно созданные.
          const capped = col.key === 'done';
          const full = capped
            ? [...inColumn].sort(
                (a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''))
            : inColumn;
          const list = capped ? full.slice(0, DONE_SHOWN) : full;
          const hiddenDone = capped ? full.length - list.length : 0;

          return (
            <section key={col.key}>
              <h2 className="text-xs text-(--color-muted) mb-2 px-1">
                {col.label} {full.length > 0 && full.length}
              </h2>
              <div className="space-y-2">
                {list.map(i => (
                  <Card
                    key={i.id}
                    item={i}
                    onChanged={() => reload(current)}
                    onError={setErr}
                    onOpen={setOpenItem}
                  />
                ))}
              </div>
              {capped && (hiddenDone > 0 || archivedCount > 0) && (
                <button
                  onClick={() => setShowArchive(true)}
                  className="text-xs text-(--color-muted) mt-2 px-1"
                >
                  ещё {hiddenDone + archivedCount} · архив
                </button>
              )}
            </section>
          );
        })}
      </div>
```

Перед `return (` в компоненте `Board` (после всех `useState`/`useEffect`, до JSX) добавить вычисление скрытого архива:

```tsx
  // То же множество «показанных в Готово», что и в рендере колонок —
  // архив показывает всё остальное: и настоящие архивные карточки, и
  // готовые сверх видимых DONE_SHOWN.
  const shownDoneIds = new Set(
    items
      .filter(i => i.status === 'done' && !i.archived_at)
      .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''))
      .slice(0, DONE_SHOWN)
      .map(i => i.id),
  );
  const archivedCount = items.filter(i => i.archived_at).length;
  const archiveItems = items
    .filter(i => i.archived_at || (i.status === 'done' && !shownDoneIds.has(i.id)))
    .sort((a, b) =>
      (b.closed_at ?? b.archived_at ?? '')
        .localeCompare(a.closed_at ?? a.archived_at ?? ''));
```

Добавить рендер модалки архива рядом с `{openItem && (...)}`:

```tsx
      {showArchive && (
        <ArchiveList
          items={archiveItems}
          onOpen={i => { setShowArchive(false); setOpenItem(i); }}
          onClose={() => setShowArchive(false)}
        />
      )}
```

- [ ] **Step 3: Проверить сборку**

Run: `cd web && npm run build`
Expected: чисто.

- [ ] **Step 4: Проверить живьём**

Если готовых задач меньше `DONE_SHOWN` и архивных нет — ссылки «ещё · архив» быть не должно. Создать (через `add` или сайт) больше `DONE_SHOWN` закрытых задач — ссылка должна появиться с верным числом, открывать список, каждая строка — открывать саму задачу в `TaskModal`.

- [ ] **Step 5: Коммит**

```bash
git add web/src/ArchiveList.tsx web/src/Board.tsx
git commit -m "Архив: ссылка внизу «Готово», список открывает модалку задачи"
```

---

### Task 6: Создание проекта и эпика на сайте

**Files:**
- Create: `web/src/NewProject.tsx`
- Create: `web/src/NewEpic.tsx`
- Modify: `web/src/Board.tsx` (кнопки в шапке, показ описания проекта)

**Interfaces:**
- Consumes: `sb`, `Project`, типы из `supabase.ts` (Task 3)
- Produces: `NewProject({ onCreated })`, `NewEpic({ project, onCreated })`

- [ ] **Step 1: Написать `web/src/NewProject.tsx`**

```tsx
import { useState } from 'react';
import { sb } from './supabase';

export function NewProject({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !name.trim() || !prefix.trim()) {
      setError('Заполни слаг, имя и префикс');
      return;
    }
    setBusy(true);
    const { error } = await sb.from('projects').insert({
      id: id.trim(),
      name: name.trim(),
      prefix: prefix.trim().toUpperCase(),
      description: description.trim() || null,
      repo_path: repoPath.trim() || null,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }

    const created = id.trim();
    setId(''); setName(''); setPrefix(''); setRepoPath('');
    setDescription(''); setOpen(false);
    onCreated(created);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="h-8 px-3 rounded-lg border border-(--color-line) text-sm"
      >
        Новый проект
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="w-72 space-y-2">
      <input
        autoFocus
        value={id}
        onChange={e => { setId(e.target.value); setError(''); }}
        placeholder="слаг: family-app"
        className="w-full h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                   border border-(--color-line) outline-none"
      />
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="имя: Семейное приложение"
        className="w-full h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                   border border-(--color-line) outline-none"
      />
      <input
        value={prefix}
        onChange={e => setPrefix(e.target.value)}
        placeholder="префикс: FAM"
        className="w-full h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                   border border-(--color-line) outline-none"
      />
      <input
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="описание (необязательно)"
        className="w-full h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                   border border-(--color-line) outline-none"
      />
      <input
        value={repoPath}
        onChange={e => setRepoPath(e.target.value)}
        placeholder="путь к папке на компе (необязательно)"
        className="w-full h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                   border border-(--color-line) outline-none"
      />
      <p className="text-[11px] text-(--color-muted)">
        Путь нужен, чтобы я сама находила проект по рабочей папке — без него
        придётся называть проект явно.
      </p>

      {error && <p className="text-xs text-(--color-danger-ink)">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 h-8 rounded-lg bg-(--color-ink)
                     text-(--color-ground) text-sm"
        >
          {busy ? '…' : 'Создать'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(''); }}
          className="h-8 px-3 rounded-lg border border-(--color-line)
                     text-sm text-(--color-muted)"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Написать `web/src/NewEpic.tsx`**

```tsx
import { useState } from 'react';
import { sb } from './supabase';

export function NewEpic(
  { project, onCreated }: { project: string; onCreated: () => void },
) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Напиши заголовок эпика'); return; }
    setBusy(true);

    const { data: seq, error: seqErr } = await sb
      .rpc('next_seq', { p_project: project, p_kind: 'epic' });
    if (seqErr) { setError(seqErr.message); setBusy(false); return; }

    const { data: p } = await sb.from('projects')
      .select('prefix').eq('id', project).single();

    const { error } = await sb.from('epics').insert({
      id: `${p!.prefix}-E${seq}`,
      seq,
      project_id: project,
      title: title.trim(),
      goal: goal.trim() || null,
      position: seq * 100,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }

    setTitle(''); setGoal(''); setOpen(false);
    onCreated();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="h-8 px-3 rounded-lg border border-(--color-line) text-sm"
      >
        Новый эпик
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="w-64 space-y-2">
      <input
        autoFocus
        value={title}
        onChange={e => { setTitle(e.target.value); setError(''); }}
        placeholder="крупная тема"
        className="w-full h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                   border border-(--color-line) outline-none"
      />
      <textarea
        value={goal}
        onChange={e => setGoal(e.target.value)}
        placeholder="цель (необязательно)"
        rows={2}
        className="w-full p-2 rounded-lg bg-(--color-panel) text-sm
                   border border-(--color-line) outline-none resize-none"
      />

      {error && <p className="text-xs text-(--color-danger-ink)">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 h-8 rounded-lg bg-(--color-ink)
                     text-(--color-ground) text-sm"
        >
          {busy ? '…' : 'Создать'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(''); }}
          className="h-8 px-3 rounded-lg border border-(--color-line)
                     text-sm text-(--color-muted)"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Подключить обе формы и показ описания в `Board.tsx`**

Добавить импорты после `import { NewTask } from './NewTask';`:

```tsx
import { NewProject } from './NewProject';
import { NewEpic } from './NewEpic';
```

Найти шапку:

```tsx
      <header className="flex items-center gap-3 mb-5">
        <select
          value={current}
          onChange={e => setCurrent(e.target.value)}
          className="h-8 px-2 rounded-lg bg-(--color-panel)
                     border border-(--color-line) text-sm"
        >
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {err && <span className="text-sm text-(--color-danger-ink)">{err}</span>}
        <span className="text-sm text-(--color-muted)">
          {items.filter(i => i.status === 'done').length}/{items.length}
        </span>
        <div className="ml-auto">
          <NewTask project={current} onAdded={() => reload(current)} />
        </div>
      </header>
```

Заменить на:

```tsx
      <header className="flex items-center gap-3 mb-5 flex-wrap">
        <select
          value={current}
          onChange={e => setCurrent(e.target.value)}
          className="h-8 px-2 rounded-lg bg-(--color-panel)
                     border border-(--color-line) text-sm"
        >
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {currentProject?.description && (
          <span className="text-sm text-(--color-muted)">
            {currentProject.description}
          </span>
        )}
        {err && <span className="text-sm text-(--color-danger-ink)">{err}</span>}
        <span className="text-sm text-(--color-muted)">
          {items.filter(i => i.status === 'done').length}/{items.length}
        </span>
        <div className="ml-auto flex gap-2">
          <NewProject onCreated={id => { reloadProjects(); setCurrent(id); }} />
          <NewEpic project={current} onCreated={() => reload(current)} />
          <NewTask project={current} onAdded={() => reload(current)} />
        </div>
      </header>
```

Добавить производную переменную `currentProject` и вынести загрузку проектов в переиспользуемую функцию `reloadProjects`. Найти:

```tsx
  useEffect(() => {
    sb.from('projects').select('*').is('archived_at', null)
      .order('position')
      .then(({ data, error }) => {
        if (error) { setErr(error.message); return; }
        const ps = (data ?? []) as Project[];
        setProjects(ps);
        if (ps.length) setCurrent(ps[0].id);
      });
  }, []);
```

Заменить на:

```tsx
  const reloadProjects = async (keepCurrent = true) => {
    const { data, error } = await sb.from('projects').select('*')
      .is('archived_at', null).order('position');
    if (error) { setErr(error.message); return; }
    const ps = (data ?? []) as Project[];
    setProjects(ps);
    if (!keepCurrent && ps.length) setCurrent(ps[0].id);
    if (keepCurrent && !current && ps.length) setCurrent(ps[0].id);
  };

  useEffect(() => { reloadProjects(false); }, []);

  const currentProject = projects.find(p => p.id === current) ?? null;
```

- [ ] **Step 4: Проверить сборку**

Run: `cd web && npm run build`
Expected: чисто.

- [ ] **Step 5: Проверить живьём**

Создать проект через форму (со слагом, именем, префиксом, без пути) — доска должна переключиться на него, пустая. Создать эпик — должен появиться (проверить через `board` от агента). Задать описание существующему проекту через инструмент `project` от агента — должно показаться в шапке сайта после обновления.

- [ ] **Step 6: Коммит**

```bash
git add web/src/NewProject.tsx web/src/NewEpic.tsx web/src/Board.tsx
git commit -m "Создание проекта и эпика на сайте, показ описания в шапке"
```

---

### Task 7: Экран эпика

**Files:**
- Create: `web/src/EpicScreen.tsx`
- Modify: `web/src/Board.tsx` (переключение на экран эпика, ссылка из карточки/модалки)
- Modify: `web/src/TaskModal.tsx` (ссылка на эпик, если задан)

**Interfaces:**
- Consumes: `sb`, `Item`, `Epic` из `supabase.ts`
- Produces: компонент `EpicScreen({ epicId, onBack, onOpenItem })`

- [ ] **Step 1: Написать `web/src/EpicScreen.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { sb } from './supabase';
import type { Item, Epic } from './supabase';

export function EpicScreen(
  { epicId, onBack, onOpenItem }: {
    epicId: string; onBack: () => void; onOpenItem: (item: Item) => void;
  },
) {
  const [epic, setEpic] = useState<Epic | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    sb.from('epics').select('*').eq('id', epicId).single()
      .then(({ data, error }) => {
        if (error) { setErr(error.message); return; }
        setEpic(data as Epic);
      });
    sb.from('items').select('*').eq('epic_id', epicId).order('position')
      .then(({ data, error }) => {
        if (error) { setErr(error.message); return; }
        setItems((data ?? []) as Item[]);
      });
  }, [epicId]);

  const done = items.filter(i => i.status === 'done' || i.archived_at).length;

  return (
    <div className="min-h-dvh p-4 md:p-6 max-w-3xl mx-auto">
      <button onClick={onBack} className="text-sm text-(--color-muted) mb-4">
        ← Доска
      </button>

      {err && <p className="text-sm text-(--color-danger-ink) mb-3">{err}</p>}

      {epic && (
        <>
          <h1 className="text-lg font-medium mb-1">{epic.title}</h1>
          {epic.goal && (
            <p className="text-sm text-(--color-muted) mb-3">{epic.goal}</p>
          )}
          <div className="flex items-center gap-3 mb-5 text-sm text-(--color-muted)">
            <span>{done}/{items.length}</span>
            {epic.plan_path && (
              <a href={epic.plan_path} className="text-(--color-ink) underline">
                план
              </a>
            )}
            {epic.spec_path && (
              <a href={epic.spec_path} className="text-(--color-ink) underline">
                спека
              </a>
            )}
          </div>
        </>
      )}

      <div className="space-y-1">
        {items.map(i => (
          <button
            key={i.id}
            onClick={() => onOpenItem(i)}
            className="w-full flex items-center gap-2 text-left text-sm
                       px-2 py-1.5 rounded hover:bg-(--color-panel)"
          >
            <span className="text-[11px] font-mono text-(--color-muted) w-10">
              {i.seq}
            </span>
            <span className={i.status === 'done' ? 'text-(--color-muted)' : ''}>
              {i.title}
            </span>
            {i.checklist.length > 0 && (
              <span className="ml-auto text-[11px] text-(--color-muted)">
                {i.checklist.filter(s => s.done).length}/{i.checklist.length}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
```

Ссылки на план/спеку ведут на относительный путь файла в репозитории — на сайте они откроются только если репозиторий опубликован там же (GitHub Pages это не делает для `.md` вне `web/`). Ponytail: рабочая ссылка на файлы репозитория — забота плана №3, если вообще понадобится; сейчас путь хотя бы виден и копируется.

- [ ] **Step 2: Подключить переключение экрана в `Board.tsx`**

Добавить импорт:

```tsx
import { EpicScreen } from './EpicScreen';
```

Добавить состояние рядом с `openItem`:

```tsx
  const [viewEpic, setViewEpic] = useState<string | null>(null);
```

В самом начале `return (` компонента `Board`, до основного JSX, добавить ранний выход на экран эпика:

```tsx
  if (viewEpic) {
    return (
      <>
        <EpicScreen
          epicId={viewEpic}
          onBack={() => setViewEpic(null)}
          onOpenItem={setOpenItem}
        />
        {openItem && (
          <TaskModal
            item={openItem}
            onClose={() => setOpenItem(null)}
            // ponytail: список экрана эпика не перечитывается на месте
            // после правки через модалку — только при повторном заходе
            // на экран. Обновить, если статус внутри эпика станет менять
            // хотя бы каждый второй заход.
            onChanged={() => setOpenItem(null)}
          />
        )}
      </>
    );
  }
```

- [ ] **Step 3: Добавить ссылку на эпик в модалку задачи**

В `web/src/TaskModal.tsx` добавить проп `onOpenEpic`. Найти:

```tsx
export function TaskModal(
  { item, onClose, onChanged }: {
    item: Item; onClose: () => void; onChanged: () => void;
  },
) {
```

Заменить на:

```tsx
export function TaskModal(
  { item, onClose, onChanged, onOpenEpic }: {
    item: Item; onClose: () => void; onChanged: () => void;
    onOpenEpic?: (epicId: string) => void;
  },
) {
```

Найти блок с `<select>` статуса и вставить после него ссылку на эпик, если она есть:

```tsx
        {item.epic_id && onOpenEpic && (
          <button
            onClick={() => onOpenEpic(item.epic_id!)}
            className="text-xs text-(--color-muted) underline block mb-3"
          >
            эпик: {item.epic_id}
          </button>
        )}
```

В `web/src/Board.tsx` передать проп в оба места, где рендерится `TaskModal` (основной вид и вид эпика из Step 2):

```tsx
          onOpenEpic={id => { setOpenItem(null); setViewEpic(id); }}
```

- [ ] **Step 4: Проверить сборку**

Run: `cd web && npm run build`
Expected: чисто.

- [ ] **Step 5: Проверить живьём**

Открыть задачу с эпиком (например, из плана №1, если он ещё на доске, или завести новый через `import_plan`) — в модалке должна быть ссылка «эпик: …». Клик — переход на экран эпика со списком всех его задач и прогрессом. «← Доска» — возврат.

- [ ] **Step 6: Коммит**

```bash
git add web/src/EpicScreen.tsx web/src/Board.tsx web/src/TaskModal.tsx
git commit -m "Экран эпика: список задач, прогресс, ссылки на план и спеку"
```

---

### Task 8: Перетаскивание мышью

**Files:**
- Create: `web/src/position.ts`
- Create: `web/test/position.test.ts`
- Modify: `web/package.json` (зависимости `@dnd-kit/core`, `@dnd-kit/sortable`)
- Modify: `web/src/Board.tsx` (обёртка `DndContext`, обработчик `onDragEnd`)

**Interfaces:**
- Produces: `between(before: number | null, after: number | null): number`

- [ ] **Step 1: Написать падающий тест**

Создать `web/test/position.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { between } from '../src/position.ts';

test('между двумя соседями — среднее', () => {
  assert.equal(between(100, 200), 150);
});

test('в начало списка — меньше первого', () => {
  assert.equal(between(null, 100), 50);
});

test('в конец списка — больше последнего', () => {
  assert.equal(between(100, null), 200);
});

test('единственный элемент — произвольная стартовая позиция', () => {
  assert.equal(between(null, null), 1000);
});

test('очень близкие соседи всё равно дают позицию между ними', () => {
  const p = between(100, 100.0001);
  assert.ok(p > 100 && p < 100.0001);
});
```

- [ ] **Step 2: Прогнать тест — должен падать**

Run: `cd web && node --test test/position.test.ts`
Expected: FAIL — `Cannot find module '../src/position.ts'`.

- [ ] **Step 3: Написать `web/src/position.ts`**

```ts
/* Дробная позиция между соседями по перетаскиванию. before/after — позиции
   карточек, между которыми встала перетаскиваемая; null на краю списка. */
export function between(before: number | null, after: number | null): number {
  if (before === null && after === null) return 1000;
  if (before === null) return after! - 100;
  if (after === null) return before + 100;
  return (before + after) / 2;
}
```

- [ ] **Step 4: Прогнать тест — должен пройти**

Run: `cd web && node --test test/position.test.ts`
Expected: PASS, 5 тестов.

- [ ] **Step 5: Добавить `test` в `npm test` веб-клиента**

В `web/package.json` найти:

```json
    "test": "node --test test/guess.test.ts"
```

Заменить на:

```json
    "test": "node --test test/guess.test.ts test/position.test.ts"
```

- [ ] **Step 6: Поставить зависимости**

Run: `cd web && npm install @dnd-kit/core @dnd-kit/sortable`

- [ ] **Step 7: Обернуть доску в `DndContext`**

В `web/src/Board.tsx` добавить импорты:

```tsx
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { between } from './position';
```

Найти рендер колонок (после правок Task 5) и обернуть весь блок `<div className="grid gap-3 md:grid-cols-4">...</div>` в `DndContext`. Добавить перед этим блоком, внутри компонента `Board`, обработчик и сенсор:

```tsx
  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  }));

  const onDragEnd = async (e: DragEndEvent) => {
    const itemId = e.active.id as string;
    const overId = e.over?.id as string | undefined;
    if (!overId) return;

    // over.id — либо статус колонки (перетащили в пустое место), либо id
    // карточки, над которой отпустили (тогда встаём перед ней).
    const targetStatus = (COLUMNS.find(c => c.key === overId)?.key
      ?? items.find(i => i.id === overId)?.status) as Item['status'] | undefined;
    if (!targetStatus) return;

    const columnItems = items
      .filter(i => i.status === targetStatus && !i.archived_at && i.id !== itemId)
      .sort((a, b) => a.position - b.position);
    const overIndex = columnItems.findIndex(i => i.id === overId);
    const before = overIndex > 0 ? columnItems[overIndex - 1].position : null;
    const after = overIndex >= 0 ? columnItems[overIndex].position : null;
    const position = between(before, after);

    const dragged = items.find(i => i.id === itemId);
    const patch: Record<string, unknown> = { position };
    if (dragged && dragged.status !== targetStatus) {
      patch.status = targetStatus;
      patch.closed_at = targetStatus === 'done' ? new Date().toISOString() : null;
    }
    const { error } = await sb.from('items').update(patch).eq('id', itemId);
    if (error) { setErr(error.message); return; }
    reload(current);
  };
```

Обёртку блока колонок в `DndContext` и замену его содержимого на компонент `Column` делаем одним шагом дальше — Step 8 показывает итоговый код целиком.

- [ ] **Step 8: Вынести колонку в отдельный компонент и обернуть в `DndContext`**

Хуки вызываются только на верхнем уровне функции-компонента, не внутри колбэка `.map()` — даже если `COLUMNS` не меняется между рендерами, вызов `useDroppable` прямо в теле `COLUMNS.map(col => {...})` внутри `Board` нарушает Rules of Hooks. Нужен отдельный компонент `Column`, который сам вызывает `useDroppable` в своём собственном теле.

В `web/src/Board.tsx` найти блок рендера колонок (получившийся после Task 5 — с обрезкой «Готово» и ссылкой на архив):

```tsx
        <div className="grid gap-3 md:grid-cols-4">
          {COLUMNS.map(col => {
            const inColumn = items.filter(
              i => i.status === col.key && !i.archived_at);
            // «Готово» — единственная колонка, которая обрезается: открытые
            // задачи не должны прятаться, а закрытых со временем становится
            // много. Сортируем по дате закрытия — «последние несколько»
            // значит недавно завершённые, а не недавно созданные.
            const capped = col.key === 'done';
            const full = capped
              ? [...inColumn].sort(
                  (a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''))
              : inColumn;
            const list = capped ? full.slice(0, DONE_SHOWN) : full;
            const hiddenDone = capped ? full.length - list.length : 0;

            return (
              <section key={col.key}>
                <h2 className="text-xs text-(--color-muted) mb-2 px-1">
                  {col.label} {full.length > 0 && full.length}
                </h2>
                <div className="space-y-2">
                  {list.map(i => (
                    <Card
                      key={i.id}
                      item={i}
                      onChanged={() => reload(current)}
                      onError={setErr}
                      onOpen={setOpenItem}
                    />
                  ))}
                </div>
                {capped && (hiddenDone > 0 || archivedCount > 0) && (
                  <button
                    onClick={() => setShowArchive(true)}
                    className="text-xs text-(--color-muted) mt-2 px-1"
                  >
                    ещё {hiddenDone + archivedCount} · архив
                  </button>
                )}
              </section>
            );
          })}
        </div>
```

Заменить на вызов нового компонента `Column` внутри `DndContext` (обёртка из Step 7 и замена содержимого — одной правкой):

```tsx
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="grid gap-3 md:grid-cols-4">
            {COLUMNS.map(col => (
              <Column
                key={col.key}
                col={col}
                items={items.filter(i => i.status === col.key && !i.archived_at)}
                archivedCount={archivedCount}
                onChanged={() => reload(current)}
                onError={setErr}
                onOpen={setOpenItem}
                onShowArchive={() => setShowArchive(true)}
              />
            ))}
          </div>
        </DndContext>
```

Добавить сам компонент `Column` в `web/src/Board.tsx` рядом с `Card` (после него или перед ним — оба на верхнем уровне модуля):

```tsx
function Column(
  { col, items, archivedCount, onChanged, onError, onOpen, onShowArchive }: {
    col: typeof COLUMNS[number]; items: Item[]; archivedCount: number;
    onChanged: () => void; onError: (msg: string) => void;
    onOpen: (item: Item) => void; onShowArchive: () => void;
  },
) {
  const { setNodeRef } = useDroppable({ id: col.key });

  // «Готово» — единственная колонка, которая обрезается: открытые задачи
  // не должны прятаться, а закрытых со временем становится много.
  // Сортируем по дате закрытия — «последние несколько» значит недавно
  // завершённые, а не недавно созданные.
  const capped = col.key === 'done';
  const full = capped
    ? [...items].sort(
        (a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''))
    : items;
  const list = capped ? full.slice(0, DONE_SHOWN) : full;
  const hiddenDone = capped ? full.length - list.length : 0;

  return (
    <section ref={setNodeRef}>
      <h2 className="text-xs text-(--color-muted) mb-2 px-1">
        {col.label} {full.length > 0 && full.length}
      </h2>
      <div className="space-y-2">
        {list.map(i => (
          <Card
            key={i.id}
            item={i}
            onChanged={onChanged}
            onError={onError}
            onOpen={onOpen}
          />
        ))}
      </div>
      {capped && (hiddenDone > 0 || archivedCount > 0) && (
        <button
          onClick={onShowArchive}
          className="text-xs text-(--color-muted) mt-2 px-1"
        >
          ещё {hiddenDone + archivedCount} · архив
        </button>
      )}
    </section>
  );
}
```

В компоненте `Card` добавить перетаскивание. Найти начало функции:

```tsx
function Card(
  { item, onChanged, onError, onOpen }: {
    item: Item; onChanged: () => void; onError: (msg: string) => void;
    onOpen: (item: Item) => void;
  },
) {
  const done = item.checklist.filter(s => s.done).length;
  const waiting = item.status === 'waiting';
```

Заменить на:

```tsx
function Card(
  { item, onChanged, onError, onOpen }: {
    item: Item; onChanged: () => void; onError: (msg: string) => void;
    onOpen: (item: Item) => void;
  },
) {
  const done = item.checklist.filter(s => s.done).length;
  const waiting = item.status === 'waiting';
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: item.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
```

Найти открывающий тег карточки:

```tsx
    <article
      onClick={() => onOpen(item)}
      className={`rounded-lg p-2.5 text-sm cursor-pointer ${
        waiting ? 'bg-(--color-wait)' : 'bg-(--color-panel)'
      }`}
    >
```

Заменить на:

```tsx
    <article
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(item)}
      className={`rounded-lg p-2.5 text-sm cursor-grab ${
        waiting ? 'bg-(--color-wait)' : 'bg-(--color-panel)'
      }`}
    >
```

`PointerSensor`'s `activationConstraint: { distance: 5 }` из Step 7 не даёт короткому клику превратиться в начало перетаскивания — клик на открытие модалки и драг остаются различимы без отдельного кода.

- [ ] **Step 9: Проверить сборку**

Run: `cd web && npm run build`
Expected: чисто.

- [ ] **Step 10: Проверить живьём**

Перетащить карточку из «Backlog» в «В работе» — должна сменить колонку и статус. Перетащить карточку внутри одной колонки, поставив её между двумя другими — порядок должен сохраниться после обновления страницы (значит `position` записалась верно). Короткий клик по карточке по-прежнему должен открывать модалку, а не начинать перетаскивание.

- [ ] **Step 11: Коммит**

```bash
git add web/src/position.ts web/test/position.test.ts web/package.json web/src/Board.tsx
git commit -m "Перетаскивание карточек мышью через @dnd-kit"
```

---

### Task 9: Мобильный свайп

**Files:**
- Modify: `web/src/Board.tsx` (обработчики касания на `Card`)

**Interfaces:**
- Consumes: `Item['status']` порядок статусов

- [ ] **Step 1: Добавить обработку свайпа в `Card`**

В `web/src/Board.tsx` добавить константу порядка статусов перед компонентом `Board`:

```tsx
const STATUS_ORDER: Item['status'][] = ['backlog', 'doing', 'waiting', 'done'];
```

В компоненте `Card` (после хуков `useDraggable` из Task 8) добавить состояние и обработчики свайпа:

```tsx
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [dragX, setDragX] = useState(0);

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    setDragX(e.touches[0].clientX - touchStartX);
  };
  const onTouchEnd = () => {
    const THRESHOLD = 60;
    if (Math.abs(dragX) > THRESHOLD) {
      const i = STATUS_ORDER.indexOf(item.status);
      const next = dragX > 0 ? i + 1 : i - 1;
      if (next >= 0 && next < STATUS_ORDER.length) move(STATUS_ORDER[next]);
    }
    setTouchStartX(null);
    setDragX(0);
  };
```

Добавить `useState` в импорт из `react`, если его там ещё нет — он уже импортирован в файле (`import { useEffect, useState } from 'react';`), дополнительных импортов не требуется.

Найти открывающий тег карточки (после правок Task 8):

```tsx
    <article
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(item)}
      className={`rounded-lg p-2.5 text-sm cursor-grab ${
        waiting ? 'bg-(--color-wait)' : 'bg-(--color-panel)'
      }`}
    >
```

Заменить на:

```tsx
    <article
      ref={setNodeRef}
      style={{ ...style, transform: `${style?.transform ?? ''} translateX(${dragX}px)` }}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(item)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className={`rounded-lg p-2.5 text-sm cursor-grab touch-pan-y ${
        waiting ? 'bg-(--color-wait)' : 'bg-(--color-panel)'
      }`}
    >
```

`touch-pan-y` в className оставляет вертикальную прокрутку страницы работающей во время горизонтального свайпа карточки.

Ponytail: свайп проверяет только сдвиг по X мимо порога, без учёта скорости и без анимации возврата, если порог не пройден (`dragX` просто сбрасывается в 0, карточка резко становится на место). Достаточно для «свайп меняет статус»; плавный отскок и инерция — если станет реально раздражать в использовании.

- [ ] **Step 2: Проверить сборку**

Run: `cd web && npm run build`
Expected: чисто.

- [ ] **Step 3: Проверить живьём**

Открыть сайт на телефоне (или эмуляцией мобильного видового окна в инструментах разработчика с включённой эмуляцией касаний). Смахнуть карточку вправо — должна перейти на статус дальше по порядку. Смахнуть влево — на статус раньше. На краях (уже «Готово» вправо, уже «Backlog» влево) — ничего не происходит. Короткий тап по-прежнему открывает модалку.

- [ ] **Step 4: Коммит**

```bash
git add web/src/Board.tsx
git commit -m "Мобильный свайп: смена статуса свайпом по карточке"
```

---

### Task 10: Supabase Realtime

**Files:**
- Create: `supabase/migrations/20260912000001_enable_realtime.sql`
- Modify: `web/src/Board.tsx` (подписка на изменения)

**Interfaces:**
- Consumes: `sb.channel` (из `@supabase/supabase-js`, уже установлен)

- [ ] **Step 1: Написать миграцию, включающую Realtime**

Создать `supabase/migrations/20260912000001_enable_realtime.sql`:

```sql
-- Realtime у Supabase работает через публикацию Postgres: таблица должна
-- быть явно добавлена, иначе подписка молча ничего не пришлёт.
alter publication supabase_realtime add table items;
alter publication supabase_realtime add table epics;
```

- [ ] **Step 2: Применить миграцию**

Через MCP-инструмент Supabase `apply_migration` с именем `enable_realtime` и телом файла из Step 1.

- [ ] **Step 3: Подписаться на изменения в `Board.tsx`**

В `web/src/Board.tsx` найти:

```tsx
  useEffect(() => { reload(current); }, [current]);
```

Заменить на:

```tsx
  useEffect(() => {
    reload(current);
    if (!current) return;

    // Пока агент пишет через MCP, доска обновляется сама — без кнопки
    // «обновить» и без опроса по таймеру.
    const channel = sb
      .channel(`items-${current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `project_id=eq.${current}` },
        () => reload(current),
      )
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [current]);
```

- [ ] **Step 4: Проверить сборку**

Run: `cd web && npm run build`
Expected: чисто.

- [ ] **Step 5: Проверить живьём**

Открыть доску в браузере. Через агента вызвать `add` или `update` на этом же проекте. Доска должна обновиться сама, без перезагрузки страницы, в течение секунды-двух.

- [ ] **Step 6: Коммит**

```bash
git add supabase/migrations/20260912000001_enable_realtime.sql web/src/Board.tsx
git commit -m "Supabase Realtime: доска обновляется сама, пока агент пишет через MCP"
```

---

### Task 11: Экран «Все проекты»

**Files:**
- Create: `web/src/AllProjects.tsx`
- Modify: `web/src/Board.tsx` (переключение на экран, ссылка из шапки)

**Interfaces:**
- Consumes: `sb`, `Project`, `Item` из `supabase.ts`
- Produces: компонент `AllProjects({ onSelect })`

- [ ] **Step 1: Написать `web/src/AllProjects.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { sb } from './supabase';
import type { Project, Item } from './supabase';

type Row = { project: Project; total: number; done: number; waiting: number };

export function AllProjects({ onSelect }: { onSelect: (id: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const { data: projects, error: pErr } = await sb.from('projects')
        .select('*').is('archived_at', null).order('position');
      if (pErr) { setErr(pErr.message); return; }

      const { data: items, error: iErr } = await sb.from('items').select('*');
      if (iErr) { setErr(iErr.message); return; }

      const all = (items ?? []) as Item[];
      setRows((projects ?? []).map((project: Project) => {
        const mine = all.filter(i => i.project_id === project.id);
        return {
          project,
          total: mine.length,
          done: mine.filter(i => i.status === 'done').length,
          waiting: mine.filter(i => i.status === 'waiting' && !i.archived_at).length,
        };
      }));
    })();
  }, []);

  return (
    <div className="min-h-dvh p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-lg font-medium mb-4">Все проекты</h1>

      {err && <p className="text-sm text-(--color-danger-ink) mb-3">{err}</p>}

      <div className="space-y-1">
        {rows.map(({ project, total, done, waiting }) => (
          <button
            key={project.id}
            onClick={() => onSelect(project.id)}
            className="w-full flex items-center gap-3 text-left text-sm
                       px-3 py-2 rounded hover:bg-(--color-panel)"
          >
            <span className="font-medium">{project.name}</span>
            {project.description && (
              <span className="text-(--color-muted) truncate">
                {project.description}
              </span>
            )}
            <span className="ml-auto text-(--color-muted)">{done}/{total}</span>
            {waiting > 0 && (
              <span className="text-(--color-wait-ink)">{waiting} ждёт</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Подключить к `Board.tsx`**

Добавить импорт:

```tsx
import { AllProjects } from './AllProjects';
```

Добавить состояние рядом с `viewEpic`:

```tsx
  const [viewAll, setViewAll] = useState(false);
```

В шапке (получившейся после Task 6) найти:

```tsx
      <header className="flex items-center gap-3 mb-5 flex-wrap">
        <select
          value={current}
          onChange={e => setCurrent(e.target.value)}
          className="h-8 px-2 rounded-lg bg-(--color-panel)
                     border border-(--color-line) text-sm"
        >
```

Заменить на:

```tsx
      <header className="flex items-center gap-3 mb-5 flex-wrap">
        <button
          onClick={() => setViewAll(true)}
          className="text-sm text-(--color-muted)"
        >
          Все проекты
        </button>
        <select
          value={current}
          onChange={e => setCurrent(e.target.value)}
          className="h-8 px-2 rounded-lg bg-(--color-panel)
                     border border-(--color-line) text-sm"
        >
```

В начале `return (`, перед проверкой `if (viewEpic)`, добавить:

```tsx
  if (viewAll) {
    return (
      <AllProjects onSelect={id => { setCurrent(id); setViewAll(false); }} />
    );
  }
```

- [ ] **Step 3: Проверить сборку**

Run: `cd web && npm run build`
Expected: чисто.

- [ ] **Step 4: Проверить живьём**

При одном проекте на доске экран должен показать одну строку с верными числами. Клик по строке — переход на доску этого проекта. При нескольких проектах (создать второй через `NewProject`) — обе строки видны, числа независимы.

- [ ] **Step 5: Коммит**

```bash
git add web/src/AllProjects.tsx web/src/Board.tsx
git commit -m "Экран «Все проекты»: прогресс и ожидающие по каждому проекту"
```

---

### Task 12: Упаковка MCP-сервера в `.mcpb`

**Files:**
- Create: `mcp/manifest.json`
- Modify: `README.md` (альтернативный способ подключения)

**Interfaces:**
- Consumes: существующий `mcp/src/index.ts`, ничего не меняет в его коде

- [ ] **Step 1: Написать манифест**

Создать `mcp/manifest.json`:

```json
{
  "manifest_version": "0.1",
  "name": "kanban",
  "display_name": "Канбан",
  "version": "1.0.0",
  "description": "Личная доска задач по проектам — шесть-семь инструментов для ведения канбана из Claude Code.",
  "author": { "name": "Georgy Shakov" },
  "server": {
    "type": "node",
    "entry_point": "src/index.ts",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/src/index.ts"],
      "env": {
        "SUPABASE_URL": "${user_config.supabase_url}",
        "SUPABASE_SERVICE_KEY": "${user_config.supabase_service_key}"
      }
    }
  },
  "user_config": {
    "supabase_url": {
      "type": "string",
      "title": "Supabase URL",
      "description": "https://<project-ref>.supabase.co",
      "required": true
    },
    "supabase_service_key": {
      "type": "string",
      "title": "Supabase service key",
      "description": "Settings → API → Secret keys → default. Хранится только локально.",
      "required": true,
      "sensitive": true
    }
  }
}
```

Поля манифеста соответствуют формату Desktop Extensions (`.mcpb`/бывший `.dxt`) на момент написания плана. Спецификация у Anthropic может измениться — перед реальной установкой свериться с актуальной документацией `.mcpb`; если поля разошлись, это не меняет остальной план — переписывается только этот файл.

- [ ] **Step 2: Упаковать**

Run (из `mcp/`): `npx @anthropic-ai/mcpb pack .`
Expected: создан файл `kanban.mcpb` (или аналогичное имя, в зависимости от версии инструмента упаковки).

Если команда называется иначе в установленной версии — использовать актуальную команду упаковки `.mcpb` из документации Anthropic; сама структура `manifest.json` от этого не зависит.

- [ ] **Step 3: Установить и проверить живьём**

В Claude Desktop: Settings → Extensions → Advanced settings → Install Extension… → выбрать `kanban.mcpb`. Ввести `SUPABASE_URL` и `SUPABASE_SERVICE_KEY` в открывшейся форме. Перезапустить сессию, проверить `board` — должен ответить, как и раньше при подключении через `claude mcp add`.

Если по итогам этого шага старое подключение через `claude mcp add --scope user` и новое через `.mcpb` конфликтуют (два зарегистрированных сервера с одним именем) — снять старое: `claude mcp remove kanban --scope user`.

- [ ] **Step 4: Обновить README**

В `README.md` найти:

```markdown
MCP-сервер запускается Claude Code сам, вручную его поднимать не нужно.
Подключается один раз:

```bash
claude mcp add kanban --scope user --env SUPABASE_URL=... --env SUPABASE_SERVICE_KEY=... -- node <путь-до-репозитория>/mcp/src/index.ts
```
```

Заменить на:

```markdown
MCP-сервер запускается Claude Code сам, вручную его поднимать не нужно.
Два способа подключить:

**Через `.mcpb` (проще)** — Claude Desktop → Settings → Extensions →
Advanced settings → Install Extension… → `mcp/kanban.mcpb` (собирается из
`mcp/manifest.json`, см. план №2). Ключи вводятся в открывшейся форме.

**Через терминал:**

```bash
claude mcp add kanban --scope user --env SUPABASE_URL=... --env SUPABASE_SERVICE_KEY=... -- node <путь-до-репозитория>/mcp/src/index.ts
```
```

- [ ] **Step 5: Коммит**

```bash
git add mcp/manifest.json README.md
git commit -m "Упаковка MCP-сервера в .mcpb для установки через Settings → Extensions"
```

`kanban.mcpb` (собранный бинарник) в git не коммитится — он собирается из `manifest.json` по требованию, как `dist/` для веб-клиента.

- [ ] **Step 6: Добавить `*.mcpb` в `.gitignore`**

В `.gitignore` добавить строку:

```
*.mcpb
```

```bash
git add .gitignore
git commit -m "Игнорировать собранные .mcpb"
```

---

### Task 13: Правило создания проекта в `~/.claude/CLAUDE.md`

**Files:**
- Modify: `~/.claude/CLAUDE.md` (вне репозитория, не коммитится)

**Interfaces:**
- Consumes: инструмент `project` из Task 1

- [ ] **Step 1: Дописать правило в раздел «Канбан»**

В `~/.claude/CLAUDE.md`, в существующей таблице «Работа идёт тремя способами...» (добавлена в плане №1), добавить строку первой в таблице:

```markdown
| Первая настоящая работа в новой папке | подтвердить в чате «завести этот проект на доску?», затем `project(id, name, prefix)`. Разовое подтверждение — не при каждой сессии в уже заведённой папке |
```

Дописать после таблицы, если такого абзаца ещё нет:

```markdown
**Семь инструментов, не шесть.** `project(id, name?, prefix?, description?)`
создаёт проект (если `id` не существует) или обновляет его поля. Создание
проекта — не то же самое, что создание задачи: это новая верхнеуровневая
сущность на доске, поэтому первый раз в новой папке я спрашиваю, а не
завожу молча.
```

- [ ] **Step 2: Проверить живьём**

В новой, ещё не заведённой на доску папке начать реальную работу (не просто `ls`/чтение). Ожидать вопрос в чат «завести этот проект на доску?» прежде, чем появится `project(...)`.

Файл `~/.claude/CLAUDE.md` лежит вне репозитория и не коммитится.

---

## Что дальше

Если после плана №2 останутся направления, которые снова выглядят важнее списка выше — план №3 пишется тем же способом: брейншторм → спека → план, после того как план №2 прожил несколько дней в реальном использовании.
