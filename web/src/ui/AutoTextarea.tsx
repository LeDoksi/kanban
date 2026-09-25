import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

// Поле, которое растёт по тексту: заголовок и описание редактируются
// «на месте», без прокрутки внутри крошечного textarea.
export function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={1} {...props} className={`resize-none overflow-hidden ${props.className ?? ''}`} />;
}
