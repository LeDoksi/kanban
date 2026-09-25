import { useEffect, useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { sb } from './supabase';
import type { Item, Epic } from './supabase';
import { epicProgress } from './epics';
import { Sheet, SheetCloseButton } from './ui/Sheet';
import { Button } from './ui/Button';
import { Markdown } from './ui/Markdown';
import { AutoTextarea } from './ui/AutoTextarea';
import { ProgressRing } from './ui/ProgressRing';
import { toasts } from './ui/toast';
import { COLUMNS } from './columns';
import { STATUS_ICON } from './statusIcons';
import { confirmStep } from './deleteConfirm';
import { DotsThree, Trash } from '@phosphor-icons/react';

export function EpicModal(
  { epicId, onClose, onOpenItem }: {
    epicId: string; onClose: () => void; onOpenItem: (item: Item) => void;
  },
) {
  const [epic, setEpic] = useState<Epic | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [editingGoal, setEditingGoal] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [goalDraft, setGoalDraft] = useState('');

  useEffect(() => {
    sb.from('epics').select('*').eq('id', epicId).single()
      .then(({ data, error }) => {
        if (error) { toasts.show(error.message); return; }
        const e = data as Epic;
        setEpic(e);
        setTitleDraft(e.title);
        setGoalDraft(e.goal ?? '');
      });
    sb.from('items').select('*').eq('epic_id', epicId).order('position')
      .then(({ data, error }) => {
        if (error) { toasts.show(error.message); return; }
        setItems((data ?? []) as Item[]);
      });
  }, [epicId]);

  const saveTitle = async () => {
    const clean = titleDraft.trim();
    if (!epic || !clean || clean === epic.title) { setTitleDraft(epic?.title ?? ''); return; }
    const { error } = await sb.from('epics').update({ title: clean }).eq('id', epicId);
    if (error) { toasts.show(error.message); return; }
    setEpic({ ...epic, title: clean });
  };

  const saveGoal = async () => {
    setEditingGoal(false);
    if (!epic) return;
    const clean = goalDraft.trim() || null;
    if (clean === epic.goal) return;
    const { error } = await sb.from('epics').update({ goal: clean }).eq('id', epicId);
    if (error) { toasts.show(error.message); return; }
    setEpic({ ...epic, goal: clean });
  };

  const { done, total } = epicProgress(epicId, items);

  return (
    <Sheet title={epic?.title ?? 'Эпик'} onClose={onClose}>
      <div className="flex items-start gap-2 mb-1">
        <div className="flex-1 min-w-0">
          <AutoTextarea
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
            aria-label="Заголовок эпика"
            className="w-full text-title bg-transparent rounded-xl px-2 -mx-2 py-1 outline-none
                       hover:bg-(--color-raised) focus:bg-(--color-raised)"
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <EpicActions epic={epic} itemCount={items.length} onClose={onClose} />
          <SheetCloseButton />
        </div>
      </div>

      <div className="flex items-center gap-3 mb-5 mt-2">
        <ProgressRing done={done} total={total} size={48} stroke={4} />
        <span className="text-title">{done} из {total}</span>
        {epic?.plan_path && (
          <a href={epic.plan_path} className="text-body text-(--color-ink) underline">План</a>
        )}
        {epic?.spec_path && (
          <a href={epic.spec_path} className="text-body text-(--color-ink) underline">Спека</a>
        )}
      </div>

      <section className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-meta text-(--color-muted)">Цель</h3>
          {epic?.goal && !editingGoal && (
            <Button variant="ghost" size="sm" onClick={() => setEditingGoal(true)}>Изменить</Button>
          )}
        </div>
        {editingGoal ? (
          <AutoTextarea
            autoFocus
            value={goalDraft}
            onChange={e => setGoalDraft(e.target.value)}
            onBlur={saveGoal}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.blur(); }}
            placeholder="Добавить цель"
            className="w-full min-h-24 p-3 rounded-xl bg-(--color-raised) text-body outline-none
                       focus:ring-2 focus:ring-(--color-accent)"
          />
        ) : epic?.goal ? (
          <Markdown text={epic.goal} className="text-body" />
        ) : (
          <button onClick={() => setEditingGoal(true)} className="text-body text-(--color-muted) hover:text-(--color-ink)">
            Добавить цель
          </button>
        )}
      </section>

      <section className="pb-8">
        <h3 className="text-meta text-(--color-muted) mb-1.5">Задачи</h3>
        {COLUMNS.map(col => {
          const group = items.filter(i => i.status === col.key);
          if (group.length === 0) return null;
          return (
            <div key={col.key} className="mb-3">
              <h4 className="text-meta text-(--color-muted) px-1 mb-1">{col.label}</h4>
              <div className="space-y-0.5">
                {group.map(i => {
                  const Icon = STATUS_ICON[i.status];
                  return (
                    <button
                      key={i.id}
                      onClick={() => onOpenItem(i)}
                      className="w-full flex items-center gap-2 text-left text-body
                                 px-2 py-1.5 rounded-xl hover:bg-(--color-raised)"
                    >
                      <Icon size={18} className="shrink-0 text-(--color-muted)" />
                      <span className="flex-1 min-w-0 truncate">{i.title}</span>
                      <span className="text-micro font-mono text-(--color-muted)">{i.id}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <p className="text-body text-(--color-muted)">Пока без задач.</p>
        )}
      </section>
    </Sheet>
  );
}

function EpicActions(
  { epic, itemCount, onClose }: { epic: Epic | null; itemCount: number; onClose: () => void },
) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'idle' | 'confirm'>('idle');

  const onDelete = async (e: Event) => {
    const next = confirmStep(step, 'delete');
    setStep(next.state);
    // Первый шаг не закрывает меню — пункт меняется на подтверждение.
    if (!next.perform) { e.preventDefault(); return; }
    // items.epic_id -> epics.id это ON DELETE SET NULL: задачи не
    // удаляются, просто теряют привязку к эпику.
    const { error } = await sb.from('epics').delete().eq('id', epic!.id);
    if (error) { toasts.show(error.message); return; }
    onClose();
  };

  return (
    <Menu.Root open={open} onOpenChange={o => { setOpen(o); if (!o) setStep(confirmStep(step, 'close').state); }}>
      <Menu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="Действия с эпиком"><DotsThree size={20} weight="bold" /></Button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className="z-[60] min-w-64 rounded-2xl bg-(--color-surface) shadow-menu p-1.5">
          <Menu.Item onSelect={onDelete} className={`${itemCls} text-(--color-danger)`}>
            <Trash size={18} />{step === 'confirm' ? 'Удалить навсегда?' : 'Удалить эпик'}
          </Menu.Item>
          {step === 'confirm' && itemCount > 0 && (
            <p className="px-3 pb-1.5 text-micro text-(--color-muted)">Задачи останутся без эпика</p>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

const itemCls = `flex items-center gap-2.5 h-10 px-3 rounded-xl outline-none cursor-pointer text-body
                 data-[highlighted]:bg-(--color-raised)`;
