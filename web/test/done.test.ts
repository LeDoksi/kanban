import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DONE_SHOWN, recentDone, shownDoneIds } from '../src/done.ts';
import type { Item } from '../src/supabase.ts';

function mkItem(overrides: Partial<Item>): Item {
  return {
    id: 'KAN-1', seq: 1, project_id: 'kanban', epic_id: null,
    type: 'task', title: 't', body: null, status: 'done',
    checklist: [], blocks: [], position: 100,
    closed_at: null, archived_at: null,
    ...overrides,
  };
}

test('recentDone: только неархивные done, новые закрытые впереди', () => {
  const items = [
    mkItem({ id: 'KAN-1', closed_at: '2026-01-01' }),
    mkItem({ id: 'KAN-2', closed_at: '2026-01-03' }),
    mkItem({ id: 'KAN-3', status: 'doing', closed_at: null }),
    mkItem({ id: 'KAN-4', closed_at: '2026-01-02', archived_at: '2026-01-05' }),
  ];
  assert.deepEqual(recentDone(items).map(i => i.id), ['KAN-2', 'KAN-1']);
});

test('shownDoneIds: обрезает до DONE_SHOWN, отдаёт множество id', () => {
  const items = Array.from({ length: DONE_SHOWN + 3 }, (_, n) =>
    mkItem({ id: `KAN-${n}`, closed_at: `2026-01-${String(n + 1).padStart(2, '0')}` }));
  const ids = shownDoneIds(items);
  assert.equal(ids.size, DONE_SHOWN);
  // Последние DONE_SHOWN по closed_at — самые большие даты.
  assert.ok(ids.has(`KAN-${items.length - 1}`));
  assert.ok(!ids.has('KAN-0'));
});
