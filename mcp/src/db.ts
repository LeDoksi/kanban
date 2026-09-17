/* Единственное место, знающее про сеть и про то, как устроены строки базы.
   Сервисный ключ обходит RLS — поэтому он живёт только здесь и только
   на машине владельца. */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  throw new Error('Нужны переменные SUPABASE_URL и SUPABASE_SERVICE_KEY');
}

export const sb = createClient(url, key, {
  auth: { persistSession: false },
});

export type Project = {
  id: string; name: string; prefix: string; description: string | null;
  repo_path: string | null;
};

export type Epic = {
  id: string; seq: number; project_id: string; title: string;
  goal: string | null; plan_path: string | null; spec_path: string | null;
  status: string; position: number;
};

export type Check = { text: string; done: boolean };

export type Item = {
  id: string; seq: number; project_id: string; epic_id: string | null;
  type: 'task' | 'bug' | 'chore'; title: string; body: string | null;
  status: 'backlog' | 'hold' | 'doing' | 'waiting' | 'done';
  checklist: Check[]; blocks: string[]; position: number;
  created_by: 'me' | 'claude'; closed_at: string | null;
  archived_at: string | null;
};

export type Comment = {
  id: number; item_id: string; author: 'me' | 'claude';
  body: string; created_at: string;
};

/* Проект определяется по рабочей папке: агент не обязан называть его
   вручную, пока работает внутри репозитория. Сравнение по префиксу пути,
   чтобы срабатывало и во вложенных папках. Регистр и слэши нормализуются —
   на Windows один и тот же путь приходит в разных написаниях. */
const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

export async function resolveProject(explicit?: string): Promise<Project> {
  const { data, error } = await sb
    .from('projects').select('*').is('archived_at', null);
  if (error) throw new Error(error.message);
  const projects = (data ?? []) as Project[];

  if (explicit) {
    const hit = projects.find(p => p.id === explicit);
    if (!hit) throw new Error(`Проект "${explicit}" не найден`);
    return hit;
  }

  const cwd = norm(process.cwd());
  const matches = projects
    .filter(p => {
      if (!p.repo_path) return false;
      const base = norm(p.repo_path);
      return cwd === base || cwd.startsWith(base + '/');
    })
    .sort((a, b) => norm(b.repo_path!).length - norm(a.repo_path!).length);

  if (matches.length) return matches[0];

  const names = projects.map(p => p.id).join(', ');
  throw new Error(
    `Не понял, какой это проект (папка ${process.cwd()}). Укажи project явно. Известные: ${names}`,
  );
}
