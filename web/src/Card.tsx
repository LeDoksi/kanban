import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { motion } from 'motion/react';
import { sb, setStatus } from './supabase';
import type { Item } from './supabase';
import { columnLabel, undoPatch, type Status } from './columns';
import { useLongPress } from './useLongPress';
import { StatusMenu } from './StatusMenu';
import { toasts } from './ui/toast';
import { panelClass } from './ui/panel';
import { TypeBadge } from './ui/TypeBadge';

// Плывущий клон под курсором во время drag — не подписан на useSortable
// (это делает DragOverlay сам), поэтому просто статичная разметка без
// обработчиков.
export function CardPreview({ item }: { item: Item }) {
  const waiting = item.status === 'waiting';
  return (
    <article className={panelClass(waiting ? 'accent' : 'default', 'p-3 pr-9 shadow-menu rotate-1')}>
      <p className="text-body line-clamp-3">{item.title}</p>
      <div className="flex items-center gap-2.5 mt-1.5 text-micro text-(--color-muted)">
        <span>{item.id}</span>
        <TypeBadge type={item.type} />
      </div>
    </article>
  );
}

export function Card(
  { item, onChanged, onOpen }: {
    item: Item; onChanged: () => void; onOpen: (item: Item) => void;
  },
) {
  const done = item.checklist.filter(s => s.done).length;
  const waiting = item.status === 'waiting';
  const [menuOpen, setMenuOpen] = useState(false);
  const { handlers, consumeClick } = useLongPress(() => setMenuOpen(true));
  // transition: null — всю анимацию позиции ведёт motion через layoutId.
  const { listeners, setNodeRef, transform, isDragging } =
    useSortable({ id: item.id, transition: null });

  const move = async (status: Status) => {
    if (status === item.status) return;
    const prev = undoPatch(item);
    const { error } = await setStatus(item.id, status);
    // Молчаливый отказ выглядел бы как «карточка сама вернулась назад».
    if (error) { toasts.show(error.message); return; }
    onChanged();
    toasts.show(`Перенесено в «${columnLabel(status)}»`, {
      label: 'Отменить',
      run: async () => {
        const { error: undoErr } = await sb.from('items').update(prev).eq('id', item.id);
        if (undoErr) { toasts.show(undoErr.message); return; }
        onChanged();
      },
    });
  };

  const archive = async () => {
    const { error } = await sb.from('items')
      .update({ archived_at: new Date().toISOString() }).eq('id', item.id);
    if (error) { toasts.show(error.message); return; }
    onChanged();
  };

  return (
    <motion.article
      ref={setNodeRef}
      layoutId={item.id}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(item); }
      }}
      animate={{
        x: transform?.x ?? 0,
        y: transform?.y ?? 0,
        zIndex: isDragging ? 10 : 0,
        opacity: isDragging ? 0.5 : 1,
        scale: menuOpen ? 1.02 : 1,
      }}
      transition={{ duration: isDragging ? 0 : 0.2, ease: 'easeOut' }}
      {...listeners}
      {...handlers}
      onClick={() => { if (!consumeClick()) onOpen(item); }}
      onContextMenu={e => { e.preventDefault(); setMenuOpen(true); }}
      className={panelClass(waiting ? 'accent' : 'default',
        'group relative p-3 pr-9 cursor-grab no-callout')}
    >
      <StatusMenu
        item={item}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onMove={move}
        onOpen={() => onOpen(item)}
        onArchive={archive}
      />
      <p className="text-body line-clamp-3">{item.title}</p>
      <div className="flex items-center gap-2.5 mt-1.5 text-micro text-(--color-muted)">
        <span>{item.id}</span>
        <TypeBadge type={item.type} />
        {item.checklist.length > 0 && <span>{done}/{item.checklist.length}</span>}
      </div>
    </motion.article>
  );
}
