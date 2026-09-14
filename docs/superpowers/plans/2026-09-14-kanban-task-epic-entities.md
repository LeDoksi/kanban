# Задача и эпик как полноценные сущности — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Задачу и эпик можно полностью создавать, редактировать, удалять и
архивировать из веб-интерфейса, без агента; эпик виден на доске как
заголовок-группировка своих задач и никогда не «теряется».

**Architecture:** Единая модалка создания (`CreateModal`) заменяет
`NewTask`+`NewEpic`. `TaskModal` расширяется инлайн-редактированием,
кнопками статуса/типа, привязкой к эпику, записью комментариев и
архивом/удалением. `EpicModal` (модалка, не экран) заменяет `EpicScreen`.
Видимость эпика на доске (пустой/активный/архивный) вычисляется на лету
одним модулем чистых функций (`epics.ts`), переиспользуемым и в `Board`,
и в модалках — без нового поля в БД. Автоархивация — через `pg_cron`.

**Tech Stack:** React 19, TypeScript strict, Tailwind 4, Supabase (Postgres,
RLS, Realtime), `node --test` для чистых функций.

**Spec:** `docs/superpowers/specs/2026-09-14-kanban-task-epic-entities-design.md`
(и родительская `docs/superpowers/specs/2026-09-11-kanban-design.md` —
модель данных/RLS/MCP не повторяются здесь).

## Global Constraints

- **Тарифы:** только бесплатные (`pg_cron` подтверждён доступным на этом
  проекте Supabase — `default_version: 1.6.4`, не установлен, но в
  списке доступных расширений).
- **Доступ:** RLS остаётся единственной проверкой прав, новых сущностей
  без политики не заводим. Удаление и запись комментариев из веба идут
  через существующие политики `items`/`comments` (анонимный ключ,
  владелец проверяется по email в JWT) — новых политик не требуется.
- **Сервисный ключ Supabase никогда не попадает в репозиторий и в
  браузер.** MCP-сервер (`mcp/`) в этом плане не меняется вообще.
- **Тесты — только на чистые функции.** Только `web/src/epics.ts`
  получает юнит-тесты. Компоненты веб-интерфейса — живьём, без моков.
- **Язык:** комментарии в коде, тексты интерфейса и сообщения коммитов —
  по-русски.
- **Цвет несёт смысл.** Новые элементы используют уже существующие
  токены (`--color-panel`, `--color-line`, `--color-muted`,
  `--color-danger-ink`, `--color-wait`, `--color-ink`, `--color-ground`)
  — новых цветов не заводим.
- **Удаление задачи необратимо** и подтверждается нативным `confirm()`
  браузера — без своей модалки поверх модалки.
- **Не входит в этот план** (обычные баги/полировка, чинятся отдельно,
  без брейншторма): KAN-40 (drag между колонками), KAN-42 (откат
  карточки), KAN-41 (границы колонок), KAN-54 (sticky заголовок),
  KAN-53 (счётчики), KAN-35..39 (техдолг плана №2).

---

### Task 1: `epics.ts` — чистые функции видимости эпика

**Files:**
- Create: `web/src/epics.ts`
- Test: `web/test/epics.test.ts`
- Modify: `web/package.json:11`

**Interfaces:**
- Produces: `epicVisibility(epicId: string, items: Item[]): 'empty' | 'active' | 'archived'`;
  `groupItemsByEpic<T extends { epic_id: string | null }>(items: T[], epics: Epic[]): { epic: Epic; items: T[] }[]`;
  `emptyEpics(epics: Epic[], allItems: Item[]): Epic[]`;
  `selectableEpics(epics: Epic[], allItems: Item[], currentEpicId?: string | null): Epic[]`.
  Все — чистые функции, без побочных эффектов и без обращения к `sb`.

- [ ] **Step 1: Написать падающий тест**

Создать `web/test/epics.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { epicVisibility, groupItemsByEpic, emptyEpics, selectableEpics } from '../src/epics.ts';
import type { Item, Epic } from '../src/supabase.ts';

function mkItem(overrides: Partial<Item>): Item {
  return {
    id: 'KAN-1', seq: 1, project_id: 'kanban', epic_id: null,
    type: 'task', title: 't', body: null, status: 'backlog',
    checklist: [], blocks: [], position: 100,
    closed_at: null, archived_at: null,
    ...overrides,
  };
}

function mkEpic(overrides: Partial<Epic>): Epic {
  return {
    id: 'KAN-E1', seq: 1, project_id: 'kanban', title: 'e',
    goal: null, plan_path: null, spec_path: null, status: 'open', position: 100,
    ...overrides,
  };
}

test('epicVisibility: без задач — empty', () => {
  assert.equal(epicVisibility('KAN-E1', []), 'empty');
});

test('epicVisibility: есть неархивная задача — active', () => {
  const items = [mkItem({ epic_id: 'KAN-E1', archived_at: null })];
  assert.equal(epicVisibility('KAN-E1', items), 'active');
});

test('epicVisibility: все задачи архивные — archived', () => {
  const items = [
    mkItem({ id: 'KAN-1', epic_id: 'KAN-E1', archived_at: '2026-01-01' }),
    mkItem({ id: 'KAN-2', epic_id: 'KAN-E1', archived_at: '2026-01-02' }),
  ];
  assert.equal(epicVisibility('KAN-E1', items), 'archived');
});

test('epicVisibility: чужие задачи не считаются', () => {
  const items = [mkItem({ id: 'KAN-1', epic_id: 'KAN-E2', archived_at: null })];
  assert.equal(epicVisibility('KAN-E1', items), 'empty');
});

test('groupItemsByEpic: группирует и сортирует по position эпика', () => {
  const epics = [
    mkEpic({ id: 'KAN-E2', position: 200 }),
    mkEpic({ id: 'KAN-E1', position: 100 }),
  ];
  const items = [
    mkItem({ id: 'KAN-1', epic_id: 'KAN-E2' }),
    mkItem({ id: 'KAN-2', epic_id: 'KAN-E1' }),
    mkItem({ id: 'KAN-3', epic_id: null }),
  ];
  const groups = groupItemsByEpic(items, epics);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].epic.id, 'KAN-E1');
  assert.deepEqual(groups[0].items.map(i => i.id), ['KAN-2']);
  assert.equal(groups[1].epic.id, 'KAN-E2');
});

test('groupItemsByEpic: игнорирует задачи с неизвестным epic_id', () => {
  const epics = [mkEpic({ id: 'KAN-E1' })];
  const items = [mkItem({ id: 'KAN-1', epic_id: 'KAN-E404' })];
  assert.deepEqual(groupItemsByEpic(items, epics), []);
});

test('emptyEpics: только эпики без единой задачи, отсортированы', () => {
  const epics = [
    mkEpic({ id: 'KAN-E2', position: 200 }),
    mkEpic({ id: 'KAN-E1', position: 100 }),
    mkEpic({ id: 'KAN-E3', position: 300 }),
  ];
  const items = [mkItem({ epic_id: 'KAN-E3' })];
  const result = emptyEpics(epics, items);
  assert.deepEqual(result.map(e => e.id), ['KAN-E1', 'KAN-E2']);
});

test('selectableEpics: архивный эпик исключается', () => {
  const epics = [mkEpic({ id: 'KAN-E1' }), mkEpic({ id: 'KAN-E2' })];
  const items = [
    mkItem({ id: 'KAN-1', epic_id: 'KAN-E1', archived_at: '2026-01-01' }),
  ];
  const result = selectableEpics(epics, items);
  assert.deepEqual(result.map(e => e.id), ['KAN-E2']);
});

test('selectableEpics: пустой и активный эпик остаются', () => {
  const epics = [mkEpic({ id: 'KAN-E1' }), mkEpic({ id: 'KAN-E2' })];
  const items = [mkItem({ id: 'KAN-1', epic_id: 'KAN-E1', archived_at: null })];
  const result = selectableEpics(epics, items);
  assert.deepEqual(result.map(e => e.id).sort(), ['KAN-E1', 'KAN-E2']);
});

test('selectableEpics: текущий эпик задачи остаётся, даже если архивный', () => {
  const epics = [mkEpic({ id: 'KAN-E1' })];
  const items = [mkItem({ id: 'KAN-1', epic_id: 'KAN-E1', archived_at: '2026-01-01' })];
  const result = selectableEpics(epics, items, 'KAN-E1');
  assert.deepEqual(result.map(e => e.id), ['KAN-E1']);
});
```

- [ ] **Step 2: Прогнать тест — должен падать**

Run: `cd web && node --test test/epics.test.ts`
Expected: FAIL — `Cannot find module '../src/epics.ts'`.

- [ ] **Step 3: Написать `web/src/epics.ts`**

```ts
import type { Item, Epic } from './supabase';

export type EpicVisibility = 'empty' | 'active' | 'archived';

export function epicVisibility(epicId: string, items: Item[]): EpicVisibility {
  const own = items.filter(i => i.epic_id === epicId);
  if (own.length === 0) return 'empty';
  return own.some(i => !i.archived_at) ? 'active' : 'archived';
}

export function groupItemsByEpic<T extends { epic_id: string | null }>(
  items: T[], epics: Epic[],
): { epic: Epic; items: T[] }[] {
  const byId = new Map(epics.map(e => [e.id, e] as const));
  const groups = new Map<string, T[]>();
  for (const item of items) {
    if (!item.epic_id || !byId.has(item.epic_id)) continue;
    const list = groups.get(item.epic_id) ?? [];
    list.push(item);
    groups.set(item.epic_id, list);
  }
  return epics
    .filter(e => groups.has(e.id))
    .sort((a, b) => a.position - b.position)
    .map(epic => ({ epic, items: groups.get(epic.id)! }));
}

export function emptyEpics(epics: Epic[], allItems: Item[]): Epic[] {
  return epics
    .filter(e => epicVisibility(e.id, allItems) === 'empty')
    .sort((a, b) => a.position - b.position);
}

export function selectableEpics(
  epics: Epic[], allItems: Item[], currentEpicId?: string | null,
): Epic[] {
  return epics
    .filter(e => epicVisibility(e.id, allItems) !== 'archived' || e.id === currentEpicId)
    .sort((a, b) => a.position - b.position);
}
```

- [ ] **Step 4: Прогнать тест — должен пройти**

Run: `cd web && node --test test/epics.test.ts`
Expected: PASS, все 10 тестов зелёные.

- [ ] **Step 5: Добавить в `npm test` веб-клиента**

В `web/package.json:11` найти:
```json
    "test": "node --test test/guess.test.ts test/position.test.ts"
```
Заменить на:
```json
    "test": "node --test test/guess.test.ts test/position.test.ts test/epics.test.ts"
```

- [ ] **Step 6: Коммит**

```bash
git add web/src/epics.ts web/test/epics.test.ts web/package.json
git commit -m "epics.ts: видимость эпика (пустой/активный/архивный), группировка задач по эпику"
```

---

### Task 2: Единая модалка создания (`CreateModal`)

**Files:**
- Create: `web/src/CreateModal.tsx`
- Modify: `web/src/Board.tsx`
- Delete: `web/src/NewTask.tsx`
- Delete: `web/src/NewEpic.tsx`

**Interfaces:**
- Consumes: `selectableEpics` из Task 1 (`epics.ts`); `sb`, `Item`, `Epic` из `supabase.ts`; `guessType`, `stripPrefix` из `guess.ts` (без изменений).
- Produces: `CreateModal({ project, epics, items, onClose, onCreated }: { project: string; epics: Epic[]; items: Item[]; onClose: () => void; onCreated: () => void })`.
  Board получает состояние `epics: Epic[]` (с загрузкой и Realtime-подпиской) и `showCreate: boolean` — используются последующими задачами (4, 6, 7).

- [ ] **Step 1: Написать `web/src/CreateModal.tsx`**

```tsx
import { useState } from 'react';
import { sb } from './supabase';
import type { Item, Epic } from './supabase';
import { guessType, stripPrefix } from './guess';
import { selectableEpics } from './epics';

export function CreateModal(
  { project, epics, items, onClose, onCreated }: {
    project: string; epics: Epic[]; items: Item[];
    onClose: () => void; onCreated: () => void;
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

    const { data: seqData, error: seqErr } = await sb
      .rpc('next_seq', { p_project: project, p_kind: 'item' });
    if (seqErr) { setError(seqErr.message); setBusy(false); return; }

    const { data: p, error: pErr } = await sb.from('projects')
      .select('prefix').eq('id', project).single();
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
    onCreated();
    onClose();
  };

  const submitEpic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!epicTitle.trim()) { setError('Напиши заголовок эпика'); return; }
    setBusy(true);

    const { data: seq, error: seqErr } = await sb
      .rpc('next_seq', { p_project: project, p_kind: 'epic' });
    if (seqErr) { setError(seqErr.message); setBusy(false); return; }

    const { data: p, error: pErr } = await sb.from('projects')
      .select('prefix').eq('id', project).single();
    if (pErr || !p) { setError(pErr?.message ?? 'Проект не найден'); setBusy(false); return; }

    const id = `${p.prefix}-E${seq}`;
    const { error } = await sb.from('epics').insert({
      id, seq, project_id: project,
      title: epicTitle.trim(), goal: goal.trim() || null,
      position: seq * 100,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    onCreated();
    onClose();
  };

  const options = selectableEpics(epics, items);

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-(--color-ground) rounded-lg max-w-md w-full p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-1.5">
            {(['task', 'epic'] as const).map(k => (
              <button
                key={k}
                type="button"
                onClick={() => { setKind(k); setError(''); }}
                className={`text-sm px-3 py-1 rounded-full border ${
                  kind === k
                    ? 'border-(--color-muted)'
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
            className="text-(--color-muted) text-lg leading-none"
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
                         focus:border-(--color-muted)"
            />
            <div className="flex gap-1.5">
              {(['task', 'bug', 'chore'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setType(t); setTouched(true); }}
                  className={`text-[11px] px-2 py-1 rounded-full border ${
                    type === t
                      ? 'border-(--color-muted)'
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
            <button
              type="submit"
              disabled={busy}
              className="w-full h-8 rounded-lg bg-(--color-ink)
                         text-(--color-ground) text-sm"
            >
              {busy ? '…' : 'В Backlog'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitEpic} className="space-y-2">
            <input
              autoFocus
              value={epicTitle}
              onChange={e => { setEpicTitle(e.target.value); setError(''); }}
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
            <button
              type="submit"
              disabled={busy}
              className="w-full h-8 rounded-lg bg-(--color-ink)
                         text-(--color-ground) text-sm"
            >
              {busy ? '…' : 'Создать'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
```

Заметь: чек-лист не входит в форму создания — его не было и в текущем
`NewTask.tsx` (задача создаётся с пустым чеклистом, пункты добавляются
через агента). Это единая замена двух существующих форм, без новых
полей сверх того, что каждая из них уже умела.

- [ ] **Step 2: Подключить в `Board.tsx` — состояние и загрузка эпиков**

В `web/src/Board.tsx` найти:
```tsx
import { NewTask } from './NewTask';
import { NewProject } from './NewProject';
import { NewEpic } from './NewEpic';
import { TaskModal } from './TaskModal';
```
Заменить на:
```tsx
import { NewProject } from './NewProject';
import { CreateModal } from './CreateModal';
import { TaskModal } from './TaskModal';
```

Найти:
```tsx
import { between } from './position';
```
Заменить на:
```tsx
import { between } from './position';
import type { Epic } from './supabase';
```

Найти:
```tsx
  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<string>('');
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState('');
  const [openItem, setOpenItem] = useState<Item | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [viewEpic, setViewEpic] = useState<string | null>(null);
  const [viewAll, setViewAll] = useState(false);
```
Заменить на:
```tsx
  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<string>('');
  const [items, setItems] = useState<Item[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [err, setErr] = useState('');
  const [openItem, setOpenItem] = useState<Item | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [viewEpic, setViewEpic] = useState<string | null>(null);
  const [viewAll, setViewAll] = useState(false);
```

Найти:
```tsx
  const reloadProjects = async (keepCurrent = true) => {
```
Перед этой строкой вставить:
```tsx
  const reloadEpics = async (project: string) => {
    if (!project) return;
    const { data, error } = await sb.from('epics').select('*')
      .eq('project_id', project).order('position');
    if (error) { setErr(error.message); return; }
    setEpics((data ?? []) as Epic[]);
  };

```

Найти:
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
Заменить на:
```tsx
  useEffect(() => {
    reload(current);
    reloadEpics(current);
    if (!current) return;

    // Пока агент пишет через MCP, доска обновляется сама — без кнопки
    // «обновить» и без опроса по таймеру. epics тоже в publication
    // (план №2, Task 10) — эпик, созданный или переименованный агентом,
    // тоже появляется без перезагрузки.
    const channel = sb
      .channel(`items-${current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `project_id=eq.${current}` },
        () => reload(current),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'epics', filter: `project_id=eq.${current}` },
        () => reloadEpics(current),
      )
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [current]);
```

- [ ] **Step 3: Заменить кнопки создания в шапке**

Найти:
```tsx
        <div className="ml-auto flex gap-2">
          <NewProject onCreated={id => { reloadProjects(); setCurrent(id); }} />
          <NewEpic project={current} onCreated={id => { reload(current); setViewEpic(id); }} />
          <NewTask project={current} onAdded={() => reload(current)} />
        </div>
```
Заменить на:
```tsx
        <div className="ml-auto flex gap-2">
          <NewProject onCreated={id => { reloadProjects(); setCurrent(id); }} />
          <button
            onClick={() => setShowCreate(true)}
            className="h-8 px-3 rounded-lg bg-(--color-ink)
                       text-(--color-ground) text-sm"
          >
            Новая задача
          </button>
        </div>
```

- [ ] **Step 4: Отрендерить `CreateModal`**

Найти:
```tsx
      {showArchive && (
        <ArchiveList
          items={archiveItems}
          onOpen={i => { setShowArchive(false); setOpenItem(i); }}
          onClose={() => setShowArchive(false)}
        />
      )}
    </div>
  );
}
```
Заменить на:
```tsx
      {showArchive && (
        <ArchiveList
          items={archiveItems}
          onOpen={i => { setShowArchive(false); setOpenItem(i); }}
          onClose={() => setShowArchive(false)}
        />
      )}

      {showCreate && (
        <CreateModal
          project={current}
          epics={epics}
          items={items}
          onClose={() => setShowCreate(false)}
          onCreated={() => { reload(current); reloadEpics(current); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Удалить старые файлы**

```bash
git rm web/src/NewTask.tsx web/src/NewEpic.tsx
```

- [ ] **Step 6: Проверить сборку**

Run: `cd web && npm run build`
Expected: чисто (никаких упоминаний `NewTask`/`NewEpic` не осталось —
`viewEpic`/`EpicScreen` ветка ещё жива до Task 6, трогать её рано).

- [ ] **Step 7: Проверить живьём**

На реальном сайте: кнопка «Новая задача» открывает модалку с
переключателем «Задача/Эпик»; создание задачи (с привязкой к эпику и
без) и создание эпика оба работают, модалка закрывается, доска
обновляется.

- [ ] **Step 8: Коммит**

```bash
git add web/src/CreateModal.tsx web/src/Board.tsx
git commit -m "Единая модалка создания задачи/эпика вместо NewTask+NewEpic"
```

---

### Task 3: `TaskModal` — инлайн-редактирование, кнопки статуса и типа

**Files:**
- Modify: `web/src/TaskModal.tsx` (переписывается целиком — большая часть файла меняется)

**Interfaces:**
- Consumes: без изменений сигнатуры `TaskModal({ item, onClose, onChanged, onOpenEpic })` — новые пропсы появятся в Task 4.
- Produces: тот же экспорт `TaskModal`, теперь с кнопками статуса/типа вместо `<select>` и инлайн-редактированием заголовка/тела. Task 4 и Task 5 дальше модифицируют этот же файл.

- [ ] **Step 1: Переписать `web/src/TaskModal.tsx` целиком**

```tsx
import { useEffect, useState } from 'react';
import { sb } from './supabase';
import type { Item, Comment } from './supabase';

const STATUS_LABEL: Record<Item['status'], string> = {
  backlog: 'Backlog', doing: 'В работе',
  waiting: 'Нужно от тебя', done: 'Готово',
};

const TYPE_LABEL: Record<Item['type'], string> = {
  task: 'задача', bug: 'баг', chore: 'долг',
};

export function TaskModal(
  { item, onClose, onChanged, onOpenEpic }: {
    item: Item; onClose: () => void; onChanged: () => void;
    onOpenEpic?: (epicId: string) => void;
  },
) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [err, setErr] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingBody, setEditingBody] = useState(false);
  const [titleDraft, setTitleDraft] = useState(item.title);
  const [bodyDraft, setBodyDraft] = useState(item.body ?? '');

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
    const { error } = await sb.from('items').update({
      status, closed_at: status === 'done' ? new Date().toISOString() : null,
    }).eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
  };

  const setType = async (type: Item['type']) => {
    const { error } = await sb.from('items').update({ type }).eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
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
          <div className="flex-1">
            <span className="text-[11px] font-mono text-(--color-muted)">
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
              <h2
                onClick={() => setEditingTitle(true)}
                className="text-base font-medium cursor-text"
              >
                {item.title}
              </h2>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="text-(--color-muted) text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-2">
          {(Object.keys(STATUS_LABEL) as Item['status'][]).map(s => (
            <button
              key={s}
              onClick={() => move(s)}
              className={`text-[11px] px-2 py-1 rounded-full border ${
                item.status === s
                  ? 'border-(--color-muted)'
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
              className={`text-[11px] px-2 py-1 rounded-full border ${
                item.type === t
                  ? 'border-(--color-muted)'
                  : 'border-(--color-line) text-(--color-muted)'
              }`}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        {item.epic_id && onOpenEpic && (
          <button
            onClick={() => onOpenEpic(item.epic_id!)}
            className="text-xs text-(--color-muted) underline block mb-3"
          >
            эпик: {item.epic_id}
          </button>
        )}

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
                       border border-(--color-line) outline-none resize-none"
          />
        ) : (
          <p
            onClick={() => setEditingBody(true)}
            className="text-sm whitespace-pre-wrap mb-4 cursor-text min-h-[1.5em]"
          >
            {item.body || (
              <span className="text-(--color-muted)">описание — клик, чтобы добавить</span>
            )}
          </p>
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

- [ ] **Step 2: Проверить сборку**

Run: `cd web && npm run build`
Expected: чисто.

- [ ] **Step 3: Проверить живьём**

На реальной задаче: клик по заголовку/телу превращает в поле ввода,
Enter/потеря фокуса сохраняет; кнопки статуса и типа переключают и
пишутся в базу (видно по обновлению карточки на доске).

- [ ] **Step 4: Коммит**

```bash
git add web/src/TaskModal.tsx
git commit -m "TaskModal: инлайн-редактирование заголовка/тела, кнопки статуса и типа вместо select"
```

---

### Task 4: `TaskModal` — привязка к эпику и запись комментариев

**Files:**
- Modify: `web/src/TaskModal.tsx`
- Modify: `web/src/Board.tsx`

**Interfaces:**
- Consumes: `selectableEpics` из Task 1; `epics`/`items` состояние из Task 2 (Board).
- Produces: `TaskModal` получает новые обязательные пропсы `epics: Epic[]` и `allItems: Item[]`.

- [ ] **Step 1: Передать новые пропсы из `Board.tsx`**

Найти (первое вхождение, внутри `viewEpic`-ветки):
```tsx
        {openItem && (
          <TaskModal
            item={openItem}
            onClose={() => setOpenItem(null)}
            // ponytail: список экрана эпика не перечитывается на месте
            // после правки через модалку — только при повторном заходе
            // на экран. Обновить, если статус внутри эпика станет менять
            // хотя бы каждый второй заход.
            onChanged={() => setOpenItem(null)}
            onOpenEpic={id => { setOpenItem(null); setViewEpic(id); }}
          />
        )}
```
Заменить на:
```tsx
        {openItem && (
          <TaskModal
            item={openItem}
            epics={epics}
            allItems={items}
            onClose={() => setOpenItem(null)}
            // ponytail: список экрана эпика не перечитывается на месте
            // после правки через модалку — только при повторном заходе
            // на экран. Обновить, если статус внутри эпика станет менять
            // хотя бы каждый второй заход.
            onChanged={() => setOpenItem(null)}
            onOpenEpic={id => { setOpenItem(null); setViewEpic(id); }}
          />
        )}
```

Найти (второе вхождение, основной рендер доски):
```tsx
      {openItem && (
        <TaskModal
          item={openItem}
          onClose={() => setOpenItem(null)}
          onChanged={() => reload(current)}
          onOpenEpic={id => { setOpenItem(null); setViewEpic(id); }}
        />
      )}
```
Заменить на:
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

- [ ] **Step 2: Расширить сигнатуру и импорты `TaskModal.tsx`**

Найти:
```tsx
import { useEffect, useState } from 'react';
import { sb } from './supabase';
import type { Item, Comment } from './supabase';
```
Заменить на:
```tsx
import { useEffect, useState } from 'react';
import { sb } from './supabase';
import type { Item, Comment, Epic } from './supabase';
import { selectableEpics } from './epics';
```

Найти:
```tsx
export function TaskModal(
  { item, onClose, onChanged, onOpenEpic }: {
    item: Item; onClose: () => void; onChanged: () => void;
    onOpenEpic?: (epicId: string) => void;
  },
) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [err, setErr] = useState('');
```
Заменить на:
```tsx
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
```

- [ ] **Step 3: Добавить обработчики привязки к эпику и отправки комментария**

Найти:
```tsx
  const setType = async (type: Item['type']) => {
    const { error } = await sb.from('items').update({ type }).eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
  };
```
После этого блока вставить:
```tsx

  const setEpic = async (epicId: string) => {
    const { error } = await sb.from('items')
      .update({ epic_id: epicId || null }).eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
  };

  const sendComment = async () => {
    const text = newComment.trim();
    if (!text) return;
    const { error } = await sb.from('comments')
      .insert({ item_id: item.id, author: 'me', body: text });
    if (error) { setErr(error.message); return; }
    setNewComment('');
    const { data, error: readErr } = await sb.from('comments').select('*')
      .eq('item_id', item.id).order('created_at');
    if (readErr) { setErr(readErr.message); return; }
    setComments((data ?? []) as Comment[]);
  };
```

- [ ] **Step 4: Заменить ссылку «эпик: …» на строку с выбором + ссылкой**

Найти:
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
Заменить на:
```tsx
        <div className="flex items-center gap-2 mb-3">
          <select
            value={item.epic_id ?? ''}
            onChange={e => setEpic(e.target.value)}
            className="h-7 px-1.5 rounded text-[11px] bg-transparent
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
              className="text-xs text-(--color-muted) underline"
            >
              открыть эпик
            </button>
          )}
        </div>
```

- [ ] **Step 5: Добавить форму комментария под существующим списком**

Найти:
```tsx
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
Заменить на:
```tsx
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
              className="flex-1 h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                         border border-(--color-line) outline-none"
            />
            <button
              onClick={sendComment}
              disabled={!newComment.trim()}
              className="h-8 px-3 rounded-lg bg-(--color-ink) text-(--color-ground)
                         text-sm disabled:opacity-40"
            >
              Отправить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Проверить сборку**

Run: `cd web && npm run build`
Expected: чисто.

- [ ] **Step 7: Проверить живьём**

На реальной задаче: выбор эпика из списка меняет привязку (видно на
доске — карточка переезжает под нужный заголовок после Task 7, а пока
хотя бы факт записи проверить через `get` в MCP или SQL); написать
комментарий — появляется в списке с автором «me».

- [ ] **Step 8: Коммит**

```bash
git add web/src/TaskModal.tsx web/src/Board.tsx
git commit -m "TaskModal: привязка/отвязка эпика и запись комментариев из веба"
```

---

### Task 5: `TaskModal` — архив, возврат из архива, удаление

**Files:**
- Modify: `web/src/TaskModal.tsx`

**Interfaces:**
- Consumes: ничего нового.
- Produces: без изменений сигнатуры `TaskModal`.

- [ ] **Step 1: Добавить обработчики**

Найти:
```tsx
  const sendComment = async () => {
```
Перед этой строкой вставить:
```tsx
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
    onClose();
  };

```

- [ ] **Step 2: Добавить кнопки внизу модалки**

Найти:
```tsx
          <div className="flex gap-2">
            <input
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendComment(); }}
              placeholder="комментарий"
              className="flex-1 h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                         border border-(--color-line) outline-none"
            />
            <button
              onClick={sendComment}
              disabled={!newComment.trim()}
              className="h-8 px-3 rounded-lg bg-(--color-ink) text-(--color-ground)
                         text-sm disabled:opacity-40"
            >
              Отправить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```
Заменить на:
```tsx
          <div className="flex gap-2">
            <input
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendComment(); }}
              placeholder="комментарий"
              className="flex-1 h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                         border border-(--color-line) outline-none"
            />
            <button
              onClick={sendComment}
              disabled={!newComment.trim()}
              className="h-8 px-3 rounded-lg bg-(--color-ink) text-(--color-ground)
                         text-sm disabled:opacity-40"
            >
              Отправить
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-4 pt-3 border-t border-(--color-line)">
          {item.status === 'done' && !item.archived_at && (
            <button onClick={archive} className="text-xs text-(--color-muted)">
              В архив
            </button>
          )}
          {item.archived_at && (
            <button onClick={restore} className="text-xs text-(--color-muted)">
              Вернуть в работу
            </button>
          )}
          <button onClick={remove} className="text-xs text-(--color-danger-ink) ml-auto">
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Проверить сборку**

Run: `cd web && npm run build`
Expected: чисто.

- [ ] **Step 4: Проверить живьём**

Создать тестовую задачу через `CreateModal`, перевести в «Готово»,
открыть модалку — появилась кнопка «В архив», нажать — задача уходит
в архив; открыть архивную задачу — кнопка «Вернуть в работу», нажать —
статус становится «В работе». Затем создать ещё одну тестовую задачу
и удалить её кнопкой «Удалить» с подтверждением — убедиться, что
строка реально пропала (не просто заархивирована).

- [ ] **Step 5: Коммит**

```bash
git add web/src/TaskModal.tsx
git commit -m "TaskModal: архив, возврат из архива и удаление задачи"
```

---

### Task 6: `EpicModal` — модалка эпика вместо экрана

**Files:**
- Create: `web/src/EpicModal.tsx`
- Modify: `web/src/Board.tsx`
- Delete: `web/src/EpicScreen.tsx`

**Interfaces:**
- Consumes: `Item`, `Epic` из `supabase.ts`.
- Produces: `EpicModal({ epicId, onClose, onOpenItem }: { epicId: string; onClose: () => void; onOpenItem: (item: Item) => void })`.
  Board теряет `viewEpic`-раннюю-ветку рендера — переиспользуется в Task 7 то же состояние `viewEpicId`.

- [ ] **Step 1: Написать `web/src/EpicModal.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { sb } from './supabase';
import type { Item, Epic } from './supabase';

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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

  const done = items.filter(i => i.status === 'done' || i.archived_at).length;

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
              <h1
                onClick={() => setEditingTitle(true)}
                className="text-lg font-medium cursor-text"
              >
                {epic?.title}
              </h1>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="text-(--color-muted) text-lg leading-none"
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
                       border border-(--color-line) outline-none resize-none"
          />
        ) : (
          <p
            onClick={() => setEditingGoal(true)}
            className="text-sm text-(--color-muted) mb-3 cursor-text min-h-[1.3em]"
          >
            {epic?.goal || 'цель — клик, чтобы добавить'}
          </p>
        )}

        <div className="flex items-center gap-3 mb-5 text-sm text-(--color-muted)">
          <span>{done}/{items.length}</span>
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
          {items.length === 0 && (
            <p className="text-sm text-(--color-muted)">Пока без задач.</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Заменить `viewEpic`-ветку в `Board.tsx` на модалку**

Найти:
```tsx
import { TaskModal } from './TaskModal';
import { ArchiveList } from './ArchiveList';
import { EpicScreen } from './EpicScreen';
import { AllProjects } from './AllProjects';
```
Заменить на:
```tsx
import { TaskModal } from './TaskModal';
import { ArchiveList } from './ArchiveList';
import { EpicModal } from './EpicModal';
import { AllProjects } from './AllProjects';
```

Найти:
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
            epics={epics}
            allItems={items}
            onClose={() => setOpenItem(null)}
            // ponytail: список экрана эпика не перечитывается на месте
            // после правки через модалку — только при повторном заходе
            // на экран. Обновить, если статус внутри эпика станет менять
            // хотя бы каждый второй заход.
            onChanged={() => setOpenItem(null)}
            onOpenEpic={id => { setOpenItem(null); setViewEpic(id); }}
          />
        )}
      </>
    );
  }

  const onDragEnd = async (e: DragEndEvent) => {
```
Заменить на:
```tsx
  const onDragEnd = async (e: DragEndEvent) => {
```

Найти:
```tsx
      {showCreate && (
        <CreateModal
          project={current}
          epics={epics}
          items={items}
          onClose={() => setShowCreate(false)}
          onCreated={() => { reload(current); reloadEpics(current); }}
        />
      )}
    </div>
  );
}
```
Заменить на:
```tsx
      {showCreate && (
        <CreateModal
          project={current}
          epics={epics}
          items={items}
          onClose={() => setShowCreate(false)}
          onCreated={() => { reload(current); reloadEpics(current); }}
        />
      )}

      {viewEpic && (
        <EpicModal
          epicId={viewEpic}
          onClose={() => setViewEpic(null)}
          onOpenItem={i => { setViewEpic(null); setOpenItem(i); }}
        />
      )}
    </div>
  );
}
```

`viewEpic`-состояние и его сеттер уже существуют (заведены до Task 2) —
переиспользуются как есть, просто вместо полноэкранной ветки теперь
рендерят модалку рядом с остальными.

- [ ] **Step 3: Удалить `EpicScreen.tsx`**

```bash
git rm web/src/EpicScreen.tsx
```

- [ ] **Step 4: Проверить сборку**

Run: `cd web && npm run build`
Expected: чисто.

- [ ] **Step 5: Проверить живьём**

Открыть задачу с эпиком → «открыть эпик» → открывается `EpicModal`
поверх доски (не переход на отдельную страницу); клик по задаче в
списке эпика открывает её `TaskModal`, `EpicModal` при этом закрывается
(как у архива); инлайн-редактирование заголовка/цели эпика работает.

- [ ] **Step 6: Коммит**

```bash
git add web/src/EpicModal.tsx web/src/Board.tsx
git commit -m "EpicModal вместо EpicScreen: модалка вместо отдельного экрана, инлайн-правка заголовка/цели"
```

---

### Task 7: `Board.tsx` — заголовки эпиков над кластерами задач

**Files:**
- Modify: `web/src/Board.tsx`

**Interfaces:**
- Consumes: `groupItemsByEpic`, `emptyEpics` из Task 1 (`epics.ts`).
- Produces: `Column` получает новые пропсы `epics: Epic[]`, `allItems: Item[]`, `onOpenEpic: (epicId: string) => void`.

- [ ] **Step 1: Импортировать функции группировки**

Найти:
```tsx
import { between } from './position';
import type { Epic } from './supabase';
```
Заменить на:
```tsx
import { between } from './position';
import { groupItemsByEpic, emptyEpics } from './epics';
import type { Epic } from './supabase';
```

- [ ] **Step 2: Передать новые пропсы в `Column`**

Найти:
```tsx
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
```
Заменить на:
```tsx
          {COLUMNS.map(col => (
            <Column
              key={col.key}
              col={col}
              items={items.filter(i => i.status === col.key && !i.archived_at)}
              epics={epics}
              allItems={items}
              archivedCount={archivedCount}
              onChanged={() => reload(current)}
              onError={setErr}
              onOpen={setOpenItem}
              onOpenEpic={id => setViewEpic(id)}
              onShowArchive={() => setShowArchive(true)}
            />
          ))}
```

- [ ] **Step 3: Переписать `Column` с группировкой**

Найти:
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
      <SortableContext items={list.map(i => i.id)} strategy={verticalListSortingStrategy}>
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
      </SortableContext>
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
Заменить на:
```tsx
function Column(
  { col, items, epics, allItems, archivedCount, onChanged, onError, onOpen, onOpenEpic, onShowArchive }: {
    col: typeof COLUMNS[number]; items: Item[]; epics: Epic[]; allItems: Item[];
    archivedCount: number;
    onChanged: () => void; onError: (msg: string) => void;
    onOpen: (item: Item) => void; onOpenEpic: (epicId: string) => void;
    onShowArchive: () => void;
  },
) {
  const { setNodeRef } = useDroppable({ id: col.key });

  // «Готово» — единственная колонка, которая обрезается: открытые задачи
  // не должны прятаться, а закрытых со временем становится много.
  // Сортируем по дате закрытия — «последние несколько» значит недавно
  // завершённые, а не недавно созданные. Группировка по эпику — уже
  // поверх этого обрезанного списка, кап не меняется.
  const capped = col.key === 'done';
  const full = capped
    ? [...items].sort(
        (a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''))
    : items;
  const list = capped ? full.slice(0, DONE_SHOWN) : full;
  const hiddenDone = capped ? full.length - list.length : 0;

  const groups = groupItemsByEpic(list, epics);
  const groupedIds = new Set(groups.flatMap(g => g.items.map(i => i.id)));
  const ungrouped = list.filter(i => !groupedIds.has(i.id));
  // Пустые эпики (ни одной задачи вообще) торчат только в Backlog —
  // это их «домашняя» колонка, иначе эпик без задач нигде не виден.
  const pinnedEmpty = col.key === 'backlog' ? emptyEpics(epics, allItems) : [];

  const epicProgress = (epicId: string) => {
    const own = allItems.filter(i => i.epic_id === epicId);
    const done = own.filter(i => i.status === 'done' || i.archived_at).length;
    return `${done}/${own.length}`;
  };

  return (
    <section ref={setNodeRef}>
      <h2 className="text-xs text-(--color-muted) mb-2 px-1">
        {col.label} {full.length > 0 && full.length}
      </h2>
      <SortableContext items={list.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {groups.map(({ epic, items: epicItems }) => (
            <div key={epic.id}>
              <button
                onClick={() => onOpenEpic(epic.id)}
                className="text-[11px] text-(--color-muted) underline mb-1 px-1"
              >
                {epic.title} ({epicProgress(epic.id)})
              </button>
              <div className="space-y-2">
                {epicItems.map(i => (
                  <Card key={i.id} item={i} onChanged={onChanged} onError={onError} onOpen={onOpen} />
                ))}
              </div>
            </div>
          ))}
          {pinnedEmpty.map(epic => (
            <button
              key={epic.id}
              onClick={() => onOpenEpic(epic.id)}
              className="text-[11px] text-(--color-muted) underline px-1 block"
            >
              {epic.title} (0/0)
            </button>
          ))}
          {ungrouped.length > 0 && (
            <div className="space-y-2">
              {ungrouped.map(i => (
                <Card key={i.id} item={i} onChanged={onChanged} onError={onError} onOpen={onOpen} />
              ))}
            </div>
          )}
        </div>
      </SortableContext>
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

- [ ] **Step 4: Проверить сборку**

Run: `cd web && npm run build`
Expected: чисто.

- [ ] **Step 5: Проверить живьём**

Создать тестовый эпик без задач — виден заголовком в Backlog. Создать
задачу с привязкой к нему в Backlog — задача появляется под тем же
заголовком (не отдельным пунктом). Перевести задачу в «В работе» —
заголовок эпика появляется в колонке «В работе», а в Backlog пропадает
(эпик больше не пустой). Заархивировать (или удалить) все задачи эпика
— заголовок исчезает отовсюду, включая Backlog.

- [ ] **Step 6: Коммит**

```bash
git add web/src/Board.tsx
git commit -m "Заголовки эпиков над кластерами задач в колонках; пустой эпик закреплён в Backlog"
```

---

### Task 8: `ArchiveList` — вернуть в работу прямо из списка

**Files:**
- Modify: `web/src/ArchiveList.tsx`
- Modify: `web/src/Board.tsx`

**Interfaces:**
- Consumes: ничего нового.
- Produces: `ArchiveList` получает новый проп `onRestore: (item: Item) => void`.

- [ ] **Step 1: Добавить кнопку и проп**

Найти:
```tsx
import type { Item } from './supabase';

export function ArchiveList(
  { items, onOpen, onClose }: {
    items: Item[]; onOpen: (item: Item) => void; onClose: () => void;
  },
) {
```
Заменить на:
```tsx
import type { Item } from './supabase';

export function ArchiveList(
  { items, onOpen, onRestore, onClose }: {
    items: Item[]; onOpen: (item: Item) => void;
    onRestore: (item: Item) => void; onClose: () => void;
  },
) {
```

Найти:
```tsx
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
```
Заменить на:
```tsx
        <div className="space-y-1">
          {items.map(i => (
            <div
              key={i.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded
                         hover:bg-(--color-panel)"
            >
              <button
                onClick={() => onOpen(i)}
                className="flex-1 text-left text-sm"
              >
                <span className="text-[11px] font-mono text-(--color-muted) mr-2">
                  {i.id}
                </span>
                {i.title}
              </button>
              {i.archived_at && (
                <button
                  onClick={() => onRestore(i)}
                  className="text-[11px] text-(--color-muted) underline shrink-0"
                >
                  вернуть в работу
                </button>
              )}
            </div>
          ))}
        </div>
```

- [ ] **Step 2: Передать обработчик из `Board.tsx`**

Найти:
```tsx
      {showArchive && (
        <ArchiveList
          items={archiveItems}
          onOpen={i => { setShowArchive(false); setOpenItem(i); }}
          onClose={() => setShowArchive(false)}
        />
      )}
```
Заменить на:
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

- [ ] **Step 3: Проверить сборку**

Run: `cd web && npm run build`
Expected: чисто.

- [ ] **Step 4: Проверить живьём**

Открыть архив — у настоящих архивных строк (`archived_at` есть)
видна кнопка «вернуть в работу»; у строк, попавших в список только
из-за капа `DONE_SHOWN` (не архивных на деле), кнопки нет — верно,
им нечего «возвращать». Нажать кнопку — строка пропадает из архива и
задача появляется в «В работе».

- [ ] **Step 5: Коммит**

```bash
git add web/src/ArchiveList.tsx web/src/Board.tsx
git commit -m "Архив: кнопка «вернуть в работу» прямо на строке"
```

---

### Task 9: Авто-архивация через `pg_cron`

**Files:**
- Create: `supabase/migrations/20260914000000_auto_archive_done.sql`

**Interfaces:**
- Consumes: ничего из предыдущих задач.
- Produces: ежедневная джоба в Postgres, не имеет TS-интерфейса.

- [ ] **Step 1: Написать миграцию**

Создать `supabase/migrations/20260914000000_auto_archive_done.sql`:

```sql
-- pg_cron доступен на бесплатном тарифе Supabase (подтверждено:
-- default_version 1.6.4 в списке расширений проекта на момент
-- написания), но не был включён ни в одной из предыдущих миграций.
create extension if not exists pg_cron with schema extensions;

-- Готовые задачи старше 3 дней уходят в архив сами — без ручного
-- вмешательства и без необходимости открывать сайт.
select cron.schedule(
  'archive-done-items',
  '0 3 * * *',
  $$ update items set archived_at = now()
     where status = 'done' and archived_at is null
       and closed_at < now() - interval '3 days' $$
);
```

- [ ] **Step 2: Применить и проверить живьём** *(шаг контроллера — требует прямого доступа к Supabase, не выполняется subagent'ом в изоляции; см. батч-проверку ниже)*

Применить миграцию через Supabase MCP (`apply_migration`), затем
проверить, что джоба реально зарегистрирована:

```sql
select jobname, schedule, active from cron.job where jobname = 'archive-done-items';
```

Expected: одна строка, `active = true`, `schedule = '0 3 * * *'`.

Полный сквозной тест (реальное трёхдневное ожидание) при проверке не
требуется — проверяется только то, что расширение включилось и джоба
зарегистрирована с правильным SQL-телом; корректность самого запроса
уже проверена вручную (Step 1) построчно.

- [ ] **Step 3: Коммит**

```bash
git add supabase/migrations/20260914000000_auto_archive_done.sql
git commit -m "Автоархивация: готовые задачи старше 3 дней уходят в архив сами (pg_cron)"
```

---

## Порядок и живая проверка

Задачи 1→9 идут последовательно (Task 2 вводит `epics`-состояние в
`Board.tsx`, от которого зависят 3-8; Task 3 переписывает `TaskModal`
целиком, от результата которого зависят find/replace в 4 и 5). После
Task 9 — полный живой прогон: создать эпик и две задачи под ним разных
типов, провести задачу через все статусы кнопками, написать
комментарий, отвязать от эпика и привязать к другому, заархивировать и
вернуть, удалить тестовые данные, свериться что мусора не осталось.
