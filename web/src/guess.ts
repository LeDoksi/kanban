import type { Item } from './supabase';

/* Тип угадывается по первым словам. Ошибка стоит один клик по пилюле,
   поэтому угадывание дешевле, чем обязательный выбор при каждом вводе. */
const BUG = /^\s*(баг|bug|ошибка|не работает|сломал|починить|чиним|фикс)/i;
const CHORE = /^\s*(долг|рефактор|почистить|убрать|обновить зависимост)/i;

export function guessType(title: string): Item['type'] {
  if (BUG.test(title)) return 'bug';
  if (CHORE.test(title)) return 'chore';
  return 'task';
}

/* "баг: календарь не листает" → "календарь не листает".
   Если после двоеточия ничего не осталось, текст возвращается как есть —
   пустой заголовок хуже неудачно срезанного. */
export function stripPrefix(title: string): string {
  // \w не покрывает кириллицу — префиксы вида "баг:" на ней и держатся.
  return title.replace(/^\s*[^\s:]+\s*:\s*/, '').trim() || title.trim();
}
