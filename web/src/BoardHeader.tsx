import { useEffect, useRef, useState } from 'react';
import { CaretDown, Plus } from '@phosphor-icons/react';
import type { Project } from './supabase';
import { Button } from './ui/Button';
import { Editable } from './Editable';

// Телефон: одна строка — переключатель проекта и прогресс; описание на
// доске не показывается (до трёх строк над колонками). Десктоп: описание
// в одну строку с правкой по клику и кнопка «Новая задача».
export function BoardHeader(
  { project, done, total, onOpenProjects, onCreate, onSaveDescription }: {
    project: Project | null; done: number; total: number;
    onOpenProjects: () => void; onCreate: () => void;
    onSaveDescription: (text: string | null) => void;
  },
) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project?.description ?? '');
  // Enter/Escape в onKeyDown снимают editing и убирают <input> из DOM —
  // это само может вызвать blur того же поля, и onBlur={save} отработал бы
  // второй раз с тем же черновиком (двойной PATCH на Enter) или вообще
  // сохранил бы то, что должен был отменить Escape. Флаг «уже обработали
  // эту сессию редактирования» ставится в onKeyDown и проверяется в onBlur;
  // сбрасывается при входе в редактирование.
  const handledRef = useRef(false);

  // Сбрасывать черновик при смене проекта или при обновлении описания
  // с сервера — иначе в поле мог бы остаться текст другого проекта.
  useEffect(() => {
    setEditing(false);
    setDraft(project?.description ?? '');
  }, [project?.id, project?.description]);

  const save = () => {
    if (handledRef.current) return;
    handledRef.current = true;
    setEditing(false);
    const clean = draft.trim() || null;
    if (project && clean !== project.description) onSaveDescription(clean);
  };

  const cancel = () => {
    handledRef.current = true;
    setEditing(false);
    setDraft(project?.description ?? '');
  };

  return (
    <header className="flex items-center gap-3 px-4 pt-3 pb-2 lg:px-6 lg:pt-5 lg:pb-4">
      <button
        onClick={onOpenProjects}
        aria-label={`Проект: ${project?.name ?? 'не выбран'}. Сменить`}
        className="inline-flex items-center gap-1.5 min-w-0 -ml-1 px-1 rounded-lg
                   text-title-lg text-(--color-ink) active:scale-[0.98] transition-transform"
      >
        <span className="truncate">{project?.name ?? 'Проекты'}</span>
        <CaretDown size={16} className="shrink-0 text-(--color-muted)" />
      </button>

      {project && (
        <div className="hidden lg:block min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={save}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
              placeholder="описание проекта"
              className="w-full h-9 px-3 rounded-xl bg-(--color-raised) text-body outline-none
                         focus:ring-2 focus:ring-(--color-accent)"
            />
          ) : (
            <Editable
              onEdit={() => { handledRef.current = false; setEditing(true); }}
              className="block truncate text-body text-(--color-muted) cursor-text"
            >
              {project.description || 'Добавить описание'}
            </Editable>
          )}
        </div>
      )}

      <span className="ml-auto shrink-0 text-meta text-(--color-muted)">
        {done} из {total}
      </span>

      {/* Оборачиваем в div: у Button свой безусловный inline-flex, и если
          добавить «hidden lg:inline-flex» прямо в её className, оба класса
          display окажутся на одном элементе и порядок в итоговом CSS (а не
          в className) решит, какой победит — не то, что нужно. */}
      <div className="hidden lg:inline-flex">
        <Button variant="primary" onClick={onCreate}>
          <Plus size={18} weight="bold" />
          Новая задача
        </Button>
      </div>

      <button
        onClick={onCreate}
        aria-label="Новая задача"
        className="lg:hidden fixed z-40 right-4 bottom-[calc(16px+env(safe-area-inset-bottom))]
                   size-14 rounded-full grid place-items-center shadow-menu
                   bg-(--color-accent) text-(--color-on-accent)
                   active:scale-95 transition-transform"
      >
        <Plus size={26} weight="bold" />
      </button>
    </header>
  );
}
