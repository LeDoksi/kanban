import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { makeRenderer } from '../src/markdown.ts';

const render = makeRenderer(new JSDOM('').window as unknown as Window & typeof globalThis);

test('разметка: жирный, код, списки, переносы строк', () => {
  const html = render('**Files:**\n- `a.ts`\nстрока');
  assert.match(html, /<strong>Files:<\/strong>/);
  assert.match(html, /<code>a\.ts<\/code>/);
});

test('вырезает скрипты, обработчики и javascript:-ссылки', () => {
  const html = render('<img src=x onerror=alert(1)><script>alert(2)</script>[x](javascript:alert(3))');
  assert.doesNotMatch(html, /onerror|<script|javascript:/i);
});

test('ссылки открываются в новой вкладке без доступа к opener', () => {
  const html = render('[сайт](https://example.com)');
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
});
