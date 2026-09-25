// Длина закрашенной дуги кольца прогресса. Пустой эпик — пустое кольцо,
// а не деление на ноль; больше целого круга не рисуем.
export function ringDash(done: number, total: number, circumference: number): number {
  if (total <= 0) return 0;
  const f = Math.min(1, Math.max(0, done / total));
  return f * circumference;
}
