import { useState } from 'react';
import { sb } from './supabase';
import type { Item, Epic } from './supabase';
import { guessType, stripPrefix } from './guess';
import { selectableEpics } from './epics';
import { Sheet, SheetCloseButton } from './ui/Sheet';
import { Button } from './ui/Button';
import { AutoTextarea } from './ui/AutoTextarea';
import { PropertySelect } from './ui/PropertySelect';
import { toasts } from './ui/toast';
import { CheckSquare, Bug, Wrench } from '@phosphor-icons/react';

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

  const [busy, setBusy] = useState(false);

  const onTitle = (v: string) => {
    setTitle(v);
    if (!touched) setType(guessType(v));
  };

  const submitTask = async () => {
    const clean = stripPrefix(title);
    if (!clean) { toasts.show('Напиши, что надо сделать'); return; }
    setBusy(true);

    // Независимые запросы — параллельно, а не друг за другом: номер и
    // префикс проекта не зависят один от другого.
    const [{ data: seqData, error: seqErr }, { data: p, error: pErr }] = await Promise.all([
      sb.rpc('next_seq', { p_project: project, p_kind: 'item' }),
      sb.from('projects').select('prefix').eq('id', project).single(),
    ]);
    if (seqErr) { toasts.show(seqErr.message); setBusy(false); return; }
    if (pErr || !p) { toasts.show(pErr?.message ?? 'Проект не найден'); setBusy(false); return; }

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
    if (error) { toasts.show(error.message); return; }
    // Доска обновится сама через Realtime — свой reload() тут был бы
    // вторым полным запросом сразу вслед за тем же, что и так придёт.
    onClose();
  };

  const submitEpic = async () => {
    if (!epicTitle.trim()) { toasts.show('Напиши заголовок эпика'); return; }
    setBusy(true);

    const [{ data: seq, error: seqErr }, { data: p, error: pErr }] = await Promise.all([
      sb.rpc('next_seq', { p_project: project, p_kind: 'epic' }),
      sb.from('projects').select('prefix').eq('id', project).single(),
    ]);
    if (seqErr) { toasts.show(seqErr.message); setBusy(false); return; }
    if (pErr || !p) { toasts.show(pErr?.message ?? 'Проект не найден'); setBusy(false); return; }

    const id = `${p.prefix}-E${seq}`;
    const { error } = await sb.from('epics').insert({
      id, seq, project_id: project,
      title: epicTitle.trim(), goal: goal.trim() || null,
      position: seq * 100,
    });
    setBusy(false);
    if (error) { toasts.show(error.message); return; }
    onClose();
  };

  const submit = () => {
    if (busy) return;
    if (kind === 'task') submitTask(); else submitEpic();
  };

  const options = selectableEpics(epics, items);

  return (
    <Sheet title="Новая задача" onClose={onClose} center>
      <form
        onSubmit={e => { e.preventDefault(); submit(); }}
        onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submit(); } }}
      >
        <div className="flex items-center justify-between mb-3">
          <div role="tablist" className="flex p-1 rounded-full bg-(--color-raised)">
            {(['task', 'epic'] as const).map(k => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
                className={`text-meta px-3 py-1.5 rounded-full transition-colors ${
                  kind === k
                    ? 'bg-(--color-surface) shadow-card text-(--color-ink)'
                    : 'text-(--color-muted)'
                }`}
              >
                {k === 'task' ? 'Задача' : 'Эпик'}
              </button>
            ))}
          </div>
          <SheetCloseButton />
        </div>

        {kind === 'task' ? (
          <div className="space-y-2">
            <AutoTextarea
              autoFocus
              value={title}
              onChange={e => onTitle(e.target.value)}
              placeholder="Что сделать?"
              className="w-full text-title bg-transparent outline-none placeholder:text-(--color-muted)"
            />
            <div className="flex gap-1.5">
              {(['task', 'bug', 'chore'] as const).map(t => {
                const Icon = t === 'task' ? CheckSquare : t === 'bug' ? Bug : Wrench;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setType(t); setTouched(true); }}
                    className={`inline-flex items-center gap-1.5 text-micro px-2.5 py-1 rounded-full ${
                      type === t
                        ? 'bg-(--color-accent-soft) text-(--color-accent-ink)'
                        : 'text-(--color-muted) hover:bg-(--color-raised)'
                    }`}
                  >
                    <Icon size={14} />
                    {t === 'task' ? 'задача' : t === 'bug' ? 'баг' : 'долг'}
                  </button>
                );
              })}
            </div>
            <PropertySelect
              label="Эпик" value={epicId}
              options={[{ value: '', label: 'Без эпика' },
                ...options.map(ep => ({ value: ep.id, label: ep.title }))]}
              onChange={setEpicId}
            />
            <Button type="submit" variant="primary" disabled={busy} className="w-full justify-center mt-1">
              {busy ? '…' : 'Создать в Backlog'}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <AutoTextarea
              autoFocus
              value={epicTitle}
              onChange={e => setEpicTitle(e.target.value)}
              placeholder="Название эпика"
              className="w-full text-title bg-transparent outline-none placeholder:text-(--color-muted)"
            />
            <AutoTextarea
              value={goal}
              onChange={e => setGoal(e.target.value)}
              placeholder="Цель (необязательно)"
              className="w-full min-h-20 p-3 rounded-xl bg-(--color-raised) text-body outline-none
                         focus:ring-2 focus:ring-(--color-accent)"
            />
            <Button type="submit" variant="primary" disabled={busy} className="w-full justify-center mt-1">
              {busy ? '…' : 'Создать эпик'}
            </Button>
          </div>
        )}
      </form>
    </Sheet>
  );
}
