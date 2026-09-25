// Долгое нажатие на карточку открывает меню статусов. Горизонтальный
// свайп карточки больше не используется: он конфликтовал бы со свайпом
// ленты колонок. Движение дальше допуска — это прокрутка, не нажатие
// (тот же урок, что в KAN-113).
export const LONG_PRESS_MS = 450;
export const MOVE_TOLERANCE = 10;

export function movedTooFar(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > MOVE_TOLERANCE;
}
