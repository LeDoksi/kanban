import type { Item } from './supabase';

// Поиск по архиву на клиенте: там 100+ закрытых задач, а искать приходится
// по памяти — «что-то про ёлку». ё и е не различаем, id ищется так же.
const norm = (s: string) => s.toLowerCase().replaceAll('ё', 'е').trim();

export function filterArchive(items: Item[], query: string): Item[] {
  const q = norm(query);
  if (!q) return items;
  return items.filter(i => norm(i.title).includes(q) || norm(i.id).includes(q));
}
