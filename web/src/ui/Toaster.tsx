import { useSyncExternalStore } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { toasts } from './toast';

export function Toaster() {
  const toast = useSyncExternalStore(toasts.subscribe, toasts.get);
  const reduce = useReducedMotion();
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 z-[60] flex justify-center px-4 pointer-events-none
                 bottom-[calc(88px+env(safe-area-inset-bottom))] lg:bottom-6"
    >
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="pointer-events-auto flex items-center gap-3 max-w-md rounded-full
                       bg-(--color-ink) text-(--color-ground) shadow-menu
                       pl-4 pr-2 min-h-11 text-meta"
          >
            <span className="py-2">{toast.text}</span>
            {toast.action && (
              <button
                onClick={() => { toast.action!.run(); toasts.dismiss(); }}
                className="h-8 px-3 rounded-full font-semibold text-(--color-ground)
                           hover:bg-(--color-ink-2)"
              >
                {toast.action.label}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
