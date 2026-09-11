import { useEffect, useState } from 'react';
import { sb } from './supabase';
import type { Item, Project } from './supabase';

const COLUMNS = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'doing',   label: 'В работе' },
  { key: 'waiting', label: 'Нужно от тебя' },
  { key: 'done',    label: 'Готово' },
] as const;

export function Board() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<string>('');
  const [items, setItems] = useState<Item[]>([]);

  const reload = async (project: string) => {
    if (!project) return;
    const { data } = await sb.from('items').select('*')
      .eq('project_id', project).is('archived_at', null)
      .order('position');
    setItems((data ?? []) as Item[]);
  };

  useEffect(() => {
    sb.from('projects').select('*').is('archived_at', null)
      .order('position')
      .then(({ data }) => {
        const ps = (data ?? []) as Project[];
        setProjects(ps);
        if (ps.length) setCurrent(ps[0].id);
      });
  }, []);

  useEffect(() => { reload(current); }, [current]);

  return (
    <div className="min-h-dvh p-4 md:p-6 max-w-6xl mx-auto">
      <header className="flex items-center gap-3 mb-5">
        <select
          value={current}
          onChange={e => setCurrent(e.target.value)}
          className="h-8 px-2 rounded-lg bg-(--color-panel)
                     border border-(--color-line) text-sm"
        >
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <span className="text-sm text-(--color-muted)">
          {items.filter(i => i.status === 'done').length}/{items.length}
        </span>
      </header>

      {/* Телефон — одна вертикаль, десктоп — четыре колонки. */}
      <div className="grid gap-3 md:grid-cols-4">
        {COLUMNS.map(col => {
          const list = items.filter(i => i.status === col.key);
          return (
            <section key={col.key}>
              <h2 className="text-xs text-(--color-muted) mb-2 px-1">
                {col.label} {list.length > 0 && list.length}
              </h2>
              <div className="space-y-2">
                {list.map(i => (
                  <Card key={i.id} item={i} onChanged={() => reload(current)} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Card({ item, onChanged }: { item: Item; onChanged: () => void }) {
  const done = item.checklist.filter(s => s.done).length;
  const waiting = item.status === 'waiting';

  const move = async (status: Item['status']) => {
    await sb.from('items').update({
      status,
      closed_at: status === 'done' ? new Date().toISOString() : null,
    }).eq('id', item.id);
    onChanged();
  };

  return (
    <article
      className={`rounded-lg p-2.5 text-sm ${
        waiting ? 'bg-(--color-wait)' : 'bg-(--color-panel)'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className={`text-[11px] font-mono ${
            waiting ? 'text-(--color-wait-ink)' : 'text-(--color-muted)'
          }`}
        >
          {item.seq}
        </span>
        {item.type !== 'task' && (
          <span className="text-[10px] px-1.5 py-px rounded
                           bg-red-100 text-red-800">
            {item.type === 'bug' ? 'баг' : 'долг'}
          </span>
        )}
      </div>

      <p className={waiting ? 'text-(--color-wait-ink)' : ''}>{item.title}</p>

      {item.checklist.length > 0 && (
        <p className="text-[11px] text-(--color-muted) mt-1.5">
          {done}/{item.checklist.length}
        </p>
      )}

      <select
        value={item.status}
        onChange={e => move(e.target.value as Item['status'])}
        aria-label={`Статус задачи ${item.title}`}
        className="mt-2 w-full h-7 px-1 rounded text-[11px]
                   bg-transparent border border-(--color-line)
                   text-(--color-muted)"
      >
        <option value="backlog">Backlog</option>
        <option value="doing">В работе</option>
        <option value="waiting">Нужно от тебя</option>
        <option value="done">Готово</option>
      </select>
    </article>
  );
}
