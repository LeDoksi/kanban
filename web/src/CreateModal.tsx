import { useEffect, useState } from 'react';
import { sb } from './supabase';
import type { Item, Epic } from './supabase';
import { guessType, stripPrefix } from './guess';
import { selectableEpics } from './epics';

export function CreateModal(
  { project, epics, items, onClose, onCreated }: {
    project: string; epics: Epic[]; items: Item[];
    onClose: () => void; onCreated: () => void;
  },
) {
  const [kind, setKind] = useState<'task' | 'epic'>('task');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const [title, setTitle] = useState('');
  const [type, setType] = useState<Item['type']>('task');
  const [touched, setTouched] = useState(false);
  const [epicId, setEpicId] = useState('');

  const [epicTitle, setEpicTitle] = useState('');
  const [goal, setGoal] = useState('');

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onTitle = (v: string) => {
    setTitle(v);
    setError('');
    if (!touched) setType(guessType(v));
  };

  const submitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = stripPrefix(title);
    if (!clean) { setError('Напиши, что надо сделать'); return; }
    setBusy(true);

    const { data: seqData, error: seqErr } = await sb
      .rpc('next_seq', { p_project: project, p_kind: 'item' });
    if (seqErr) { setError(seqErr.message); setBusy(false); return; }

    const { data: p, error: pErr } = await sb.from('projects')
      .select('prefix').eq('id', project).single();
    if (pErr || !p) { setError(pErr?.message ?? 'Проект не найден'); setBusy(false); return; }

    const { error } = await sb.from('items').insert({
      id: `${p.prefix}-${seqData}`,
      seq: seqData,
      project_id: project,
      type,
      title: clean,
      status: 'backlog',
      created_by: 'me',
      epic_id: epicId || null,
      position: seqData * 100,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    onCreated();
    onClose();
  };

  const submitEpic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!epicTitle.trim()) { setError('Напиши заголовок эпика'); return; }
    setBusy(true);

    const { data: seq, error: seqErr } = await sb
      .rpc('next_seq', { p_project: project, p_kind: 'epic' });
    if (seqErr) { setError(seqErr.message); setBusy(false); return; }

    const { data: p, error: pErr } = await sb.from('projects')
      .select('prefix').eq('id', project).single();
    if (pErr || !p) { setError(pErr?.message ?? 'Проект не найден'); setBusy(false); return; }

    const id = `${p.prefix}-E${seq}`;
    const { error } = await sb.from('epics').insert({
      id, seq, project_id: project,
      title: epicTitle.trim(), goal: goal.trim() || null,
      position: seq * 100,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    onCreated();
    onClose();
  };

  const options = selectableEpics(epics, items);

  return (
    <div
      className="fixed inset-0 bg-(--color-overlay) flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-(--color-ground) rounded-lg max-w-md w-full p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-1.5">
            {(['task', 'epic'] as const).map(k => (
              <button
                key={k}
                type="button"
                onClick={() => { setKind(k); setError(''); }}
                className={`text-sm px-3 py-1 rounded-full border ${
                  kind === k
                    ? 'border-(--color-muted)'
                    : 'border-(--color-line) text-(--color-muted)'
                }`}
              >
                {k === 'task' ? 'Задача' : 'Эпик'}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="text-(--color-muted) text-lg leading-none"
          >
            ×
          </button>
        </div>

        {kind === 'task' ? (
          <form onSubmit={submitTask} className="space-y-2">
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
            <select
              value={epicId}
              onChange={e => setEpicId(e.target.value)}
              className="w-full h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                         border border-(--color-line)"
            >
              <option value="">— без эпика —</option>
              {options.map(ep => (
                <option key={ep.id} value={ep.id}>{ep.title}</option>
              ))}
            </select>
            {error && <p className="text-xs text-(--color-danger-ink)">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full h-8 rounded-lg bg-(--color-ink)
                         text-(--color-ground) text-sm"
            >
              {busy ? '…' : 'В Backlog'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitEpic} className="space-y-2">
            <input
              autoFocus
              value={epicTitle}
              onChange={e => { setEpicTitle(e.target.value); setError(''); }}
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
            <button
              type="submit"
              disabled={busy}
              className="w-full h-8 rounded-lg bg-(--color-ink)
                         text-(--color-ground) text-sm"
            >
              {busy ? '…' : 'Создать'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
