import { useState } from 'react';
import type { Item } from './supabase';
import { filterArchive } from './archive';
import { Sheet, SheetCloseButton } from './ui/Sheet';
import { Button } from './ui/Button';
import { MagnifyingGlass, ArrowCounterClockwise } from '@phosphor-icons/react';

function Row(
  { item, onOpen, onRestore }: {
    item: Item; onOpen: (item: Item) => void; onRestore: (item: Item) => void;
  },
) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-(--color-raised)">
      <button onClick={() => onOpen(item)} className="flex-1 min-w-0 flex items-baseline gap-2 text-left">
        <span className="text-micro font-mono text-(--color-muted) shrink-0">{item.id}</span>
        <span className="text-body truncate">{item.title}</span>
      </button>
      {item.archived_at && (
        <Button variant="ghost" size="sm" onClick={() => onRestore(item)} className="shrink-0">
          <ArrowCounterClockwise size={16} />
          Вернуть
        </Button>
      )}
    </div>
  );
}

export function ArchiveList(
  { items, onOpen, onRestore, onClose }: {
    items: Item[]; onOpen: (item: Item) => void;
    onRestore: (item: Item) => void; onClose: () => void;
  },
) {
  const [query, setQuery] = useState('');
  const filtered = filterArchive(items, query);
  // Одинаково выглядели «правда в архиве» (archived_at) и «готово, но не
  // поместилось в кап колонки» (архивной пометки нет) — владелец принимал
  // второе за первое. Разные секции делают разницу видимой.
  const archived = filtered.filter(i => i.archived_at);
  const overflow = filtered.filter(i => !i.archived_at);

  return (
    <Sheet title="Архив" onClose={onClose}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-title font-medium">Архив</h2>
        <SheetCloseButton />
      </div>

      <div className="relative mb-4">
        <MagnifyingGlass size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-(--color-muted)" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Поиск по архиву"
          className="w-full h-10 pl-9 pr-3 rounded-full bg-(--color-raised) text-body
                     outline-none focus:ring-2 focus:ring-(--color-accent)"
        />
      </div>

      {items.length === 0 && (
        <p className="text-body text-(--color-muted)">Пусто.</p>
      )}

      {items.length > 0 && filtered.length === 0 && (
        <p className="text-body text-(--color-muted)">Ничего не нашлось</p>
      )}

      {overflow.length > 0 && (
        <div className="mb-4">
          <h3 className="text-meta text-(--color-muted) mb-1 px-1">
            Готово, не поместилось в колонку
          </h3>
          <div className="space-y-0.5">
            {overflow.map(i => (
              <Row key={i.id} item={i} onOpen={onOpen} onRestore={onRestore} />
            ))}
          </div>
        </div>
      )}

      {archived.length > 0 && (
        <div>
          <h3 className="text-meta text-(--color-muted) mb-1 px-1">
            В архиве
          </h3>
          <div className="space-y-0.5">
            {archived.map(i => (
              <Row key={i.id} item={i} onOpen={onOpen} onRestore={onRestore} />
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}
