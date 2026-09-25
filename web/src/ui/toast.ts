// Один тост за раз, снизу по центру. Ошибки раньше выводились текстом в
// шапке доски и тонули среди кнопок; тост заметен и сам уходит. Стор без
// React, чтобы его можно было звать из любого обработчика и тестировать
// в node.
export type ToastAction = { label: string; run: () => void };
export type Toast = { id: number; text: string; action?: ToastAction };

export function createToastStore(
  timers: { set: typeof setTimeout; clear: typeof clearTimeout } = { set: setTimeout, clear: clearTimeout },
) {
  let current: Toast | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(fn => fn());

  const dismiss = () => {
    timers.clear(timer);
    current = null;
    emit();
  };

  return {
    show(text: string, action?: ToastAction, ms = 4000) {
      timers.clear(timer);
      seq += 1;
      current = { id: seq, text, action };
      timer = timers.set(dismiss, ms);
      emit();
    },
    dismiss,
    get: () => current,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}

export const toasts = createToastStore();
