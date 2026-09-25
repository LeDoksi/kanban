import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterArchive } from '../src/archive.ts';
import type { Item } from '../src/supabase.ts';

const mk = (id: string, title: string) => ({
  id, seq: 1, project_id: 'k', epic_id: null, type: 'task', title, body: null, status: 'done',
  checklist: [], blocks: [], position: 1, closed_at: null, archived_at: null,
}) as Item;
const items = [mk('KAN-12', 'Ёлка на главной'), mk('KAN-3', 'Меню кофейни')];

test('пустой запрос — всё', () => {
  assert.equal(filterArchive(items, '  ').length, 2);
});

test('без учёта регистра и ё/е', () => {
  assert.deepEqual(filterArchive(items, 'ЕЛКА').map(i => i.id), ['KAN-12']);
});

test('по id', () => {
  assert.deepEqual(filterArchive(items, 'kan-3').map(i => i.id), ['KAN-3']);
});
