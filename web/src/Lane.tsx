import { Children, useEffect, useRef, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { indexFromScroll } from './lane';

// Лента колонок на телефоне: листание и доводку делает браузер
// (scroll-snap), своих обработчиков жеста нет — поэтому она не спорит с
// вертикальной прокруткой колонок.
export function Lane(
  { active, onActiveChange, children }: {
    active: number; onActiveChange: (i: number) => void; children: ReactNode;
  },
) {
  const ref = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const mounted = useRef(false);
  const reduce = useReducedMotion();

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
    const settle = () => onActiveChange(indexFromScroll(el.scrollLeft, step(), el.children.length));
    if ('onscrollend' in window) {
      el.addEventListener('scrollend', settle);
      return () => el.removeEventListener('scrollend', settle);
    }
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(settle); };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { cancelAnimationFrame(raf); el.removeEventListener('scroll', onScroll); };
  }, [onActiveChange]);

  // Активная вкладка → прокрутка. Первый раз без анимации: открываемся
  // сразу на сохранённой колонке.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const left = active * step();
    if (Math.abs(el.scrollLeft - left) > 2) {
      el.scrollTo({ left, behavior: mounted.current && !reduce ? 'smooth' : 'instant' });
    }
    mounted.current = true;
  }, [active, reduce]);

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
        <div className="snap-start shrink-0 h-full w-[calc(100%-24px)] md:w-[calc(50%-6px)]">
          {child}
        </div>
      ))}
    </div>
  );
}
