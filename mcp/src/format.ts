/* Форматы вывода для агента. Здесь экономятся токены: ни одного лишнего
   слова, ни одной скобки JSON. Числа выравниваются по правому краю,
   чтобы столбец читался глазом. */
import type { Item, Comment, Epic } from './db.ts';

export type BoardHead = {
  project: string;
  description?: string | null;
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
  // Описание — одной строкой с проектом, не отдельной строкой:
  // компактность важнее структуры для формата, который читает агент.
  const desc = head.description ? ` — ${head.description}` : '';
  const lines = [`${head.project}${desc}${epic} (${head.done}/${head.total})`];

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
