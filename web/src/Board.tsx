import { useEffect, useState } from 'react';
import { DndContext, type DragEndEvent, MouseSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { sb } from './supabase';
import type { Item, Project } from './supabase';
import { NewTask } from './NewTask';
import { NewProject } from './NewProject';
import { NewEpic } from './NewEpic';
import { TaskModal } from './TaskModal';
import { ArchiveList } from './ArchiveList';
import { EpicScreen } from './EpicScreen';
import { between } from './position';

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
  const [err, setErr] = useState('');
  const [openItem, setOpenItem] = useState<Item | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [viewEpic, setViewEpic] = useState<string | null>(null);

  // Архивные грузим тоже: из колонок они убраны, но в счётчике остаются —
  // иначе прогресс едет назад, когда готовые карточки уходят в архив.
  const reload = async (project: string) => {
    if (!project) return;
    const { data, error } = await sb.from('items').select('*')
      .eq('project_id', project)
      .order('position');
    if (error) { setErr(error.message); return; }
    setErr('');
    setItems((data ?? []) as Item[]);
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
    if (!current) return;

    // Пока агент пишет через MCP, доска обновляется сама — без кнопки
    // «обновить» и без опроса по таймеру.
    const channel = sb
      .channel(`items-${current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `project_id=eq.${current}` },
        () => reload(current),
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

  if (viewEpic) {
    return (
      <>
        <EpicScreen
          epicId={viewEpic}
          onBack={() => setViewEpic(null)}
          onOpenItem={setOpenItem}
        />
        {openItem && (
          <TaskModal
            item={openItem}
            onClose={() => setOpenItem(null)}
            // ponytail: список экрана эпика не перечитывается на месте
            // после правки через модалку — только при повторном заходе
            // на экран. Обновить, если статус внутри эпика станет менять
            // хотя бы каждый второй заход.
            onChanged={() => setOpenItem(null)}
            onOpenEpic={id => { setOpenItem(null); setViewEpic(id); }}
          />
        )}
      </>
    );
  }

  const onDragEnd = async (e: DragEndEvent) => {
    const itemId = e.active.id as string;
    const overId = e.over?.id as string | undefined;
    if (!overId) return;

    // over.id — либо статус колонки (перетащили в пустое место), либо id
    // карточки, над которой отпустили (тогда встаём перед ней).
    const targetStatus = (COLUMNS.find(c => c.key === overId)?.key
      ?? items.find(i => i.id === overId)?.status) as Item['status'] | undefined;
    if (!targetStatus) return;

    const columnItems = items
      .filter(i => i.status === targetStatus && !i.archived_at && i.id !== itemId)
      .sort((a, b) => a.position - b.position);
    const overIndex = columnItems.findIndex(i => i.id === overId);
    const before = overIndex > 0 ? columnItems[overIndex - 1].position : null;
    const after = overIndex >= 0 ? columnItems[overIndex].position : null;
    const position = between(before, after);

    const dragged = items.find(i => i.id === itemId);
    const patch: Record<string, unknown> = { position };
    if (dragged && dragged.status !== targetStatus) {
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
          <NewEpic project={current} onCreated={() => reload(current)} />
          <NewTask project={current} onAdded={() => reload(current)} />
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
              archivedCount={archivedCount}
              onChanged={() => reload(current)}
              onError={setErr}
              onOpen={setOpenItem}
              onShowArchive={() => setShowArchive(true)}
            />
          ))}
        </div>
      </DndContext>

      {openItem && (
        <TaskModal
          item={openItem}
          onClose={() => setOpenItem(null)}
          onChanged={() => { reload(current); setOpenItem(null); }}
          onOpenEpic={id => { setOpenItem(null); setViewEpic(id); }}
        />
      )}

      {showArchive && (
        <ArchiveList
          items={archiveItems}
          onOpen={i => { setShowArchive(false); setOpenItem(i); }}
          onClose={() => setShowArchive(false)}
        />
      )}
    </div>
  );
}

function Column(
  { col, items, archivedCount, onChanged, onError, onOpen, onShowArchive }: {
    col: typeof COLUMNS[number]; items: Item[]; archivedCount: number;
    onChanged: () => void; onError: (msg: string) => void;
    onOpen: (item: Item) => void; onShowArchive: () => void;
  },
) {
  const { setNodeRef } = useDroppable({ id: col.key });

  // «Готово» — единственная колонка, которая обрезается: открытые задачи
  // не должны прятаться, а закрытых со временем становится много.
  // Сортируем по дате закрытия — «последние несколько» значит недавно
  // завершённые, а не недавно созданные.
  const capped = col.key === 'done';
  const full = capped
    ? [...items].sort(
        (a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''))
    : items;
  const list = capped ? full.slice(0, DONE_SHOWN) : full;
  const hiddenDone = capped ? full.length - list.length : 0;

  return (
    <section ref={setNodeRef}>
      <h2 className="text-xs text-(--color-muted) mb-2 px-1">
        {col.label} {full.length > 0 && full.length}
      </h2>
      <SortableContext items={list.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {list.map(i => (
            <Card
              key={i.id}
              item={i}
              onChanged={onChanged}
              onError={onError}
              onOpen={onOpen}
            />
          ))}
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
