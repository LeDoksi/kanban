import { test } from 'node:test';
import assert from 'node:assert/strict';
import { epicVisibility, groupItemsByEpic, emptyEpics, selectableEpics, epicProgress } from '../src/epics.ts';
import type { Item, Epic } from '../src/supabase.ts';

function mkItem(overrides: Partial<Item>): Item {
  return {
    id: 'KAN-1', seq: 1, project_id: 'kanban', epic_id: null,
    type: 'task', title: 't', body: null, status: 'backlog',
    checklist: [], blocks: [], position: 100,
    closed_at: null, archived_at: null,
    ...overrides,
  };
}

function mkEpic(overrides: Partial<Epic>): Epic {
  return {
    id: 'KAN-E1', seq: 1, project_id: 'kanban', title: 'e',
    goal: null, plan_path: null, spec_path: null, status: 'open', position: 100,
    ...overrides,
  };
}

test('epicVisibility: без задач — empty', () => {
  assert.equal(epicVisibility('KAN-E1', []), 'empty');
});

test('epicVisibility: есть неархивная задача — active', () => {
  const items = [mkItem({ epic_id: 'KAN-E1', archived_at: null })];
  assert.equal(epicVisibility('KAN-E1', items), 'active');
});

test('epicVisibility: все задачи архивные — archived', () => {
  const items = [
    mkItem({ id: 'KAN-1', epic_id: 'KAN-E1', archived_at: '2026-01-01' }),
    mkItem({ id: 'KAN-2', epic_id: 'KAN-E1', archived_at: '2026-01-02' }),
  ];
  assert.equal(epicVisibility('KAN-E1', items), 'archived');
});

test('epicVisibility: чужие задачи не считаются', () => {
  const items = [mkItem({ id: 'KAN-1', epic_id: 'KAN-E2', archived_at: null })];
  assert.equal(epicVisibility('KAN-E1', items), 'empty');
});

test('groupItemsByEpic: группирует и сортирует по position эпика', () => {
  const epics = [
    mkEpic({ id: 'KAN-E2', position: 200 }),
    mkEpic({ id: 'KAN-E1', position: 100 }),
  ];
  const items = [
    mkItem({ id: 'KAN-1', epic_id: 'KAN-E2' }),
    mkItem({ id: 'KAN-2', epic_id: 'KAN-E1' }),
    mkItem({ id: 'KAN-3', epic_id: null }),
  ];
  const groups = groupItemsByEpic(items, epics);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].epic.id, 'KAN-E1');
  assert.deepEqual(groups[0].items.map(i => i.id), ['KAN-2']);
  assert.equal(groups[1].epic.id, 'KAN-E2');
});

test('groupItemsByEpic: игнорирует задачи с неизвестным epic_id', () => {
  const epics = [mkEpic({ id: 'KAN-E1' })];
  const items = [mkItem({ id: 'KAN-1', epic_id: 'KAN-E404' })];
  assert.deepEqual(groupItemsByEpic(items, epics), []);
});

test('emptyEpics: только эпики без единой задачи, отсортированы', () => {
  const epics = [
    mkEpic({ id: 'KAN-E2', position: 200 }),
    mkEpic({ id: 'KAN-E1', position: 100 }),
    mkEpic({ id: 'KAN-E3', position: 300 }),
  ];
  const items = [mkItem({ epic_id: 'KAN-E3' })];
  const result = emptyEpics(epics, items);
  assert.deepEqual(result.map(e => e.id), ['KAN-E1', 'KAN-E2']);
});

test('selectableEpics: архивный эпик исключается', () => {
  const epics = [mkEpic({ id: 'KAN-E1' }), mkEpic({ id: 'KAN-E2' })];
  const items = [
    mkItem({ id: 'KAN-1', epic_id: 'KAN-E1', archived_at: '2026-01-01' }),
  ];
  const result = selectableEpics(epics, items);
  assert.deepEqual(result.map(e => e.id), ['KAN-E2']);
});

test('selectableEpics: пустой и активный эпик остаются', () => {
  const epics = [mkEpic({ id: 'KAN-E1' }), mkEpic({ id: 'KAN-E2' })];
  const items = [mkItem({ id: 'KAN-1', epic_id: 'KAN-E1', archived_at: null })];
  const result = selectableEpics(epics, items);
  assert.deepEqual(result.map(e => e.id).sort(), ['KAN-E1', 'KAN-E2']);
});

test('selectableEpics: текущий эпик задачи остаётся, даже если архивный', () => {
  const epics = [mkEpic({ id: 'KAN-E1' })];
  const items = [mkItem({ id: 'KAN-1', epic_id: 'KAN-E1', archived_at: '2026-01-01' })];
  const result = selectableEpics(epics, items, 'KAN-E1');
  assert.deepEqual(result.map(e => e.id), ['KAN-E1']);
});

test('epicProgress: считает done/archived как выполненные, из всех колонок', () => {
  const items = [
    mkItem({ id: 'KAN-1', epic_id: 'KAN-E1', status: 'done', archived_at: null }),
    mkItem({ id: 'KAN-2', epic_id: 'KAN-E1', status: 'doing', archived_at: '2026-01-01' }),
    mkItem({ id: 'KAN-3', epic_id: 'KAN-E1', status: 'backlog', archived_at: null }),
  ];
  assert.deepEqual(epicProgress('KAN-E1', items), { done: 2, total: 3 });
});

test('epicProgress: без задач — 0/0', () => {
  assert.deepEqual(epicProgress('KAN-E1', []), { done: 0, total: 0 });
});
