import type { Item } from './supabase';
import type { PanelTone } from './ui/panel';

// Что показывать в строке меты карточки. Отдельно от разметки, чтобы
// правила («всё отмечено», «пробелы — не описание») были проверяемы.
export type CardMeta = {
  checklist: { done: number; total: number; complete: boolean } | null;
  comments: number;
  hasBody: boolean;
};

// Здесь же, а не в Card.tsx: только компоненты в файле — иначе
// react/only-export-components ломает fast refresh (проверено линтером).
export function cardTone(item: Item): PanelTone {
  if (item.status === 'waiting') return 'accent';
  if (item.status === 'done') return 'done';
  return 'default';
}

export function cardMeta(item: Item): CardMeta {
  const total = item.checklist.length;
  const done = item.checklist.filter(s => s.done).length;
  return {
    checklist: total ? { done, total, complete: done === total } : null,
    comments: item.comments?.[0]?.count ?? 0,
    hasBody: !!item.body?.trim(),
  };
}
