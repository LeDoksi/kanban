import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext, DragOverlay, type DragEndEvent,
  MouseSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { sb, closedAtFor } from './supabase';
import type { Item, Project } from './supabase';
import { CreateModal } from './CreateModal';
import { TaskModal } from './TaskModal';
import { ArchiveList } from './ArchiveList';
import { EpicModal } from './EpicModal';
import { ProjectDrawer, type ProjectRow } from './ProjectDrawer';
import { BoardHeader } from './BoardHeader';
import { between } from './position';
import { shownDoneIds } from './done';
import type { Epic } from './supabase';
import { AnimatePresence } from 'motion/react';
import { toasts } from './ui/toast';
import { COLUMNS, STATUS_ORDER, type Status } from './columns';
import {
  storage, readLastProject, writeLastProject, pickProject,
  readLastColumn, writeLastColumn, startColumn,
} from './prefs';
import { useMedia } from './useMedia';
import { ColumnTabs } from './ColumnTabs';
import { Lane } from './Lane';
import { CardPreview } from './Card';
import { Column } from './Column';

export function Board() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<string>('');
  const [items, setItems] = useState<Item[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
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
  const [loaded, setLoaded] = useState(false);

  const isDesktop = useMedia('(min-width: 1024px)');
  const [activeColumn, setActiveColumn] = useState<Status>('backlog');
  // Последний current, актуальный сразу (не после ре-рендера) — чтобы
  // reload/reloadEpics могли отбросить ответ, который пришёл уже после
  // переключения на другой проект.
  const currentRef = useRef(current);
  useEffect(() => { currentRef.current = current; }, [current]);
  // Стартовая колонка выбирается один раз на проект — по первой загрузке
  // его задач, а не при каждом realtime-обновлении.
  const columnPicked = useRef<string | null>(null);
  const selectColumn = useCallback((s: Status) => {
    setActiveColumn(s);
    if (columnPicked.current) writeLastColumn(storage(), columnPicked.current, s);
  }, []);
  const selectColumnIndex = useCallback((i: number) => selectColumn(STATUS_ORDER[i]), [selectColumn]);

  const reload = async (project: string) => {
    if (!project) return;
    const { data, error } = await sb.from('items').select('*, comments(count)')
      .eq('project_id', project)
      .order('position');
    // Пока ждали ответ, могли переключиться на другой проект — тогда
    // этот ответ устарел, показывать его (даже ошибку) нельзя: иначе
    // неудачная загрузка проекта B на миг покажет карточки A.
    if (project !== currentRef.current) return;
    if (error) { toasts.show(error.message); setLoaded(true); return; }
    const list = (data ?? []) as Item[];
    setItems(list);
    setLoaded(true);
    setOpenItem(prev => prev ? (list.find(i => i.id === prev.id) ?? prev) : null);
    if (columnPicked.current !== project) {
      columnPicked.current = project;
      setActiveColumn(startColumn(list, readLastColumn(storage(), project)));
    }
  };

  const reloadEpics = async (project: string) => {
    if (!project) return;
    const { data, error } = await sb.from('epics').select('*')
      .eq('project_id', project).order('position');
    if (project !== currentRef.current) return;
    if (error) { toasts.show(error.message); return; }
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
    if (error) { toasts.show(error.message); return; }
    const ps = (data ?? []) as Project[];
    setProjects(ps);
    if (!keepCurrent || !current) {
      const id = pickProject(ps, readLastProject(storage()));
      if (id) setCurrent(id);
    }

    if (iErr) { toasts.show(iErr.message); return; }
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

  useEffect(() => { if (current) writeLastProject(storage(), current); }, [current]);

  const currentProject = projects.find(p => p.id === current) ?? null;

  const saveProjectDescription = async (id: string, description: string | null) => {
    const { error } = await sb.from('projects').update({ description }).eq('id', id);
    if (error) { toasts.show(error.message); return; }
    reloadProjects();
  };

  const archiveProject = async (id: string) => {
    const { error } = await sb.from('projects').update({ archived_at: new Date().toISOString() }).eq('id', id);
    if (error) { toasts.show(error.message); return; }
    if (id === current) {
      // Текущий проект ушёл в архив — переключаемся на другой (pickProject
      // в reloadProjects сам выберет первый доступный).
      setCurrent('');
      reloadProjects(false);
    } else {
      reloadProjects();
    }
  };

  useEffect(() => {
    setLoaded(false);
    // Очищаем карточки/эпики сразу при смене проекта — иначе неудачная
    // (или медленная) загрузка проекта B ещё какое-то время показывает
    // карточки A под новым заголовком.
    setItems([]);
    setEpics([]);
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
  const counts = Object.fromEntries(STATUS_ORDER.map(s =>
    [s, items.filter(i => i.status === s && !i.archived_at).length])) as Record<Status, number>;
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
    if (error) { toasts.show(error.message); reload(current); return; }
    reload(current);
  };

  const renderColumn = (col: typeof COLUMNS[number], bare: boolean) => (
    <Column
      key={col.key}
      col={col}
      bare={bare}
      loading={!loaded}
      items={items.filter(i => i.status === col.key && !i.archived_at)}
      epics={epics}
      allItems={items}
      archivedCount={archivedCount}
      onChanged={() => reload(current)}
      onOpen={setOpenItem}
      onOpenEpic={id => setViewEpic(id)}
      onShowArchive={() => setShowArchive(true)}
      onLocalPatch={(id, patch) => setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))}
    />
  );

  return (
    // board-no-select (KAN-122): на тач-устройствах во время удержания карточки
    // Radix ставит body pointer-events:none, и жест выделения уходит с карточки
    // на любой текст доски — вкладки, заголовки колонок, названия карточек.
    // Шторки с описанием задачи/эпика портальны и вне .board-no-select, текст
    // там остаётся выделяемым.
    <div className="h-dvh flex flex-col max-w-[1440px] mx-auto board-no-select">
      <BoardHeader
        project={currentProject}
        done={items.filter(i => i.status === 'done').length}
        total={items.length}
        onOpenProjects={() => setShowProjects(true)}
        onCreate={() => setShowCreate(true)}
        onSaveDescription={text => saveProjectDescription(current, text)}
      />

      {/* Телефон — вкладки и лента с одной колонкой на экран, десктоп — сетка из пяти. */}
      <DndContext
        sensors={sensors}
        onDragStart={e => setActiveId(e.active.id as string)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        {isDesktop ? (
          <div className="flex-1 min-h-0 grid grid-cols-5 gap-4 px-6">
            {COLUMNS.map(col => renderColumn(col, false))}
          </div>
        ) : (
          <>
            <ColumnTabs counts={counts} active={activeColumn} onSelect={selectColumn} />
            <Lane active={STATUS_ORDER.indexOf(activeColumn)} onActiveChange={selectColumnIndex} ready={loaded}>
              {COLUMNS.map(col => renderColumn(col, true))}
            </Lane>
          </>
        )}
        <DragOverlay>
          {activeItem && <CardPreview item={activeItem} />}
        </DragOverlay>
      </DndContext>

      <AnimatePresence>
        {openItem && (
          <TaskModal
            key="task-modal"
            item={openItem}
            epics={epics}
            allItems={items}
            onClose={() => setOpenItem(null)}
            onChanged={() => reload(current)}
            onOpenEpic={id => { setOpenItem(null); setViewEpic(id); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showArchive && (
          <ArchiveList
            key="archive-list"
            items={archiveItems}
            onOpen={i => { setShowArchive(false); setOpenItem(i); }}
            onRestore={async i => {
              const { error } = await sb.from('items')
                .update({ status: 'doing', archived_at: null }).eq('id', i.id);
              if (error) { toasts.show(error.message); return; }
              reload(current);
            }}
            onClose={() => setShowArchive(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCreate && (
          <CreateModal
            key="create-modal"
            project={current}
            epics={epics}
            items={items}
            onClose={() => setShowCreate(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewEpic && (
          <EpicModal
            key="epic-modal"
            epicId={viewEpic}
            onClose={() => setViewEpic(null)}
            onOpenItem={i => { setViewEpic(null); setOpenItem(i); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProjects && (
          <ProjectDrawer
            key="project-drawer"
            current={current}
            rows={projectRows}
            onSelect={id => { setCurrent(id); reloadProjects(); }}
            onSaveDescription={saveProjectDescription}
            onArchive={archiveProject}
            onClose={() => setShowProjects(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

