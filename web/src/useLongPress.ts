import { useRef } from 'react';
import { LONG_PRESS_MS, movedTooFar } from './longpress';

export function useLongPress(onFire: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  // После срабатывания браузер всё равно пришлёт click при отпускании
  // пальца — его надо проглотить, иначе вместе с меню откроется задача.
  const fired = useRef(false);

  const cancel = () => {
    clearTimeout(timer.current);
    start.current = null;
  };

  return {
    handlers: {
      onTouchStart: (e: React.TouchEvent) => {
        fired.current = false;
        start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          fired.current = true;
          navigator.vibrate?.(10);
          onFire();
        }, LONG_PRESS_MS);
      },
      onTouchMove: (e: React.TouchEvent) => {
        if (!start.current) return;
        const dx = e.touches[0].clientX - start.current.x;
        const dy = e.touches[0].clientY - start.current.y;
        if (movedTooFar(dx, dy)) cancel();
      },
      onTouchEnd: cancel,
      onTouchCancel: cancel,
    },
    consumeClick: () => {
      if (!fired.current) return false;
      fired.current = false;
      return true;
    },
  };
}
