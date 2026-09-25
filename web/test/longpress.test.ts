import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movedTooFar, MOVE_TOLERANCE, LONG_PRESS_MS } from '../src/longpress.ts';

test('дрожание пальца не отменяет долгое нажатие', () => {
  assert.equal(movedTooFar(3, 4), false);
  assert.equal(movedTooFar(0, MOVE_TOLERANCE), false);
});

test('движение дальше допуска — это прокрутка, нажатие отменяется', () => {
  assert.equal(movedTooFar(0, MOVE_TOLERANCE + 1), true);
  assert.equal(movedTooFar(-8, 8), true);
});

test('порог времени — 450 мс', () => {
  assert.equal(LONG_PRESS_MS, 450);
});
