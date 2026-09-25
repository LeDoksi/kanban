import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readLastProject, writeLastProject, readLastColumn, writeLastColumn,
  pickProject, startColumn,
} from '../src/prefs.ts';
import type { Item } from '../src/supabase.ts';

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
}
const broken = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
};
function mkItem(o: Partial<Item>): Item {
  return {
    id: 'X-1', seq: 1, project_id: 'p', epic_id: null, type: 'task', title: 't', body: null,
    status: 'backlog', checklist: [], blocks: [], position: 100,
    closed_at: null, archived_at: null, ...o,
  };
}

test('проект: запись и чтение', () => {
  const s = mem();
  writeLastProject(s, 'kanban');
  assert.equal(readLastProject(s), 'kanban');
});

test('колонка: своя для каждого проекта, мусор игнорируется', () => {
  const s = mem();
  writeLastColumn(s, 'a', 'doing');
  writeLastColumn(s, 'b', 'done');
  assert.equal(readLastColumn(s, 'a'), 'doing');
  assert.equal(readLastColumn(s, 'b'), 'done');
  s.setItem('kanban:lastColumn:c', 'nonsense');
  assert.equal(readLastColumn(s, 'c'), null);
});

test('падающий Storage и null не ломают чтение и запись', () => {
  assert.doesNotThrow(() => writeLastProject(broken, 'x'));
  assert.doesNotThrow(() => writeLastColumn(broken, 'x', 'doing'));
  assert.equal(readLastProject(broken), null);
  assert.equal(readLastColumn(broken, 'x'), null);
  assert.equal(readLastProject(null), null);
});

test('pickProject: сохранённый, если он есть в списке, иначе первый', () => {
  const ps = [{ id: 'a' }, { id: 'b' }];
  assert.equal(pickProject(ps, 'b'), 'b');
  assert.equal(pickProject(ps, 'gone'), 'a');
  assert.equal(pickProject(ps, null), 'a');
  assert.equal(pickProject([], 'a'), null);
});

test('startColumn: сохранённая важнее; иначе «В работе», если там есть живые задачи', () => {
  const doing = [mkItem({ status: 'doing' })];
  const archivedDoing = [mkItem({ status: 'doing', archived_at: '2026-01-01' })];
  assert.equal(startColumn(doing, 'done'), 'done');
  assert.equal(startColumn(doing, null), 'doing');
  assert.equal(startColumn(archivedDoing, null), 'backlog');
  assert.equal(startColumn([], null), 'backlog');
});
