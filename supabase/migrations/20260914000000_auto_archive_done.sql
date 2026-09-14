-- pg_cron доступен на бесплатном тарифе Supabase (подтверждено:
-- default_version 1.6.4 в списке расширений проекта на момент
-- написания), но не был включён ни в одной из предыдущих миграций.
create extension if not exists pg_cron with schema extensions;

-- Готовые задачи старше 3 дней уходят в архив сами — без ручного
-- вмешательства и без необходимости открывать сайт.
select cron.schedule(
  'archive-done-items',
  '0 3 * * *',
  $$ update items set archived_at = now()
     where status = 'done' and archived_at is null
       and closed_at < now() - interval '3 days' $$
);
