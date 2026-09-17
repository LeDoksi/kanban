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
