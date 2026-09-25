import { motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';

// Видимая часть экрана без выехавшей клавиатуры. iOS Safari при открытии
// клавиатуры не сжимает layout viewport: fixed inset-0 остаётся на всю
// высоту, модалка центрируется по ней и оказывается под клавиатурой
// (KAN-112). visualViewport знает реальную видимую область — по ней и
// меряем подложку. Android с interactive-widget=resizes-content в
// index.html и так сжимает layout, там значения просто совпадут.
function useVisualViewport() {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setBox({ top: vv.offsetTop, height: vv.height });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return box;
}

export function Sheet(
  { onClose, placement = 'center', maxWidth = 'max-w-lg', children }: {
    onClose: () => void;
    placement?: 'center' | 'left';
    maxWidth?: string;
    children: ReactNode;
  },
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const viewport = useVisualViewport();

  const hidden = placement === 'left' ? { x: '-100%' } : { opacity: 0, scale: 0.97 };
  const visible = placement === 'left' ? { x: 0 } : { opacity: 1, scale: 1 };

  return (
    <motion.div
      className={`fixed inset-0 bg-(--color-overlay) z-50 flex ${
        placement === 'left' ? '' : 'items-center justify-center p-4'
      }`}
      style={viewport ? { top: viewport.top, height: viewport.height, bottom: 'auto' } : undefined}
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className={`bg-(--color-ground) overflow-y-auto ${
          placement === 'left'
            ? 'absolute inset-y-0 left-0 w-80 max-w-[85vw] p-5'
            : `rounded-lg w-full ${maxWidth} max-h-full md:max-h-[85vh] p-5`
        }`}
        onClick={e => e.stopPropagation()}
        initial={hidden}
        animate={visible}
        exit={hidden}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
