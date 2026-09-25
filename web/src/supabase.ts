import { createClient } from '@supabase/supabase-js';

export const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export type Check = { text: string; done: boolean };

export type Item = {
  id: string; seq: number; project_id: string; epic_id: string | null;
  type: 'task' | 'bug' | 'chore'; title: string; body: string | null;
  status: 'backlog' | 'hold' | 'doing' | 'waiting' | 'done';
  checklist: Check[]; blocks: string[]; position: number;
  closed_at: string | null; archived_at: string | null;
  // Встроенный счётчик PostgREST: select('*, comments(count)') отдаёт
  // [{ count: N }]. Необязательный — другие запросы (эпик, архив)
  // выбирают '*' без него.
  comments?: { count: number }[];
};

export type Comment = {
  id: number; item_id: string; author: 'me' | 'claude';
  body: string; created_at: string;
};

export type Epic = {
  id: string; seq: number; project_id: string; title: string;
  goal: string | null; plan_path: string | null; spec_path: string | null;
  status: string; position: number;
};

export type Project = {
  id: string; name: string; prefix: string; description: string | null;
};

// status меняется → closed_at ставится/сбрасывается: было продублировано
// в drag, свайпе/селекте карточки и TaskModal. closedAtFor() отдельно —
// drag комбинирует его с position в одном update и не может звать
// setStatus() напрямую.
export const closedAtFor = (status: Item['status']): string | null =>
  status === 'done' ? new Date().toISOString() : null;

export const setStatus = (id: string, status: Item['status']) =>
  sb.from('items')
    .update({ status, closed_at: closedAtFor(status) })
    .eq('id', id);
