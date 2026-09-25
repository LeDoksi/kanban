// Какая колонка ленты сейчас на экране. step — расстояние между началами
// соседних колонок (ширина + зазор): меряется по DOM, поэтому после
// поворота телефона пересчитывается сам.
export function indexFromScroll(scrollLeft: number, step: number, count: number): number {
  if (step <= 0 || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / step)));
}

// На планшете (768–1023px) видно две колонки — лента не может
// прокрутиться до active*step для последней колонки, упирается в
// scrollWidth раньше. indexFromScroll на застрявшем scrollLeft округляет
// вниз, и активная вкладка откатывается назад, хотя нужная колонка уже
// на экране. Если лента у самого конца и активная вкладка не левее
// вычисленного индекса — она и так видна, оставляем её как есть.
export function settleIndex(
  scrollLeft: number, step: number, count: number, atEnd: boolean, active: number,
): number {
  const computed = indexFromScroll(scrollLeft, step, count);
  if (atEnd && active >= computed) return active;
  return computed;
}
