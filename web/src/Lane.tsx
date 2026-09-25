import { Children, useEffect, useRef, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { settleIndex } from './lane';

// Лента колонок на телефоне: листание и доводку делает браузер
// (scroll-snap), своих обработчиков жеста нет — поэтому она не спорит с
// вертикальной прокруткой колонок.
export function Lane(
  { active, onActiveChange, ready, children }: {
    active: number; onActiveChange: (i: number) => void; ready: boolean; children: ReactNode;
  },
) {
  const ref = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const mounted = useRef(false);
  const reduce = useReducedMotion();
  // Цель программной прокрутки (тап по вкладке, восстановление после
  // загрузки) — чтобы её собственный scrollend не записался в lastColumn
  // как будто колонку выбрал пользователь свайпом.
  const programmatic = useRef<number | null>(null);

  const step = () => {
    const el = ref.current;
    if (!el || el.children.length < 2) return el?.clientWidth ?? 0;
    return (el.children[1] as HTMLElement).offsetLeft - (el.children[0] as HTMLElement).offsetLeft;
  };

  // Прокрутка → активная вкладка. scrollend приходит один раз, когда
  // доводка закончилась; где его нет — scroll, прорежённый rAF.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const settle = () => {
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
      const computed = settleIndex(el.scrollLeft, step(), el.children.length, atEnd, activeRef.current);
      if (programmatic.current !== null && computed === programmatic.current) {
        programmatic.current = null;
        return;
      }
      onActiveChange(computed);
    };
    if ('onscrollend' in window) {
      el.addEventListener('scrollend', settle);
      return () => el.removeEventListener('scrollend', settle);
    }
    // Без scrollend любой промежуточный кадр программного scrollTo (доводка
    // после тапа по вкладке, ResizeObserver) тоже даёт scroll-событие —
    // settle() на нём видел бы позицию «в пути» и откатывал бы активную
    // вкладку назад. Ждём паузу в событиях scroll, а не первый rAF после них.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => { clearTimeout(timer); timer = setTimeout(settle, 120); };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { clearTimeout(timer); el.removeEventListener('scroll', onScroll); };
  }, [onActiveChange]);

  // Активная вкладка → прокрутка. Первый раз без анимации: открываемся
  // сразу на сохранённой колонке. Пока задачи ещё не загрузились (!ready),
  // стартовая колонка может дважды поменяться (пустой список → реальный
  // startColumn) — до готовности едем instant и не считаем это выбором
  // пользователя.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const left = active * step();
    if (Math.abs(el.scrollLeft - left) > 2) {
      programmatic.current = active;
      el.scrollTo({ left, behavior: mounted.current && ready && !reduce ? 'smooth' : 'instant' });
    }
    if (ready) mounted.current = true;
  }, [active, ready, reduce]);

  // Поворот или изменение ширины — вернуться точно на активную колонку.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      el.scrollTo({ left: activeRef.current * step(), behavior: 'instant' });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="flex-1 min-h-0 flex gap-3 overflow-x-auto overscroll-x-contain
                 snap-x snap-mandatory scroll-px-3 px-3 no-scrollbar"
    >
      {Children.map(children, child => (
        <div className="snap-start shrink-0 h-full w-[calc(100%-24px)] md:w-[calc(50%-12px)] overflow-x-clip">
          {child}
        </div>
      ))}
    </div>
  );
}
