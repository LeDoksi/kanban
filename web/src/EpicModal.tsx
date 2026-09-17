import { useEffect, useState } from 'react';
import { sb } from './supabase';
import type { Item, Epic } from './supabase';
import { epicProgress } from './epics';
import { Editable } from './Editable';

export function EpicModal(
  { epicId, onClose, onOpenItem }: {
    epicId: string; onClose: () => void; onOpenItem: (item: Item) => void;
  },
) {
  const [epic, setEpic] = useState<Epic | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [goalDraft, setGoalDraft] = useState('');

  useEffect(() => {
    sb.from('epics').select('*').eq('id', epicId).single()
      .then(({ data, error }) => {
        if (error) { setErr(error.message); return; }
        const e = data as Epic;
        setEpic(e);
        setTitleDraft(e.title);
        setGoalDraft(e.goal ?? '');
      });
    sb.from('items').select('*').eq('epic_id', epicId).order('position')
      .then(({ data, error }) => {
        if (error) { setErr(error.message); return; }
        setItems((data ?? []) as Item[]);
      });
  }, [epicId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const saveTitle = async () => {
    setEditingTitle(false);
    const clean = titleDraft.trim();
    if (!epic || !clean || clean === epic.title) { setTitleDraft(epic?.title ?? ''); return; }
    const { error } = await sb.from('epics').update({ title: clean }).eq('id', epicId);
    if (error) { setErr(error.message); return; }
    setEpic({ ...epic, title: clean });
  };

  const saveGoal = async () => {
    setEditingGoal(false);
    if (!epic) return;
    const clean = goalDraft.trim() || null;
    if (clean === epic.goal) return;
    const { error } = await sb.from('epics').update({ goal: clean }).eq('id', epicId);
    if (error) { setErr(error.message); return; }
    setEpic({ ...epic, goal: clean });
  };

  const remove = async () => {
    // items.epic_id -> epics.id is ON DELETE SET NULL: задачи не удаляются,
    // просто теряют привязку к эпику.
    const warning = items.length > 0
      ? `Удалить эпик «${epic?.title}»? Задачи (${items.length}) останутся, но потеряют привязку к нему.`
      : `Удалить эпик «${epic?.title}»?`;
    if (!confirm(warning)) return;
    const { error } = await sb.from('epics').delete().eq('id', epicId);
    if (error) { setErr(error.message); return; }
    onClose();
  };

  const { done, total } = epicProgress(epicId, items);

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
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1">
            {editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => { if (e.key === 'Enter') saveTitle(); }}
                className="block w-full text-lg font-medium bg-transparent
                           border-b border-(--color-line) outline-none"
              />
            ) : (
              <Editable
                as="h1"
                onEdit={() => setEditingTitle(true)}
                className="text-lg font-medium cursor-text"
              >
                {epic?.title}
              </Editable>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="text-(--color-muted) text-lg leading-none"
          >
            ×
          </button>
        </div>

        {err && <p className="text-sm text-(--color-danger-ink) mb-3">{err}</p>}

        {editingGoal ? (
          <textarea
            autoFocus
            value={goalDraft}
            onChange={e => setGoalDraft(e.target.value)}
            onBlur={saveGoal}
            onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) saveGoal(); }}
            rows={2}
            placeholder="цель"
            className="w-full p-2 mb-3 rounded-lg bg-(--color-panel) text-sm
                       border border-(--color-line) outline-none resize-none"
          />
        ) : (
          <Editable
            as="p"
            onEdit={() => setEditingGoal(true)}
            className="text-sm text-(--color-muted) mb-3 cursor-text min-h-[1.3em]"
          >
            {epic?.goal || 'цель — клик, чтобы добавить'}
          </Editable>
        )}

        <div className="flex items-center gap-3 mb-5 text-sm text-(--color-muted)">
          <span>{done}/{total}</span>
          {epic?.plan_path && (
            <a href={epic.plan_path} className="text-(--color-ink) underline">план</a>
          )}
          {epic?.spec_path && (
            <a href={epic.spec_path} className="text-(--color-ink) underline">спека</a>
          )}
        </div>

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
          {items.length === 0 && (
            <p className="text-sm text-(--color-muted)">Пока без задач.</p>
          )}
        </div>

        <div className="flex mt-4 pt-3 border-t border-(--color-line)">
          <button onClick={remove} className="text-xs text-(--color-danger-ink) ml-auto">
            Удалить эпик
          </button>
        </div>
      </div>
    </div>
  );
}
