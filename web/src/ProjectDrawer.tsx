import { useEffect, useState } from 'react';
import { sb } from './supabase';
import type { Project } from './supabase';
import { NewProject } from './NewProject';

type Row = { project: Project; total: number; done: number; waiting: number };

export function ProjectDrawer(
  { current, onSelect, onClose }: { current: string; onSelect: (id: string) => void; onClose: () => void },
) {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState('');

  // Только нужные колонки, не select('*') по всем задачам всех проектов —
  // старый экран «Все проекты» заметно тормозил именно на этом запросе.
  const load = async () => {
    const { data: projects, error: pErr } = await sb.from('projects')
      .select('*').is('archived_at', null).order('position');
    if (pErr) { setErr(pErr.message); return; }

    const { data: items, error: iErr } = await sb.from('items')
      .select('project_id, status, archived_at');
    if (iErr) { setErr(iErr.message); return; }

    const all = items ?? [];
    setRows((projects ?? []).map((project: Project) => {
      const mine = all.filter(i => i.project_id === project.id);
      return {
        project,
        total: mine.length,
        done: mine.filter(i => i.status === 'done').length,
        waiting: mine.filter(i => i.status === 'waiting' && !i.archived_at).length,
      };
    }));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose}>
      <div
        className="fixed inset-y-0 left-0 w-80 max-w-[85vw] bg-(--color-ground)
                   overflow-y-auto p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-medium">Проекты</h2>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="text-(--color-muted) text-lg leading-none"
          >
            ×
          </button>
        </div>

        {err && <p className="text-sm text-(--color-danger-ink) mb-3">{err}</p>}

        <NewProject onCreated={id => { onSelect(id); onClose(); }} />

        <div className="space-y-1 mt-4">
          {rows.map(({ project, total, done, waiting }) => (
            <button
              key={project.id}
              onClick={() => { onSelect(project.id); onClose(); }}
              className={`w-full flex items-center gap-3 text-left text-sm
                         px-3 py-2 rounded hover:bg-(--color-panel) ${
                project.id === current ? 'bg-(--color-panel)' : ''
              }`}
            >
              <span className="font-medium min-w-0 truncate">{project.name}</span>
              {project.description && (
                <span className="text-(--color-muted) truncate">
                  {project.description}
                </span>
              )}
              <span className="ml-auto shrink-0 text-(--color-muted)">{done}/{total}</span>
              {waiting > 0 && (
                <span className="shrink-0 text-(--color-wait-ink)">{waiting} ждёт</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
