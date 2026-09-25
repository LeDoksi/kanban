import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight } from '@phosphor-icons/react';
import { setStatus } from './supabase';
import type { Item } from './supabase';
import { swipeTarget, swipePreview, lockAxis, SWIPE_THRESHOLD } from './swipe';
import { COLUMNS } from './columns';
import { panelClass } from './ui/panel';
import { TypeBadge } from './ui/TypeBadge';

// Плывущий клон под курсором во время drag — не подписан на useSortable
// (это делает DragOverlay сам), поэтому просто статичная разметка без
// обработчиков.
export function CardPreview({ item }: { item: Item }) {
  const waiting = item.status === 'waiting';
  return (
    <article className={panelClass(waiting ? 'accent' : 'default', 'p-2.5 text-body shadow-lg rotate-1')}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`text-micro font-mono ${
          waiting ? 'text-(--color-accent-ink)' : 'text-(--color-muted)'
        }`}>
          {item.seq}
        </span>
        <TypeBadge type={item.type} />
      </div>
      <p className={waiting ? 'text-(--color-accent-ink)' : ''}>{item.title}</p>
    </article>
  );
}

export function Card(
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

  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [axis, setAxis] = useState<'x' | 'y' | null>(null);
  const [dragX, setDragX] = useState(0);
  const swiping = touchStart !== null;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    setAxis(null);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStart === null || axis === 'y') return;
    const dx = e.touches[0].clientX - touchStart.x;
    const dy = e.touches[0].clientY - touchStart.y;
    const locked = axis ?? lockAxis(dx, dy);
    if (locked !== axis) setAxis(locked);
    if (locked === 'x') setDragX(dx);
  };
  const resetTouch = () => {
    setTouchStart(null);
    setAxis(null);
    setDragX(0);
  };
  const onTouchEnd = () => {
    if (axis === 'x' && target) move(target);
    resetTouch();
  };

  // target — с порогом, решает, что случится на onTouchEnd. preview —
  // без порога, только для панели: та открывается с первого пикселя
  // свайпа, а не выстреливает внезапно после срабатывания.
  const target = swipeTarget(item.status, dragX);
  const preview = swipePreview(item.status, dragX);
  const committed = Math.abs(dragX) > SWIPE_THRESHOLD;

  const move = async (status: Item['status']) => {
    const { error } = await setStatus(item.id, status);
    // Молчаливый отказ выглядел бы как «карточка сама вернулась назад».
    if (error) { onError(error.message); return; }
    onChanged();
  };

  return (
    // Панель со следующим статусом лежит позади карточки и открывается
    // по мере сдвига — раньше подсказка была приклеена к самой карточке
    // и уезжала с ней к краю экрана, толком не успевая показаться.
    <div className="relative">
      {preview && (
        <div
          aria-hidden
          className={`absolute inset-0 rounded-lg flex items-center gap-1.5 px-3
                     text-body font-medium overflow-hidden ${
            dragX > 0 ? 'justify-start' : 'justify-end'
          } ${
            committed
              ? 'bg-(--color-ink) text-(--color-ground)'
              : 'bg-(--color-raised) text-(--color-muted)'
          }`}
        >
          {dragX > 0 ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
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
        animate={{
          x: transform?.x ?? 0,
          y: transform?.y ?? 0,
          zIndex: isDragging ? 10 : 0,
          opacity: isDragging ? 0.5 : 1,
        }}
        transition={{ duration: isDragging ? 0 : 0.2, ease: 'easeOut' }}
        {...listeners}
        onClick={() => onOpen(item)}
        className={panelClass(waiting ? 'accent' : 'default', 'p-2.5 text-body cursor-grab')}
      >
        <motion.div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={resetTouch}
          animate={{ x: dragX }}
          transition={swiping ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 32 }}
          className="touch-pan-y"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span className={`text-micro font-mono ${
              waiting ? 'text-(--color-accent-ink)' : 'text-(--color-muted)'
            }`}>
              {item.seq}
            </span>
            <TypeBadge type={item.type} />
          </div>

          <p className={waiting ? 'text-(--color-accent-ink)' : ''}>{item.title}</p>

          {item.checklist.length > 0 && (
            <p className="text-micro text-(--color-muted) mt-1.5">
              {done}/{item.checklist.length}
            </p>
          )}
        </motion.div>
      </motion.article>
    </div>
  );
}
