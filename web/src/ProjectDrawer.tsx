import { useRef, useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import type { Project } from './supabase';
import { NewProject } from './NewProject';
import { Sheet, SheetCloseButton } from './ui/Sheet';
import { Button } from './ui/Button';
import { ProgressRing } from './ui/ProgressRing';
import { AutoTextarea } from './ui/AutoTextarea';
import { confirmStep } from './deleteConfirm';
import { Check, DotsThree, Pencil, Archive, Plus, ArrowLeft } from '@phosphor-icons/react';

export type ProjectRow = { project: Project; total: number; done: number; waiting: number };

// Меню живёт в портале, но события из портала всплывают по дереву
// компонентов — до кнопки выбора проекта. Содержимое меню гасит
// всплытие, как в StatusMenu.
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

const itemCls = `flex items-center gap-2.5 h-10 px-3 rounded-xl outline-none cursor-pointer text-body
                 data-[highlighted]:bg-(--color-raised)`;

export function ProjectDrawer(
  { current, rows, onSelect, onSaveDescription, onArchive, onClose }: {
    current: string; rows: ProjectRow[];
    onSelect: (id: string) => void;
    onSaveDescription: (id: string, text: string | null) => void;
    onArchive: (id: string) => void;
    onClose: () => void;
  },
) {
  const [creating, setCreating] = useState(false);

  return (
    <Sheet title="Проекты" onClose={onClose} side="left">
      {creating ? (
        <>
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setCreating(false)}
              className="flex items-center gap-1.5 text-body text-(--color-muted) hover:text-(--color-ink)"
            >
              <ArrowLeft size={18} /> Проекты
            </button>
            <SheetCloseButton />
          </div>
          <NewProject onCreated={id => { setCreating(false); onSelect(id); onClose(); }} />
        </>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-title font-medium">Проекты</h2>
            <SheetCloseButton />
          </div>

          <div className="space-y-1">
            {rows.map(row => (
              <ProjectRowItem
                key={row.project.id}
                row={row}
                isCurrent={row.project.id === current}
                onSelect={() => { onSelect(row.project.id); onClose(); }}
                onSaveDescription={text => onSaveDescription(row.project.id, text)}
                onArchive={() => onArchive(row.project.id)}
              />
            ))}
          </div>

          <Button variant="secondary" onClick={() => setCreating(true)} className="w-full justify-center mt-3">
            <Plus size={18} />
            Новый проект
          </Button>
        </>
      )}
    </Sheet>
  );
}

function ProjectRowItem(
  { row, isCurrent, onSelect, onSaveDescription, onArchive }: {
    row: ProjectRow; isCurrent: boolean;
    onSelect: () => void;
    onSaveDescription: (text: string | null) => void;
    onArchive: () => void;
  },
) {
  const { project, total, done, waiting } = row;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.description ?? '');
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'idle' | 'confirm'>('idle');
  // Enter/Escape в onKeyDown снимают editing — это само может вызвать blur
  // того же поля, и onBlur={save} отработал бы второй раз с тем же
  // черновиком. Флаг «уже обработали эту сессию редактирования», как в
  // BoardHeader.
  const handledRef = useRef(false);

  const save = () => {
    if (handledRef.current) return;
    handledRef.current = true;
    setEditing(false);
    const clean = draft.trim() || null;
    if (clean !== project.description) onSaveDescription(clean);
  };

  const cancel = () => {
    handledRef.current = true;
    setEditing(false);
    setDraft(project.description ?? '');
  };

  const onArchiveSelect = (e: Event) => {
    const next = confirmStep(step, 'delete');
    setStep(next.state);
    // Первый шаг не закрывает меню — пункт меняется на подтверждение.
    if (!next.perform) { e.preventDefault(); return; }
    onArchive();
  };

  if (editing) {
    return (
      <div className="flex items-start gap-3 px-2 py-1.5">
        <ProgressRing done={done} total={total} size={28} />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="text-body font-medium truncate">{project.name}</div>
          <AutoTextarea
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); save(); }
              if (e.key === 'Escape') cancel();
            }}
            placeholder="описание проекта"
            className="w-full text-meta text-(--color-muted) bg-transparent outline-none"
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 rounded-xl px-2 py-1.5 ${
      isCurrent ? 'bg-(--color-raised)' : 'hover:bg-(--color-raised)'
    }`}
    >
      <button onClick={onSelect} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <ProgressRing done={done} total={total} size={28} />
        <div className="min-w-0 flex-1">
          <div className="text-body font-medium truncate">{project.name}</div>
          {project.description && (
            <div className="text-meta text-(--color-muted) truncate">{project.description}</div>
          )}
        </div>
      </button>

      <div className="flex items-center gap-1.5 shrink-0">
        {isCurrent && <Check size={16} className="text-(--color-accent-ink)" />}
        {waiting > 0 && <span className="text-meta text-(--color-accent-ink)">{waiting} ждёт</span>}
        <Menu.Root open={open} onOpenChange={o => { setOpen(o); if (!o) setStep(confirmStep(step, 'close').state); }}>
          <Menu.Trigger asChild>
            <Button
              variant="ghost" size="icon" aria-label={`Действия с проектом ${project.name}`}
              onClick={stop} onMouseDown={stop} onPointerDown={stop}
            >
              <DotsThree size={18} weight="bold" />
            </Button>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content
              align="end" sideOffset={6} onClick={stop} onMouseDown={stop} onPointerDown={stop}
              className="z-[60] min-w-56 rounded-2xl bg-(--color-surface) shadow-menu p-1.5"
            >
              <Menu.Item
                onSelect={() => { handledRef.current = false; setDraft(project.description ?? ''); setEditing(true); }}
                className={itemCls}
              >
                <Pencil size={18} className="text-(--color-muted)" />
                Изменить описание
              </Menu.Item>
              <Menu.Item onSelect={onArchiveSelect} className={`${itemCls} text-(--color-danger)`}>
                <Archive size={18} />
                {step === 'confirm' ? 'В архив, точно?' : 'В архив'}
              </Menu.Item>
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      </div>
    </div>
  );
}
