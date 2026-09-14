import type { Item } from './supabase';

export function ArchiveList(
  { items, onOpen, onRestore, onClose }: {
    items: Item[]; onOpen: (item: Item) => void;
    onRestore: (item: Item) => void; onClose: () => void;
  },
) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
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

        <div className="space-y-1">
          {items.map(i => (
            <div
              key={i.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded
                         hover:bg-(--color-panel)"
            >
              <button
                onClick={() => onOpen(i)}
                className="flex-1 text-left text-sm"
              >
                <span className="text-[11px] font-mono text-(--color-muted) mr-2">
                  {i.id}
                </span>
                {i.title}
              </button>
              {i.archived_at && (
                <button
                  onClick={() => onRestore(i)}
                  className="text-[11px] text-(--color-muted) underline shrink-0"
                >
                  вернуть в работу
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
