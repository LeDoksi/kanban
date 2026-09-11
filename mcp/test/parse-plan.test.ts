import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parsePlan } from '../src/parse-plan.ts';

const SAMPLE = `# План №1: слой данных на Firestore

**Goal:** Перевести данные пары в Firestore, не переписывая интерфейс.

**Spec:** [\`docs/superpowers/specs/2026-09-09-firestore-refactor-design.md\`](../specs/2026-09-09-firestore-refactor-design.md)

## Global Constraints

- **Тарифы:** только бесплатные.

---

### Task 1: Подключение Firestore и правила доступа

**Files:**
- Modify: \`index.html\`

**Interfaces:**
- Produces: \`fsDoc()\`

- [ ] **Step 1: Владелец включает Firestore в консоли**

Это ручной шаг, выполняет владелец проекта. Firebase Console → Build.

- [ ] **Step 2: Подключить SDK Firestore и открыть его в CSP**

В \`index.html\` добавить строку.

- [ ] **Step 3: Коммит**

\`\`\`bash
git commit -m "Подключение"
\`\`\`

---

### Task 2: Репозиторий — чтение

**Files:**
- Create: \`src/04-repo.js\`

- [ ] **Step 1: Объявить состояние загрузки**

- [ ] **Step 2: Прогнать**
`;

test('заголовок плана и цель', () => {
  const p = parsePlan(SAMPLE);
  assert.equal(p.title, 'слой данных на Firestore');
  assert.match(p.goal, /^Перевести данные пары/);
});

test('путь до спеки вытащен из ссылки', () => {
  const p = parsePlan(SAMPLE);
  assert.equal(p.specPath,
    'docs/superpowers/specs/2026-09-09-firestore-refactor-design.md');
});

test('номер плана в заголовок не попадает', () => {
  assert.doesNotMatch(parsePlan(SAMPLE).title, /План №/);
});

test('найдены обе задачи', () => {
  const p = parsePlan(SAMPLE);
  assert.equal(p.tasks.length, 2);
  assert.equal(p.tasks[0].title, 'Подключение Firestore и правила доступа');
  assert.equal(p.tasks[1].title, 'Репозиторий — чтение');
});

test('Files и Interfaces попадают в тело задачи', () => {
  const t = parsePlan(SAMPLE).tasks[0];
  assert.match(t.body, /index\.html/);
  assert.match(t.body, /fsDoc\(\)/);
});

test('шаги плана становятся чеклистом без разметки', () => {
  const t = parsePlan(SAMPLE).tasks[1];
  assert.deepEqual(t.checklist,
    ['Объявить состояние загрузки', 'Прогнать']);
});

test('ручной шаг вынут из чеклиста в отдельный список', () => {
  const t = parsePlan(SAMPLE).tasks[0];
  assert.deepEqual(t.manualSteps, ['Владелец включает Firestore в консоли']);
  assert.deepEqual(t.checklist, [
    'Подключить SDK Firestore и открыть его в CSP',
    'Коммит',
  ]);
});

test('секция Global Constraints задачей не считается', () => {
  assert.ok(!parsePlan(SAMPLE).tasks.some(t => /Constraints/.test(t.title)));
});

test('план без задач не роняет парсер', () => {
  const p = parsePlan('# План №9: пустой\n\n**Goal:** ничего.\n');
  assert.equal(p.tasks.length, 0);
  assert.equal(p.specPath, null);
});

test('разметка внутри блока кода задачей не считается', () => {
  // План, который сам содержит пример плана — обычное дело для планов
  // про инструменты. Заголовки и шаги внутри ``` не структура, а текст.
  const md = [
    '# План №3: про парсер',
    '',
    '### Task 1: Настоящая задача',
    '',
    '- [ ] **Step 1: Настоящий шаг**',
    '',
    '```md',
    '### Task 9: Фальшивая задача',
    '- [ ] **Step 1: Фальшивый шаг**',
    '```',
    '',
    '- [ ] **Step 2: Второй настоящий шаг**',
    '',
  ].join('\n');

  const p = parsePlan(md);
  assert.equal(p.tasks.length, 1);
  assert.equal(p.tasks[0].title, 'Настоящая задача');
  assert.deepEqual(p.tasks[0].checklist,
    ['Настоящий шаг', 'Второй настоящий шаг']);
});

test('разбирает настоящий план целиком', () => {
  const file = new URL(
    '../../2026-09-09-firestore-data-layer.md', import.meta.url);
  if (!existsSync(file)) return; // файл мог переехать — тест не обязателен
  const p = parsePlan(readFileSync(file, 'utf8'));
  assert.equal(p.tasks.length, 15);
  assert.equal(p.title, 'слой данных на Firestore');

  const steps = p.tasks.reduce((n, t) => n + t.checklist.length, 0);
  assert.equal(steps, 92);

  const manual = p.tasks.flatMap(t => t.manualSteps);
  assert.equal(manual.length, 1);
  assert.match(manual[0], /Владелец включает Firestore/);
  // Шагов много, но ни один не пустой и ни один не тащит разметку.
  for (const t of p.tasks) {
    for (const s of t.checklist) {
      assert.ok(s.length > 0);
      assert.doesNotMatch(s, /\*\*/);
      assert.doesNotMatch(s, /^Step \d/);
    }
  }
});
