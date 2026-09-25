import { useEffect, useState } from 'react';
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
import { Editable } from './Editable';
import { between } from './position';
import { shownDoneIds } from './done';
import type { Epic } from './supabase';
import { Button } from './ui/Button';
import { AnimatePresence } from 'motion/react';
import { toasts } from './ui/toast';
import { COLUMNS } from './columns';
import { storage, readLastProject, writeLastProject, pickProject } from './prefs';
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

  const reload = async (project: string) => {
    if (!project) return;
    const { data, error } = await sb.from('items').select('*')
      .eq('project_id', project)
      .order('position');
    if (error) { toasts.show(error.message); return; }
    const list = (data ?? []) as Item[];
    setItems(list);
    setOpenItem(prev => prev ? (list.find(i => i.id === prev.id) ?? prev) : null);
  };

  const reloadEpics = async (project: string) => {
    if (!project) return;
    const { data, error } = await sb.from('epics').select('*')
      .eq('project_id', project).order('position');
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
    if (error) { toasts.show(error.message); return; }
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
    if (error) { toasts.show(error.message); reload(current); return; }
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
              className="text-body bg-transparent border border-(--color-line)
                         rounded-lg p-1 outline-none resize-none"
            />
          ) : (
            <Editable
              onEdit={() => setEditingDescription(true)}
              className="text-body text-(--color-muted) cursor-text"
            >
              {currentProject.description || 'описание — клик, чтобы добавить'}
            </Editable>
          )
        )}
        <span className="text-body text-(--color-muted)">
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
            onClose={() => setShowProjects(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

