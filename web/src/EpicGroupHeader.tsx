import { CaretRight } from '@phosphor-icons/react';
import type { Epic, Item } from './supabase';
import { epicProgress } from './epics';
import { ProgressRing } from './ui/ProgressRing';

// Шапка группы эпика — строка-кнопка на всю ширину. Раньше это была
// подчёркнутая ссылка по центру, переносившаяся на 2–3 строки.
export function EpicGroupHeader(
  { epic, allItems, onOpen }: { epic: Epic; allItems: Item[]; onOpen: (id: string) => void },
) {
  const { done, total } = epicProgress(epic.id, allItems);
  return (
    <button
      onClick={() => onOpen(epic.id)}
      className="w-full flex items-center gap-2 h-8 px-1 rounded-xl text-meta text-(--color-ink-2)
                 hover:bg-(--color-raised) active:scale-[0.99] transition-transform"
    >
      <ProgressRing done={done} total={total} size={14} />
      <span className="flex-1 min-w-0 truncate text-left">{epic.title}</span>
      <span className="text-micro text-(--color-muted)">{done}/{total}</span>
      <CaretRight size={14} className="text-(--color-muted)" />
    </button>
  );
}
