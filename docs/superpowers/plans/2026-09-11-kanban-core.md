# План №1: рабочий минимум канбан-доски

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Поднять доску, которой можно пользоваться: агент ведёт задачи через MCP, владелец читает и пополняет их с телефона и компьютера.

**Architecture:** Данные и вход живут в отдельном проекте Supabase. MCP-сервер на Node запускается локально, ходит в базу сервисным ключом в обход RLS и отдаёт агенту сжатый текст вместо JSON. Веб-клиент — статика на Vite, ходит анонимным ключом под magic-link сессией и упирается в RLS. Промежуточного API-слоя нет.

**Tech Stack:** Node 24 (нативное исполнение TypeScript без сборки), `@modelcontextprotocol/sdk`, `@supabase/supabase-js`, React 19 + Vite + Tailwind 4, тесты — встроенный `node --test`.

**Spec:** [`docs/superpowers/specs/2026-09-11-kanban-design.md`](../specs/2026-09-11-kanban-design.md)

## Global Constraints

- **Тарифы:** только бесплатные. Supabase Free: 500 МБ базы, 50 000 активных пользователей. Netlify Free для статики.
- **Доступ:** читать и писать может только `shakov.georgy@gmail.com`. Проверка — в RLS-политике, а не в коде клиента.
- **Сервисный ключ Supabase никогда не попадает в репозиторий и в браузер.** Он живёт только в пользовательском конфиге MCP (`claude mcp add --scope user`). В `.gitignore` с первого коммита.
- **Node 24 исполняет `.ts` напрямую.** Ни `tsc`, ни `tsx`, ни сборки для MCP-сервера нет. Запуск — `node src/index.ts`.
- **Описание каждого MCP-инструмента — не длиннее 15 слов.** Описания сидят в системном промпте каждого запроса агента; это их бюджет.
- **Ответы инструментов — сжатый текст, не JSON.** Целевой размер ответа `board` — до 300 токенов на проект.
- **Тесты пишутся на чистые функции** (`parse-plan.ts`, `format.ts`), где живёт логика. Обёртки над `supabase-js` тестируются живой проверкой, а не моками: мок клиента проверял бы мок.
- **Язык:** комментарии в коде, тексты интерфейса и сообщения коммитов — по-русски.
- **Тестовый запуск:** `npm test` в папке `mcp/` прогоняет оба тестовых файла.

## Структура файлов

```
канбан/
  .gitignore
  supabase/
    migrations/20260911000000_schema.sql   схема, индексы, RLS
  mcp/
    package.json
    src/
      index.ts        точка входа: stdio-транспорт, регистрация инструментов
      db.ts           клиент Supabase, типы строк, определение проекта по cwd
      format.ts       сжатые форматы вывода (чистые функции)
      parse-plan.ts   разбор планов superpowers (чистые функции)
      tools.ts        шесть инструментов
    test/
      format.test.ts
      parse-plan.test.ts
  web/
    package.json
    vite.config.ts
    index.html
    src/
      main.tsx        точка входа, подключение стилей
      supabase.ts     клиент с анонимным ключом
      App.tsx         вход по magic-link и выбор экрана
      Board.tsx       доска на четыре колонки
      NewTask.tsx     заведение задачи
      styles.css      Tailwind и токены темы
```

Логика разделена по ответственности, а не по слою: `parse-plan.ts` и `format.ts` — чистые и тестируемые, `db.ts` и `tools.ts` — вся работа с сетью. Шесть инструментов лежат в одном файле намеренно: каждый занимает 20–40 строк, и разносить их по шести файлам значило бы шесть импортов ради нуля выгоды.

---

### Task 1: Проект Supabase, схема и RLS

**Files:**
- Create: `.gitignore`
- Create: `supabase/migrations/20260911000000_schema.sql`

**Interfaces:**
- Produces: таблицы `projects`, `epics`, `items`, `comments`; функция `next_seq(text)`; переменные окружения `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` для последующих задач

- [ ] **Step 1: Создать `.gitignore` до всего остального**

```
node_modules/
dist/
.env
.env.local
*.local
.DS_Store
```

Этот шаг первый намеренно: следующие шаги порождают ключи, и репозиторий должен быть к ним готов заранее.

- [ ] **Step 2: Владелец подтверждает создание проекта Supabase**

Это шаг с внешним эффектом — спросить владельца прежде, чем выполнять.

Создать отдельный проект (не переиспользовать существующий `LeDoksi's Project`): сервисный ключ даёт полный доступ ко всей базе в обход RLS, и класть канбан в одну базу с другим приложением означало бы выдать MCP-серверу доступ к чужим данным.

Через MCP-инструмент Supabase `create_project`:
- организация: `vayrgnxvufcwwpzqmiml`
- имя: `kanban`
- регион: `eu-west-3` (тот же, что у существующего проекта)

Перед созданием вызвать `get_cost`, показать владельцу результат и дождаться подтверждения. На бесплатном тарифе стоимость нулевая, но подтверждение всё равно обязательно.

- [ ] **Step 3: Написать миграцию схемы**

Создать `supabase/migrations/20260911000000_schema.sql`:

```sql
-- Проекты. id — человекочитаемый слаг, prefix идёт в номера задач.
create table projects (
  id          text primary key,
  name        text not null,
  prefix      text not null,
  repo_path   text,
  position    double precision not null default 1000,
  archived_at timestamptz
);

-- Эпик = один план superpowers.
create table epics (
  id          text primary key,
  seq         integer not null,
  project_id  text not null references projects(id) on delete cascade,
  title       text not null,
  goal        text,
  plan_path   text,
  spec_path   text,
  status      text not null default 'active'
              check (status in ('active','done','archived')),
  position    double precision not null default 1000,
  created_at  timestamptz not null default now(),
  unique (project_id, seq)
);

-- Задачи. status — это колонка на доске.
create table items (
  id          text primary key,
  seq         integer not null,
  project_id  text not null references projects(id) on delete cascade,
  epic_id     text references epics(id) on delete set null,
  type        text not null default 'task'
              check (type in ('task','bug','chore')),
  title       text not null,
  body        text,
  status      text not null default 'backlog'
              check (status in ('backlog','doing','waiting','done')),
  checklist   jsonb not null default '[]'::jsonb,
  blocks      text[] not null default '{}',
  position    double precision not null default 1000,
  created_by  text not null default 'claude'
              check (created_by in ('me','claude')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  closed_at   timestamptz,
  archived_at timestamptz,
  unique (project_id, seq)
);

create table comments (
  id         bigserial primary key,
  item_id    text not null references items(id) on delete cascade,
  author     text not null check (author in ('me','claude')),
  body       text not null,
  created_at timestamptz not null default now()
);

-- Доска всегда фильтрует по проекту и статусу, эпик — по эпику.
create index items_board_idx on items (project_id, status, position);
create index items_epic_idx  on items (epic_id, position);
create index comments_item_idx on comments (item_id, created_at);

-- Следующий номер внутри проекта. Блокировка строки проекта сериализует
-- параллельные вставки, поэтому два одновременных вызова не дадут
-- одинаковый seq.
create or replace function next_seq(p_project text, p_kind text)
returns integer language plpgsql as $$
declare n integer;
begin
  perform 1 from projects where id = p_project for update;
  if p_kind = 'epic' then
    select coalesce(max(seq),0)+1 into n from epics where project_id = p_project;
  else
    select coalesce(max(seq),0)+1 into n from items where project_id = p_project;
  end if;
  return n;
end $$;

-- updated_at поддерживается базой, а не вызывающим кодом.
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger items_touch before update on items
  for each row execute function touch_updated_at();

-- Доступ: только владелец. Сервисный ключ RLS не проверяет.
alter table projects enable row level security;
alter table epics    enable row level security;
alter table items    enable row level security;
alter table comments enable row level security;

create policy owner_only on projects for all
  using (auth.jwt() ->> 'email' = 'shakov.georgy@gmail.com')
  with check (auth.jwt() ->> 'email' = 'shakov.georgy@gmail.com');

create policy owner_only on epics for all
  using (auth.jwt() ->> 'email' = 'shakov.georgy@gmail.com')
  with check (auth.jwt() ->> 'email' = 'shakov.georgy@gmail.com');

create policy owner_only on items for all
  using (auth.jwt() ->> 'email' = 'shakov.georgy@gmail.com')
  with check (auth.jwt() ->> 'email' = 'shakov.georgy@gmail.com');

create policy owner_only on comments for all
  using (auth.jwt() ->> 'email' = 'shakov.georgy@gmail.com')
  with check (auth.jwt() ->> 'email' = 'shakov.georgy@gmail.com');
```

- [ ] **Step 4: Применить миграцию**

Через MCP-инструмент Supabase `apply_migration` с именем `schema` и телом файла из Step 3.

- [ ] **Step 5: Проверить, что RLS закрывает доступ анониму**

Через MCP-инструмент Supabase `execute_sql`:

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' order by tablename;
```

Expected: четыре строки, `rowsecurity` = `true` у каждой.

Затем проверить, что политика действительно отсекает чужака:

```sql
set local role authenticated;
set local request.jwt.claims = '{"email":"someone@else.com"}';
select count(*) from projects;
```

Expected: `0` строк и отсутствие ошибки — политика не пускает, но и не падает.

- [ ] **Step 6: Завести первый проект в базе**

Через `execute_sql`. Путь — тот, в котором лежит этот план:

```sql
insert into projects (id, name, prefix, repo_path) values
  ('kanban', 'Канбан', 'KAN',
   'C:\Users\Georgy\OneDrive\Рабочий стол\нейронка\канбан');
```

Доска начинает вести саму себя с первого дня — это заодно живая проверка всего остального.

- [ ] **Step 7: Получить ключи и запомнить их**

Через MCP-инструменты Supabase `get_project_url` и `get_publishable_keys` для нового проекта. Сервисный ключ берётся в консоли Supabase (Settings → API) — он не отдаётся через MCP намеренно.

Записать три значения во временную заметку сессии, **не в файл репозитория**:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (публикуемый, попадёт в веб-клиент)
- `SUPABASE_SERVICE_KEY` (секретный, только для MCP)

- [ ] **Step 8: Коммит**

```bash
git add .gitignore supabase/
git commit -m "Схема канбана: таблицы, индексы, нумерация задач и RLS"
```

---

### Task 2: Каркас MCP-сервера

**Files:**
- Create: `mcp/package.json`
- Create: `mcp/src/db.ts`
- Create: `mcp/src/index.ts`
- Create: `mcp/src/tools.ts`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` из окружения (Task 1)
- Produces: `sb` — клиент Supabase; типы `Project`, `Item`, `Epic`, `Comment`; `resolveProject(explicit?: string): Promise<Project>`; `registerTools(server: McpServer): void`; исполняемый сервер `mcp/src/index.ts`

- [ ] **Step 1: Создать `mcp/package.json`**

```json
{
  "name": "kanban-mcp",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test test/format.test.ts test/parse-plan.test.ts",
    "start": "node src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "@supabase/supabase-js": "^2.47.0",
    "zod": "^3.24.0"
  }
}
```

Поля `devDependencies` нет и не будет: Node 24 исполняет TypeScript сам, тесты встроены в Node.

- [ ] **Step 2: Установить зависимости**

Run: `cd mcp && npm install`
Expected: `node_modules` создан, ошибок нет.

- [ ] **Step 3: Написать `mcp/src/db.ts`**

```ts
/* Единственное место, знающее про сеть и про то, как устроены строки базы.
   Сервисный ключ обходит RLS — поэтому он живёт только здесь и только
   на машине владельца. */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  throw new Error('Нужны переменные SUPABASE_URL и SUPABASE_SERVICE_KEY');
}

export const sb = createClient(url, key, {
  auth: { persistSession: false },
});

export type Project = {
  id: string; name: string; prefix: string; repo_path: string | null;
};

export type Epic = {
  id: string; seq: number; project_id: string; title: string;
  goal: string | null; plan_path: string | null; spec_path: string | null;
  status: string; position: number;
};

export type Check = { text: string; done: boolean };

export type Item = {
  id: string; seq: number; project_id: string; epic_id: string | null;
  type: 'task' | 'bug' | 'chore'; title: string; body: string | null;
  status: 'backlog' | 'doing' | 'waiting' | 'done';
  checklist: Check[]; blocks: string[]; position: number;
  created_by: 'me' | 'claude'; closed_at: string | null;
  archived_at: string | null;
};

export type Comment = {
  id: number; item_id: string; author: 'me' | 'claude';
  body: string; created_at: string;
};

/* Проект определяется по рабочей папке: агент не обязан называть его
   вручную, пока работает внутри репозитория. Сравнение по префиксу пути,
   чтобы срабатывало и во вложенных папках. Регистр и слэши нормализуются —
   на Windows один и тот же путь приходит в разных написаниях. */
const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

export async function resolveProject(explicit?: string): Promise<Project> {
  const { data, error } = await sb
    .from('projects').select('*').is('archived_at', null);
  if (error) throw new Error(error.message);
  const projects = (data ?? []) as Project[];

  if (explicit) {
    const hit = projects.find(p => p.id === explicit);
    if (!hit) throw new Error(`Проект "${explicit}" не найден`);
    return hit;
  }

  const cwd = norm(process.cwd());
  const matches = projects
    .filter(p => p.repo_path && cwd.startsWith(norm(p.repo_path)))
    .sort((a, b) => norm(b.repo_path!).length - norm(a.repo_path!).length);

  if (matches.length) return matches[0];

  const names = projects.map(p => p.id).join(', ');
  throw new Error(
    `Не понял, какой это проект (папка ${process.cwd()}). Укажи project явно. Известные: ${names}`,
  );
}
```

Функции вычисления позиции между соседями здесь нет: в этом плане карточки не перетаскиваются, позиция только назначается при создании. Она приедет вместе с `@dnd-kit` во втором плане.

- [ ] **Step 4: Написать заглушку `mcp/src/tools.ts`**

Настоящие инструменты появятся в Task 4 и 6. Сейчас нужен один, чтобы проверить, что сервер вообще поднимается и виден агенту.

```ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolveProject } from './db.ts';

export function registerTools(server: McpServer) {
  server.registerTool(
    'board',
    {
      description: 'Сводка доски проекта',
      inputSchema: { project: z.string().optional() },
    },
    async ({ project }) => {
      const p = await resolveProject(project);
      return { content: [{ type: 'text', text: `${p.id} · пусто` }] };
    },
  );
}
```

- [ ] **Step 5: Написать `mcp/src/index.ts`**

```ts
/* Точка входа MCP-сервера. Запускается Claude Code по stdio; любой вывод
   в stdout, кроме протокола, ломает связь — поэтому диагностика идёт
   только в stderr. */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.ts';

const server = new McpServer({ name: 'kanban', version: '1.0.0' });
registerTools(server);

await server.connect(new StdioServerTransport());
console.error('kanban mcp: подключён');
```

- [ ] **Step 6: Проверить, что сервер стартует**

Run:
```bash
cd mcp && SUPABASE_URL=<url> SUPABASE_SERVICE_KEY=<key> node src/index.ts
```
Expected: в stderr появляется `kanban mcp: подключён`, процесс висит и ждёт. Прервать по Ctrl+C.

Если Node ругается на синтаксис TypeScript — версия ниже 22.6. Проверить `node --version`; на 24.x стрип типов включён по умолчанию.

- [ ] **Step 7: Ручной шаг владельца — подключить сервер к Claude Code**

Это ручной шаг, выполняет владелец проекта: команда содержит секретный ключ, и он не должен попасть ни в репозиторий, ни в историю сессии агента.

```bash
claude mcp add kanban --scope user --env SUPABASE_URL=<url> --env SUPABASE_SERVICE_KEY=<service-key> -- node "C:/Users/Georgy/OneDrive/Рабочий стол/нейронка/канбан/mcp/src/index.ts"
```

Область `user`, а не `project`: конфиг проекта коммитится, пользовательский — нет.

После выполнения — перезапустить сессию Claude Code, чтобы сервер подхватился.

- [ ] **Step 8: Проверить, что агент видит инструмент**

Вызвать `board` из агента, находясь в папке канбана.
Expected: `kanban · пусто`.

- [ ] **Step 9: Коммит**

```bash
git add mcp/package.json mcp/package-lock.json mcp/src/db.ts mcp/src/index.ts mcp/src/tools.ts
git commit -m "Каркас MCP-сервера: клиент базы, определение проекта по папке"
```

---

### Task 3: Сжатые форматы вывода

**Files:**
- Create: `mcp/src/format.ts`
- Create: `mcp/test/format.test.ts`

**Interfaces:**
- Consumes: типы `Item`, `Comment`, `Epic` из `db.ts` (Task 2)
- Produces: `formatBoard(items: Item[], head: BoardHead): string`; `formatItem(item: Item, comments: Comment[], epic?: Epic | null): string`; тип `BoardHead = { project: string; epic?: { id: string; title: string } | null; done: number; total: number }`

- [ ] **Step 1: Написать падающий тест**

Создать `mcp/test/format.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBoard, formatItem } from '../src/format.ts';
import type { Item, Comment } from '../src/db.ts';

const item = (over: Partial<Item>): Item => ({
  id: 'KAN-1', seq: 1, project_id: 'kanban', epic_id: null,
  type: 'task', title: 'Задача', body: null, status: 'backlog',
  checklist: [], blocks: [], position: 1000, created_by: 'claude',
  closed_at: null, archived_at: null, ...over,
});

test('шапка показывает проект, эпик и прогресс', () => {
  const out = formatBoard([], {
    project: 'family-app',
    epic: { id: 'FAM-E1', title: 'Firestore' },
    done: 7, total: 15,
  });
  assert.equal(out.split('\n')[0], 'family-app · E1 Firestore (7/15)');
});

test('префикс проекта в строках не печатается', () => {
  const out = formatBoard(
    [item({ id: 'KAN-8', seq: 8, title: 'Заметки', status: 'doing' })],
    { project: 'kanban', done: 0, total: 1 },
  );
  assert.match(out, /^ ?8 /m);
  assert.doesNotMatch(out, /KAN-8/);
});

test('задача в работе помечена и показывает прогресс чеклиста', () => {
  const out = formatBoard(
    [item({
      seq: 8, title: 'Заметки', status: 'doing',
      checklist: [
        { text: 'а', done: true }, { text: 'б', done: true },
        { text: 'в', done: true }, { text: 'г', done: false },
        { text: 'д', done: false }, { text: 'е', done: false },
      ],
    })],
    { project: 'kanban', done: 0, total: 1 },
  );
  assert.match(out, /▸ Заметки/);
  assert.match(out, /3\/6/);
});

test('ожидание владельца помечено восклицательным знаком', () => {
  const out = formatBoard(
    [item({ seq: 12, title: 'Включить Firestore', status: 'waiting' })],
    { project: 'kanban', done: 0, total: 1 },
  );
  assert.match(out, /12 ! Включить Firestore/);
});

test('тип печатается словом только когда это не обычная задача', () => {
  const out = formatBoard(
    [
      item({ seq: 9, title: 'Списки' }),
      item({ id: 'KAN-14', seq: 14, title: 'Календарь', type: 'bug' }),
    ],
    { project: 'kanban', done: 0, total: 2 },
  );
  const [, , bug] = out.split('\n');
  assert.match(bug, /bug/);
  assert.doesNotMatch(out.split('\n')[1], /task/);
});

test('закрытые задачи в список не попадают', () => {
  const out = formatBoard(
    [
      item({ seq: 1, title: 'Старая', status: 'done' }),
      item({ id: 'KAN-2', seq: 2, title: 'Живая' }),
    ],
    { project: 'kanban', done: 1, total: 2 },
  );
  assert.doesNotMatch(out, /Старая/);
  assert.match(out, /Живая/);
});

test('пустая доска говорит об этом словом, а не пустой строкой', () => {
  const out = formatBoard([], { project: 'kanban', done: 0, total: 0 });
  assert.match(out, /пусто/);
});

test('карточка показывает чеклист галочками и комментарии', () => {
  const c: Comment[] = [{
    id: 1, item_id: 'KAN-8', author: 'claude',
    body: 'Перенёс. Нашёл двойной вызов.', created_at: '2026-09-11T14:20:00Z',
  }];
  const out = formatItem(
    item({
      id: 'KAN-8', seq: 8, title: 'Заметки', status: 'doing',
      body: 'Тело задачи.',
      checklist: [{ text: 'первый', done: true }, { text: 'второй', done: false }],
    }),
    c,
  );
  assert.match(out, /KAN-8/);
  assert.match(out, /\[x\] первый/);
  assert.match(out, /\[ \] второй/);
  assert.match(out, /Тело задачи\./);
  assert.match(out, /claude: Перенёс\. Нашёл двойной вызов\./);
});
```

- [ ] **Step 2: Прогнать тест — должен падать**

Run: `cd mcp && npm test`
Expected: FAIL — `Cannot find module '../src/format.ts'`.

- [ ] **Step 3: Написать `mcp/src/format.ts`**

```ts
/* Форматы вывода для агента. Здесь экономятся токены: ни одного лишнего
   слова, ни одной скобки JSON. Числа выравниваются по правому краю,
   чтобы столбец читался глазом. */
import type { Item, Comment, Epic } from './db.ts';

export type BoardHead = {
  project: string;
  epic?: { id: string; title: string } | null;
  done: number;
  total: number;
};

const MARK: Record<Item['status'], string> = {
  doing: '▸', waiting: '!', backlog: ' ', done: ' ',
};

const progress = (c: Item['checklist']) =>
  c.length ? `${c.filter(s => s.done).length}/${c.length}` : '';

export function formatBoard(items: Item[], head: BoardHead): string {
  // Эпик печатается коротким хвостом id: "FAM-E1" → "E1".
  const epic = head.epic
    ? ` · ${head.epic.id.split('-').pop()} ${head.epic.title}`
    : '';
  const lines = [`${head.project}${epic} (${head.done}/${head.total})`];

  const open = items.filter(i => i.status !== 'done' && !i.archived_at);
  if (!open.length) {
    lines.push('пусто');
    return lines.join('\n');
  }

  const order = { waiting: 0, doing: 1, backlog: 2, done: 3 };
  open.sort((a, b) =>
    order[a.status] - order[b.status] || a.position - b.position);

  const width = Math.max(...open.map(i => String(i.seq).length));
  for (const i of open) {
    const seq = String(i.seq).padStart(width);
    const type = i.type === 'task' ? '' : ` ${i.type}`;
    const prog = progress(i.checklist);
    const tail = [i.status, prog, type.trim()].filter(Boolean).join(' ');
    lines.push(`${seq} ${MARK[i.status]} ${i.title}  ${tail}`.trimEnd());
  }
  return lines.join('\n');
}

export function formatItem(
  item: Item,
  comments: Comment[],
  epic?: Epic | null,
): string {
  const lines = [`${item.id} · ${item.title}  [${item.status}]`];
  if (epic) lines.push(`эпик: ${epic.id} ${epic.title}`);
  if (item.type !== 'task') lines.push(`тип: ${item.type}`);
  if (item.blocks.length) lines.push(`блокирует: ${item.blocks.join(', ')}`);
  if (item.body) lines.push('', item.body.trim());

  if (item.checklist.length) {
    lines.push('');
    for (const s of item.checklist) {
      lines.push(`[${s.done ? 'x' : ' '}] ${s.text}`);
    }
  }

  if (comments.length) {
    lines.push('');
    for (const c of comments) {
      lines.push(`${c.created_at.slice(0, 10)} ${c.author}: ${c.body}`);
    }
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Прогнать тесты — должны пройти**

Run: `cd mcp && npm test`
Expected: PASS, 8 тестов.

- [ ] **Step 5: Коммит**

```bash
git add mcp/src/format.ts mcp/test/format.test.ts
git commit -m "Сжатые форматы вывода для агента"
```

---

### Task 4: Пять инструментов работы с доской

**Files:**
- Modify: `mcp/src/tools.ts` (заменить заглушку целиком)

**Interfaces:**
- Consumes: `sb`, `resolveProject`, типы из `db.ts` (Task 2); `formatBoard`, `formatItem` из `format.ts` (Task 3)
- Produces: инструменты `board`, `get`, `add`, `update`, `comment`

- [ ] **Step 1: Переписать `mcp/src/tools.ts`**

```ts
/* Шесть инструментов агента. Описания намеренно короткие: каждое слово
   здесь оплачивается в системном промпте каждого запроса. Ответы —
   одна строка подтверждения, а не эхо созданных объектов. */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { sb, resolveProject } from './db.ts';
import type { Item, Epic, Comment } from './db.ts';
import { formatBoard, formatItem } from './format.ts';

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });

const STATUS = z.enum(['backlog', 'doing', 'waiting', 'done']);
const TYPE = z.enum(['task', 'bug', 'chore']);

async function nextSeq(project: string, kind: 'item' | 'epic') {
  const { data, error } = await sb.rpc('next_seq', {
    p_project: project, p_kind: kind,
  });
  if (error) throw new Error(error.message);
  return data as number;
}

export function registerTools(server: McpServer) {

  server.registerTool('board', {
    description: 'Сводка доски: открытые задачи проекта одной таблицей',
    inputSchema: {
      project: z.string().optional(),
      epic: z.string().optional(),
    },
  }, async ({ project, epic }) => {
    const p = await resolveProject(project);

    let q = sb.from('items').select('*')
      .eq('project_id', p.id).is('archived_at', null);
    if (epic) q = q.eq('epic_id', epic);
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const items = (data ?? []) as Item[];
    let head = null as Epic | null;
    if (epic) {
      const r = await sb.from('epics').select('*').eq('id', epic).single();
      head = (r.data ?? null) as Epic | null;
    }

    return text(formatBoard(items, {
      project: p.id,
      epic: head ? { id: head.id, title: head.title } : null,
      done: items.filter(i => i.status === 'done').length,
      total: items.length,
    }));
  });

  server.registerTool('get', {
    description: 'Полная карточка: тело, чеклист, комментарии',
    inputSchema: { id: z.string() },
  }, async ({ id }) => {
    const { data, error } = await sb
      .from('items').select('*').eq('id', id).single();
    if (error) throw new Error(`Задача ${id} не найдена`);
    const item = data as Item;

    const cs = await sb.from('comments').select('*')
      .eq('item_id', id).order('created_at');
    let epic: Epic | null = null;
    if (item.epic_id) {
      const e = await sb.from('epics').select('*')
        .eq('id', item.epic_id).single();
      epic = (e.data ?? null) as Epic | null;
    }
    return text(formatItem(item, (cs.data ?? []) as Comment[], epic));
  });

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
    let pos = Date.now() % 1_000_000;
    for (const it of items) {
      const seq = await nextSeq(p.id, 'item');
      rows.push({
        id: `${p.prefix}-${seq}`,
        seq,
        project_id: p.id,
        epic_id: it.epic ?? null,
        type: it.type,
        title: it.title,
        body: it.body ?? null,
        status: it.status,
        checklist: (it.checklist ?? []).map(t => ({ text: t, done: false })),
        blocks: it.blocks ?? [],
        position: (pos += 100),
        created_by: 'claude',
      });
    }

    const { error } = await sb.from('items').insert(rows);
    if (error) throw new Error(error.message);

    const ids = rows.map(r => r.id);
    return text(ids.length === 1
      ? `${ids[0]} создана`
      : `${ids[0]}..${ids[ids.length - 1]} создано (${ids.length})`);
  });

  server.registerTool('update', {
    description: 'Изменить задачу: статус, поля, галочки чеклиста, архив',
    inputSchema: {
      id: z.string(),
      status: STATUS.optional(),
      title: z.string().optional(),
      body: z.string().optional(),
      type: TYPE.optional(),
      epic: z.string().optional(),
      check: z.union([z.number(), z.string()]).optional(),
      uncheck: z.union([z.number(), z.string()]).optional(),
      archive: z.boolean().optional(),
    },
  }, async (a) => {
    const { data, error } = await sb
      .from('items').select('*').eq('id', a.id).single();
    if (error) throw new Error(`Задача ${a.id} не найдена`);
    const item = data as Item;

    const patch: Record<string, unknown> = {};
    if (a.status) {
      patch.status = a.status;
      patch.closed_at = a.status === 'done' ? new Date().toISOString() : null;
    }
    if (a.title !== undefined) patch.title = a.title;
    if (a.body !== undefined) patch.body = a.body;
    if (a.type) patch.type = a.type;
    if (a.epic !== undefined) patch.epic_id = a.epic;
    if (a.archive) patch.archived_at = new Date().toISOString();

    // Шаг чеклиста указывается номером (с единицы) или куском текста.
    const mark = (needle: number | string, done: boolean) => {
      const list = item.checklist.map(s => ({ ...s }));
      const i = typeof needle === 'number'
        ? needle - 1
        : list.findIndex(s => s.text.toLowerCase().includes(
            String(needle).toLowerCase()));
      if (i < 0 || i >= list.length) {
        throw new Error(`Шаг "${needle}" не найден в ${a.id}`);
      }
      list[i].done = done;
      patch.checklist = list;
      return list[i].text;
    };

    const touched: string[] = [];
    if (a.check !== undefined) touched.push(mark(a.check, true));
    if (a.uncheck !== undefined) touched.push(mark(a.uncheck, false));

    if (!Object.keys(patch).length) return text(`${a.id}: нечего менять`);

    const up = await sb.from('items').update(patch).eq('id', a.id);
    if (up.error) throw new Error(up.error.message);

    const what = [
      a.status && `→ ${a.status}`,
      touched.length && `шаг: ${touched.join(', ')}`,
      a.archive && 'в архив',
    ].filter(Boolean).join('; ');
    return text(`${a.id} ${what || 'обновлена'}`);
  });

  server.registerTool('comment', {
    description: 'Записать краткий итог в журнал задачи',
    inputSchema: { id: z.string(), text: z.string() },
  }, async ({ id, text: body }) => {
    const { error } = await sb.from('comments')
      .insert({ item_id: id, author: 'claude', body });
    if (error) throw new Error(error.message);
    return text(`${id}: записано`);
  });
}
```

- [ ] **Step 2: Перезапустить сессию и проверить `add` живьём**

Через агента: создать две задачи в проекте `kanban`.
Expected: ответ вида `KAN-1..KAN-2 создано (2)`.

- [ ] **Step 3: Проверить `board`**

Expected: шапка `kanban (0/2)` и две строки с номерами 1 и 2.

- [ ] **Step 4: Проверить `update` и `comment`**

Перевести `KAN-1` в `doing`, отметить первый шаг чеклиста, записать комментарий, затем вызвать `get KAN-1`.
Expected: в карточке виден статус `doing`, `[x]` на первом шаге, комментарий с датой.

- [ ] **Step 5: Проверить, что незнакомая папка даёт понятную ошибку**

Запустить `board` из папки, не принадлежащей ни одному проекту.
Expected: сообщение «Не понял, какой это проект…» со списком известных проектов, а не стектрейс.

- [ ] **Step 6: Коммит**

```bash
git add mcp/src/tools.ts
git commit -m "Пять инструментов доски: board, get, add, update, comment"
```

---

### Task 5: Разбор планов superpowers

**Files:**
- Create: `mcp/src/parse-plan.ts`
- Create: `mcp/test/parse-plan.test.ts`

**Interfaces:**
- Produces: `parsePlan(md: string): ParsedPlan`; типы `ParsedPlan = { title, goal, specPath, tasks }`, `ParsedTask = { title, body, checklist: string[], manualSteps: string[] }`

Это самая рискованная часть системы и единственная, где TDD обязателен: парсер работает с чужим текстом, который никто не валидирует.

- [ ] **Step 1: Написать падающий тест**

Создать `mcp/test/parse-plan.test.ts`. Тесты идут на вырезках реальной формы — той, что в `2026-09-09-firestore-data-layer.md`.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parsePlan } from '../src/parse-plan.ts';

const SAMPLE = `# План №1: слой данных на Firestore

**Goal:** Перевести данные пары в Firestore, не переписывая интерфейс.

**Spec:** [\`docs/superpowers/specs/2026-09-09-firestore-refactor-design.md\`](../specs/2026-09-09-firestore-refactor-design.md)

## Global Constraints

- **Тарифы:** только бесплатные.

---

### Task 1: Подключение Firestore и правила доступа

**Files:**
- Modify: \`index.html\`

**Interfaces:**
- Produces: \`fsDoc()\`

- [ ] **Step 1: Владелец включает Firestore в консоли**

Это ручной шаг, выполняет владелец проекта. Firebase Console → Build.

- [ ] **Step 2: Подключить SDK Firestore и открыть его в CSP**

В \`index.html\` добавить строку.

- [ ] **Step 3: Коммит**

\`\`\`bash
git commit -m "Подключение"
\`\`\`

---

### Task 2: Репозиторий — чтение

**Files:**
- Create: \`src/04-repo.js\`

- [ ] **Step 1: Объявить состояние загрузки**

- [ ] **Step 2: Прогнать**
`;

test('заголовок плана и цель', () => {
  const p = parsePlan(SAMPLE);
  assert.equal(p.title, 'слой данных на Firestore');
  assert.match(p.goal, /^Перевести данные пары/);
});

test('путь до спеки вытащен из ссылки', () => {
  const p = parsePlan(SAMPLE);
  assert.equal(p.specPath,
    'docs/superpowers/specs/2026-09-09-firestore-refactor-design.md');
});

test('номер плана в заголовок не попадает', () => {
  assert.doesNotMatch(parsePlan(SAMPLE).title, /План №/);
});

test('найдены обе задачи', () => {
  const p = parsePlan(SAMPLE);
  assert.equal(p.tasks.length, 2);
  assert.equal(p.tasks[0].title, 'Подключение Firestore и правила доступа');
  assert.equal(p.tasks[1].title, 'Репозиторий — чтение');
});

test('Files и Interfaces попадают в тело задачи', () => {
  const t = parsePlan(SAMPLE).tasks[0];
  assert.match(t.body, /index\.html/);
  assert.match(t.body, /fsDoc\(\)/);
});

test('шаги плана становятся чеклистом без разметки', () => {
  const t = parsePlan(SAMPLE).tasks[1];
  assert.deepEqual(t.checklist,
    ['Объявить состояние загрузки', 'Прогнать']);
});

test('ручной шаг вынут из чеклиста в отдельный список', () => {
  const t = parsePlan(SAMPLE).tasks[0];
  assert.deepEqual(t.manualSteps, ['Владелец включает Firestore в консоли']);
  assert.deepEqual(t.checklist, [
    'Подключить SDK Firestore и открыть его в CSP',
    'Коммит',
  ]);
});

test('секция Global Constraints задачей не считается', () => {
  assert.ok(!parsePlan(SAMPLE).tasks.some(t => /Constraints/.test(t.title)));
});

test('план без задач не роняет парсер', () => {
  const p = parsePlan('# План №9: пустой\n\n**Goal:** ничего.\n');
  assert.equal(p.tasks.length, 0);
  assert.equal(p.specPath, null);
});

test('разметка внутри блока кода задачей не считается', () => {
  // План, который сам содержит пример плана — обычное дело для планов
  // про инструменты. Заголовки и шаги внутри ``` не структура, а текст.
  const md = [
    '# План №3: про парсер',
    '',
    '### Task 1: Настоящая задача',
    '',
    '- [ ] **Step 1: Настоящий шаг**',
    '',
    '```md',
    '### Task 9: Фальшивая задача',
    '- [ ] **Step 1: Фальшивый шаг**',
    '```',
    '',
    '- [ ] **Step 2: Второй настоящий шаг**',
    '',
  ].join('\n');

  const p = parsePlan(md);
  assert.equal(p.tasks.length, 1);
  assert.equal(p.tasks[0].title, 'Настоящая задача');
  assert.deepEqual(p.tasks[0].checklist,
    ['Настоящий шаг', 'Второй настоящий шаг']);
});

test('разбирает настоящий план целиком', () => {
  const file = new URL(
    '../../2026-09-09-firestore-data-layer.md', import.meta.url);
  if (!existsSync(file)) return; // файл мог переехать — тест не обязателен
  const p = parsePlan(readFileSync(file, 'utf8'));
  assert.equal(p.tasks.length, 15);
  assert.equal(p.title, 'слой данных на Firestore');

  const steps = p.tasks.reduce((n, t) => n + t.checklist.length, 0);
  assert.equal(steps, 92);

  const manual = p.tasks.flatMap(t => t.manualSteps);
  assert.equal(manual.length, 1);
  assert.match(manual[0], /Владелец включает Firestore/);
  // Шагов много, но ни один не пустой и ни один не тащит разметку.
  for (const t of p.tasks) {
    for (const s of t.checklist) {
      assert.ok(s.length > 0);
      assert.doesNotMatch(s, /\*\*/);
      assert.doesNotMatch(s, /^Step \d/);
    }
  }
});
```

- [ ] **Step 2: Прогнать тест — должен падать**

Run: `cd mcp && npm test`
Expected: FAIL — `Cannot find module '../src/parse-plan.ts'`.

- [ ] **Step 3: Написать `mcp/src/parse-plan.ts`**

```ts
/* Разбор планов superpowers. Формат задаётся скиллом writing-plans:
   "# План №N: title", "### Task N: title", "- [ ] **Step N: text**".
   Парсер намеренно снисходителен — чужой текст никто не валидирует,
   и падать на неожиданной строке он не должен. */

export type ParsedTask = {
  title: string;
  body: string;
  checklist: string[];
  manualSteps: string[];
};

export type ParsedPlan = {
  title: string;
  goal: string;
  specPath: string | null;
  tasks: ParsedTask[];
};

/* Признаки шага, который выполняет человек, а не агент. Эвристика:
   агент обязан проверить результат импорта глазами. */
const MANUAL = [
  'ручной шаг',
  'выполняет владелец',
  'в консоли',
  'consoleе', // опечатка встречается в реальных планах
];

const isManual = (title: string, body: string) => {
  const hay = `${title}\n${body}`.toLowerCase();
  return MANUAL.some(m => hay.includes(m));
};

/* "- [ ] **Step 3: Написать мок**" → "Написать мок" */
const stepTitle = (line: string): string =>
  line
    .replace(/^\s*-\s*\[[ xX]\]\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/^Step\s+\d+\s*:\s*/i, '')
    .trim();

const isFence = (line: string) => /^\s*(```|~~~)/.test(line);

export function parsePlan(md: string): ParsedPlan {
  const lines = md.split(/\r?\n/);

  const h1 = lines.find(l => l.startsWith('# ')) ?? '';
  const title = h1
    .replace(/^#\s*/, '')
    .replace(/^План\s*№\s*\d+\s*:\s*/i, '')
    .trim();

  const goalLine = lines.find(l => l.startsWith('**Goal:**')) ?? '';
  const goal = goalLine.replace('**Goal:**', '').trim();

  const specLine = lines.find(l => l.startsWith('**Spec:**')) ?? '';
  // Берём путь из кода в квадратных скобках: [`path`](../relative)
  const specMatch = specLine.match(/\[`([^`]+)`\]/) ?? specLine.match(/\[([^\]]+)\]/);
  const specPath = specMatch ? specMatch[1] : null;

  const tasks: ParsedTask[] = [];
  let cur: { title: string; lines: string[] } | null = null;

  const flush = () => {
    if (!cur) return;
    tasks.push(buildTask(cur.title, cur.lines));
    cur = null;
  };

  // Внутри ``` разметка — это текст, а не структура. План про инструменты
  // вполне может содержать пример другого плана целиком.
  let fenced = false;

  for (const line of lines) {
    if (isFence(line)) {
      fenced = !fenced;
      if (cur) cur.lines.push(line);
      continue;
    }
    if (!fenced) {
      const head = line.match(/^###\s+Task\s+\d+\s*:\s*(.+)$/i);
      if (head) {
        flush();
        cur = { title: head[1].trim(), lines: [] };
        continue;
      }
      // Заголовок второго уровня закрывает текущую задачу: так секции
      // вроде "## Что дальше" не приклеиваются к последней задаче.
      if (/^##\s/.test(line)) { flush(); continue; }
    }
    if (cur) cur.lines.push(line);
  }
  flush();

  return { title, goal, specPath, tasks };
}

function buildTask(title: string, lines: string[]): ParsedTask {
  const checklist: string[] = [];
  const manualSteps: string[] = [];
  const bodyLines: string[] = [];

  let stepTitleText: string | null = null;
  let stepBody: string[] = [];
  let seenStep = false;
  let fenced = false;

  const closeStep = () => {
    if (stepTitleText === null) return;
    const body = stepBody.join('\n');
    (isManual(stepTitleText, body) ? manualSteps : checklist)
      .push(stepTitleText);
    stepTitleText = null;
    stepBody = [];
  };

  for (const line of lines) {
    if (isFence(line)) fenced = !fenced;

    // Строка вида "- [ ]" внутри блока кода — пример, а не шаг.
    if (!fenced && /^\s*-\s*\[[ xX]\]/.test(line)) {
      closeStep();
      seenStep = true;
      stepTitleText = stepTitle(line);
      continue;
    }
    if (stepTitleText !== null) stepBody.push(line);
    else if (!seenStep) bodyLines.push(line);
  }
  closeStep();

  // Тело задачи — всё до первого шага: Files, Interfaces, пояснения.
  const body = bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  return {
    title,
    body,
    checklist: checklist.filter(Boolean),
    manualSteps: manualSteps.filter(Boolean),
  };
}
```

- [ ] **Step 4: Прогнать тесты — должны пройти**

Run: `cd mcp && npm test`
Expected: PASS, все тесты обоих файлов.

Если последний тест падает на числе задач — проверить, не съел ли парсер `## Что дальше` как задачу.

- [ ] **Step 5: Коммит**

```bash
git add mcp/src/parse-plan.ts mcp/test/parse-plan.test.ts
git commit -m "Разбор планов superpowers: эпик, задачи, чеклисты, ручные шаги"
```

---

### Task 6: Инструмент импорта плана

**Files:**
- Modify: `mcp/src/tools.ts` (добавить шестой инструмент)

**Interfaces:**
- Consumes: `parsePlan` из `parse-plan.ts` (Task 5); `sb`, `resolveProject`, `nextSeq` из Task 4
- Produces: инструмент `import_plan`

- [ ] **Step 1: Добавить импорты в начало `mcp/src/tools.ts`**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePlan } from './parse-plan.ts';
```

- [ ] **Step 2: Добавить инструмент внутрь `registerTools`, после `comment`**

```ts
  server.registerTool('import_plan', {
    description: 'Залить план superpowers на доску: эпик и все задачи',
    inputSchema: {
      path: z.string(),
      project: z.string().optional(),
    },
  }, async ({ path, project }) => {
    const p = await resolveProject(project);
    const full = resolve(process.cwd(), path);
    const plan = parsePlan(readFileSync(full, 'utf8'));

    if (!plan.tasks.length) {
      return text(`В ${path} не нашлось задач вида "### Task N: ...". Импорт отменён.`);
    }

    const eseq = await nextSeq(p.id, 'epic');
    const epicId = `${p.prefix}-E${eseq}`;
    const e = await sb.from('epics').insert({
      id: epicId, seq: eseq, project_id: p.id,
      title: plan.title, goal: plan.goal || null,
      plan_path: path, spec_path: plan.specPath,
      position: Date.now() % 1_000_000,
    });
    if (e.error) throw new Error(e.error.message);

    const rows = [];
    let pos = 1000;
    let manual = 0;

    for (const t of plan.tasks) {
      const seq = await nextSeq(p.id, 'item');
      const id = `${p.prefix}-${seq}`;
      rows.push({
        id, seq, project_id: p.id, epic_id: epicId, type: 'task',
        title: t.title, body: t.body || null, status: 'backlog',
        checklist: t.checklist.map(s => ({ text: s, done: false })),
        blocks: [], position: (pos += 100), created_by: 'claude',
      });

      // Ручной шаг вынимается из задачи и становится карточкой владельцу,
      // которая её же и блокирует.
      for (const m of t.manualSteps) {
        const mseq = await nextSeq(p.id, 'item');
        rows.push({
          id: `${p.prefix}-${mseq}`, seq: mseq, project_id: p.id,
          epic_id: epicId, type: 'chore', title: m,
          body: `Ручной шаг из задачи «${t.title}».`,
          status: 'waiting', checklist: [], blocks: [id],
          position: (pos += 100), created_by: 'claude',
        });
        manual++;
      }
    }

    const ins = await sb.from('items').insert(rows);
    if (ins.error) throw new Error(ins.error.message);

    const steps: number = plan.tasks.reduce((n, t) => n + t.checklist.length, 0);
    return text(
      `${epicId} «${plan.title}»: ${plan.tasks.length} задач, ${steps} шагов` +
      (manual ? `, ${manual} ждёт тебя` : '') +
      `\nПроверь разбор глазами: get ${rows[0].id}`,
    );
  });
```

- [ ] **Step 3: Импортировать настоящий план**

Через агента: `import_plan` с путём `2026-09-09-firestore-data-layer.md` в проект `kanban`.
Expected: `KAN-E1 «слой данных на Firestore»: 15 задач, 92 шагов, 1 ждёт тебя`.

В файле 93 шага: 92 достались задачам, один — ручной — вынут отдельной карточкой в `waiting`. Если числа разошлись, разбирается причина, а не правится ожидание.

- [ ] **Step 4: Проверить разбор глазами**

Вызвать `board` с фильтром по эпику и `get` на первой задаче.
Expected: в задаче виден чеклист без разметки `**`, ручной шаг стоит отдельной карточкой в `waiting` и её поле `blocks` указывает на первую задачу.

Если парсер что-то разобрал криво — **это правится здесь**, а не списывается на эвристику.

- [ ] **Step 5: Убрать тестовые задачи из Task 4**

Задачи `KAN-1` и `KAN-2` были заведены для проверки инструментов. Заархивировать их через `update` с `archive: true`.

- [ ] **Step 6: Коммит**

```bash
git add mcp/src/tools.ts
git commit -m "Импорт планов superpowers одним вызовом"
```

---

### Task 7: Каркас веб-клиента и вход по magic-link

**Files:**
- Create: `web/package.json`
- Create: `web/vite.config.ts`
- Create: `web/index.html`
- Create: `web/.env.local`
- Create: `web/src/main.tsx`
- Create: `web/src/styles.css`
- Create: `web/src/supabase.ts`
- Create: `web/src/App.tsx`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (Task 1)
- Produces: `sb` — браузерный клиент Supabase; компонент `App`, который показывает форму входа до авторизации и `Board` после

- [ ] **Step 1: Создать проект Vite**

Run: `npm create vite@latest web -- --template react-ts`
Expected: папка `web/` с каркасом.

- [ ] **Step 2: Поставить зависимости**

Run: `cd web && npm install && npm install @supabase/supabase-js && npm install -D tailwindcss @tailwindcss/vite`

- [ ] **Step 3: Подключить Tailwind в `web/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

- [ ] **Step 4: Заменить `web/src/styles.css`**

Удалить `web/src/App.css` и `web/src/index.css`, создать `web/src/styles.css`:

```css
@import "tailwindcss";

/* Тёмная тема обязательна: доска открывается и ночью с телефона.
   Цвет несёт смысл и только его — янтарный «ждёт тебя», красный «баг»,
   зелёный «закрыто». Всё остальное серое. */
@theme {
  --color-ground: #ffffff;
  --color-panel: #f6f6f4;
  --color-ink: #1a1a18;
  --color-muted: #6b6b66;
  --color-line: #e4e4e0;
  --color-wait: #faeeda;
  --color-wait-ink: #854f0b;
}

@media (prefers-color-scheme: dark) {
  @theme {
    --color-ground: #17171a;
    --color-panel: #1f1f23;
    --color-ink: #ececea;
    --color-muted: #9a9a94;
    --color-line: #2c2c31;
    --color-wait: #3a2c12;
    --color-wait-ink: #f0c078;
  }
}

body {
  background: var(--color-ground);
  color: var(--color-ink);
  font-family: ui-sans-serif, system-ui, sans-serif;
}
```

- [ ] **Step 5: Создать `web/.env.local`**

```
VITE_SUPABASE_URL=<url из Task 1>
VITE_SUPABASE_ANON_KEY=<анонимный ключ из Task 1>
```

Файл уже покрыт `.gitignore` (`.env.local`). Анонимный ключ не секрет — он попадает в собранный бандл и защищён политикой RLS, — но держать его вне репозитория всё равно правильнее.

- [ ] **Step 6: Написать `web/src/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js';

export const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export type Check = { text: string; done: boolean };

export type Item = {
  id: string; seq: number; project_id: string; epic_id: string | null;
  type: 'task' | 'bug' | 'chore'; title: string; body: string | null;
  status: 'backlog' | 'doing' | 'waiting' | 'done';
  checklist: Check[]; position: number; archived_at: string | null;
};

export type Project = { id: string; name: string; prefix: string };
```

- [ ] **Step 7: Создать заглушку `web/src/Board.tsx`**

`App.tsx` из следующего шага импортирует доску, а её настоящая версия
приедет только в Task 8. Без заглушки сборка не пройдёт.

```tsx
export function Board() {
  return <p className="p-6 text-sm text-(--color-muted)">Доска будет здесь.</p>;
}
```

- [ ] **Step 8: Написать `web/src/App.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { sb } from './supabase';
import { Board } from './Board';

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
      options: { emailRedirectTo: window.location.origin },
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

- [ ] **Step 9: Переписать `web/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
```

- [ ] **Step 10: Ручной шаг владельца — разрешить адрес возврата**

Это ручной шаг, выполняет владелец проекта. В консоли Supabase: Authentication → URL Configuration → добавить в **Redirect URLs** адрес `http://localhost:5173`. Без него ссылка из письма приведёт в никуда.

Адрес Netlify добавляется в Task 10, когда он станет известен.

- [ ] **Step 11: Проверить вход живьём**

Run: `cd web && npm run dev`

Открыть `http://localhost:5173`, ввести `shakov.georgy@gmail.com`, получить письмо, перейти по ссылке.
Expected: форма входа сменяется заглушкой «Доска будет здесь».

- [ ] **Step 12: Проверить, что чужак ничего не видит**

Войти по ссылке, отправленной на любой другой адрес.
Expected: вход проходит (Supabase пускает кого угодно), но данных нет — RLS не отдаёт ни одной строки. Проверить это в консоли браузера:

```js
await sb.from('projects').select('*')
```
Expected: пустой массив, без ошибки.

Это и есть защита: она живёт в базе, а не в коде страницы.

- [ ] **Step 13: Коммит**

```bash
git add web/ ':!web/.env.local'
git commit -m "Веб-клиент: каркас Vite, тема, вход по ссылке на почту"
```

---

### Task 8: Доска на четыре колонки

**Files:**
- Create: `web/src/Board.tsx`

**Interfaces:**
- Consumes: `sb`, типы `Item`, `Project` из `supabase.ts` (Task 7)
- Produces: компонент `Board` — заменяет заглушку из Task 7. Внутри него живёт `reload(project)`, к которой Task 9 подцепит форму заведения задачи

- [ ] **Step 1: Заменить заглушку `web/src/Board.tsx` целиком**

```tsx
import { useEffect, useState } from 'react';
import { sb } from './supabase';
import type { Item, Project } from './supabase';

const COLUMNS = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'doing',   label: 'В работе' },
  { key: 'waiting', label: 'Нужно от тебя' },
  { key: 'done',    label: 'Готово' },
] as const;

export function Board() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<string>('');
  const [items, setItems] = useState<Item[]>([]);

  const reload = async (project: string) => {
    if (!project) return;
    const { data } = await sb.from('items').select('*')
      .eq('project_id', project).is('archived_at', null)
      .order('position');
    setItems((data ?? []) as Item[]);
  };

  useEffect(() => {
    sb.from('projects').select('*').is('archived_at', null)
      .order('position')
      .then(({ data }) => {
        const ps = (data ?? []) as Project[];
        setProjects(ps);
        if (ps.length) setCurrent(ps[0].id);
      });
  }, []);

  useEffect(() => { reload(current); }, [current]);

  return (
    <div className="min-h-dvh p-4 md:p-6 max-w-6xl mx-auto">
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
        <span className="text-sm text-(--color-muted)">
          {items.filter(i => i.status === 'done').length}/{items.length}
        </span>
      </header>

      {/* Телефон — одна вертикаль, десктоп — четыре колонки. */}
      <div className="grid gap-3 md:grid-cols-4">
        {COLUMNS.map(col => {
          const list = items.filter(i => i.status === col.key);
          return (
            <section key={col.key}>
              <h2 className="text-xs text-(--color-muted) mb-2 px-1">
                {col.label} {list.length > 0 && list.length}
              </h2>
              <div className="space-y-2">
                {list.map(i => (
                  <Card key={i.id} item={i} onChanged={() => reload(current)} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Card({ item, onChanged }: { item: Item; onChanged: () => void }) {
  const done = item.checklist.filter(s => s.done).length;
  const waiting = item.status === 'waiting';

  const move = async (status: Item['status']) => {
    await sb.from('items').update({
      status,
      closed_at: status === 'done' ? new Date().toISOString() : null,
    }).eq('id', item.id);
    onChanged();
  };

  return (
    <article
      className={`rounded-lg p-2.5 text-sm ${
        waiting ? 'bg-(--color-wait)' : 'bg-(--color-panel)'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className={`text-[11px] font-mono ${
            waiting ? 'text-(--color-wait-ink)' : 'text-(--color-muted)'
          }`}
        >
          {item.seq}
        </span>
        {item.type !== 'task' && (
          <span className="text-[10px] px-1.5 py-px rounded
                           bg-red-100 text-red-800">
            {item.type === 'bug' ? 'баг' : 'долг'}
          </span>
        )}
      </div>

      <p className={waiting ? 'text-(--color-wait-ink)' : ''}>{item.title}</p>

      {item.checklist.length > 0 && (
        <p className="text-[11px] text-(--color-muted) mt-1.5">
          {done}/{item.checklist.length}
        </p>
      )}

      <select
        value={item.status}
        onChange={e => move(e.target.value as Item['status'])}
        aria-label={`Статус задачи ${item.title}`}
        className="mt-2 w-full h-7 px-1 rounded text-[11px]
                   bg-transparent border border-(--color-line)
                   text-(--color-muted)"
      >
        <option value="backlog">Backlog</option>
        <option value="doing">В работе</option>
        <option value="waiting">Нужно от тебя</option>
        <option value="done">Готово</option>
      </select>
    </article>
  );
}
```

Перетаскивания мышью здесь нет намеренно: `select` работает и пальцем, и мышью, и с клавиатуры, и стоит ноль зависимостей. `@dnd-kit` приедет во втором плане, если выяснится, что выбор статуса раздражает.

- [ ] **Step 2: Проверить доску живьём**

Run: `cd web && npm run dev`
Expected: видны задачи импортированного плана, разложенные по колонкам; ручной шаг стоит в «Нужно от тебя» янтарной карточкой.

- [ ] **Step 3: Проверить смену статуса**

Перевести любую задачу в «В работе», обновить страницу.
Expected: задача осталась в новой колонке.

- [ ] **Step 4: Проверить телефон**

Открыть в браузере инструменты разработчика, включить эмуляцию ширины 375px.
Expected: колонки встали в одну вертикаль, горизонтальной прокрутки нет.

- [ ] **Step 5: Коммит**

```bash
git add web/src/Board.tsx
git commit -m "Доска: четыре колонки, смена статуса, одна вертикаль на телефоне"
```

---

### Task 9: Заведение задачи

**Files:**
- Create: `web/src/guess.ts`
- Create: `web/test/guess.test.ts`
- Create: `web/src/NewTask.tsx`
- Modify: `web/package.json` (добавить скрипт `test`)
- Modify: `web/src/Board.tsx` (подключить форму)

**Interfaces:**
- Consumes: `sb`, тип `Item` из `supabase.ts` (Task 7); `reload` внутри `Board` (Task 8)
- Produces: `guessType(title: string): Item['type']`; `stripPrefix(title: string): string`; компонент `NewTask({ project, onAdded })`

Угадывание типа — единственная настоящая логика в веб-клиенте, поэтому она выносится в отдельный файл без React и покрывается тестами. Node исполняет его напрямую, отдельный тестовый фреймворк не нужен.

- [ ] **Step 1: Написать падающий тест**

Создать `web/test/guess.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessType, stripPrefix } from '../src/guess.ts';

test('слово "баг" в начале даёт тип bug', () => {
  assert.equal(guessType('баг: календарь не листает'), 'bug');
  assert.equal(guessType('Починить календарь'), 'bug');
  assert.equal(guessType('не работает вход'), 'bug');
});

test('слова про уборку дают тип chore', () => {
  assert.equal(guessType('рефактор гейта'), 'chore');
  assert.equal(guessType('почистить мёртвый код'), 'chore');
});

test('обычный текст остаётся задачей', () => {
  assert.equal(guessType('Добавить экран архива'), 'task');
  assert.equal(guessType(''), 'task');
});

test('слово-признак в середине не считается', () => {
  assert.equal(guessType('Добавить отчёт про баги'), 'task');
});

test('префикс до двоеточия срезается', () => {
  assert.equal(stripPrefix('баг: календарь не листает'),
    'календарь не листает');
  assert.equal(stripPrefix('чиним:   пробелы  '), 'пробелы');
});

test('текст без префикса не трогается', () => {
  assert.equal(stripPrefix('Добавить экран архива'), 'Добавить экран архива');
});

test('текст, состоящий из одного префикса, не превращается в пустоту', () => {
  assert.equal(stripPrefix('баг:'), 'баг:');
});
```

- [ ] **Step 2: Прогнать тест — должен падать**

Добавить в `web/package.json` в раздел `scripts`:

```json
    "test": "node --test test/guess.test.ts"
```

Run: `cd web && npm test`
Expected: FAIL — `Cannot find module '../src/guess.ts'`.

- [ ] **Step 3: Написать `web/src/guess.ts`**

```ts
import type { Item } from './supabase';

/* Тип угадывается по первым словам. Ошибка стоит один клик по пилюле,
   поэтому угадывание дешевле, чем обязательный выбор при каждом вводе. */
const BUG = /^\s*(баг|bug|ошибка|не работает|сломал|починить|чиним|фикс)/i;
const CHORE = /^\s*(долг|рефактор|почистить|убрать|обновить зависимост)/i;

export function guessType(title: string): Item['type'] {
  if (BUG.test(title)) return 'bug';
  if (CHORE.test(title)) return 'chore';
  return 'task';
}

/* "баг: календарь не листает" → "календарь не листает".
   Если после двоеточия ничего не осталось, текст возвращается как есть —
   пустой заголовок хуже неудачно срезанного. */
export function stripPrefix(title: string): string {
  return title.replace(/^\s*\w+\s*:\s*/, '').trim() || title.trim();
}
```

- [ ] **Step 4: Прогнать тесты — должны пройти**

Run: `cd web && npm test`
Expected: PASS, 7 тестов.

- [ ] **Step 5: Написать `web/src/NewTask.tsx`**

```tsx
import { useState } from 'react';
import { sb } from './supabase';
import type { Item } from './supabase';
import { guessType, stripPrefix } from './guess';

export function NewTask(
  { project, onAdded }: { project: string; onAdded: () => void },
) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<Item['type']>('task');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onTitle = (v: string) => {
    setTitle(v);
    setError('');
    if (!touched) setType(guessType(v));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = stripPrefix(title);
    if (!clean) { setError('Напиши, что надо сделать'); return; }
    setBusy(true);

    const { data: seqData, error: seqErr } = await sb
      .rpc('next_seq', { p_project: project, p_kind: 'item' });
    if (seqErr) { setError(seqErr.message); setBusy(false); return; }

    const { data: p } = await sb.from('projects')
      .select('prefix').eq('id', project).single();

    const { error } = await sb.from('items').insert({
      id: `${p!.prefix}-${seqData}`,
      seq: seqData,
      project_id: project,
      type,
      title: clean,
      status: 'backlog',
      created_by: 'me',
      position: Date.now() % 1_000_000,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }

    setTitle(''); setType('task'); setTouched(false); setOpen(false);
    onAdded();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="h-8 px-3 rounded-lg bg-(--color-ink)
                   text-(--color-ground) text-sm"
      >
        Новая задача
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="w-64 space-y-2">
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

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 h-8 rounded-lg bg-(--color-ink)
                     text-(--color-ground) text-sm"
        >
          {busy ? '…' : 'В Backlog'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setTitle(''); setError(''); }}
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

- [ ] **Step 6: Подключить форму к доске**

В `web/src/Board.tsx` добавить импорт:

```tsx
import { NewTask } from './NewTask';
```

и вернуть кнопку в шапку — сразу после счётчика внутри `<header>`:

```tsx
        <div className="ml-auto">
          <NewTask project={current} onAdded={() => reload(current)} />
        </div>
```

- [ ] **Step 7: Проверить угадывание типа**

Ввести `баг: календарь не листает`.
Expected: пилюля «баг» подсвечена, в базу уходит заголовок без префикса — `календарь не листает`.

- [ ] **Step 8: Проверить, что ручной выбор перебивает угадывание**

Ввести `баг: что-то`, ткнуть пилюлю «задача», дописать текст.
Expected: тип остаётся `задача` — угадывание больше не вмешивается.

- [ ] **Step 9: Проверить отказ на пустом вводе**

Отправить форму с пустым полем.
Expected: сообщение «Напиши, что надо сделать», задача не создаётся.

- [ ] **Step 10: Проверить, что задача видна агенту**

Через агента вызвать `board`.
Expected: заведённая с сайта задача видна в выводе инструмента с пометкой, что завёл её не агент.

- [ ] **Step 11: Коммит**

```bash
git add web/src/guess.ts web/test/guess.test.ts web/src/NewTask.tsx web/src/Board.tsx web/package.json
git commit -m "Заведение задачи: одно поле, угадывание типа, отмена угадывания"
```

---

### Task 10: Выкладка сайта

**Files:**
- Create: `netlify.toml`

**Interfaces:**
- Consumes: собранный `web/dist` (Task 8, 9)
- Produces: публичный адрес доски

- [ ] **Step 1: Создать `netlify.toml` в корне репозитория**

```toml
[build]
  base    = "web"
  command = "npm run build"
  publish = "web/dist"

# Одностраничное приложение: любой путь отдаёт index.html, иначе
# возврат по ссылке из письма упрётся в 404.
[[redirects]]
  from = "/*"
  to   = "/index.html"
  status = 200
```

- [ ] **Step 2: Проверить сборку локально**

Run: `cd web && npm run build`
Expected: папка `web/dist` создана, ошибок типизации нет.

- [ ] **Step 3: Владелец подтверждает выкладку**

Это шаг с внешним эффектом: сайт станет доступен в интернете. Спросить владельца прежде, чем выполнять.

- [ ] **Step 4: Выложить через MCP-инструменты Netlify**

Создать проект и задать переменные окружения сборки `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` теми же значениями, что в `web/.env.local`.

- [ ] **Step 5: Ручной шаг владельца — добавить адрес в Supabase**

Это ручной шаг, выполняет владелец проекта. В консоли Supabase: Authentication → URL Configuration → добавить выданный Netlify адрес в **Redirect URLs** и в **Site URL**.

Без этого вход по ссылке с телефона будет возвращать на `localhost`.

- [ ] **Step 6: Проверить вход с телефона**

Открыть адрес на телефоне, войти по ссылке из почты.
Expected: доска открывается, задачи видны, колонки идут одной вертикалью.

- [ ] **Step 7: Коммит**

```bash
git add netlify.toml
git commit -m "Выкладка доски на Netlify"
```

---

### Task 11: Правила ведения доски

**Files:**
- Modify: `~/.claude/CLAUDE.md`
- Create: `README.md`

**Interfaces:**
- Consumes: инструменты из Task 4 и 6
- Produces: постоянные правила поведения агента

- [ ] **Step 1: Дописать раздел в `~/.claude/CLAUDE.md`**

Добавить в конец файла:

```markdown
# Канбан

Доска: <подставить реальный адрес, выданный Netlify в Task 10>.
Инструменты MCP-сервера `kanban`: `board`, `get`, `add`, `update`,
`comment`, `import_plan`.

**Читаю доску только по просьбе. Веду — всегда.** Отдельной команды на
ведение не требуется: если работа идёт над проектом, который есть на
доске, карточки заводятся и обновляются сами собой.

Работа идёт тремя способами, и доска ведётся во всех трёх:

| Событие | Действие |
|---|---|
| Написан план через `writing-plans` | `import_plan` немедленно |
| Попросили сделать что-то без плана | карточка **до** начала работы, сразу `doing` |
| Требование добавилось в идущую работу | новая карточка в тот же эпик, либо пункт чеклиста, если это шаг внутри текущей задачи |
| Проект добивается без плана | каждая осмысленная единица — отдельная карточка |
| Задача взята в работу | `update` → `doing` |
| Упёрся в ручной шаг или вопрос | карточка в `waiting` и **остановка работы** |
| Найден баг или долг мимо темы | карточка в `backlog`, работа продолжается |
| Задача закончена | `comment` с итогом, затем `update` → `done` |

**Порог.** Карточка заводится, если работа оставляет след: правку в файле,
коммит, решение, находку. Не заводится на чтение, поиск, ответ на вопрос
и разовую однострочную правку по ходу разговора. Сомнение — в пользу
заведения.

**Формат комментария — одно-три предложения.** Что сделано, что найдено
по пути, что с этим сделано. Логи вызовов инструментов, перечисление
прочитанных файлов и промежуточные попытки на доску не попадают никогда.

**Доска и `.md` план не спорят.** Файл плана — то, по чему идёт
исполнение; доска — то, где видно состояние. Синхронизация на границах
задач, не на каждом шаге.
```

- [ ] **Step 2: Написать `README.md`**

```markdown
# Канбан

Личная доска задач по проектам. Владелец заводит задачи с телефона,
Claude Code ведёт их через MCP.

## Что где

- `supabase/migrations/` — схема базы, индексы, RLS
- `mcp/` — MCP-сервер: шесть инструментов для агента
- `web/` — веб-клиент на Vite
- `docs/superpowers/specs/` — спека
- `docs/superpowers/plans/` — планы

## Запуск

```bash
cd web && npm run dev     # сайт на localhost:5173
cd mcp && npm test        # тесты парсера планов и форматов вывода
cd web && npm test        # тест угадывания типа задачи
```

MCP-сервер запускается Claude Code сам, вручную его поднимать не нужно.
Подключается один раз:

```bash
claude mcp add kanban --scope user --env SUPABASE_URL=... --env SUPABASE_SERVICE_KEY=... -- node <путь>/mcp/src/index.ts
```

## Доступ

Читать и писать может только владелец — проверка в RLS-политике Postgres,
а не в коде клиента. Сервисный ключ живёт только в пользовательском
конфиге MCP и в репозиторий не попадает.
```

- [ ] **Step 3: Коммит**

```bash
git add README.md
git commit -m "Правила ведения доски и описание проекта"
```

Файл `~/.claude/CLAUDE.md` лежит вне репозитория и не коммитится.

---

### Task 12: Живая проверка целиком

**Files:**
- Modify: никаких. Задача проверочная.

**Interfaces:**
- Consumes: всё построенное в Task 1–11

- [ ] **Step 1: Проверить полный круг с телефона**

Завести с телефона задачу в проект `kanban`. Затем в новой сессии Claude Code вызвать `board`.
Expected: задача видна агенту.

- [ ] **Step 2: Проверить полный круг со стороны агента**

Взять эту задачу в работу (`update` → `doing`), сделать что-нибудь мелкое, записать `comment`, закрыть (`update` → `done`).
Expected: на сайте видны все три изменения после обновления страницы.

- [ ] **Step 3: Прогнать все тесты**

Run: `cd mcp && npm test && cd ../web && npm test`
Expected: зелёные оба набора — форматы и парсер в `mcp`, угадывание типа в `web`.

- [ ] **Step 4: Проверить, что секретов нет в репозитории**

Run: `git log -p | grep -iE "service_role|eyJ[A-Za-z0-9_-]{20,}" | head`
Expected: пусто. Если что-то нашлось — ключ скомпрометирован, его нужно отозвать в консоли Supabase и выпустить заново, а историю переписать.

- [ ] **Step 5: Записать результат на саму доску**

Через `comment` на задаче эпика `KAN-E1` — или новой карточкой, если её нет: что построено, что осталось на второй план.

Это первая настоящая запись в журнал и одновременно проверка того, что формат отчёта соблюдается.

---

## Что дальше

**План №2 — удобство.** Экран эпика со свёрнутым списком задач и комментариями, мобильный список со свайпом по карточке, перетаскивание мышью через `@dnd-kit`, архив закрытых задач, живое обновление через Supabase Realtime, экран «Все проекты».

Пишется после того, как первый план проживёт несколько дней. За это время станет видно, что из списка выше действительно нужно, а что было придумано заранее.
