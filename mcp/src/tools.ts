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
      const list = ((patch.checklist as typeof item.checklist) ?? item.checklist)
        .map(s => ({ ...s }));
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
