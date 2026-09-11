import { useState } from 'react';
import { sb } from './supabase';
import type { Item } from './supabase';
import { guessType, stripPrefix } from './guess';

export function NewTask(
  { project, onAdded }: { project: string; onAdded: () => void },
) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<Item['type']>('task');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onTitle = (v: string) => {
    setTitle(v);
    setError('');
    if (!touched) setType(guessType(v));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = stripPrefix(title);
    if (!clean) { setError('Напиши, что надо сделать'); return; }
    setBusy(true);

    const { data: seqData, error: seqErr } = await sb
      .rpc('next_seq', { p_project: project, p_kind: 'item' });
    if (seqErr) { setError(seqErr.message); setBusy(false); return; }

    const { data: p } = await sb.from('projects')
      .select('prefix').eq('id', project).single();

    const { error } = await sb.from('items').insert({
      id: `${p!.prefix}-${seqData}`,
      seq: seqData,
      project_id: project,
      type,
      title: clean,
      status: 'backlog',
      created_by: 'me',
      position: Date.now() % 1_000_000,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }

    setTitle(''); setType('task'); setTouched(false); setOpen(false);
    onAdded();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="h-8 px-3 rounded-lg bg-(--color-ink)
                   text-(--color-ground) text-sm"
      >
        Новая задача
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="w-64 space-y-2">
      <textarea
        autoFocus
        value={title}
        onChange={e => onTitle(e.target.value)}
        placeholder="баг: календарь не листает в ноябрь"
        rows={2}
        className="w-full p-2 rounded-lg bg-(--color-panel) text-sm
                   border border-(--color-line) outline-none resize-none
                   focus:border-(--color-muted)"
      />

      <div className="flex gap-1.5">
        {(['task', 'bug', 'chore'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => { setType(t); setTouched(true); }}
            className={`text-[11px] px-2 py-1 rounded-full border ${
              type === t
                ? 'border-(--color-muted)'
                : 'border-(--color-line) text-(--color-muted)'
            }`}
          >
            {t === 'task' ? 'задача' : t === 'bug' ? 'баг' : 'долг'}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-(--color-danger-ink)">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 h-8 rounded-lg bg-(--color-ink)
                     text-(--color-ground) text-sm"
        >
          {busy ? '…' : 'В Backlog'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setTitle(''); setError(''); }}
          className="h-8 px-3 rounded-lg border border-(--color-line)
                     text-sm text-(--color-muted)"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
