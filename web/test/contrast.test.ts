import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrast, parseTokens } from '../src/contrast.ts';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const tokens = parseTokens(css);

const TEXT = ['ink', 'ink-2', 'muted', 'accent-ink'];
const BG = ['ground', 'surface', 'raised', 'accent-soft'];
const PAIRS: [string, string][] = [
  ...TEXT.flatMap(fg => BG.map(bg => [fg, bg] as [string, string])),
  ['on-accent', 'accent'],
  ['danger', 'surface'],
  ['danger', 'ground'],
];

test('contrast: чёрное на белом 21, одинаковые цвета 1', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21);
  assert.equal(contrast('#c4532d', '#c4532d'), 1);
});

for (const theme of ['light', 'dark'] as const) {
  for (const [fg, bg] of PAIRS) {
    test(`${theme}: ${fg} на ${bg} ≥ 4.5`, () => {
      const a = tokens[theme][fg];
      const b = tokens[theme][bg];
      assert.ok(a && b, `нет токена ${fg} или ${bg}`);
      assert.ok(contrast(a, b) >= 4.5, `${fg} ${a} на ${bg} ${b}: ${contrast(a, b).toFixed(2)}`);
    });
  }
}
