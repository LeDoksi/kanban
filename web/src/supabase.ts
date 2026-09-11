import { createClient } from '@supabase/supabase-js';

export const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export type Check = { text: string; done: boolean };

export type Item = {
  id: string; seq: number; project_id: string; epic_id: string | null;
  type: 'task' | 'bug' | 'chore'; title: string; body: string | null;
  status: 'backlog' | 'doing' | 'waiting' | 'done';
  checklist: Check[]; position: number; archived_at: string | null;
};

export type Project = { id: string; name: string; prefix: string };
