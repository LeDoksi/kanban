import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swipeTarget, swipePreview, lockAxis, SWIPE_THRESHOLD, AXIS_SLOP } from '../src/swipe.ts';

test('ниже порога — нет цели', () => {
  assert.equal(swipeTarget('backlog', SWIPE_THRESHOLD), null);
  assert.equal(swipeTarget('backlog', -SWIPE_THRESHOLD), null);
});

test('вправо — следующий статус', () => {
  assert.equal(swipeTarget('backlog', SWIPE_THRESHOLD + 1), 'doing');
  assert.equal(swipeTarget('doing', SWIPE_THRESHOLD + 1), 'waiting');
});

test('влево — предыдущий статус', () => {
  assert.equal(swipeTarget('doing', -(SWIPE_THRESHOLD + 1)), 'backlog');
  assert.equal(swipeTarget('done', -(SWIPE_THRESHOLD + 1)), 'waiting');
});

test('за краями — некуда, null', () => {
  assert.equal(swipeTarget('hold', -(SWIPE_THRESHOLD + 1)), null);
  assert.equal(swipeTarget('done', SWIPE_THRESHOLD + 1), null);
});

test('swipePreview: показывает направление с первого пикселя, без порога', () => {
  assert.equal(swipePreview('backlog', 1), 'doing');
  assert.equal(swipePreview('doing', -1), 'backlog');
  assert.equal(swipePreview('backlog', 0), null);
});

test('swipePreview: за краями всё равно null', () => {
  assert.equal(swipePreview('hold', -1), null);
  assert.equal(swipePreview('done', 1), null);
});

test('lockAxis: до AXIS_SLOP решения нет', () => {
  assert.equal(lockAxis(AXIS_SLOP - 1, 0), null);
  assert.equal(lockAxis(0, -(AXIS_SLOP - 1)), null);
});

test('lockAxis: вертикаль — скролл, горизонталь — свайп', () => {
  assert.equal(lockAxis(2, AXIS_SLOP), 'y');
  assert.equal(lockAxis(-AXIS_SLOP * 2, 3), 'x');
});

test('lockAxis: диагональ считается скроллом', () => {
  assert.equal(lockAxis(AXIS_SLOP, AXIS_SLOP), 'y');
  assert.equal(lockAxis(-15, 12), 'y');
});
