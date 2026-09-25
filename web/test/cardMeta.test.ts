import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardMeta } from '../src/cardMeta.ts';
import type { Item } from '../src/supabase.ts';

function mk(o: Partial<Item>): Item {
  return {
    id: 'K-1', seq: 1, project_id: 'k', epic_id: null, type: 'task', title: 't', body: null,
    status: 'backlog', checklist: [], blocks: [], position: 100,
    closed_at: null, archived_at: null, ...o,
  };
}

test('пустая карточка — ничего лишнего', () => {
  assert.deepEqual(cardMeta(mk({})), { checklist: null, comments: 0, hasBody: false });
});

test('чеклист: счётчик и признак «всё отмечено»', () => {
  const two = [{ text: 'a', done: true }, { text: 'b', done: false }];
  assert.deepEqual(cardMeta(mk({ checklist: two })).checklist, { done: 1, total: 2, complete: false });
  const all = [{ text: 'a', done: true }];
  assert.deepEqual(cardMeta(mk({ checklist: all })).checklist, { done: 1, total: 1, complete: true });
});

test('комментарии из встроенного счётчика; нет поля — ноль', () => {
  assert.equal(cardMeta(mk({ comments: [{ count: 3 }] })).comments, 3);
  assert.equal(cardMeta(mk({ comments: [] })).comments, 0);
  assert.equal(cardMeta(mk({})).comments, 0);
});

test('описание из одних пробелов не считается описанием', () => {
  assert.equal(cardMeta(mk({ body: '  \n ' })).hasBody, false);
  assert.equal(cardMeta(mk({ body: 'x' })).hasBody, true);
});
