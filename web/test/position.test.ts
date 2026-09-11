import { test } from 'node:test';
import assert from 'node:assert/strict';
import { between } from '../src/position.ts';

test('между двумя соседями — среднее', () => {
  assert.equal(between(100, 200), 150);
});

test('в начало списка — меньше первого', () => {
  assert.equal(between(null, 100), 50);
});

test('в конец списка — больше последнего', () => {
  assert.equal(between(100, null), 200);
});

test('единственный элемент — произвольная стартовая позиция', () => {
  assert.equal(between(null, null), 1000);
});

test('очень близкие соседи всё равно дают позицию между ними', () => {
  const p = between(100, 100.0001);
  assert.ok(p > 100 && p < 100.0001);
});
