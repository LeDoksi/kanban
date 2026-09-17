-- Пятый статус: «hold» — то, что осознанно отложено на потом, отдельно
-- от backlog (ещё не начато) и waiting (нужно от владельца прямо сейчас).
alter table items drop constraint items_status_check;
alter table items add constraint items_status_check
  check (status in ('backlog', 'hold', 'doing', 'waiting', 'done'));
