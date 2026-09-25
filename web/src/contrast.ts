// Контраст WCAG 2.x. Нужен тесту, который держит все пары токенов
// «текст на фоне» не ниже AA: палитру легко сдвинуть на глаз и не
// заметить, что подписи стали нечитаемыми.
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => channel(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function hexTokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)) out[m[1]] = m[2];
  return out;
}

// Светлая тема — блок @theme, тёмная — :root внутри
// @media (prefers-color-scheme: dark), поверх светлой.
export function parseTokens(css: string) {
  const light = hexTokens(css.match(/@theme\s*\{([\s\S]*?)\n\}/)?.[1] ?? '');
  const darkBlock = css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([\s\S]*?)\}/)?.[1] ?? '';
  return { light, dark: { ...light, ...hexTokens(darkBlock) } };
}
