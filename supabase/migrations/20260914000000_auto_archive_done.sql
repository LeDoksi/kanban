create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'archive-done-items',
  '0 3 * * *',
  $$ update items set archived_at = now()
     where status = 'done' and archived_at is null
       and closed_at < now() - interval '3 days' $$
);
