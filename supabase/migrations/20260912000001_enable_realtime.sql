-- Realtime у Supabase работает через публикацию Postgres: таблица должна
-- быть явно добавлена, иначе подписка молча ничего не пришлёт.
alter publication supabase_realtime add table items;
alter publication supabase_realtime add table epics;
