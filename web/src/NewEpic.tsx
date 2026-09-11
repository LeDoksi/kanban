import { useState } from 'react';
import { sb } from './supabase';

export function NewEpic(
  { project, onCreated }: { project: string; onCreated: () => void },
) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Напиши заголовок эпика'); return; }
    setBusy(true);

    const { data: seq, error: seqErr } = await sb
      .rpc('next_seq', { p_project: project, p_kind: 'epic' });
    if (seqErr) { setError(seqErr.message); setBusy(false); return; }

    const { data: p } = await sb.from('projects')
      .select('prefix').eq('id', project).single();

    const { error } = await sb.from('epics').insert({
      id: `${p!.prefix}-E${seq}`,
      seq,
      project_id: project,
      title: title.trim(),
      goal: goal.trim() || null,
      position: seq * 100,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }

    setTitle(''); setGoal(''); setOpen(false);
    onCreated();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="h-8 px-3 rounded-lg border border-(--color-line) text-sm"
      >
        Новый эпик
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="w-64 space-y-2">
      <input
        autoFocus
        value={title}
        onChange={e => { setTitle(e.target.value); setError(''); }}
        placeholder="крупная тема"
        className="w-full h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                   border border-(--color-line) outline-none"
      />
      <textarea
        value={goal}
        onChange={e => setGoal(e.target.value)}
        placeholder="цель (необязательно)"
        rows={2}
        className="w-full p-2 rounded-lg bg-(--color-panel) text-sm
                   border border-(--color-line) outline-none resize-none"
      />

      {error && <p className="text-xs text-(--color-danger-ink)">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 h-8 rounded-lg bg-(--color-ink)
                     text-(--color-ground) text-sm"
        >
          {busy ? '…' : 'Создать'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(''); }}
          className="h-8 px-3 rounded-lg border border-(--color-line)
                     text-sm text-(--color-muted)"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
