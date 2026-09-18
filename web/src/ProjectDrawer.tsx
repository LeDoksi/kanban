import type { Project } from './supabase';
import { NewProject } from './NewProject';
import { Sheet } from './ui/Sheet';

export type ProjectRow = { project: Project; total: number; done: number; waiting: number };

export function ProjectDrawer(
  { current, rows, onSelect, onClose }: {
    current: string; rows: ProjectRow[];
    onSelect: (id: string) => void; onClose: () => void;
  },
) {
  return (
    <Sheet onClose={onClose} placement="left">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-medium">Проекты</h2>
        <button
          onClick={onClose}
          aria-label="Закрыть"
          className="text-(--color-muted) hover:text-(--color-ink) text-lg leading-none"
        >
          ×
        </button>
      </div>

      <NewProject onCreated={id => { onSelect(id); onClose(); }} />

      <div className="space-y-1 mt-4">
        {rows.map(({ project, total, done, waiting }) => (
          <button
            key={project.id}
            onClick={() => { onSelect(project.id); onClose(); }}
            className={`w-full text-left text-sm px-3 py-2 rounded
                       hover:bg-(--color-panel) ${
              project.id === current ? 'bg-(--color-panel)' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="font-medium">{project.name}</span>
              <span className="ml-auto shrink-0 text-(--color-muted)">{done}/{total}</span>
              {waiting > 0 && (
                <span className="shrink-0 text-(--color-accent-ink)">{waiting} ждёт</span>
              )}
            </div>
            {project.description && (
              <div className="text-(--color-muted) truncate mt-0.5">
                {project.description}
              </div>
            )}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
