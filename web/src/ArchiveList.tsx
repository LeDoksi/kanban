import type { Item } from './supabase';
import { Sheet } from './ui/Sheet';

function Row(
  { item, onOpen, onRestore }: {
    item: Item; onOpen: (item: Item) => void; onRestore: (item: Item) => void;
  },
) {
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded
                 hover:bg-(--color-panel)"
    >
      <button
        onClick={() => onOpen(item)}
        className="flex-1 text-left text-sm"
      >
        <span className="text-2xs font-mono text-(--color-muted) mr-2">
          {item.id}
        </span>
        {item.title}
      </button>
      {item.archived_at && (
        <button
          onClick={() => onRestore(item)}
          className="text-2xs text-(--color-muted) hover:text-(--color-ink) underline shrink-0"
        >
          вернуть в работу
        </button>
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
  const archived = items.filter(i => i.archived_at);
  const overflow = items.filter(i => !i.archived_at);

  return (
    <Sheet onClose={onClose} maxWidth="max-w-lg">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-medium">Архив</h2>
        <button
          onClick={onClose}
          aria-label="Закрыть"
          className="text-(--color-muted) hover:text-(--color-ink) text-lg leading-none"
        >
          ×
        </button>
      </div>

      {items.length === 0 && (
        <p className="text-sm text-(--color-muted)">Пусто.</p>
      )}

      {overflow.length > 0 && (
        <div className="mb-4">
          <h3 className="text-2xs text-(--color-muted) mb-1 px-1">
            Готово — не поместилось в колонку
          </h3>
          <div className="space-y-1">
            {overflow.map(i => (
              <Row key={i.id} item={i} onOpen={onOpen} onRestore={onRestore} />
            ))}
          </div>
        </div>
      )}

      {archived.length > 0 && (
        <div>
          <h3 className="text-2xs text-(--color-muted) mb-1 px-1">
            В архиве
          </h3>
          <div className="space-y-1">
            {archived.map(i => (
              <Row key={i.id} item={i} onOpen={onOpen} onRestore={onRestore} />
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}
