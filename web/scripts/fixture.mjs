// Синтетические данные для снимков. Настоящую доску сюда не кладём:
// репозиторий публичный, а задачи личные.
const now = Date.parse('2026-09-25T10:00:00Z');
const ago = h => new Date(now - h * 3600_000).toISOString();

export const projects = [
  { id: 'cafe', name: 'Кофейня', prefix: 'CAF', description: 'Сайт и меню для кофейни у дома', position: 100, archived_at: null },
  { id: 'folio', name: 'Портфолио', prefix: 'PF', description: 'Личный сайт-портфолио с кейсами, блогом и формой связи. Статика на GitHub Pages.', position: 200, archived_at: null },
];

export const epics = [
  { id: 'PF-E1', seq: 1, project_id: 'folio', title: 'Раздел кейсов: сетка, фильтры, страница кейса', goal: 'Показать **пять** лучших проектов', plan_path: null, spec_path: null, status: 'active', position: 100 },
  { id: 'PF-E2', seq: 2, project_id: 'folio', title: 'Блог', goal: null, plan_path: null, spec_path: null, status: 'active', position: 200 },
  { id: 'PF-E3', seq: 3, project_id: 'folio', title: 'Перенос на Astro', goal: null, plan_path: null, spec_path: null, status: 'active', position: 300 },
];

let seq = 0;
const item = (project_id, prefix, status, title, extra = {}) => {
  seq += 1;
  return {
    id: `${prefix}-${seq}`, seq, project_id, epic_id: null, type: 'task', title, body: null,
    status, checklist: [], blocks: [], position: seq * 100, created_by: 'me',
    created_at: ago(200 - seq), updated_at: ago(100 - seq),
    closed_at: status === 'done' ? ago(seq) : null, archived_at: null, ...extra,
  };
};

export const items = [
  item('cafe', 'CAF', 'backlog', 'Меню на доске у кассы'),
  item('cafe', 'CAF', 'doing', 'Фото зала для главной'),
  item('cafe', 'CAF', 'waiting', 'Согласовать цены на сезонные напитки'),
  item('cafe', 'CAF', 'done', 'Купить домен'),

  item('folio', 'PF', 'hold', 'Тёмная тема для блога', { epic_id: 'PF-E2' }),
  item('folio', 'PF', 'backlog', 'Сетка кейсов: две колонки на планшете, одна на телефоне', { epic_id: 'PF-E1', checklist: [{ text: 'Сетка', done: true }, { text: 'Планшет', done: false }] }),
  item('folio', 'PF', 'backlog', 'Фильтр кейсов по типу работы', { epic_id: 'PF-E1' }),
  item('folio', 'PF', 'backlog', 'Страница кейса: обложка, задача, решение, результат в цифрах и отзыв клиента, плюс галерея скриншотов с подписями', { epic_id: 'PF-E1', body: '**Files:**\n- `src/pages/case/[slug].astro`\n- `src/components/Gallery.astro`' }),
  item('folio', 'PF', 'backlog', 'баг: форма связи отправляет пустое письмо', { type: 'bug' }),
  item('folio', 'PF', 'backlog', 'Убрать неиспользуемые шрифты из сборки', { type: 'chore' }),
  item('folio', 'PF', 'backlog', 'RSS для блога', { epic_id: 'PF-E2' }),
  item('folio', 'PF', 'backlog', 'Открытые графы для соцсетей', {}),
  item('folio', 'PF', 'doing', 'Перенести главную на Astro', { epic_id: 'PF-E3', checklist: [{ text: 'Шапка', done: true }, { text: 'Кейсы', done: false }, { text: 'Подвал', done: false }] }),
  item('folio', 'PF', 'doing', 'Скорость: картинки в AVIF', {}),
  item('folio', 'PF', 'waiting', 'Какие пять кейсов показываем первыми?', { epic_id: 'PF-E1', created_by: 'claude' }),
  item('folio', 'PF', 'done', 'Настроить GitHub Pages', {}),
  item('folio', 'PF', 'done', 'Логотип в SVG', {}),
  item('folio', 'PF', 'done', 'Шрифты: подключить локально', { type: 'chore' }),
  // Ещё готовые сверх DONE_SHOWN (5) и настоящий архив — чтобы в снимках
  // была видна кнопка «Архив · N» и обе секции шторки архива.
  item('folio', 'PF', 'done', 'Фавикон для сайта', {}),
  item('folio', 'PF', 'done', 'Ёлка на главной ко Дню города', {}),
  item('folio', 'PF', 'done', 'Обновить копирайт в футере', {}),
  item('folio', 'PF', 'done', 'Меню кофейни в футере со ссылкой', { archived_at: ago(50) }),
];

export const comments = [
  { id: 1, item_id: '*', author: 'claude', body: 'Сделал черновик, посмотри **сетку** на телефоне.', created_at: ago(5) },
  { id: 2, item_id: '*', author: 'me', body: 'Ок, на планшете две колонки мало', created_at: ago(2) },
];
