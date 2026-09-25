export type PanelTone = 'default' | 'accent' | 'done';

// Карточка отделяется от фона тенью, а не рамкой. «Нужно от тебя»
// дополнительно получает тёплый фон и тонкое акцентное кольцо — это
// единственное, что на доске должно бросаться в глаза.
const TONE: Record<PanelTone, string> = {
  default: 'bg-(--color-surface) shadow-card',
  accent: 'bg-(--color-accent-soft) shadow-card ring-[1.5px] ring-inset ring-(--color-accent)',
  // Закрытые задачи отходят на второй план: тень слабее, текст ink-2
  // (ставит CardBody), фон тот же.
  done: 'bg-(--color-surface) shadow-[0_1px_2px_var(--color-shadow)]',
};

export function panelClass(tone: PanelTone = 'default', extra = ''): string {
  return `rounded-2xl ${TONE[tone]} ${extra}`.trim();
}
