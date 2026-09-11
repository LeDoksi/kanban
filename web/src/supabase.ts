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
  checklist: Check[]; blocks: string[]; position: number;
  closed_at: string | null; archived_at: string | null;
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
