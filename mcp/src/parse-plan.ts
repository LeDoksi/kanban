/* Разбор планов superpowers. Формат задаётся скиллом writing-plans:
   "# План №N: title", "### Task N: title", "- [ ] **Step N: text**".
   Парсер намеренно снисходителен — чужой текст никто не валидирует,
   и падать на неожиданной строке он не должен. */

export type ParsedTask = {
  title: string;
  body: string;
  checklist: string[];
  manualSteps: string[];
};

export type ParsedPlan = {
  title: string;
  goal: string;
  specPath: string | null;
  tasks: ParsedTask[];
};

/* Признаки шага, который выполняет человек, а не агент. Эвристика:
   агент обязан проверить результат импорта глазами. */
const MANUAL = [
  'ручной шаг',
  'выполняет владелец',
  'в консоли',
  'consoleе', // опечатка встречается в реальных планах
];

const isManual = (title: string, body: string) => {
  const hay = `${title}\n${body}`.toLowerCase();
  return MANUAL.some(m => hay.includes(m));
};

/* "- [ ] **Step 3: Написать мок**" → "Написать мок" */
const stepTitle = (line: string): string =>
  line
    .replace(/^\s*-\s*\[[ xX]\]\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/^Step\s+\d+\s*:\s*/i, '')
    .trim();

const isFence = (line: string) => /^\s*(```|~~~)/.test(line);

export function parsePlan(md: string): ParsedPlan {
  const lines = md.split(/\r?\n/);

  const h1 = lines.find(l => l.startsWith('# ')) ?? '';
  const title = h1
    .replace(/^#\s*/, '')
    .replace(/^План\s*№\s*\d+\s*:\s*/i, '')
    .trim();

  const goalLine = lines.find(l => l.startsWith('**Goal:**')) ?? '';
  const goal = goalLine.replace('**Goal:**', '').trim();

  const specLine = lines.find(l => l.startsWith('**Spec:**')) ?? '';
  // Берём путь из кода в квадратных скобках: [`path`](../relative)
  const specMatch = specLine.match(/\[`([^`]+)`\]/) ?? specLine.match(/\[([^\]]+)\]/);
  const specPath = specMatch ? specMatch[1] : null;

  const tasks: ParsedTask[] = [];
  let cur: { title: string; lines: string[] } | null = null;

  const flush = () => {
    if (!cur) return;
    tasks.push(buildTask(cur.title, cur.lines));
    cur = null;
  };

  // Внутри ``` разметка — это текст, а не структура. План про инструменты
  // вполне может содержать пример другого плана целиком.
  let fenced = false;

  for (const line of lines) {
    if (isFence(line)) {
      fenced = !fenced;
      if (cur) cur.lines.push(line);
      continue;
    }
    if (!fenced) {
      const head = line.match(/^###\s+Task\s+\d+\s*:\s*(.+)$/i);
      if (head) {
        flush();
        cur = { title: head[1].trim(), lines: [] };
        continue;
      }
      // Заголовок второго уровня закрывает текущую задачу: так секции
      // вроде "## Что дальше" не приклеиваются к последней задаче.
      if (/^##\s/.test(line)) { flush(); continue; }
    }
    if (cur) cur.lines.push(line);
  }
  flush();

  return { title, goal, specPath, tasks };
}

function buildTask(title: string, lines: string[]): ParsedTask {
  const checklist: string[] = [];
  const manualSteps: string[] = [];
  const bodyLines: string[] = [];

  let stepTitleText: string | null = null;
  let stepBody: string[] = [];
  let seenStep = false;
  let fenced = false;

  const closeStep = () => {
    if (stepTitleText === null) return;
    const body = stepBody.join('\n');
    (isManual(stepTitleText, body) ? manualSteps : checklist)
      .push(stepTitleText);
    stepTitleText = null;
    stepBody = [];
  };

  for (const line of lines) {
    if (isFence(line)) fenced = !fenced;

    // Строка вида "- [ ]" внутри блока кода — пример, а не шаг.
    if (!fenced && /^\s*-\s*\[[ xX]\]/.test(line)) {
      closeStep();
      seenStep = true;
      stepTitleText = stepTitle(line);
      continue;
    }
    if (stepTitleText !== null) stepBody.push(line);
    else if (!seenStep) bodyLines.push(line);
  }
  closeStep();

  // Тело задачи — всё до первого шага: Files, Interfaces, пояснения.
  const body = bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  return {
    title,
    body,
    checklist: checklist.filter(Boolean),
    manualSteps: manualSteps.filter(Boolean),
  };
}
