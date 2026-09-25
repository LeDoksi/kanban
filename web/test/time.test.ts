import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relTime } from '../src/time.ts';

const now = new Date('2026-09-25T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

test('секунды и будущее — «только что»', () => {
  assert.equal(relTime(ago(20_000), now), 'только что');
  assert.equal(relTime(new Date(now.getTime() + 5_000).toISOString(), now), 'только что');
});

test('минуты и часы', () => {
  assert.equal(relTime(ago(5 * 60_000), now), '5 мин назад');
  assert.equal(relTime(ago(2 * 3600_000), now), '2 ч назад');
});

test('вчера и дальше — дата', () => {
  assert.equal(relTime(ago(26 * 3600_000), now), 'вчера');
  assert.equal(relTime('2026-09-01T10:00:00Z', now), '1 сент.');
  assert.equal(relTime('2025-12-31T10:00:00Z', now), '31 дек. 2025');
});
