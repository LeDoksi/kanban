import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexFromScroll } from '../src/lane.ts';

test('индекс по прокрутке округляется к ближайшей колонке', () => {
  assert.equal(indexFromScroll(0, 378, 5), 0);
  assert.equal(indexFromScroll(378, 378, 5), 1);
  assert.equal(indexFromScroll(560, 378, 5), 1);
  assert.equal(indexFromScroll(570, 378, 5), 2);
});

test('за краями и при нулевом шаге — в пределах 0..count-1', () => {
  assert.equal(indexFromScroll(-40, 378, 5), 0);
  assert.equal(indexFromScroll(99999, 378, 5), 4);
  assert.equal(indexFromScroll(500, 0, 5), 0);
  assert.equal(indexFromScroll(500, 378, 0), 0);
});
