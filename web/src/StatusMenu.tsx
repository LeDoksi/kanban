import * as Menu from '@radix-ui/react-dropdown-menu';
import { Archive, ArrowSquareOut, Check, DotsThree } from '@phosphor-icons/react';
import type { Item } from './supabase';
import { COLUMNS, type Status } from './columns';
import { STATUS_ICON } from './statusIcons';

// Меню живёт в портале, но React-события из портала всплывают по дереву
// компонентов — до карточки, где висят onClick (открыть задачу),
// обработчики dnd-kit и долгого нажатия. Поэтому содержимое меню гасит
// всплытие всего, что карточка слушает.
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

const itemClass = `flex items-center gap-2.5 h-10 px-3 rounded-xl outline-none cursor-pointer
                   text-body text-(--color-ink) data-[highlighted]:bg-(--color-raised)`;

export function StatusMenu(
  { item, open, onOpenChange, onMove, onOpen, onArchive }: {
    item: Item;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onMove: (status: Status) => void;
    onOpen: () => void;
    onArchive: () => void;
  },
) {
  return (
    <Menu.Root open={open} onOpenChange={onOpenChange}>
      {/* Триггер — кнопка «⋯» в углу карточки. На мыши видна при наведении
          и фокусе; на сенсорных экранах невидима и не ловит касания, но
          остаётся в раскладке: меню, открытое долгим нажатием, якорится
          к ней. display:none дал бы нулевой прямоугольник в (0,0).
          KAN-123: data-[state=open]/group-focus-within показывали её и на
          тач-экранах, когда открытое долгим нажатием меню фокусировало
          дерево карточки — [@media(hover:none)]:opacity-0! перебивает их
          важностью независимо от порядка классов. */}
      <Menu.Trigger asChild>
        <button
          aria-label="Действия с задачей"
          onClick={stop}
          onMouseDown={stop}
          onPointerDown={stop}
          className="absolute right-1.5 top-1.5 size-8 grid place-items-center rounded-full
                     text-(--color-muted) hover:bg-(--color-raised) hover:text-(--color-ink)
                     opacity-0 group-hover:opacity-100 focus-visible:opacity-100
                     group-focus-within:opacity-100 data-[state=open]:opacity-100
                     [@media(hover:none)]:pointer-events-none
                     [@media(hover:none)]:opacity-0!"
        >
          <DotsThree size={18} weight="bold" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          onClick={stop}
          onMouseDown={stop}
          onPointerDown={stop}
          onTouchStart={stop}
          // KAN-122: меню открывается под ещё нажатым пальцем — без
          // no-callout это выделяет текст пунктов меню как текст страницы.
          className="z-50 min-w-56 rounded-2xl bg-(--color-surface) shadow-menu p-1.5 no-callout"
        >
          {COLUMNS.map(c => {
            const Icon = STATUS_ICON[c.key];
            const current = c.key === item.status;
            return (
              <Menu.Item key={c.key} onSelect={() => onMove(c.key)} className={itemClass}>
                <Icon size={18} className="text-(--color-muted)" />
                <span className="flex-1">{c.label}</span>
                {current && <Check size={16} className="text-(--color-accent-ink)" />}
              </Menu.Item>
            );
          })}
          <Menu.Separator className="h-px my-1 mx-2 bg-(--color-line)" />
          <Menu.Item onSelect={onOpen} className={itemClass}>
            <ArrowSquareOut size={18} className="text-(--color-muted)" />
            Открыть
          </Menu.Item>
          {item.status === 'done' && !item.archived_at && (
            <Menu.Item onSelect={onArchive} className={itemClass}>
              <Archive size={18} className="text-(--color-muted)" />
              В архив
            </Menu.Item>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
