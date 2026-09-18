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
import { swipeTarget, swipePreview, SWIPE_THRESHOLD } from './swipe';
import type { Epic } from './supabase';
import { Button } from './ui/Button';
import { motion } from 'motion/react';
import { panelClass } from './ui/panel';

const COLUMNS = [
  { key: 'hold',    label: 'Hold' },
  { key: 'backlog', label: 'Backlog' },
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
        <Button variant="secondary" onClick={() => setShowProjects(true)}>
          {currentProject?.name ?? 'Проекты'}
        </Button>
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
        <Button variant="primary" className="ml-auto" onClick={() => setShowCreate(true)}>
          Новая задача
        </Button>
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
      <h2 className="text-xs text-(--color-muted) mb-2 px-1 flex items-center gap-1.5
                     sticky top-0 bg-(--color-ground) py-1 z-10">
        {col.label}
        {full.length > 0 && (
          <span className="text-2xs px-1.5 rounded-full bg-(--color-panel)">
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
                className="text-2xs text-(--color-muted) hover:text-(--color-ink) underline mb-1 px-1 block"
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
              className="text-2xs text-(--color-muted) hover:text-(--color-ink) underline px-1 block"
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
          className="text-xs text-(--color-muted) hover:text-(--color-ink) mt-2 px-1"
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
    <article className={panelClass(waiting ? 'accent' : 'default', 'p-2.5 text-sm shadow-lg rotate-1')}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`text-2xs font-mono ${
          waiting ? 'text-(--color-accent-ink)' : 'text-(--color-muted)'
        }`}>
          {item.seq}
        </span>
        {item.type !== 'task' && (
          <span className="text-2xs px-1.5 py-px rounded
                           bg-(--color-danger) text-(--color-danger-ink)">
            {item.type === 'bug' ? 'баг' : 'долг'}
          </span>
        )}
      </div>
      <p className={waiting ? 'text-(--color-accent-ink)' : ''}>{item.title}</p>
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
  // transition: null — как в официальном примере dnd-kit + Framer Motion:
  // dnd-kit больше не пишет свой CSS-transition, всю анимацию позиции
  // (в т.ч. после onDragEnd/reload(), когда сам dnd-kit уже молчит) ведёт
  // motion через layoutId.
  const { listeners, setNodeRef, transform, isDragging } =
    useSortable({ id: item.id, transition: null });

  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const swiping = touchStartX !== null;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    setDragX(e.touches[0].clientX - touchStartX);
  };
  const onTouchEnd = () => {
    if (target) move(target);
    setTouchStartX(null);
    setDragX(0);
  };

  const target = swipeTarget(item.status, dragX);
  const preview = swipePreview(item.status, dragX);
  const committed = Math.abs(dragX) > SWIPE_THRESHOLD;

  const move = async (status: Item['status']) => {
    const { error } = await setStatus(item.id, status);
    if (error) { onError(error.message); return; }
    onChanged();
  };

  return (
    <div className="relative">
      {preview && (
        <div
          aria-hidden
          className={`absolute inset-0 rounded-lg flex items-center gap-1.5 px-3
                     text-sm font-medium overflow-hidden ${
            dragX > 0 ? 'justify-start' : 'justify-end'
          } ${
            committed
              ? 'bg-(--color-ink) text-(--color-ground)'
              : 'bg-(--color-panel) text-(--color-muted)'
          }`}
        >
          <span>{dragX > 0 ? '→' : '←'}</span>
          <span>{COLUMNS.find(c => c.key === preview)?.label}</span>
        </div>
      )}
      <motion.article
        ref={setNodeRef}
        layoutId={item.id}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(item); }
        }}
        animate={
          transform
            ? { x: transform.x, y: transform.y, zIndex: 10, opacity: isDragging ? 0.5 : 1 }
            : { x: 0, y: 0, zIndex: 0, opacity: 1 }
        }
        transition={{ duration: isDragging ? 0 : 0.2, ease: 'easeOut' }}
        {...listeners}
        onClick={() => onOpen(item)}
        className={panelClass(waiting ? 'accent' : 'default', 'p-2.5 text-sm cursor-grab')}
      >
        <motion.div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          animate={{ x: dragX }}
          transition={swiping ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 32 }}
          className="touch-pan-y"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span className={`text-2xs font-mono ${
              waiting ? 'text-(--color-accent-ink)' : 'text-(--color-muted)'
            }`}>
              {item.seq}
            </span>
            {item.type !== 'task' && (
              <span className="text-2xs px-1.5 py-px rounded
                               bg-(--color-danger) text-(--color-danger-ink)">
                {item.type === 'bug' ? 'баг' : 'долг'}
              </span>
            )}
          </div>

          <p className={waiting ? 'text-(--color-accent-ink)' : ''}>{item.title}</p>

          {item.checklist.length > 0 && (
            <p className="text-2xs text-(--color-muted) mt-1.5">
              {done}/{item.checklist.length}
            </p>
          )}
        </motion.div>
      </motion.article>
    </div>
  );
}
