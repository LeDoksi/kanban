import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Item, Epic } from './supabase';
import { groupItemsByEpic, emptyEpics } from './epics';
import { DONE_SHOWN, recentDone } from './done';
import { COLUMNS, EMPTY_TEXT } from './columns';
import { Card, CardSkeleton } from './Card';
import { STATUS_ICON } from './statusIcons';
import { EpicGroupHeader } from './EpicGroupHeader';

export function Column(
  { col, items, epics, allItems, archivedCount, onChanged, onOpen, onOpenEpic, onShowArchive, bare, loading }: {
    col: typeof COLUMNS[number]; items: Item[]; epics: Epic[]; allItems: Item[];
    archivedCount: number;
    onChanged: () => void;
    onOpen: (item: Item) => void; onOpenEpic: (epicId: string) => void;
    onShowArchive: () => void;
    bare: boolean;
    loading: boolean;
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
    <section ref={setNodeRef} className="h-full min-h-0 flex flex-col">
      {!bare && (
        <h2 className="flex items-center gap-2 px-1 pb-3 text-meta text-(--color-muted)">
          {col.label}
          {full.length > 0 && <span className="text-micro">{full.length}</span>}
        </h2>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain pb-28 lg:pb-6 -mx-1 px-1 pt-1 thin-scroll">
        {loading ? (
          <div className="space-y-2">
            <CardSkeleton /><CardSkeleton /><CardSkeleton />
          </div>
        ) : list.length === 0 && pinnedEmpty.length === 0 ? (
          <EmptyColumn status={col.key} />
        ) : (
          <SortableContext
            items={[...groups.flatMap(g => g.items), ...ungrouped].map(i => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-5">
              {groups.map(({ epic, items: epicItems }) => (
                // Плашка вместо рамки: видно, где кончается эпик и начинаются
                // задачи без эпика (KAN-125), но без «коробки в коробке».
                <div key={epic.id} className="rounded-[18px] bg-(--color-group) p-1.5 space-y-1.5">
                  <EpicGroupHeader epic={epic} allItems={allItems} onOpen={onOpenEpic} />
                  <div className="space-y-1.5">
                    {epicItems.map(i => (
                      <Card key={i.id} item={i} onChanged={onChanged} onOpen={onOpen} />
                    ))}
                  </div>
                </div>
              ))}
              {pinnedEmpty.map(epic => (
                <div key={epic.id} className="rounded-[18px] bg-(--color-group) p-1.5 space-y-1.5">
                  <EpicGroupHeader epic={epic} allItems={allItems} onOpen={onOpenEpic} />
                </div>
              ))}
              {ungrouped.length > 0 && (
                <div className="space-y-2">
                  {(groups.length + pinnedEmpty.length > 0) && (
                    <h3 className="px-1 pb-1 text-meta text-(--color-muted)">Без эпика</h3>
                  )}
                  {ungrouped.map(i => (
                    <Card key={i.id} item={i} onChanged={onChanged} onOpen={onOpen} />
                  ))}
                </div>
              )}
            </div>
          </SortableContext>
        )}
        {capped && (hiddenDone > 0 || archivedCount > 0) && (
          <button
            onClick={onShowArchive}
            className="text-meta text-(--color-muted) hover:text-(--color-ink) mt-2 px-1"
          >
            ещё {hiddenDone + archivedCount} · архив
          </button>
        )}
      </div>
    </section>
  );
}

function EmptyColumn({ status }: { status: Item['status'] }) {
  const Icon = STATUS_ICON[status];
  return (
    <div className="flex flex-col items-center gap-2 text-center px-6 py-12 text-(--color-muted)">
      <Icon size={28} />
      <p className="text-meta max-w-60">{EMPTY_TEXT[status]}</p>
    </div>
  );
}
