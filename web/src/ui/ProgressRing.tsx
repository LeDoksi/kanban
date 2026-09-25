import { ringDash } from '../progress';

// Кольцо рисуется двумя окружностями SVG: дорожка цвета line и дуга
// accent. Это не иконка, а геометрия — библиотечного аналога нет.
export function ProgressRing(
  { done, total, size, stroke = 2.5 }: { done: number; total: number; size: number; stroke?: number },
) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="var(--color-accent)" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${ringDash(done, total, c)} ${c}`}
      />
    </svg>
  );
}
