import { useEffect, useState } from 'react';
import { sb } from './supabase';
import type { Project, Item } from './supabase';

type Row = { project: Project; total: number; done: number; waiting: number };

export function AllProjects({ onSelect }: { onSelect: (id: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const { data: projects, error: pErr } = await sb.from('projects')
        .select('*').is('archived_at', null).order('position');
      if (pErr) { setErr(pErr.message); return; }

      const { data: items, error: iErr } = await sb.from('items').select('*');
      if (iErr) { setErr(iErr.message); return; }

      const all = (items ?? []) as Item[];
      setRows((projects ?? []).map((project: Project) => {
        const mine = all.filter(i => i.project_id === project.id);
        return {
          project,
          total: mine.length,
          done: mine.filter(i => i.status === 'done').length,
          waiting: mine.filter(i => i.status === 'waiting' && !i.archived_at).length,
        };
      }));
    })();
  }, []);

  return (
    <div className="min-h-dvh p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-lg font-medium mb-4">Все проекты</h1>

      {err && <p className="text-sm text-(--color-danger-ink) mb-3">{err}</p>}

      <div className="space-y-1">
        {rows.map(({ project, total, done, waiting }) => (
          <button
            key={project.id}
            onClick={() => onSelect(project.id)}
            className="w-full flex items-center gap-3 text-left text-sm
                       px-3 py-2 rounded hover:bg-(--color-panel)"
          >
            <span className="font-medium">{project.name}</span>
            {project.description && (
              <span className="text-(--color-muted) truncate">
                {project.description}
              </span>
            )}
            <span className="ml-auto text-(--color-muted)">{done}/{total}</span>
            {waiting > 0 && (
              <span className="text-(--color-wait-ink)">{waiting} ждёт</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
