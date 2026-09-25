import type { Item } from './supabase';
// Расширение .ts обязательно: node --test запускает этот файл напрямую,
// без сборщика, и не угадывает расширения у импортов времени выполнения.
import { STATUS_ORDER, type Status } from './columns.ts';

// Память между заходами: последний проект и последняя вкладка на
// телефоне. Раньше после перезагрузки всегда открывался первый проект.
// Хранилище может отсутствовать или бросать (приватный режим, запрет
// cookies) — тогда просто ничего не помним.
export type Store = Pick<Storage, 'getItem' | 'setItem'> | null;

const PROJECT_KEY = 'kanban:lastProject';
const columnKey = (project: string) => `kanban:lastColumn:${project}`;

export function storage(): Store {
  try { return window.localStorage; } catch { return null; }
}

function read(s: Store, key: string): string | null {
  try { return s?.getItem(key) ?? null; } catch { return null; }
}

function write(s: Store, key: string, value: string): void {
  try { s?.setItem(key, value); } catch { /* память — удобство, не данные */ }
}

export const readLastProject = (s: Store) => read(s, PROJECT_KEY);
export const writeLastProject = (s: Store, id: string) => write(s, PROJECT_KEY, id);

export function readLastColumn(s: Store, project: string): Status | null {
  const v = read(s, columnKey(project));
  return STATUS_ORDER.includes(v as Status) ? (v as Status) : null;
}

export const writeLastColumn = (s: Store, project: string, status: Status) =>
  write(s, columnKey(project), status);

export function pickProject(projects: { id: string }[], saved: string | null): string | null {
  if (saved && projects.some(p => p.id === saved)) return saved;
  return projects[0]?.id ?? null;
}

export function startColumn(items: Item[], saved: Status | null): Status {
  if (saved) return saved;
  return items.some(i => i.status === 'doing' && !i.archived_at) ? 'doing' : 'backlog';
}
