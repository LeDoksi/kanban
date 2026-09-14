import { useEffect, useState } from 'react';
import { DndContext, type DragEndEvent, MouseSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { sb } from './supabase';
import type { Item, Project } from './supabase';
import { NewProject } from './NewProject';
import { CreateModal } from './CreateModal';
import { TaskModal } from './TaskModal';
import { ArchiveList } from './ArchiveList';
import { EpicModal } from './EpicModal';
import { AllProjects } from './AllProjects';
import { between } from './position';
import { groupItemsByEpic, emptyEpics, epicProgress } from './epics';
import type { Epic } from './supabase';

const STATUS_ORDER: Item['status'][] = ['backlog', 'doing', 'waiting', 'done'];

const COLUMNS = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'doing',   label: 'В работе' },
  { key: 'waiting', label: 'Нужно от тебя' },
  { key: 'done',    label: 'Готово' },
] as const;

const DONE_SHOWN = 5;

export function Board() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<string>('');
  const [items, setItems] = useState<Item[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [err, setErr] = useState('');
  const [openItem, setOpenItem] = useState<Item | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [viewEpic, setViewEpic] = useState<string | null>(null);
  const [viewAll, setViewAll] = useState(false);

  // Архивные грузим тоже: из колонок они убраны, но в счётчике остаются —
  // иначе прогресс едет назад, когда готовые карточки уходят в архив.
  const reload = async (project: string) => {
    if (!project) return;
    const { data, error } = await sb.from('items').select('*')
      .eq('project_id', project)
      .order('position');
    if (error) { setErr(error.message); return; }
    setErr('');
    const list = (data ?? []) as Item[];
    setItems(list);
    setOpenItem(prev => prev ? (list.find(i => i.id === prev.id) ?? prev) : null);
  };

  const reloadEpics = async (project: string) => {
    if (!project) return;
    const { data, error } = await sb.from('epics').select('*')
      .eq('project_id', project).order('position');
    if (error) { setErr(error.message); return; }
    setEpics((data ?? []) as Epic[]);
  };

  const reloadProjects = async (keepCurrent = true) => {
    const { data, error } = await sb.from('projects').select('*')
      .is('archived_at', null).order('position');
    if (error) { setErr(error.message); return; }
    const ps = (data ?? []) as Project[];
    setProjects(ps);
    if (!keepCurrent && ps.length) setCurrent(ps[0].id);
    if (keepCurrent && !current && ps.length) setCurrent(ps[0].id);
  };

  useEffect(() => { reloadProjects(false); }, []);

  const currentProject = projects.find(p => p.id === current) ?? null;

  useEffect(() => {
    reload(current);
    reloadEpics(current);
    if (!current) return;

    // Пока агент пишет через MCP, доска обновляется сама — без кнопки
    // «обновить» и без опроса по таймеру. epics тоже в publication
    // (план №2, Task 10) — эпик, созданный или переименованный агентом,
    // тоже появляется без перезагрузки.
    const channel = sb
      .channel(`items-${current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `project_id=eq.${current}` },
        () => reload(current),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'epics', filter: `project_id=eq.${current}` },
        () => reloadEpics(current),
      )
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [current]);

  // То же множество «показанных в Готово», что и в рендере колонок —
  // архив показывает всё остальное: и настоящие архивные карточки, и
  // готовые сверх видимых DONE_SHOWN.
  const shownDoneIds = new Set(
    items
      .filter(i => i.status === 'done' && !i.archived_at)
      .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''))
      .slice(0, DONE_SHOWN)
      .map(i => i.id),
  );
  const archivedCount = items.filter(i => i.archived_at).length;
  const archiveItems = items
    .filter(i => i.archived_at || (i.status === 'done' && !shownDoneIds.has(i.id)))
    .sort((a, b) =>
      (b.closed_at ?? b.archived_at ?? '')
        .localeCompare(a.closed_at ?? a.archived_at ?? ''));

  // Хук вызывается безусловно, до любого раннего return — иначе порядок
  // хуков между рендерами разъедет (например, при входе на экран эпика).
  // MouseSensor, не PointerSensor: PointerSensor объединяет мышь и
  // касание, и захватывал бы свайп на телефоне как начало перетаскивания
  // раньше, чем сработают собственные touch-обработчики карточки.
  const sensors = useSensors(useSensor(MouseSensor, {
    activationConstraint: { distance: 5 },
  }));

  if (viewAll) {
    return (
      <AllProjects onSelect={id => { setCurrent(id); setViewAll(false); }} />
    );
  }

  const onDragEnd = async (e: DragEndEvent) => {
    const itemId = e.active.id as string;
    const overId = e.over?.id as string | undefined;
    if (!overId) return;

    const targetStatus = (COLUMNS.find(c => c.key === overId)?.key
      ?? items.find(i => i.id === overId)?.status) as Item['status'] | undefined;
    if (!targetStatus) return;

    const dragged = items.find(i => i.id === itemId);
    if (!dragged) return;

    const columnItems = items
      .filter(i => i.status === targetStatus && !i.archived_at && i.id !== itemId)
      .sort((a, b) => a.position - b.position);

    const droppedOnColumn = COLUMNS.some(c => c.key === overId);
    let before: number | null;
    let after: number | null;

    if (droppedOnColumn) {
      // Отпустили на пустом месте колонки — в конец списка.
      const last = columnItems[columnItems.length - 1];
      before = last ? last.position : null;
      after = null;
    } else {
      const overIndex = columnItems.findIndex(i => i.id === overId);
      if (overIndex === -1) return;
      const overItem = columnItems[overIndex];
      // В той же колонке направление сдвига решает, до карточки или после:
      // тащим вниз (была раньше по position) — после overItem, вверх — до.
      const sameColumn = dragged.status === targetStatus;
      const movingDown = sameColumn && dragged.position < overItem.position;
      if (movingDown) {
        before = overItem.position;
        after = columnItems[overIndex + 1]?.position ?? null;
      } else {
        before = columnItems[overIndex - 1]?.position ?? null;
        after = overItem.position;
      }
    }
    const position = between(before, after);

    const patch: Record<string, unknown> = { position };
    if (dragged.status !== targetStatus) {
      patch.status = targetStatus;
      patch.closed_at = targetStatus === 'done' ? new Date().toISOString() : null;
    }
    const { error } = await sb.from('items').update(patch).eq('id', itemId);
    if (error) { setErr(error.message); return; }
    reload(current);
  };

  return (
    <div className="min-h-dvh p-4 md:p-6 max-w-6xl mx-auto">
      <header className="flex items-center gap-3 mb-5 flex-wrap">
        <button
          onClick={() => setViewAll(true)}
          className="text-sm text-(--color-muted)"
        >
          Все проекты
        </button>
        <select
          value={current}
          onChange={e => setCurrent(e.target.value)}
          className="h-8 px-2 rounded-lg bg-(--color-panel)
                     border border-(--color-line) text-sm"
        >
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {currentProject?.description && (
          <span className="text-sm text-(--color-muted)">
            {currentProject.description}
          </span>
        )}
        {err && <span className="text-sm text-(--color-danger-ink)">{err}</span>}
        <span className="text-sm text-(--color-muted)">
          {items.filter(i => i.status === 'done').length}/{items.length}
        </span>
        <div className="ml-auto flex gap-2">
          <NewProject onCreated={id => { reloadProjects(); setCurrent(id); }} />
          <button
            onClick={() => setShowCreate(true)}
            className="h-8 px-3 rounded-lg bg-(--color-ink)
                       text-(--color-ground) text-sm"
          >
            Новая задача
          </button>
        </div>
      </header>

      {/* Телефон — одна вертикаль, десктоп — четыре колонки. */}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid gap-3 md:grid-cols-4">
          {COLUMNS.map(col => (
            <Column
              key={col.key}
              col={col}
              items={items.filter(i => i.status === col.key && !i.archived_at)}
              epics={epics}
              allItems={items}
              archivedCount={archivedCount}
              onChanged={() => reload(current)}
              onError={setErr}
              onOpen={setOpenItem}
              onOpenEpic={id => setViewEpic(id)}
              onShowArchive={() => setShowArchive(true)}
            />
          ))}
        </div>
      </DndContext>

      {openItem && (
        <TaskModal
          item={openItem}
          epics={epics}
          allItems={items}
          onClose={() => setOpenItem(null)}
          onChanged={() => reload(current)}
          onOpenEpic={id => { setOpenItem(null); setViewEpic(id); }}
        />
      )}

      {showArchive && (
        <ArchiveList
          items={archiveItems}
          onOpen={i => { setShowArchive(false); setOpenItem(i); }}
          onRestore={async i => {
            const { error } = await sb.from('items')
              .update({ status: 'doing', archived_at: null }).eq('id', i.id);
            if (error) { setErr(error.message); return; }
            reload(current);
          }}
          onClose={() => setShowArchive(false)}
        />
      )}

      {showCreate && (
        <CreateModal
          project={current}
          epics={epics}
          items={items}
          onClose={() => setShowCreate(false)}
          onCreated={() => { reload(current); reloadEpics(current); }}
        />
      )}

      {viewEpic && (
        <EpicModal
          epicId={viewEpic}
          onClose={() => setViewEpic(null)}
          onOpenItem={i => { setViewEpic(null); setOpenItem(i); }}
        />
      )}
    </div>
  );
}

function Column(
  { col, items, epics, allItems, archivedCount, onChanged, onError, onOpen, onOpenEpic, onShowArchive }: {
    col: typeof COLUMNS[number]; items: Item[]; epics: Epic[]; allItems: Item[];
    archivedCount: number;
    onChanged: () => void; onError: (msg: string) => void;
    onOpen: (item: Item) => void; onOpenEpic: (epicId: string) => void;
    onShowArchive: () => void;
  },
) {
  const { setNodeRef } = useDroppable({ id: col.key });

  // «Готово» — единственная колонка, которая обрезается: открытые задачи
  // не должны прятаться, а закрытых со временем становится много.
  // Сортируем по дате закрытия — «последние несколько» значит недавно
  // завершённые, а не недавно созданные. Группировка по эпику — уже
  // поверх этого обрезанного списка, кап не меняется.
  const capped = col.key === 'done';
  const full = capped
    ? [...items].sort(
        (a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''))
    : items;
  const list = capped ? full.slice(0, DONE_SHOWN) : full;
  const hiddenDone = capped ? full.length - list.length : 0;

  const groups = groupItemsByEpic(list, epics);
  const groupedIds = new Set(groups.flatMap(g => g.items.map(i => i.id)));
  const ungrouped = list.filter(i => !groupedIds.has(i.id));
  // Пустые эпики (ни одной задачи вообще) торчат только в Backlog —
  // это их «домашняя» колонка, иначе эпик без задач нигде не виден.
  const pinnedEmpty = col.key === 'backlog' ? emptyEpics(epics, allItems) : [];

  return (
    <section ref={setNodeRef}>
      <h2 className="text-xs text-(--color-muted) mb-2 px-1">
        {col.label} {full.length > 0 && full.length}
      </h2>
      <SortableContext
        items={[...groups.flatMap(g => g.items), ...ungrouped].map(i => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-3">
          {groups.map(({ epic, items: epicItems }) => (
            <div key={epic.id}>
              <button
                onClick={() => onOpenEpic(epic.id)}
                className="text-[11px] text-(--color-muted) underline mb-1 px-1"
              >
                {epic.title} ({epicProgress(epic.id, allItems).done}/{epicProgress(epic.id, allItems).total})
              </button>
              <div className="space-y-2">
                {epicItems.map(i => (
                  <Card key={i.id} item={i} onChanged={onChanged} onError={onError} onOpen={onOpen} />
                ))}
              </div>
            </div>
          ))}
          {pinnedEmpty.map(epic => (
            <button
              key={epic.id}
              onClick={() => onOpenEpic(epic.id)}
              className="text-[11px] text-(--color-muted) underline px-1 block"
            >
              {epic.title} ({epicProgress(epic.id, allItems).done}/{epicProgress(epic.id, allItems).total})
            </button>
          ))}
          {ungrouped.length > 0 && (
            <div className="space-y-2">
              {ungrouped.map(i => (
                <Card key={i.id} item={i} onChanged={onChanged} onError={onError} onOpen={onOpen} />
              ))}
            </div>
          )}
        </div>
      </SortableContext>
      {capped && (hiddenDone > 0 || archivedCount > 0) && (
        <button
          onClick={onShowArchive}
          className="text-xs text-(--color-muted) mt-2 px-1"
        >
          ещё {hiddenDone + archivedCount} · архив
        </button>
      )}
    </section>
  );
}

function Card(
  { item, onChanged, onError, onOpen }: {
    item: Item; onChanged: () => void; onError: (msg: string) => void;
    onOpen: (item: Item) => void;
  },
) {
  const done = item.checklist.filter(s => s.done).length;
  const waiting = item.status === 'waiting';
  const { listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition: transition ?? undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [dragX, setDragX] = useState(0);

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    setDragX(e.touches[0].clientX - touchStartX);
  };
  // ponytail: свайп проверяет только сдвиг по X мимо порога, без учёта
  // скорости и без анимации возврата — если порог не пройден, dragX
  // просто сбрасывается в 0, и карточка резко становится на место.
  // Достаточно для «свайп меняет статус»; плавный отскок и инерция —
  // если без них станет реально раздражать в использовании.
  const onTouchEnd = () => {
    const THRESHOLD = 60;
    if (Math.abs(dragX) > THRESHOLD) {
      const i = STATUS_ORDER.indexOf(item.status);
      const next = dragX > 0 ? i + 1 : i - 1;
      if (next >= 0 && next < STATUS_ORDER.length) move(STATUS_ORDER[next]);
    }
    setTouchStartX(null);
    setDragX(0);
  };

  const move = async (status: Item['status']) => {
    const { error } = await sb.from('items').update({
      status,
      closed_at: status === 'done' ? new Date().toISOString() : null,
    }).eq('id', item.id);
    // Молчаливый отказ выглядел бы как «карточка сама вернулась назад».
    if (error) { onError(error.message); return; }
    onChanged();
  };

  return (
    <article
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(item); }
      }}
      style={{
        ...style,
        transform: `${style.transform ?? ''} translateX(${dragX}px)`.trim(),
      }}
      {...listeners}
      onClick={() => onOpen(item)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className={`rounded-lg p-2.5 text-sm cursor-grab touch-pan-y ${
        waiting ? 'bg-(--color-wait)' : 'bg-(--color-panel)'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className={`text-[11px] font-mono ${
            waiting ? 'text-(--color-wait-ink)' : 'text-(--color-muted)'
          }`}
        >
          {item.seq}
        </span>
        {item.type !== 'task' && (
          <span className="text-[10px] px-1.5 py-px rounded
                           bg-(--color-danger) text-(--color-danger-ink)">
            {item.type === 'bug' ? 'баг' : 'долг'}
          </span>
        )}
      </div>

      <p className={waiting ? 'text-(--color-wait-ink)' : ''}>{item.title}</p>

      {item.checklist.length > 0 && (
        <p className="text-[11px] text-(--color-muted) mt-1.5">
          {done}/{item.checklist.length}
        </p>
      )}

      <select
        value={item.status}
        onChange={e => move(e.target.value as Item['status'])}
        onClick={e => e.stopPropagation()}
        aria-label={`Статус задачи ${item.title}`}
        className="mt-2 w-full h-7 px-1 rounded text-[11px]
                   bg-transparent border border-(--color-line)
                   text-(--color-muted)"
      >
        <option value="backlog">Backlog</option>
        <option value="doing">В работе</option>
        <option value="waiting">Нужно от тебя</option>
        <option value="done">Готово</option>
      </select>
    </article>
  );
}
