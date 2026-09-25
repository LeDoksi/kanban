import { useCallback, useSyncExternalStore } from 'react';

export type VisualViewportInsets = { height: number; offsetTop: number };

// Отдельный файл (не .tsx): экспорт хука рядом с компонентами ломает
// Fast Refresh (oxlint react/only-export-components), см. sheetClose.ts.
//
// Зачем это вообще нужно: при открытой клавиатуре видна только часть
// экрана — visualViewport. Шторку ставим по его координатам: верх видимой
// области в координатах fixed-позиционирования — offsetTop, высота — height.
// window.innerHeight для расчёта не годится: в iOS Safari он сжимается
// вместе с клавиатурой, в Chromium — нет (KAN-126: на iPhone шторка
// оставалась под клавиатурой, видна была только пустая её часть).
function subscribe(notify: () => void) {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  vv.addEventListener('resize', notify);
  vv.addEventListener('scroll', notify);
  return () => {
    vv.removeEventListener('resize', notify);
    vv.removeEventListener('scroll', notify);
  };
}

// useSyncExternalStore сравнивает снимки по ссылке — если каждый вызов
// возвращать новый объект, будет бесконечный ре-рендер. Кэшируем последний
// снимок и отдаём тот же объект, пока значения не изменились.
let lastSnapshot: VisualViewportInsets | null = null;
function getSnapshot(): VisualViewportInsets | null {
  const vv = window.visualViewport;
  if (!vv) return null;
  const height = vv.height;
  const offsetTop = vv.offsetTop;
  if (!lastSnapshot || lastSnapshot.height !== height || lastSnapshot.offsetTop !== offsetTop) {
    lastSnapshot = { height, offsetTop };
  }
  return lastSnapshot;
}

export function useVisualViewportInsets(): VisualViewportInsets | null {
  const sub = useCallback((notify: () => void) => subscribe(notify), []);
  // getServerSnapshot тот же, что и клиентский: хук не участвует в SSR,
  // а window тут всегда доступен (компонент рендерится только в браузере).
  return useSyncExternalStore(sub, getSnapshot, getSnapshot);
}
