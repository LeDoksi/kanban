import type { Item } from './supabase';

export const STATUS_ORDER: Item['status'][] = ['hold', 'backlog', 'doing', 'waiting', 'done'];
export const SWIPE_THRESHOLD = 60;

function neighbor(status: Item['status'], dragX: number): Item['status'] | null {
  const idx = STATUS_ORDER.indexOf(status) + (dragX > 0 ? 1 : -1);
  return idx >= 0 && idx < STATUS_ORDER.length ? STATUS_ORDER[idx] : null;
}

// Куда денёт свайп, если отпустить прямо сейчас — null, пока порог не
// пройден или дальше двигаться некуда (уже на первом/последнем статусе).
export function swipeTarget(status: Item['status'], dragX: number): Item['status'] | null {
  if (Math.abs(dragX) <= SWIPE_THRESHOLD) return null;
  return neighbor(status, dragX);
}

// То же самое, но без порога — для панели, которая открывается позади
// карточки с первого пикселя свайпа, а не только после срабатывания.
export function swipePreview(status: Item['status'], dragX: number): Item['status'] | null {
  if (dragX === 0) return null;
  return neighbor(status, dragX);
}

// Сколько пикселей пальцу дать, прежде чем решить, скролл это или свайп.
// Раньше решения не было вовсе: любое косое движение при прокрутке
// ленты сдвигало карточку вбок и открывало панель статуса.
export const AXIS_SLOP = 10;

// 'y' — это прокрутка, карточку не трогаем до конца касания; 'x' — свайп;
// null — палец ещё не ушёл дальше AXIS_SLOP, рано решать.
export function lockAxis(dx: number, dy: number): 'x' | 'y' | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_SLOP) return null;
  // Горизонталь должна явно преобладать: диагональ считается скроллом,
  // иначе палец, чуть ведущий вбок при прокрутке, опять цепляет карточку.
  return Math.abs(dx) > Math.abs(dy) * 1.5 ? 'x' : 'y';
}
