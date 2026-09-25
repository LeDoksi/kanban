import * as Popover from '@radix-ui/react-popover';
import { useState, type ReactNode } from 'react';
import { CaretDown, Check, type Icon } from '@phosphor-icons/react';

export type Option<V extends string> = { value: V; label: string; icon?: Icon };

// Строка свойства «подпись — значение», как в Linear/Notion. Значение —
// кнопка, по которой открывается список; вместо пяти чипов статуса и трёх
// чипов типа, которые раньше лежали одной кучей.
export function PropertySelect<V extends string>(
  { label, value, options, onChange, trailing }: {
    label: string; value: V; options: Option<V>[]; onChange: (v: V) => void; trailing?: ReactNode;
  },
) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);
  const CurIcon = current?.icon;
  return (
    <div className="flex items-center gap-3 min-h-10">
      <span className="w-24 shrink-0 text-meta text-(--color-muted)">{label}</span>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button className="min-w-0 flex items-center gap-2 h-9 px-3 rounded-full text-body
                             hover:bg-(--color-raised) data-[state=open]:bg-(--color-raised)">
            {CurIcon && <CurIcon size={16} className="text-(--color-muted)" />}
            <span className="truncate">{current?.label ?? '—'}</span>
            <CaretDown size={14} className="text-(--color-muted)" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start" sideOffset={6} collisionPadding={12}
            className="z-[60] min-w-56 max-h-72 overflow-y-auto rounded-2xl bg-(--color-surface) shadow-menu p-1.5"
          >
            {options.map(o => {
              const OIcon = o.icon;
              return (
                <button
                  key={o.value}
                  onClick={() => { setOpen(false); if (o.value !== value) onChange(o.value); }}
                  className="w-full flex items-center gap-2.5 h-10 px-3 rounded-xl text-body text-left
                             hover:bg-(--color-raised) focus-visible:bg-(--color-raised) outline-none"
                >
                  {OIcon && <OIcon size={18} className="text-(--color-muted)" />}
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.value === value && <Check size={16} className="text-(--color-accent-ink)" />}
                </button>
              );
            })}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {trailing}
    </div>
  );
}
