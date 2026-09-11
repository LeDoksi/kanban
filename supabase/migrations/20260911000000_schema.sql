-- Проекты. id — человекочитаемый слаг, prefix идёт в номера задач.
create table projects (
  id          text primary key,
  name        text not null,
  prefix      text not null,
  repo_path   text,
  position    double precision not null default 1000,
  archived_at timestamptz
);

-- Эпик = один план superpowers.
create table epics (
  id          text primary key,
  seq         integer not null,
  project_id  text not null references projects(id) on delete cascade,
  title       text not null,
  goal        text,
  plan_path   text,
  spec_path   text,
  status      text not null default 'active'
              check (status in ('active','done','archived')),
  position    double precision not null default 1000,
  created_at  timestamptz not null default now(),
  unique (project_id, seq)
);

-- Задачи. status — это колонка на доске.
create table items (
  id          text primary key,
  seq         integer not null,
  project_id  text not null references projects(id) on delete cascade,
  epic_id     text references epics(id) on delete set null,
  type        text not null default 'task'
              check (type in ('task','bug','chore')),
  title       text not null,
  body        text,
  status      text not null default 'backlog'
              check (status in ('backlog','doing','waiting','done')),
  checklist   jsonb not null default '[]'::jsonb,
  blocks      text[] not null default '{}',
  position    double precision not null default 1000,
  created_by  text not null default 'claude'
              check (created_by in ('me','claude')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  closed_at   timestamptz,
  archived_at timestamptz,
  unique (project_id, seq)
);

create table comments (
  id         bigserial primary key,
  item_id    text not null references items(id) on delete cascade,
  author     text not null check (author in ('me','claude')),
  body       text not null,
  created_at timestamptz not null default now()
);

-- Доска всегда фильтрует по проекту и статусу, эпик — по эпику.
create index items_board_idx on items (project_id, status, position);
create index items_epic_idx  on items (epic_id, position);
create index comments_item_idx on comments (item_id, created_at);

-- Следующий номер внутри проекта. Блокировка строки проекта сериализует
-- параллельные вставки, поэтому два одновременных вызова не дадут
-- одинаковый seq.
create or replace function next_seq(p_project text, p_kind text)
returns integer language plpgsql as $$
declare n integer;
begin
  perform 1 from projects where id = p_project for update;
  if p_kind = 'epic' then
    select coalesce(max(seq),0)+1 into n from epics where project_id = p_project;
  else
    select coalesce(max(seq),0)+1 into n from items where project_id = p_project;
  end if;
  return n;
end $$;

-- updated_at поддерживается базой, а не вызывающим кодом.
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger items_touch before update on items
  for each row execute function touch_updated_at();

-- Доступ: только владелец. Сервисный ключ RLS не проверяет.
alter table projects enable row level security;
alter table epics    enable row level security;
alter table items    enable row level security;
alter table comments enable row level security;

create policy owner_only on projects for all
  using (auth.jwt() ->> 'email' = 'shakov.georgy@gmail.com')
  with check (auth.jwt() ->> 'email' = 'shakov.georgy@gmail.com');

create policy owner_only on epics for all
  using (auth.jwt() ->> 'email' = 'shakov.georgy@gmail.com')
  with check (auth.jwt() ->> 'email' = 'shakov.georgy@gmail.com');

create policy owner_only on items for all
  using (auth.jwt() ->> 'email' = 'shakov.georgy@gmail.com')
  with check (auth.jwt() ->> 'email' = 'shakov.georgy@gmail.com');

create policy owner_only on comments for all
  using (auth.jwt() ->> 'email' = 'shakov.georgy@gmail.com')
  with check (auth.jwt() ->> 'email' = 'shakov.georgy@gmail.com');
