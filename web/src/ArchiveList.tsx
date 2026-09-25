import type { Item } from './supabase';
import { Sheet, SheetCloseButton } from './ui/Sheet';

function Row(
  { item, onOpen, onRestore }: {
    item: Item; onOpen: (item: Item) => void; onRestore: (item: Item) => void;
  },
) {
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded
                 hover:bg-(--color-raised)"
    >
      <button
        onClick={() => onOpen(item)}
        className="flex-1 text-left text-body"
      >
        <span className="text-micro font-mono text-(--color-muted) mr-2">
          {item.id}
        </span>
        {item.title}
      </button>
      {item.archived_at && (
        <button
          onClick={() => onRestore(item)}
          className="text-micro text-(--color-muted) hover:text-(--color-ink) underline shrink-0"
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
  // Одинаково выглядели «правда в архиве» (archived_at) и «готово, но не
  // поместилось в кап колонки» (архивной пометки нет) — владелец принимал
  // второе за первое. Разные секции делают разницу видимой.
  const archived = items.filter(i => i.archived_at);
  const overflow = items.filter(i => !i.archived_at);

  return (
    <Sheet title="Архив" onClose={onClose}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-title font-medium">Архив</h2>
        <SheetCloseButton />
      </div>

      {items.length === 0 && (
        <p className="text-body text-(--color-muted)">Пусто.</p>
      )}

      {overflow.length > 0 && (
        <div className="mb-4">
          <h3 className="text-micro text-(--color-muted) mb-1 px-1">
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
          <h3 className="text-micro text-(--color-muted) mb-1 px-1">
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
