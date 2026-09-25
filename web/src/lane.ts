// Какая колонка ленты сейчас на экране. step — расстояние между началами
// соседних колонок (ширина + зазор): меряется по DOM, поэтому после
// поворота телефона пересчитывается сам.
export function indexFromScroll(scrollLeft: number, step: number, count: number): number {
  if (step <= 0 || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / step)));
}
