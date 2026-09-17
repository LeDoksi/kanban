/* Семь инструментов агента. Описания намеренно короткие: каждое слово
   здесь оплачивается в системном промпте каждого запроса. Ответы —
   одна строка подтверждения, а не эхо созданных объектов. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { sb, resolveProject } from './db.ts';
import type { Item, Epic, Comment, Project } from './db.ts';
import { formatBoard, formatItem } from './format.ts';
import { parsePlan } from './parse-plan.ts';

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });

const STATUS = z.enum(['backlog', 'hold', 'doing', 'waiting', 'done']);
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

    // Эпик проверяется до счёта задач: несуществующий id иначе дал бы
    // тот же пустой (0/0), что и реальный пустой эпик, — неразличимо.
    let head = null as Epic | null;
    if (epic) {
      const r = await sb.from('epics').select('*').eq('id', epic).maybeSingle();
      if (r.error) throw new Error(r.error.message);
      if (!r.data) throw new Error(`Эпик ${epic} не найден`);
      head = r.data as Epic;
    }

    // Архивные тянем тоже: они не показываются в списке (formatBoard
    // отфильтрует), но считаются в «сделано из всего» — иначе счётчик
    // едет назад, когда готовые карточки убирают из колонки.
    let q = sb.from('items').select('*').eq('project_id', p.id);
    if (epic) q = q.eq('epic_id', epic);
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const items = (data ?? []) as Item[];

    // Список эпиков — только когда доска не сужена до одного из них:
    // иначе это единственный способ узнать ID эпика без get() задачи.
    let epics: { id: string; title: string; done: number; total: number }[] | undefined;
    if (!epic) {
      const er = await sb.from('epics').select('*')
        .eq('project_id', p.id).neq('status', 'archived');
      if (er.error) throw new Error(er.error.message);
      epics = (er.data as Epic[] ?? []).map(e => {
        const own = items.filter(i => i.epic_id === e.id);
        return {
          id: e.id, title: e.title,
          done: own.filter(i => i.status === 'done').length,
          total: own.length,
        };
      });
    }

    return text(formatBoard(items, {
      project: p.id,
      description: p.description,
      epic: head ? { id: head.id, title: head.title } : null,
      done: items.filter(i => i.status === 'done').length,
      total: items.length,
      epics,
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
        type: it.type,
        title: it.title,
        body: it.body ?? null,
        status: it.status,
        checklist: (it.checklist ?? []).map(t => ({ text: t, done: false })),
        blocks: it.blocks ?? [],
        // seq монотонен и уникален внутри проекта, шаг 100 оставляет
        // место вставить карточку между соседними дробной позицией.
        position: seq * 100,
        created_by: 'claude',
      };
      // Вставляем сразу, а не пачкой в конце: next_seq() видит состояние
      // items ДО вставки, и пачка в конце дала бы всем строкам один seq.
      // ponytail: вставка построчная, не в транзакции — сбой на середине
      // массива оставит более ранние строки уже записанными без явного
      // сигнала об этом вызывающему. Обновить на атомарный RPC-батч,
      // если частичные импорты когда-нибудь станут реальной проблемой.
      const { error } = await sb.from('items').insert(row);
      if (error) throw new Error(error.message);
      rows.push(row);
    }

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
    if (a.archive !== undefined) {
      patch.archived_at = a.archive ? new Date().toISOString() : null;
    }

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
      a.archive !== undefined && (a.archive ? 'в архив' : 'из архива'),
    ].filter(Boolean).join('; ');
    return text(`${a.id} ${what || 'обновлена'}`);
  });

  server.registerTool('comment', {
    description: 'Записать краткий итог в журнал задачи',
    inputSchema: { id: z.string(), text: z.string() },
  }, async ({ id, text: body }) => {
    // Без проверки чужой id всплыл бы сырым нарушением внешнего ключа.
    const check = await sb.from('items').select('id').eq('id', id).single();
    if (check.error) throw new Error(`Задача ${id} не найдена`);

    const { error } = await sb.from('comments')
      .insert({ item_id: id, author: 'claude', body });
    if (error) throw new Error(error.message);
    return text(`${id}: записано`);
  });

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

    // Повторный вызов на том же файле иначе продублировал бы эпик и все
    // задачи целиком. План опознаётся по plan_path внутри проекта.
    const dup = await sb.from('epics').select('id')
      .eq('project_id', p.id).eq('plan_path', path).maybeSingle();
    // Ошибку проверки (например, .maybeSingle() на двух совпавших строках,
    // если дубликат уже случился раньше) трактуем как «лучше отказать
    // в импорте», а не тихо пропускаем дальше и плодим ещё один дубль.
    if (dup.error) throw new Error(dup.error.message);
    if (dup.data) {
      return text(`${dup.data.id} уже импортирован из ${path}. Импорт отменён.`);
    }

    const eseq = await nextSeq(p.id, 'epic');
    const epicId = `${p.prefix}-E${eseq}`;
    const e = await sb.from('epics').insert({
      id: epicId, seq: eseq, project_id: p.id,
      title: plan.title, goal: plan.goal || null,
      plan_path: path, spec_path: plan.specPath,
      position: eseq * 100,
    });
    if (e.error) throw new Error(e.error.message);

    const rows = [];
    let manual = 0;

    for (const t of plan.tasks) {
      const seq = await nextSeq(p.id, 'item');
      const id = `${p.prefix}-${seq}`;
      const taskRow = {
        id, seq, project_id: p.id, epic_id: epicId, type: 'task',
        title: t.title, body: t.body || null, status: 'backlog',
        checklist: t.checklist.map(s => ({ text: s, done: false })),
        blocks: [], position: seq * 100, created_by: 'claude',
      };
      // Вставляем сразу же, как и в add(): next_seq() иначе не увидит
      // строки, ещё не вставленные из этого же вызова.
      // ponytail: то же самое допущение об атомарности, что и в add() —
      // сбой на середине плана оставит уже импортированные задачи на
      // доске без отдельного сигнала об этом.
      const taskIns = await sb.from('items').insert(taskRow);
      if (taskIns.error) throw new Error(taskIns.error.message);
      rows.push(taskRow);

      // Ручной шаг вынимается из задачи и становится карточкой владельцу,
      // которая её же и блокирует.
      for (const m of t.manualSteps) {
        const mseq = await nextSeq(p.id, 'item');
        const manualRow = {
          id: `${p.prefix}-${mseq}`, seq: mseq, project_id: p.id,
          epic_id: epicId, type: 'chore', title: m,
          body: `Ручной шаг из задачи «${t.title}».`,
          status: 'waiting', checklist: [], blocks: [id],
          position: mseq * 100, created_by: 'claude',
        };
        const manualIns = await sb.from('items').insert(manualRow);
        if (manualIns.error) throw new Error(manualIns.error.message);
        rows.push(manualRow);
        manual++;
      }
    }

    const steps: number = plan.tasks.reduce((n, t) => n + t.checklist.length, 0);
    return text(
      `${epicId} «${plan.title}»: ${plan.tasks.length} задач, ${steps} шагов` +
      (manual ? `, ${manual} ждёт тебя` : '') +
      `\nПроверь разбор глазами: get ${rows[0].id}`,
    );
  });

  server.registerTool('project', {
    description: 'Создать проект или обновить его имя/префикс/описание',
    inputSchema: {
      id: z.string(),
      name: z.string().optional(),
      prefix: z.string().optional(),
      description: z.string().optional(),
    },
  }, async ({ id, name, prefix, description }) => {
    const existing = await sb.from('projects').select('*').eq('id', id).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);

    if (existing.data) {
      const cur = existing.data as Project;
      const patch: Record<string, unknown> = {};
      if (name !== undefined) patch.name = name;
      if (prefix !== undefined) patch.prefix = prefix;
      if (description !== undefined) patch.description = description;
      // Без полей на изменение — это чтение: без него узнать текущие
      // name/prefix/description можно было только через SQL мимо MCP.
      if (!Object.keys(patch).length) {
        return text(`${cur.id} · ${cur.name} [${cur.prefix}]`
          + (cur.description ? ` — ${cur.description}` : ''));
      }
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
}
