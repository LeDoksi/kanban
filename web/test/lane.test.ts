import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexFromScroll, settleIndex } from '../src/lane.ts';

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

test('в конце ленты (планшет, 2 видимые колонки) активная вкладка не откатывается назад', () => {
  // 5 колонок, шаг 378 — на 820px в ленту помещается ~2, и максимум
  // прокрутки не дотягивает до 4*step (последняя колонка уже на экране).
  const step = 378;
  const count = 5;
  // Прокрутили до конца (например, doScrollEnd после тапа на «Готово»,
  // индекс 4), но реальный scrollLeft застрял на ~2.97*step.
  assert.equal(settleIndex(2.97 * step, step, count, true, 4), 4);
});

test('в конце ленты активная вкладка ниже вычисленного индекса — сообщаем вычисленный', () => {
  const step = 378;
  const count = 5;
  // Конец ленты, но активная вкладка была позади (например, пользователь
  // долистал руками с 1-й колонки) — вычисленный индекс достовернее.
  assert.equal(settleIndex(2.97 * step, step, count, true, 1), Math.round(2.97));
});

test('не в конце ленты — ведёт себя как indexFromScroll', () => {
  const step = 378;
  const count = 5;
  assert.equal(settleIndex(378, step, count, false, 4), indexFromScroll(378, step, count));
  assert.equal(settleIndex(570, step, count, false, 0), indexFromScroll(570, step, count));
});

test('телефон (одна колонка на экран, atEnd на последней): работает как раньше', () => {
  const step = 390;
  const count = 5;
  assert.equal(settleIndex(4 * step, step, count, true, 4), 4);
  assert.equal(settleIndex(0, step, count, false, 0), 0);
});
