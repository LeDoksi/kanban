import { useEffect, useState } from 'react';
import { sb } from './supabase';
import type { Item, Comment } from './supabase';

const STATUS_LABEL: Record<Item['status'], string> = {
  backlog: 'Backlog', doing: 'В работе',
  waiting: 'Нужно от тебя', done: 'Готово',
};

export function TaskModal(
  { item, onClose, onChanged }: {
    item: Item; onClose: () => void; onChanged: () => void;
  },
) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [err, setErr] = useState('');

  // Комментарии грузятся только при открытии одной задачи, а не для
  // всех карточек доски сразу — тот же принцип, что у get() в MCP.
  useEffect(() => {
    sb.from('comments').select('*')
      .eq('item_id', item.id).order('created_at')
      .then(({ data, error }) => {
        if (error) { setErr(error.message); return; }
        setComments((data ?? []) as Comment[]);
      });
  }, [item.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleCheck = async (i: number) => {
    const list = item.checklist.map((s, idx) =>
      idx === i ? { ...s, done: !s.done } : s);
    const { error } = await sb.from('items')
      .update({ checklist: list }).eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
  };

  const move = async (status: Item['status']) => {
    const { error } = await sb.from('items').update({
      status, closed_at: status === 'done' ? new Date().toISOString() : null,
    }).eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
  };

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
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <span className="text-[11px] font-mono text-(--color-muted)">
              {item.id}
            </span>
            <h2 className="text-base font-medium">{item.title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="text-(--color-muted) text-lg leading-none"
          >
            ×
          </button>
        </div>

        <select
          value={item.status}
          onChange={e => move(e.target.value as Item['status'])}
          onClick={e => e.stopPropagation()}
          aria-label="Статус"
          className="h-8 px-2 rounded-lg bg-(--color-panel)
                     border border-(--color-line) text-sm mb-4"
        >
          {(Object.keys(STATUS_LABEL) as Item['status'][]).map(s => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>

        {err && <p className="text-sm text-(--color-danger-ink) mb-3">{err}</p>}

        {item.body && (
          <p className="text-sm whitespace-pre-wrap mb-4">{item.body}</p>
        )}

        {item.checklist.length > 0 && (
          <ul className="space-y-1.5 mb-4">
            {item.checklist.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={s.done}
                  onChange={() => toggleCheck(i)}
                />
                <span className={s.done ? 'text-(--color-muted) line-through' : ''}>
                  {s.text}
                </span>
              </li>
            ))}
          </ul>
        )}

        {comments.length > 0 && (
          <div className="space-y-2 border-t border-(--color-line) pt-3">
            {comments.map(c => (
              <div key={c.id} className="text-xs">
                <span className="text-(--color-muted)">
                  {c.created_at.slice(0, 10)} {c.author}:
                </span>{' '}
                {c.body}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
