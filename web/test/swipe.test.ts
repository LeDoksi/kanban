import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swipeTarget, SWIPE_THRESHOLD } from '../src/swipe.ts';

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
  assert.equal(swipeTarget('backlog', -(SWIPE_THRESHOLD + 1)), null);
  assert.equal(swipeTarget('done', SWIPE_THRESHOLD + 1), null);
});
