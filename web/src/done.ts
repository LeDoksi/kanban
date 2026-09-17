import type { Item } from './supabase';

// «Готово» — единственная колонка, которая обрезается: и шапка (счётчик
// скрытых), и сама колонка должны видеть один и тот же срез последних
// N закрытых, иначе список карточек и счётчики расходятся между собой.
export const DONE_SHOWN = 5;

export function recentDone(items: Item[]): Item[] {
  return items
    .filter(i => i.status === 'done' && !i.archived_at)
    .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''));
}

export function shownDoneIds(items: Item[]): Set<string> {
  return new Set(recentDone(items).slice(0, DONE_SHOWN).map(i => i.id));
}
