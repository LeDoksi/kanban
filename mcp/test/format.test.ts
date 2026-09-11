import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBoard, formatItem } from '../src/format.ts';
import type { Item, Comment } from '../src/db.ts';

const item = (over: Partial<Item>): Item => ({
  id: 'KAN-1', seq: 1, project_id: 'kanban', epic_id: null,
  type: 'task', title: 'Задача', body: null, status: 'backlog',
  checklist: [], blocks: [], position: 1000, created_by: 'claude',
  closed_at: null, archived_at: null, ...over,
});

test('шапка показывает проект, эпик и прогресс', () => {
  const out = formatBoard([], {
    project: 'family-app',
    epic: { id: 'FAM-E1', title: 'Firestore' },
    done: 7, total: 15,
  });
  assert.equal(out.split('\n')[0], 'family-app · E1 Firestore (7/15)');
});

test('шапка показывает описание проекта, если оно задано', () => {
  const out = formatBoard([], {
    project: 'family-app',
    description: 'трекер свиданий пары',
    done: 0, total: 0,
  });
  assert.equal(out.split('\n')[0], 'family-app — трекер свиданий пары (0/0)');
});

test('шапка с описанием и эпиком одновременно', () => {
  const out = formatBoard([], {
    project: 'family-app',
    description: 'трекер свиданий пары',
    epic: { id: 'FAM-E1', title: 'Firestore' },
    done: 7, total: 15,
  });
  assert.equal(
    out.split('\n')[0],
    'family-app — трекер свиданий пары · E1 Firestore (7/15)',
  );
});

test('без описания шапка как раньше, без лишнего тире', () => {
  const out = formatBoard([], { project: 'kanban', done: 0, total: 0 });
  assert.equal(out.split('\n')[0], 'kanban (0/0)');
});

test('префикс проекта в строках не печатается', () => {
  const out = formatBoard(
    [item({ id: 'KAN-8', seq: 8, title: 'Заметки', status: 'doing' })],
    { project: 'kanban', done: 0, total: 1 },
  );
  assert.match(out, /^ ?8 /m);
  assert.doesNotMatch(out, /KAN-8/);
});

test('задача в работе помечена и показывает прогресс чеклиста', () => {
  const out = formatBoard(
    [item({
      seq: 8, title: 'Заметки', status: 'doing',
      checklist: [
        { text: 'а', done: true }, { text: 'б', done: true },
        { text: 'в', done: true }, { text: 'г', done: false },
        { text: 'д', done: false }, { text: 'е', done: false },
      ],
    })],
    { project: 'kanban', done: 0, total: 1 },
  );
  assert.match(out, /▸ Заметки/);
  assert.match(out, /3\/6/);
});

test('ожидание владельца помечено восклицательным знаком', () => {
  const out = formatBoard(
    [item({ seq: 12, title: 'Включить Firestore', status: 'waiting' })],
    { project: 'kanban', done: 0, total: 1 },
  );
  assert.match(out, /12 ! Включить Firestore/);
});

test('тип печатается словом только когда это не обычная задача', () => {
  const out = formatBoard(
    [
      item({ seq: 9, title: 'Списки' }),
      item({ id: 'KAN-14', seq: 14, title: 'Календарь', type: 'bug' }),
    ],
    { project: 'kanban', done: 0, total: 2 },
  );
  const [, , bug] = out.split('\n');
  assert.match(bug, /bug/);
  assert.doesNotMatch(out.split('\n')[1], /task/);
});

test('закрытые задачи в список не попадают', () => {
  const out = formatBoard(
    [
      item({ seq: 1, title: 'Старая', status: 'done' }),
      item({ id: 'KAN-2', seq: 2, title: 'Живая' }),
    ],
    { project: 'kanban', done: 1, total: 2 },
  );
  assert.doesNotMatch(out, /Старая/);
  assert.match(out, /Живая/);
});

test('пустая доска говорит об этом словом, а не пустой строкой', () => {
  const out = formatBoard([], { project: 'kanban', done: 0, total: 0 });
  assert.match(out, /пусто/);
});

test('карточка показывает чеклист галочками и комментарии', () => {
  const c: Comment[] = [{
    id: 1, item_id: 'KAN-8', author: 'claude',
    body: 'Перенёс. Нашёл двойной вызов.', created_at: '2026-09-11T14:20:00Z',
  }];
  const out = formatItem(
    item({
      id: 'KAN-8', seq: 8, title: 'Заметки', status: 'doing',
      body: 'Тело задачи.',
      checklist: [{ text: 'первый', done: true }, { text: 'второй', done: false }],
    }),
    c,
  );
  assert.match(out, /KAN-8/);
  assert.match(out, /\[x\] первый/);
  assert.match(out, /\[ \] второй/);
  assert.match(out, /Тело задачи\./);
  assert.match(out, /claude: Перенёс\. Нашёл двойной вызов\./);
});
