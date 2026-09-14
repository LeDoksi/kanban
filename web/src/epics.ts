import type { Item, Epic } from './supabase';

export type EpicVisibility = 'empty' | 'active' | 'archived';

export function epicVisibility(epicId: string, items: Item[]): EpicVisibility {
  const own = items.filter(i => i.epic_id === epicId);
  if (own.length === 0) return 'empty';
  return own.some(i => !i.archived_at) ? 'active' : 'archived';
}

export function groupItemsByEpic<T extends { epic_id: string | null }>(
  items: T[], epics: Epic[],
): { epic: Epic; items: T[] }[] {
  const byId = new Map(epics.map(e => [e.id, e] as const));
  const groups = new Map<string, T[]>();
  for (const item of items) {
    if (!item.epic_id || !byId.has(item.epic_id)) continue;
    const list = groups.get(item.epic_id) ?? [];
    list.push(item);
    groups.set(item.epic_id, list);
  }
  return epics
    .filter(e => groups.has(e.id))
    .sort((a, b) => a.position - b.position)
    .map(epic => ({ epic, items: groups.get(epic.id)! }));
}

export function emptyEpics(epics: Epic[], allItems: Item[]): Epic[] {
  return epics
    .filter(e => epicVisibility(e.id, allItems) === 'empty')
    .sort((a, b) => a.position - b.position);
}

export function selectableEpics(
  epics: Epic[], allItems: Item[], currentEpicId?: string | null,
): Epic[] {
  return epics
    .filter(e => epicVisibility(e.id, allItems) !== 'archived' || e.id === currentEpicId)
    .sort((a, b) => a.position - b.position);
}

export function epicProgress(epicId: string, allItems: Item[]): { done: number; total: number } {
  const own = allItems.filter(i => i.epic_id === epicId);
  const done = own.filter(i => i.status === 'done' || i.archived_at).length;
  return { done, total: own.length };
}
