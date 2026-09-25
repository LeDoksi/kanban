import type { ReactNode } from 'react';

// Обёртка над кликабельным текстом, который открывает инлайн-редактор.
// role="button" одного onClick на <span>/<h2>/<p> не хватает — без
// tabIndex/onKeyDown до него не добраться Tab'ом и не активировать с
// клавиатуры. Используется везде, где click-to-edit подменяет текст на
// input/textarea (TaskModal, EpicModal, шапка доски).
export function Editable(
  { as: Tag = 'span', onEdit, className, children }: {
    as?: 'span' | 'h1' | 'h2' | 'p' | 'div';
    onEdit: () => void;
    className?: string;
    children: ReactNode;
  },
) {
  return (
    <Tag
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(); }
      }}
      className={className}
    >
      {children}
    </Tag>
  );
}
