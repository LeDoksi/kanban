import { useState } from 'react';
import { sb } from './supabase';
import type { Item, Epic } from './supabase';
import { guessType, stripPrefix } from './guess';
import { selectableEpics } from './epics';
import { Sheet } from './ui/Sheet';
import { Button } from './ui/Button';

export function CreateModal(
  { project, epics, items, onClose }: {
    project: string; epics: Epic[]; items: Item[];
    onClose: () => void;
  },
) {
  const [kind, setKind] = useState<'task' | 'epic'>('task');

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

    const [{ data: seqData, error: seqErr }, { data: p, error: pErr }] = await Promise.all([
      sb.rpc('next_seq', { p_project: project, p_kind: 'item' }),
      sb.from('projects').select('prefix').eq('id', project).single(),
    ]);
    if (seqErr) { setError(seqErr.message); setBusy(false); return; }
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
    onClose();
  };

  const submitEpic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!epicTitle.trim()) { setError('Напиши заголовок эпика'); return; }
    setBusy(true);

    const [{ data: seq, error: seqErr }, { data: p, error: pErr }] = await Promise.all([
      sb.rpc('next_seq', { p_project: project, p_kind: 'epic' }),
      sb.from('projects').select('prefix').eq('id', project).single(),
    ]);
    if (seqErr) { setError(seqErr.message); setBusy(false); return; }
    if (pErr || !p) { setError(pErr?.message ?? 'Проект не найден'); setBusy(false); return; }

    const id = `${p.prefix}-E${seq}`;
    const { error } = await sb.from('epics').insert({
      id, seq, project_id: project,
      title: epicTitle.trim(), goal: goal.trim() || null,
      position: seq * 100,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    onClose();
  };

  const options = selectableEpics(epics, items);

  return (
    <Sheet onClose={onClose} maxWidth="max-w-md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1.5">
          {(['task', 'epic'] as const).map(k => (
            <button
              key={k}
              type="button"
              onClick={() => { setKind(k); setError(''); }}
              className={`text-sm px-3 py-1 rounded-full border ${
                kind === k
                  ? 'border-(--color-accent) text-(--color-accent-ink)'
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
          className="text-(--color-muted) hover:text-(--color-ink) text-lg leading-none"
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
                       focus:border-(--color-accent)"
          />
          <div className="flex gap-1.5">
            {(['task', 'bug', 'chore'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => { setType(t); setTouched(true); }}
                className={`text-2xs px-2 py-1 rounded-full border ${
                  type === t
                    ? 'border-(--color-accent) text-(--color-accent-ink)'
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
          <Button type="submit" variant="primary" disabled={busy} className="w-full">
            {busy ? '…' : 'В Backlog'}
          </Button>
        </form>
      ) : (
        <form onSubmit={submitEpic} className="space-y-2">
          <input
            autoFocus
            value={epicTitle}
            onChange={e => { setEpicTitle(e.target.value); setError(''); }}
            placeholder="крупная тема"
            className="w-full h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                       border border-(--color-line) outline-none
                       focus:border-(--color-accent)"
          />
          <textarea
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder="цель (необязательно)"
            rows={2}
            className="w-full p-2 rounded-lg bg-(--color-panel) text-sm
                       border border-(--color-line) outline-none resize-none
                       focus:border-(--color-accent)"
          />
          {error && <p className="text-xs text-(--color-danger-ink)">{error}</p>}
          <Button type="submit" variant="primary" disabled={busy} className="w-full">
            {busy ? '…' : 'Создать'}
          </Button>
        </form>
      )}
    </Sheet>
  );
}
