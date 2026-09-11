import { useEffect, useState } from 'react';
import { sb } from './supabase';
import type { Item, Epic } from './supabase';

export function EpicScreen(
  { epicId, onBack, onOpenItem }: {
    epicId: string; onBack: () => void; onOpenItem: (item: Item) => void;
  },
) {
  const [epic, setEpic] = useState<Epic | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    sb.from('epics').select('*').eq('id', epicId).single()
      .then(({ data, error }) => {
        if (error) { setErr(error.message); return; }
        setEpic(data as Epic);
      });
    sb.from('items').select('*').eq('epic_id', epicId).order('position')
      .then(({ data, error }) => {
        if (error) { setErr(error.message); return; }
        setItems((data ?? []) as Item[]);
      });
  }, [epicId]);

  const done = items.filter(i => i.status === 'done' || i.archived_at).length;

  return (
    <div className="min-h-dvh p-4 md:p-6 max-w-3xl mx-auto">
      <button onClick={onBack} className="text-sm text-(--color-muted) mb-4">
        ← Доска
      </button>

      {err && <p className="text-sm text-(--color-danger-ink) mb-3">{err}</p>}

      {epic && (
        <>
          <h1 className="text-lg font-medium mb-1">{epic.title}</h1>
          {epic.goal && (
            <p className="text-sm text-(--color-muted) mb-3">{epic.goal}</p>
          )}
          <div className="flex items-center gap-3 mb-5 text-sm text-(--color-muted)">
            <span>{done}/{items.length}</span>
            {epic.plan_path && (
              <a href={epic.plan_path} className="text-(--color-ink) underline">
                план
              </a>
            )}
            {epic.spec_path && (
              <a href={epic.spec_path} className="text-(--color-ink) underline">
                спека
              </a>
            )}
          </div>
        </>
      )}

      <div className="space-y-1">
        {items.map(i => (
          <button
            key={i.id}
            onClick={() => onOpenItem(i)}
            className="w-full flex items-center gap-2 text-left text-sm
                       px-2 py-1.5 rounded hover:bg-(--color-panel)"
          >
            <span className="text-[11px] font-mono text-(--color-muted) w-10">
              {i.seq}
            </span>
            <span className={i.status === 'done' ? 'text-(--color-muted)' : ''}>
              {i.title}
            </span>
            {i.checklist.length > 0 && (
              <span className="ml-auto text-[11px] text-(--color-muted)">
                {i.checklist.filter(s => s.done).length}/{i.checklist.length}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
