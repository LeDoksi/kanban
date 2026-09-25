import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { COLUMNS, type Status } from './columns';

export function ColumnTabs(
  { counts, active, onSelect }: {
    counts: Record<Status, number>; active: Status; onSelect: (s: Status) => void;
  },
) {
  const refs = useRef<Partial<Record<Status, HTMLButtonElement | null>>>({});
  const reduce = useReducedMotion();

  // Пять вкладок в 390px не влезают: активная сама подкручивается в видимую
  // зону, когда её выбрали свайпом ленты.
  useEffect(() => {
    refs.current[active]?.scrollIntoView({
      inline: 'nearest', block: 'nearest', behavior: reduce ? 'auto' : 'smooth',
    });
  }, [active, reduce]);

  return (
    <div
      role="tablist"
      aria-label="Колонки"
      className="flex gap-1 overflow-x-auto px-3 pb-2 no-scrollbar"
    >
      {COLUMNS.map(c => {
        const on = c.key === active;
        const n = counts[c.key];
        const hot = c.key === 'waiting' && n > 0;
        return (
          <button
            key={c.key}
            ref={el => { refs.current[c.key] = el; }}
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(c.key)}
            className={`relative shrink-0 h-9 px-3.5 rounded-full inline-flex items-center gap-1.5
                       text-meta transition-colors ${
              on ? 'text-(--color-ink)' : 'text-(--color-muted)'
            }`}
          >
            {on && (
              <motion.span
                layoutId="column-tab"
                className="absolute inset-0 rounded-full bg-(--color-raised)"
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{c.label}</span>
            {n > 0 && (
              <span className={`relative text-micro ${hot ? 'text-(--color-accent-ink) font-semibold' : ''}`}>
                {n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
