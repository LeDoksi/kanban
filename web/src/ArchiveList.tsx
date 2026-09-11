import type { Item } from './supabase';

export function ArchiveList(
  { items, onOpen, onClose }: {
    items: Item[]; onOpen: (item: Item) => void; onClose: () => void;
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
            <button
              key={i.id}
              onClick={() => onOpen(i)}
              className="w-full text-left text-sm px-2 py-1.5 rounded
                         hover:bg-(--color-panel)"
            >
              <span className="text-[11px] font-mono text-(--color-muted) mr-2">
                {i.id}
              </span>
              {i.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
