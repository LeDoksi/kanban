import type { Item } from './supabase';

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
        <span className="text-[11px] font-mono text-(--color-muted) mr-2">
          {item.id}
        </span>
        {item.title}
      </button>
      {item.archived_at && (
        <button
          onClick={() => onRestore(item)}
          className="text-[11px] text-(--color-muted) underline shrink-0"
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
    <div
      className="fixed inset-0 bg-(--color-overlay) flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-(--color-ground) rounded-lg max-w-lg w-full max-h-[85vh]
                   overflow-y-auto p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-medium">Архив</h2>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="text-(--color-muted) text-lg leading-none"
          >
            ×
          </button>
        </div>

        {items.length === 0 && (
          <p className="text-sm text-(--color-muted)">Пусто.</p>
        )}

        {overflow.length > 0 && (
          <div className="mb-4">
            <h3 className="text-[11px] text-(--color-muted) mb-1 px-1">
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
            <h3 className="text-[11px] text-(--color-muted) mb-1 px-1">
              В архиве
            </h3>
            <div className="space-y-1">
              {archived.map(i => (
                <Row key={i.id} item={i} onOpen={onOpen} onRestore={onRestore} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
