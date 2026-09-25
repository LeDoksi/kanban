import { useEffect, useState } from 'react';

// marked + DOMPurify (~20 КБ gz) нужны только в открытой шторке — грузим
// их отдельным чанком при первом показе, а до загрузки показываем текст
// как есть (pre-wrap), без мигания пустоты.
let loader: Promise<(src: string) => string> | null = null;
const loadRenderer = () =>
  (loader ??= import('../markdown').then(m => m.makeRenderer(window)));

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  const [render, setRender] = useState<((s: string) => string) | null>(null);
  useEffect(() => {
    let alive = true;
    loadRenderer().then(r => { if (alive) setRender(() => r); });
    return () => { alive = false; };
  }, []);
  if (!render) return <div className={`whitespace-pre-wrap ${className}`}>{text}</div>;
  // Вывод DOMPurify — единственный источник HTML в приложении.
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: render(text) }} />;
}
