import { useCallback, useSyncExternalStore } from 'react';

export type VisualViewportInsets = { height: number; bottomInset: number };

// Отдельный файл (не .tsx): экспорт хука рядом с компонентами ломает
// Fast Refresh (oxlint react/only-export-components), см. sheetClose.ts.
//
// Зачем это вообще нужно: на телефоне при открытии клавиатуры браузер
// не меняет window.innerHeight — сжимается только visualViewport. Шторка
// с fixed высотой (h-[92dvh]) продолжает целиться в старую высоту экрана
// и просто уезжает выше клавиатуры за верхний край. bottomInset — это
// высота того, что «съедено» снизу (клавиатура + возможный оффсет
// прокрутки), на неё и подтягиваем низ шторки.
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
  const bottomInset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
  if (!lastSnapshot || lastSnapshot.height !== height || lastSnapshot.bottomInset !== bottomInset) {
    lastSnapshot = { height, bottomInset };
  }
  return lastSnapshot;
}

export function useVisualViewportInsets(): VisualViewportInsets | null {
  const sub = useCallback((notify: () => void) => subscribe(notify), []);
  // getServerSnapshot тот же, что и клиентский: хук не участвует в SSR,
  // а window тут всегда доступен (компонент рендерится только в браузере).
  return useSyncExternalStore(sub, getSnapshot, getSnapshot);
}
