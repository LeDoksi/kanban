const MONTHS = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];

// Время комментария «по-человечески». Своя функция, а не Intl.RelativeTimeFormat:
// «2 ч назад» и «вчера» короче, чем «2 часа назад» / «1 день назад», а
// строка стоит в мелкой подписи. Дата — по UTC, как хранится в базе.
export function relTime(iso: string, now: Date): string {
  const t = new Date(iso);
  const s = (now.getTime() - t.getTime()) / 1000;
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 24 * 3600) return `${Math.floor(s / 3600)} ч назад`;
  if (s < 48 * 3600) return 'вчера';
  const d = `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`;
  return t.getUTCFullYear() === now.getUTCFullYear() ? d : `${d} ${t.getUTCFullYear()}`;
}

export function fullDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU');
}
