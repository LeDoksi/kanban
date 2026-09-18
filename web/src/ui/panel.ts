export type PanelTone = 'default' | 'accent';

const TONE: Record<PanelTone, string> = {
  default: 'bg-(--color-panel)',
  accent: 'bg-(--color-accent-soft)',
};

export function panelClass(tone: PanelTone = 'default', extra = ''): string {
  return `rounded-lg ${TONE[tone]} ${extra}`.trim();
}
