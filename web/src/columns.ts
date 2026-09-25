import type { Item } from './supabase';

export type Status = Item['status'];

// Порядок колонок на доске и во вкладках. Раньше жил в Board.tsx и
// swipe.ts по отдельности.
export const COLUMNS = [
  { key: 'hold', label: 'Hold' },
  { key: 'backlog', label: 'Backlog' },
  { key: 'doing', label: 'В работе' },
  { key: 'waiting', label: 'Нужно от тебя' },
  { key: 'done', label: 'Готово' },
] as const satisfies readonly { key: Status; label: string }[];

export const STATUS_ORDER: Status[] = COLUMNS.map(c => c.key);

export const columnLabel = (s: Status): string =>
  COLUMNS.find(c => c.key === s)?.label ?? s;

export const EMPTY_TEXT: Record<Status, string> = {
  hold: 'Здесь то, что отложено',
  backlog: 'Новых задач нет',
  doing: 'Сейчас ничего не в работе',
  waiting: 'Когда Claude будет ждать твоего ответа, задача появится здесь',
  done: 'Закрытых задач пока нет',
};

// Что вернуть по «Отменить» после смены статуса. closed_at берётся
// исходный: иначе задача, случайно унесённая из «Готово», вернулась бы
// с датой закрытия «сейчас» и переехала бы в начало колонки.
export function undoPatch(item: Item): Pick<Item, 'status' | 'position' | 'closed_at'> {
  return { status: item.status, position: item.position, closed_at: item.closed_at };
}
