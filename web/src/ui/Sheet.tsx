import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Drawer } from 'vaul';
import { motion } from 'motion/react';
import { X } from '@phosphor-icons/react';
import { useMedia } from '../useMedia';
import { Button } from './Button';
// useSheetClose живёт в отдельном файле (не переэкспортируется отсюда):
// экспорт хука рядом с компонентами в одном файле ломает Fast Refresh
// (oxlint react/only-export-components) — импортировать его из
// './ui/sheetClose' напрямую.
import { CloseProvider, useSheetClose } from './sheetClose';
import { useVisualViewportInsets } from './useVisualViewport';

export function SheetCloseButton() {
  const close = useSheetClose();
  return (
    <Button variant="ghost" size="icon" onClick={close} aria-label="Закрыть" className="-mr-2 -mt-1">
      <X size={20} />
    </Button>
  );
}

export function Sheet(
  { title, onClose, side = 'auto', center = false, children }: {
    title: string; onClose: () => void; side?: 'auto' | 'left'; center?: boolean; children: ReactNode;
  },
) {
  const desktop = useMedia('(min-width: 1024px)');
  const [open, setOpen] = useState(true);

  // vaul вызывает onAnimationEnd только когда сам меняет свой внутренний
  // isOpen (drag, Esc, тап по подложке — через closeDrawer -> setIsOpen).
  // Если вместо этого просто выставить снаружи проп open=false (как делала
  // кнопка «×»), useControllableState это как внешний контроль воспринимает
  // молча и onOpenChange/onAnimationEnd не зовёт — шторка визуально
  // исчезает, а onClose родителя никогда не срабатывает, и та же шторка
  // больше не открывается. closedRef гарантирует, что onClose вызовется
  // ровно один раз — либо по этому таймеру (после анимации 0.5с), либо
  // раньше по честному onAnimationEnd, — какой сработает первым. Хуки
  // должны идти до условного return ниже (CenterSheet не использует vaul,
  // но правила хуков одинаковы для всех веток рендера).
  const closedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    closedRef.current = false;
    return () => { closedRef.current = true; clearTimeout(timerRef.current); };
  }, []);
  const finish = () => { if (!closedRef.current) { closedRef.current = true; onClose(); } };
  const close = () => {
    setOpen(false);
    timerRef.current = setTimeout(finish, 500);
  };

  // KAN-126: repositionInputs сдвигал (translate) весь fixed-элемент
  // шторки вверх на высоту клавиатуры целиком — а не только поле ввода.
  // При h-[92dvh] шторка уезжала выше верхнего края экрана, и на месте
  // видимого оставался только серый оверлей. Вместо сдвига всей шторки
  // сами подтягиваем нижнюю границу под клавиатуру и уменьшаем высоту —
  // так composer с полем комментария остаётся на месте, а не улетает.
  // Хук вызывается безусловно (до return для CenterSheet) — как и все
  // хуки выше по тем же причинам, см. комментарий про closedRef.
  const vv = useVisualViewportInsets();

  if (center && desktop) return <CenterSheet title={title} onClose={onClose}>{children}</CenterSheet>;

  const direction = !desktop ? 'bottom' : side === 'left' ? 'left' : 'right';

  // Низ шторки — на нижнем крае видимой области (над клавиатурой), верх
  // считаем от него. top, а не bottom: bottom считался бы от layout
  // viewport, который iOS при клавиатуре ведёт иначе, чем Chromium.
  const sheetHeight = vv ? Math.min(vv.height * 0.92, vv.height - 12) : 0;
  const bottomStyle = direction === 'bottom' && vv
    ? { top: vv.offsetTop + vv.height - sheetHeight, bottom: 'auto', height: sheetHeight }
    : undefined;

  return (
    <Drawer.Root
      open={open}
      onOpenChange={setOpen}
      direction={direction}
      // Родитель размонтирует шторку только когда она доехала: иначе
      // закрытие обрывалось бы на середине анимации.
      onAnimationEnd={isOpen => { if (!isOpen) finish(); }}
      // repositionInputs выключен (KAN-126): см. комментарий выше про
      // bottomStyle — сами держим низ шторки над клавиатурой через
      // visualViewport, а не даём vaul сдвигать всю шторку целиком.
      repositionInputs={false}
      // Свою подгонку под клавиатуру vaul (через react-aria preventScroll)
      // на iOS делает прокруткой страницы при фокусе поля — это сдвигает
      // fixed-шторку повторно. Прокрутку фона и так блокирует подложка.
      disablePreventScroll
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-(--color-overlay)" />
        <Drawer.Content
          style={bottomStyle}
          className={`fixed z-50 flex flex-col bg-(--color-surface) outline-none ${
            direction === 'bottom'
              ? 'inset-x-0 bottom-0 h-[92dvh] rounded-t-3xl'
              : direction === 'right'
                ? 'inset-y-0 right-0 w-[480px] max-w-full'
                : 'inset-y-0 left-0 w-[400px] max-w-full'
          }`}
        >
          <Drawer.Title className="sr-only">{title}</Drawer.Title>
          {direction === 'bottom' && (
            <Drawer.Handle className="mt-2.5 mb-1 w-10! h-1.5! bg-(--color-line)!" />
          )}
          <CloseProvider value={close}>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3">
              {children}
            </div>
          </CloseProvider>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

// Окно по центру для создания задачи на десктопе: vaul не умеет
// центрированный режим, отдельный Radix Dialog ради одного окна не нужен.
function CenterSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-(--color-overlay)"
      onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div
        role="dialog" aria-modal="true" aria-label={title}
        className="w-full max-w-[480px] max-h-[85vh] overflow-y-auto rounded-2xl bg-(--color-surface) shadow-menu p-5"
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      >
        <CloseProvider value={onClose}>{children}</CloseProvider>
      </motion.div>
    </motion.div>
  );
}
