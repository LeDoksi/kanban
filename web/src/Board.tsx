import { useEffect, useState } from 'react';
import {
  DndContext, DragOverlay, type DragEndEvent,
  MouseSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { sb, setStatus, closedAtFor } from './supabase';
import type { Item, Project } from './supabase';
import { CreateModal } from './CreateModal';
import { TaskModal } from './TaskModal';
import { ArchiveList } from './ArchiveList';
import { EpicModal } from './EpicModal';
import { ProjectDrawer, type ProjectRow } from './ProjectDrawer';
import { Editable } from './Editable';
import { between } from './position';
import { groupItemsByEpic, emptyEpics, epicProgress } from './epics';
import { DONE_SHOWN, recentDone, shownDoneIds } from './done';
import { swipeTarget } from './swipe';
import type { Epic } from './supabase';

const COLUMNS = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'hold',    label: 'Hold' },
  { key: 'doing',   label: 'В работе' },
  { key: 'waiting', label: 'Нужно от тебя' },
  { key: 'done',    label: 'Готово' },
] as const;

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
  const [showProjects, setShowProjects] = useState(false);
  const [projectRows, setProjectRows] = useState<ProjectRow[]>([]);
  // Плывущий превью-клон под курсором: у каждой колонки свой SortableContext,
  // и без DragOverlay dnd-kit не рисует ничего под курсором ни над пустым
  // местом, ни над чужой колонкой — только над существующими карточками.
  const [activeId, setActiveId] = useState<string | null>(null);

  // Ошибка держится на экране гарантированные несколько секунд, а не до
  // ближайшего фонового reload() — иначе Realtime мог погасить её раньше,
  // чем её успели прочитать.
  useEffect(() => {
    if (!err) return;
    const t = setTimeout(() => setErr(''), 4000);
    return () => clearTimeout(t);
  }, [err]);

  // Realtime дёргает reload() на любое изменение — если он гасит err
  // сразу же, сообщение об ошибке живёт меньше секунды. Очищаем err
  // отдельным таймером (ниже), а не тут.
  const reload = async (project: string) => {
    if (!project) return;
    const { data, error } = await sb.from('items').select('*')
      .eq('project_id', project)
      .order('position');
    if (error) { setErr(error.message); return; }
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

  // Сводка для шторки проектов (счётчики total/done/waiting) грузится
  // здесь же, а не при каждом открытии шторки — она не настолько горяча,
  // чтобы платить полным перезапросом за каждый клик на кнопку «Проекты».
  const reloadProjects = async (keepCurrent = true) => {
    const [{ data, error }, { data: allItems, error: iErr }] = await Promise.all([
      sb.from('projects').select('*').is('archived_at', null).order('position'),
      sb.from('items').select('project_id, status, archived_at'),
    ]);
    if (error) { setErr(error.message); return; }
    const ps = (data ?? []) as Project[];
    setProjects(ps);
    if (!keepCurrent && ps.length) setCurrent(ps[0].id);
    if (keepCurrent && !current && ps.length) setCurrent(ps[0].id);

    if (iErr) { setErr(iErr.message); return; }
    const all = allItems ?? [];
    setProjectRows(ps.map(project => {
      const mine = all.filter(i => i.project_id === project.id);
      return {
        project,
        total: mine.length,
        done: mine.filter(i => i.status === 'done').length,
        waiting: mine.filter(i => i.status === 'waiting' && !i.archived_at).length,
      };
    }));
  };

  useEffect(() => { reloadProjects(false); }, []);

  const currentProject = projects.find(p => p.id === current) ?? null;

  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');

  // Сбрасывать черновик при смене проекта или при обновлении описания
  // с сервера — иначе после переключения проекта в textarea мог бы
  // остаться текст от предыдущего.
  useEffect(() => {
    setEditingDescription(false);
    setDescriptionDraft(currentProject?.description ?? '');
  }, [current, currentProject?.description]);

  const saveDescription = async () => {
    setEditingDescription(false);
    const clean = descriptionDraft.trim() || null;
    if (!currentProject || clean === currentProject.description) return;
    const { error } = await sb.from('projects')
      .update({ description: clean }).eq('id', current);
    if (error) { setErr(error.message); return; }
    reloadProjects();
  };

  useEffect(() => {
    reload(current);
    reloadEpics(current);
    if (!current) return;

    // Пока агент пишет через MCP, доска обновляется сама — без кнопки
    // «обновить» и без опроса по таймеру. epics тоже в publication
    // (план №2, Task 10) — эпик, созданный или переименованный агентом,
    // тоже появляется без перезагрузки.
    //
    // Debounce: удаление эпика с N задачами снимает epic_id у каждой
    // через ON DELETE SET NULL — это N отдельных событий на items почти
    // одновременно, и без debounce каждое тянуло бы свой полный reload().
    let itemsTimer: ReturnType<typeof setTimeout> | undefined;
    let epicsTimer: ReturnType<typeof setTimeout> | undefined;
    const debouncedReload = () => {
      clearTimeout(itemsTimer);
      itemsTimer = setTimeout(() => reload(current), 200);
    };
    const debouncedReloadEpics = () => {
      clearTimeout(epicsTimer);
      epicsTimer = setTimeout(() => reloadEpics(current), 200);
    };

    const channel = sb
      .channel(`items-${current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `project_id=eq.${current}` },
        debouncedReload,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'epics', filter: `project_id=eq.${current}` },
        debouncedReloadEpics,
      )
      .subscribe();

    return () => {
      clearTimeout(itemsTimer);
      clearTimeout(epicsTimer);
      sb.removeChannel(channel);
    };
  }, [current]);

  // То же множество «показанных в Готово», что и в рендере колонок —
  // архив показывает всё остальное: и настоящие архивные карточки, и
  // готовые сверх видимых DONE_SHOWN.
  const doneShownIds = shownDoneIds(items);
  const activeItem = activeId ? items.find(i => i.id === activeId) ?? null : null;
  const archivedCount = items.filter(i => i.archived_at).length;
  const archiveItems = items
    .filter(i => i.archived_at || (i.status === 'done' && !doneShownIds.has(i.id)))
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

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
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

    const patch: Partial<Pick<Item, 'position' | 'status' | 'closed_at'>> = { position };
    if (dragged.status !== targetStatus) {
      patch.status = targetStatus;
      patch.closed_at = closedAtFor(targetStatus);
    }

    // Обновляем локально сразу: иначе карточка на долю секунды откатывается
    // на старое место, пока не придёт ответ сервера/Realtime.
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...patch } : i));

    const { error } = await sb.from('items').update(patch).eq('id', itemId);
    if (error) { setErr(error.message); reload(current); return; }
    reload(current);
  };

  return (
    <div className="min-h-dvh p-4 md:p-6 max-w-6xl mx-auto">
      <header className="flex items-center gap-3 mb-5 flex-wrap">
        <button
          onClick={() => setShowProjects(true)}
          className="h-8 px-3 rounded-lg bg-(--color-panel)
                     border border-(--color-line) text-sm"
        >
          {currentProject?.name ?? 'Проекты'}
        </button>
        {currentProject && (
          editingDescription ? (
            <textarea
              autoFocus
              value={descriptionDraft}
              onChange={e => setDescriptionDraft(e.target.value)}
              onBlur={saveDescription}
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) saveDescription(); }}
              rows={2}
              placeholder="описание"
              className="text-sm bg-transparent border border-(--color-line)
                         rounded-lg p-1 outline-none resize-none"
            />
          ) : (
            <Editable
              onEdit={() => setEditingDescription(true)}
              className="text-sm text-(--color-muted) cursor-text"
            >
              {currentProject.description || 'описание — клик, чтобы добавить'}
            </Editable>
          )
        )}
        {err && <span className="text-sm text-(--color-danger-ink)">{err}</span>}
        <span className="text-sm text-(--color-muted)">
          {items.filter(i => i.status === 'done').length}/{items.length}
        </span>
        <button
          onClick={() => setShowCreate(true)}
          className="ml-auto h-8 px-3 rounded-lg bg-(--color-ink)
                     text-(--color-ground) text-sm"
        >
          Новая задача
        </button>
      </header>

      {/* Телефон — одна вертикаль, десктоп — пять колонок. */}
      <DndContext
        sensors={sensors}
        onDragStart={e => setActiveId(e.active.id as string)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="grid gap-3 md:grid-cols-5">
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
        <DragOverlay>
          {activeItem && <CardPreview item={activeItem} />}
        </DragOverlay>
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
        />
      )}

      {viewEpic && (
        <EpicModal
          epicId={viewEpic}
          onClose={() => setViewEpic(null)}
          onOpenItem={i => { setViewEpic(null); setOpenItem(i); }}
        />
      )}

      {showProjects && (
        <ProjectDrawer
          current={current}
          rows={projectRows}
          onSelect={id => { setCurrent(id); reloadProjects(); }}
          onClose={() => setShowProjects(false)}
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
      <h2 className="text-xs text-(--color-muted) mb-2 px-1
                     sticky top-0 bg-(--color-ground) py-1 z-10">
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

// Плывущий клон под курсором во время drag — не подписан на useSortable
// (это делает DragOverlay сам), поэтому просто статичная разметка без
// обработчиков.
function CardPreview({ item }: { item: Item }) {
  const waiting = item.status === 'waiting';
  return (
    <article
      className={`rounded-lg p-2.5 text-sm shadow-lg rotate-1 ${
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
    </article>
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
    if (target) move(target);
    setTouchStartX(null);
    setDragX(0);
  };

  // Куда денёт свайп, если отпустить прямо сейчас — без этого не видно,
  // что произойдёт, пока карточка уже не улетела в другой статус.
  const target = swipeTarget(item.status, dragX);

  const move = async (status: Item['status']) => {
    const { error } = await setStatus(item.id, status);
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
      className={`relative rounded-lg p-2.5 text-sm cursor-grab touch-pan-y ${
        waiting ? 'bg-(--color-wait)' : 'bg-(--color-panel)'
      } ${target ? 'ring-2 ring-(--color-muted)' : ''}`}
    >
      {target && (
        <span
          className={`absolute top-1/2 -translate-y-1/2 text-[11px] px-1.5 py-0.5
                      rounded bg-(--color-ink) text-(--color-ground) whitespace-nowrap
                      ${dragX > 0 ? 'right-2' : 'left-2'}`}
        >
          → {COLUMNS.find(c => c.key === target)?.label}
        </span>
      )}
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
    </article>
  );
}
