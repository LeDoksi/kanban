import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS_ORDER, columnLabel, undoPatch } from '../src/columns.ts';
import type { Item } from '../src/supabase.ts';

test('порядок колонок', () => {
  assert.deepEqual(STATUS_ORDER, ['hold', 'backlog', 'doing', 'waiting', 'done']);
  assert.equal(columnLabel('waiting'), 'Нужно от тебя');
});

test('undoPatch сохраняет исходный closed_at задачи из «Готово»', () => {
  const item = {
    id: 'K-1', seq: 1, project_id: 'k', epic_id: null, type: 'task', title: 't', body: null,
    status: 'done', checklist: [], blocks: [], position: 350,
    closed_at: '2026-09-01T10:00:00Z', archived_at: null,
  } satisfies Item;
  assert.deepEqual(undoPatch(item), { status: 'done', position: 350, closed_at: '2026-09-01T10:00:00Z' });
});
