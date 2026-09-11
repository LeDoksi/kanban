/* Дробная позиция между соседями по перетаскиванию. before/after — позиции
   карточек, между которыми встала перетаскиваемая; null на краю списка. */
export function between(before: number | null, after: number | null): number {
  if (before === null && after === null) return 1000;
  if (before === null) return after! / 2;
  if (after === null) return before + 100;
  return (before + after) / 2;
}
