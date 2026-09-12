# Канбан

Личная доска задач по проектам. Владелец заводит задачи с телефона,
Claude Code ведёт их через MCP.

Доска: https://ledoksi.github.io/kanban/

## Что где

- `supabase/migrations/` — схема базы, индексы, RLS
- `mcp/` — MCP-сервер: семь инструментов для агента
- `web/` — веб-клиент на Vite, деплоится на GitHub Pages через
  `.github/workflows/deploy.yml`
- `docs/superpowers/specs/` — спека
- `docs/superpowers/plans/` — планы

## Первый запуск

Пустая база не заводит проекты сама — вставь первую строку в `projects`
через Supabase SQL editor (пример — в конце
`supabase/migrations/20260911000000_schema.sql`).

## Запуск

```bash
cd web && npm run dev     # сайт на localhost:5173
cd mcp && npm test        # тесты парсера планов и форматов вывода
cd web && npm test        # тесты угадывания типа задачи и дробной позиции
```

MCP-сервер запускается Claude Code сам, вручную его поднимать не нужно.
Два способа подключить:

**Через `.mcpb` (проще)** — Claude Desktop → Settings → Extensions →
Advanced settings → Install Extension… → `mcp/mcp.mcpb` (собирается из
`mcp/manifest.json`, см. план №2). Ключи вводятся в открывшейся форме.

**Через терминал:**

```bash
claude mcp add kanban --scope user --env SUPABASE_URL=... --env SUPABASE_SERVICE_KEY=... -- node <путь-до-репозитория>/mcp/src/index.ts
```

## Доступ

Читать и писать может только владелец — проверка в RLS-политике Postgres,
а не в коде клиента. Сервисный ключ живёт только в пользовательском
конфиге MCP и в репозиторий не попадает.
