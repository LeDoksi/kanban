import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Item, Epic } from './supabase';
import { groupItemsByEpic, emptyEpics, epicProgress } from './epics';
import { DONE_SHOWN, recentDone } from './done';
import { COLUMNS } from './columns';
import { Card } from './Card';

export function Column(
  { col, items, epics, allItems, archivedCount, onChanged, onOpen, onOpenEpic, onShowArchive }: {
    col: typeof COLUMNS[number]; items: Item[]; epics: Epic[]; allItems: Item[];
    archivedCount: number;
    onChanged: () => void;
    onOpen: (item: Item) => void; onOpenEpic: (epicId: string) => void;
    onShowArchive: () => void;
  },
) {
  const { setNodeRef } = useDroppable({ id: col.key });

  // «Готово» — единственная колонка, которая обрезается: открытые задачи
  // не должны прятаться, а закрытых со временем становится много.
  // items уже отфильтрованы до status===col.key && !archived_at в Board —
  // recentDone() лишь досортирует по дате закрытия. Группировка по эпику —
  // уже поверх этого обрезанного списка, кап не меняется.
  const capped = col.key === 'done';
  const full = capped ? recentDone(items) : items;
  const list = capped ? full.slice(0, DONE_SHOWN) : full;
  const hiddenDone = capped ? full.length - list.length : 0;

  const groups = groupItemsByEpic(list, epics);
  const groupedIds = new Set(groups.flatMap(g => g.items.map(i => i.id)));
  const ungrouped = list.filter(i => !groupedIds.has(i.id));
  // Пустые эпики (ни одной задачи вообще) торчат только в Backlog —
  // это их «домашняя» колонка, иначе эпик без задач нигде не виден.
  const pinnedEmpty = col.key === 'backlog' ? emptyEpics(epics, allItems) : [];

  return (
    <section
      ref={setNodeRef}
      className="rounded-lg border border-(--color-line) p-2"
    >
      <h2 className="text-meta text-(--color-muted) mb-2 px-1 flex items-center gap-1.5
                     sticky top-0 bg-(--color-ground) py-1 z-10">
        {col.label}
        {full.length > 0 && (
          <span className="text-micro px-1.5 rounded-full bg-(--color-raised)">
            {full.length}
          </span>
        )}
      </h2>
      <SortableContext
        items={[...groups.flatMap(g => g.items), ...ungrouped].map(i => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-3">
          {groups.map(({ epic, items: epicItems }) => (
            // Рамка вокруг всей группы — иначе не видно, где кончаются
            // задачи эпика и начинаются несвязанные (выглядели одинаково,
            // отличаясь только подписью сверху).
            <div key={epic.id} className="rounded-lg border border-(--color-line) p-1.5">
              <button
                onClick={() => onOpenEpic(epic.id)}
                className="text-micro text-(--color-muted) hover:text-(--color-ink) underline mb-1 px-1 block"
              >
                {epic.title} ({epicProgress(epic.id, allItems).done}/{epicProgress(epic.id, allItems).total})
              </button>
              <div className="space-y-2">
                {epicItems.map(i => (
                  <Card key={i.id} item={i} onChanged={onChanged} onOpen={onOpen} />
                ))}
              </div>
            </div>
          ))}
          {pinnedEmpty.map(epic => (
            <button
              key={epic.id}
              onClick={() => onOpenEpic(epic.id)}
              className="text-micro text-(--color-muted) hover:text-(--color-ink) underline px-1 block"
            >
              {epic.title} ({epicProgress(epic.id, allItems).done}/{epicProgress(epic.id, allItems).total})
            </button>
          ))}
          {ungrouped.length > 0 && (
            <div className="space-y-2">
              {ungrouped.map(i => (
                <Card key={i.id} item={i} onChanged={onChanged} onOpen={onOpen} />
              ))}
            </div>
          )}
        </div>
      </SortableContext>
      {capped && (hiddenDone > 0 || archivedCount > 0) && (
        <button
          onClick={onShowArchive}
          className="text-meta text-(--color-muted) hover:text-(--color-ink) mt-2 px-1"
        >
          ещё {hiddenDone + archivedCount} · архив
        </button>
      )}
    </section>
  );
}
