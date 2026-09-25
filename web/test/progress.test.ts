import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ringDash } from '../src/progress.ts';

test('доля закрашенной окружности', () => {
  assert.equal(ringDash(0, 9, 100), 0);
  assert.equal(ringDash(3, 9, 90), 30);
  assert.equal(ringDash(9, 9, 100), 100);
});

test('пустой эпик и мусор — ноль, больше целого не бывает', () => {
  assert.equal(ringDash(0, 0, 100), 0);
  assert.equal(ringDash(5, 3, 100), 100);
  assert.equal(ringDash(-1, 3, 100), 0);
});
