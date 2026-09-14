# Навигация и структура проекта — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Проект переключается через выезжающую слева шторку (не
выпадающий список), создание проекта сводится к одному полю «имя» со
слагом/префиксом, сгенерированными автоматически, полное описание
проекта редактируется прямо в шапке доски.

**Architecture:** Новый `ProjectDrawer.tsx` заменяет `AllProjects.tsx` и
`<select>` в шапке `Board.tsx`, встраивает упрощённый `NewProject.tsx`.
Слаг/префикс — чистые функции в новом `slug.ts`. Описание проекта в
шапке получает тот же инлайн-редактор, что уже есть у задачи и эпика.

**Tech Stack:** React 19, TypeScript strict, Tailwind 4, Supabase
(Postgres, RLS), `node --test` для чистых функций.

**Spec:** `docs/superpowers/specs/2026-09-14-kanban-project-navigation-design.md`
(родительская: `docs/superpowers/specs/2026-09-11-kanban-design.md`).

## Global Constraints

- Тарифы: только бесплатные — новых сервисов не добавляется.
- Доступ: RLS остаётся единственной проверкой прав, новых сущностей без
  политики не заводим.
- Сервисный ключ Supabase никогда не попадает в репозиторий и в браузер.
  MCP-сервер (`mcp/`) в этом плане не меняется вообще.
- Тесты — только на чистые функции (`slugify`, `prefixify`). Компоненты
  веб-интерфейса — живьём, без моков.
- Язык: комментарии в коде, тексты интерфейса и сообщения коммитов — по-русски.
- Цвет несёт смысл. Новые элементы используют уже существующие токены
  (`--color-panel`, `--color-line`, `--color-muted`, `--color-ink`,
  `--color-ground`, `--color-wait-ink`, `--color-danger-ink`) — новых
  цветов не заводим.

---

### Task 1: `slug.ts` — генерация слага и префикса

**Files:**
- Create: `web/src/slug.ts`
- Test: `web/test/slug.test.ts`
- Modify: `web/package.json:11`

**Interfaces:**
- Produces: `slugify(name: string): string`, `prefixify(slug: string): string`.

- [ ] **Step 1: Написать падающий тест**

Создать `web/test/slug.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, prefixify } from '../src/slug.ts';

test('slugify: транслитерация кириллицы, пробелы в дефисы', () => {
  assert.equal(slugify('Семейное приложение'), 'semeynoe-prilozhenie');
});

test('slugify: латиница проходит как есть, пробелы в дефисы', () => {
  assert.equal(slugify('Family App'), 'family-app');
});

test('slugify: схлопывает повторяющиеся разделители и обрезает края', () => {
  assert.equal(slugify('  Тест!!  Проект  '), 'test-proekt');
});

test('slugify: пусто на входе — пусто на выходе', () => {
  assert.equal(slugify(''), '');
});

test('slugify: строка без букв/цифр — пустой слаг', () => {
  assert.equal(slugify('!!!'), '');
});

test('prefixify: первые 3 буквы слага без дефисов, в верхнем регистре', () => {
  assert.equal(prefixify('semeynoe-prilozhenie'), 'SEM');
  assert.equal(prefixify('family-app'), 'FAM');
});

test('prefixify: короткий слаг — берёт сколько есть', () => {
  assert.equal(prefixify('ab'), 'AB');
});

test('prefixify: пустой слаг — пустой префикс', () => {
  assert.equal(prefixify(''), '');
});
```

- [ ] **Step 2: Прогнать тест — должен падать**

Run: `cd web && node --test test/slug.test.ts`
Expected: FAIL — `Cannot find module '../src/slug.ts'`.

- [ ] **Step 3: Написать `web/src/slug.ts`**

```ts
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh',
  з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya',
};

export function slugify(name: string): string {
  const translit = name.toLowerCase().split('').map(ch => TRANSLIT[ch] ?? ch).join('');
  return translit
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function prefixify(slug: string): string {
  return slug.replace(/-/g, '').slice(0, 3).toUpperCase();
}
```

- [ ] **Step 4: Прогнать тест — должен пройти**

Run: `cd web && node --test test/slug.test.ts`
Expected: PASS, все 9 тестов зелёные.

- [ ] **Step 5: Добавить в `npm test` веб-клиента**

В `web/package.json:11` найти:
```json
    "test": "node --test test/guess.test.ts test/position.test.ts test/epics.test.ts"
```
Заменить на:
```json
    "test": "node --test test/guess.test.ts test/position.test.ts test/epics.test.ts test/slug.test.ts"
```

- [ ] **Step 6: Коммит**

```bash
git add web/src/slug.ts web/test/slug.test.ts web/package.json
git commit -m "slug.ts: генерация слага и префикса проекта из имени"
```

---

### Task 2: `NewProject.tsx` — упрощённая форма (имя → слаг/префикс автоматически)

**Files:**
- Modify: `web/src/NewProject.tsx` (переписывается целиком)

**Interfaces:**
- Consumes: `slugify`, `prefixify` из Task 1 (`slug.ts`).
- Produces: тот же экспорт и та же внешняя сигнатура —
  `NewProject({ onCreated: (id: string) => void })`. Внутренние поля
  меняются, публичный интерфейс компонента — нет, поэтому `Board.tsx`
  (который пока ещё импортирует `NewProject` напрямую, до Task 3)
  продолжает собираться без изменений.

- [ ] **Step 1: Переписать `web/src/NewProject.tsx` целиком**

```tsx
import { useState } from 'react';
import { sb } from './supabase';
import { slugify, prefixify } from './slug';

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
        value={name}
        onChange={e => onName(e.target.value)}
        placeholder="имя: Семейное приложение"
        className="w-full h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                   border border-(--color-line) outline-none"
      />
      <div className="flex gap-2">
        <input
          value={slug}
          onChange={e => { setSlug(e.target.value); setSlugTouched(true); setError(''); }}
          placeholder="слаг"
          className="flex-1 h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                     border border-(--color-line) outline-none"
        />
        <input
          value={prefix}
          onChange={e => { setPrefix(e.target.value); setPrefixTouched(true); setError(''); }}
          placeholder="префикс"
          className="w-20 h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                     border border-(--color-line) outline-none"
        />
      </div>
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

- [ ] **Step 2: Проверить сборку**

Run: `cd web && npm run build`
Expected: чисто.

- [ ] **Step 3: Проверить живьём**

На реальном сайте: кнопка «Новый проект» → ввод имени с кириллицей →
слаг и префикс подставляются автоматически → ручная правка слага
останавливает его автообновление от имени (префикс при этом продолжает
обновляться, если его не трогали).

- [ ] **Step 4: Коммит**

```bash
git add web/src/NewProject.tsx
git commit -m "NewProject: одно поле имя, слаг и префикс генерируются автоматически"
```

---

### Task 3: `ProjectDrawer` — шторка вместо select и «Все проекты»

**Files:**
- Create: `web/src/ProjectDrawer.tsx`
- Modify: `web/src/Board.tsx`
- Delete: `web/src/AllProjects.tsx`

**Interfaces:**
- Consumes: `NewProject` из Task 2 (сигнатура не изменилась).
- Produces: `ProjectDrawer({ onSelect, onClose }: { onSelect: (id: string) => void; onClose: () => void })`.

- [ ] **Step 1: Написать `web/src/ProjectDrawer.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { sb } from './supabase';
import type { Project } from './supabase';
import { NewProject } from './NewProject';

type Row = { project: Project; total: number; done: number; waiting: number };

export function ProjectDrawer(
  { onSelect, onClose }: { onSelect: (id: string) => void; onClose: () => void },
) {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState('');

  // Только нужные колонки, не select('*') по всем задачам всех проектов —
  // старый экран «Все проекты» заметно тормозил именно на этом запросе.
  const load = async () => {
    const { data: projects, error: pErr } = await sb.from('projects')
      .select('*').is('archived_at', null).order('position');
    if (pErr) { setErr(pErr.message); return; }

    const { data: items, error: iErr } = await sb.from('items')
      .select('project_id, status, archived_at');
    if (iErr) { setErr(iErr.message); return; }

    const all = items ?? [];
    setRows((projects ?? []).map((project: Project) => {
      const mine = all.filter(i => i.project_id === project.id);
      return {
        project,
        total: mine.length,
        done: mine.filter(i => i.status === 'done').length,
        waiting: mine.filter(i => i.status === 'waiting' && !i.archived_at).length,
      };
    }));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose}>
      <div
        className="fixed inset-y-0 left-0 w-80 max-w-[85vw] bg-(--color-ground)
                   overflow-y-auto p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-medium">Проекты</h2>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="text-(--color-muted) text-lg leading-none"
          >
            ×
          </button>
        </div>

        {err && <p className="text-sm text-(--color-danger-ink) mb-3">{err}</p>}

        <div className="space-y-1 mb-4">
          {rows.map(({ project, total, done, waiting }) => (
            <button
              key={project.id}
              onClick={() => { onSelect(project.id); onClose(); }}
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

        <NewProject onCreated={id => { onSelect(id); onClose(); }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Убрать `select`/«Все проекты» из шапки `Board.tsx`, подключить шторку**

Найти:
```tsx
import { sb } from './supabase';
import type { Item, Project } from './supabase';
import { NewProject } from './NewProject';
import { CreateModal } from './CreateModal';
import { TaskModal } from './TaskModal';
import { ArchiveList } from './ArchiveList';
import { EpicModal } from './EpicModal';
import { AllProjects } from './AllProjects';
```
Заменить на:
```tsx
import { sb } from './supabase';
import type { Item, Project } from './supabase';
import { CreateModal } from './CreateModal';
import { TaskModal } from './TaskModal';
import { ArchiveList } from './ArchiveList';
import { EpicModal } from './EpicModal';
import { ProjectDrawer } from './ProjectDrawer';
```

Найти:
```tsx
  const [showCreate, setShowCreate] = useState(false);
  const [viewEpic, setViewEpic] = useState<string | null>(null);
  const [viewAll, setViewAll] = useState(false);
```
Заменить на:
```tsx
  const [showCreate, setShowCreate] = useState(false);
  const [viewEpic, setViewEpic] = useState<string | null>(null);
  const [showProjects, setShowProjects] = useState(false);
```

Найти:
```tsx
  if (viewAll) {
    return (
      <AllProjects onSelect={id => { setCurrent(id); setViewAll(false); }} />
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
          <button
            onClick={() => setShowCreate(true)}
            className="h-8 px-3 rounded-lg bg-(--color-ink)
                       text-(--color-ground) text-sm"
          >
            Новая задача
          </button>
        </div>
      </header>
```
Заменить на:
```tsx
      <header className="flex items-center gap-3 mb-5 flex-wrap">
        <button
          onClick={() => setShowProjects(true)}
          className="h-8 px-3 rounded-lg bg-(--color-panel)
                     border border-(--color-line) text-sm"
        >
          {currentProject?.name ?? 'Проекты'}
        </button>
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
          <button
            onClick={() => setShowCreate(true)}
            className="h-8 px-3 rounded-lg bg-(--color-ink)
                       text-(--color-ground) text-sm"
          >
            Новая задача
          </button>
        </div>
      </header>
```

- [ ] **Step 3: Отрендерить `ProjectDrawer`**

Найти:
```tsx
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
Заменить на:
```tsx
      {viewEpic && (
        <EpicModal
          epicId={viewEpic}
          onClose={() => setViewEpic(null)}
          onOpenItem={i => { setViewEpic(null); setOpenItem(i); }}
        />
      )}

      {showProjects && (
        <ProjectDrawer
          onSelect={id => { setCurrent(id); reloadProjects(); }}
          onClose={() => setShowProjects(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Удалить `AllProjects.tsx`**

```bash
git rm web/src/AllProjects.tsx
```

- [ ] **Step 5: Проверить сборку**

Run: `cd web && npm run build`
Expected: чисто — никаких упоминаний `AllProjects`/`viewAll` не осталось.

- [ ] **Step 6: Проверить живьём**

Кнопка с именем текущего проекта открывает шторку слева; список
проектов с прогрессом; клик по проекту переключает и закрывает шторку;
«Новый проект» внутри шторки создаёт и сразу переключает на новый.

- [ ] **Step 7: Коммит**

```bash
git add web/src/ProjectDrawer.tsx web/src/Board.tsx
git commit -m "Шторка выбора проекта вместо select и экрана «Все проекты»"
```

---

### Task 4: Описание проекта в шапке — инлайн-редактирование

**Files:**
- Modify: `web/src/Board.tsx`

**Interfaces:**
- Consumes: ничего нового.
- Produces: без изменений публичного интерфейса `Board`.

- [ ] **Step 1: Добавить состояние и обработчик**

Найти:
```tsx
  const currentProject = projects.find(p => p.id === current) ?? null;

  useEffect(() => {
    reload(current);
```
Заменить на:
```tsx
  const currentProject = projects.find(p => p.id === current) ?? null;

  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');

  // Сбрасывать черновик при смене проекта или при обновлении описания
  // с сервера — иначе после переключения проекта в textarea мог бы
  // остаться текст от предыдущего.
  useEffect(() => {
    setEditingDescription(false);
    setDescriptionDraft(currentProject?.description ?? '');
  }, [current, currentProject?.description]);

  const saveDescription = async () => {
    setEditingDescription(false);
    const clean = descriptionDraft.trim() || null;
    if (!currentProject || clean === currentProject.description) return;
    const { error } = await sb.from('projects')
      .update({ description: clean }).eq('id', current);
    if (error) { setErr(error.message); return; }
    reloadProjects();
  };

  useEffect(() => {
    reload(current);
```

- [ ] **Step 2: Заменить статичный span на клик-и-редактируй**

Найти:
```tsx
        {currentProject?.description && (
          <span className="text-sm text-(--color-muted)">
            {currentProject.description}
          </span>
        )}
        {err && <span className="text-sm text-(--color-danger-ink)">{err}</span>}
```
Заменить на:
```tsx
        {currentProject && (
          editingDescription ? (
            <textarea
              autoFocus
              value={descriptionDraft}
              onChange={e => setDescriptionDraft(e.target.value)}
              onBlur={saveDescription}
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) saveDescription(); }}
              rows={2}
              placeholder="описание"
              className="text-sm bg-transparent border border-(--color-line)
                         rounded-lg p-1 outline-none resize-none"
            />
          ) : (
            <span
              onClick={() => setEditingDescription(true)}
              className="text-sm text-(--color-muted) cursor-text"
            >
              {currentProject.description || 'описание — клик, чтобы добавить'}
            </span>
          )
        )}
        {err && <span className="text-sm text-(--color-danger-ink)">{err}</span>}
```

- [ ] **Step 3: Проверить сборку**

Run: `cd web && npm run build`
Expected: чисто.

- [ ] **Step 4: Проверить живьём**

Клик по описанию (или по плейсхолдеру, если пусто) превращает его в
textarea; Ctrl+Enter или потеря фокуса сохраняет; переключение на другой
проект через шторку сбрасывает черновик, не оставляя текст от прошлого
проекта.

- [ ] **Step 5: Коммит**

```bash
git add web/src/Board.tsx
git commit -m "Описание проекта в шапке доски: инлайн-редактирование вместо статичного текста"
```

---

## Порядок и живая проверка

Задачи строго последовательны: Task 2 зависит от `slug.ts` (Task 1);
Task 3 зависит от упрощённого `NewProject` (Task 2, сигнатура не
менялась, но `ProjectDrawer` встраивает уже новую версию) и переписывает
шапку `Board.tsx`; Task 4 модифицирует ту же шапку поверх результата
Task 3. После Task 4 — полный живой прогон: открыть шторку, переключить
проект, создать новый проект с кириллическим именем, проверить
автогенерацию слага/префикса и ручную правку, отредактировать описание
текущего проекта, переключиться и вернуться — убедиться, что описание
не потерялось и не перепуталось между проектами.
