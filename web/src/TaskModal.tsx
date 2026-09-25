import { useEffect, useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { sb, setStatus } from './supabase';
import type { Item, Comment, Epic } from './supabase';
import { selectableEpics } from './epics';
import { Sheet, SheetCloseButton } from './ui/Sheet';
import { Button } from './ui/Button';
import { Markdown } from './ui/Markdown';
import { PropertySelect } from './ui/PropertySelect';
import { AutoTextarea } from './ui/AutoTextarea';
import { relTime, fullDate } from './time';
import { toasts } from './ui/toast';
import { COLUMNS } from './columns';
import { STATUS_ICON } from './statusIcons';
import { confirmStep } from './deleteConfirm';
import {
  CheckSquare, Bug, Wrench, ArrowSquareOut, CheckCircle, Circle, PaperPlaneRight,
  DotsThree, Archive, ArrowCounterClockwise, Trash,
} from '@phosphor-icons/react';

export function TaskModal(
  { item, epics, allItems, onClose, onChanged, onOpenEpic }: {
    item: Item; epics: Epic[]; allItems: Item[];
    onClose: () => void; onChanged: () => void;
    onOpenEpic?: (epicId: string) => void;
  },
) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [editingBody, setEditingBody] = useState(false);
  const [titleDraft, setTitleDraft] = useState(item.title);
  const [bodyDraft, setBodyDraft] = useState(item.body ?? '');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    sb.from('comments').select('*')
      .eq('item_id', item.id).order('created_at')
      .then(({ data, error }) => {
        if (error) { toasts.show(error.message); return; }
        setComments((data ?? []) as Comment[]);
      });
  }, [item.id]);

  // Синхронизировать черновики, если доска перечиталась (Realtime,
  // правка агентом) — иначе после чужой правки инлайн-редактор будет
  // молча затирать её своим устаревшим черновиком.
  useEffect(() => {
    setTitleDraft(item.title);
    setBodyDraft(item.body ?? '');
  }, [item.id, item.title, item.body]);

  const toggleCheck = async (i: number) => {
    const { data, error: readErr } = await sb.from('items')
      .select('checklist').eq('id', item.id).single();
    if (readErr) { toasts.show(readErr.message); return; }
    const current = (data?.checklist ?? item.checklist) as typeof item.checklist;
    const list = current.map((s, idx) =>
      idx === i ? { ...s, done: !s.done } : s);
    const { error } = await sb.from('items')
      .update({ checklist: list }).eq('id', item.id);
    if (error) { toasts.show(error.message); return; }
    onChanged();
  };

  const move = async (status: Item['status']) => {
    const { error } = await setStatus(item.id, status);
    if (error) { toasts.show(error.message); return; }
    onChanged();
  };

  const setType = async (type: Item['type']) => {
    const { error } = await sb.from('items').update({ type }).eq('id', item.id);
    if (error) { toasts.show(error.message); return; }
    onChanged();
  };

  const setEpic = async (epicId: string) => {
    const { error } = await sb.from('items')
      .update({ epic_id: epicId || null }).eq('id', item.id);
    if (error) { toasts.show(error.message); return; }
    onChanged();
  };

  const sendComment = async () => {
    const text = newComment.trim();
    // sending гонит от тройного клика/Enter до отклика сети: без него
    // каждый клик видит ещё не очищенный newComment и шлёт свою вставку.
    if (!text || sending) return;
    setSending(true);
    const { error } = await sb.from('comments')
      .insert({ item_id: item.id, author: 'me', body: text });
    setSending(false);
    if (error) { toasts.show(error.message); return; }
    setNewComment('');
    const { data, error: readErr } = await sb.from('comments').select('*')
      .eq('item_id', item.id).order('created_at');
    if (readErr) { toasts.show(readErr.message); return; }
    setComments((data ?? []) as Comment[]);
  };

  const saveTitle = async () => {
    const clean = titleDraft.trim();
    if (!clean || clean === item.title) { setTitleDraft(item.title); return; }
    const { error } = await sb.from('items').update({ title: clean }).eq('id', item.id);
    if (error) { toasts.show(error.message); return; }
    onChanged();
  };

  const saveBody = async () => {
    setEditingBody(false);
    const clean = bodyDraft.trim() || null;
    if (clean === item.body) return;
    const { error } = await sb.from('items').update({ body: clean }).eq('id', item.id);
    if (error) { toasts.show(error.message); return; }
    onChanged();
  };

  return (
    <Sheet title={item.title} onClose={onClose}>
      <div className="flex items-center gap-2 mb-1">
        <button
          onClick={() => { navigator.clipboard?.writeText(item.id).then(() => toasts.show('Скопировано'), () => {}); }}
          className="text-micro font-mono text-(--color-muted) hover:text-(--color-ink)"
          aria-label={`Скопировать ${item.id}`}
        >
          {item.id}
        </button>
        <div className="ml-auto flex items-center gap-1">
          <TaskActions item={item} onChanged={onChanged} onClose={onClose} />
          <span className="hidden lg:inline-flex"><SheetCloseButton /></span>
        </div>
      </div>
      <AutoTextarea
        value={titleDraft}
        onChange={e => setTitleDraft(e.target.value)}
        onBlur={saveTitle}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
        aria-label="Заголовок"
        className="w-full text-title bg-transparent rounded-xl px-2 -mx-2 py-1 outline-none
                   hover:bg-(--color-raised) focus:bg-(--color-raised)"
      />

      <div className="mt-3 mb-4 space-y-1">
        <PropertySelect
          label="Статус" value={item.status}
          options={COLUMNS.map(c => ({ value: c.key, label: c.label, icon: STATUS_ICON[c.key] }))}
          onChange={move}
        />
        <PropertySelect
          label="Тип" value={item.type}
          options={[
            { value: 'task', label: 'Задача', icon: CheckSquare },
            { value: 'bug', label: 'Баг', icon: Bug },
            { value: 'chore', label: 'Долг', icon: Wrench },
          ]}
          onChange={setType}
        />
        <PropertySelect
          label="Эпик" value={item.epic_id ?? ''}
          options={[{ value: '', label: 'Без эпика' },
            ...selectableEpics(epics, allItems, item.epic_id).map(ep => ({ value: ep.id, label: ep.title }))]}
          onChange={setEpic}
          trailing={item.epic_id && onOpenEpic ? (
            <Button variant="ghost" size="icon" aria-label="Открыть эпик" onClick={() => onOpenEpic(item.epic_id!)}>
              <ArrowSquareOut size={18} />
            </Button>
          ) : null}
        />
        {item.blocks.length > 0 && (
          <div className="flex items-center gap-3 min-h-10">
            <span className="w-24 shrink-0 text-meta text-(--color-muted)">Блокирует</span>
            <div className="flex flex-wrap gap-1.5">
              {item.blocks.map(b => (
                <span key={b} className="px-2.5 h-7 inline-flex items-center rounded-full bg-(--color-raised) text-micro font-mono">{b}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      <section className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-meta text-(--color-muted)">Описание</h3>
          {item.body && !editingBody && (
            <Button variant="ghost" size="sm" onClick={() => setEditingBody(true)}>Изменить</Button>
          )}
        </div>
        {editingBody ? (
          <AutoTextarea
            autoFocus
            value={bodyDraft}
            onChange={e => setBodyDraft(e.target.value)}
            onBlur={saveBody}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.blur(); }}
            placeholder="Добавить описание"
            className="w-full min-h-24 p-3 rounded-xl bg-(--color-raised) text-body outline-none
                       focus:ring-2 focus:ring-(--color-accent)"
          />
        ) : item.body ? (
          <Markdown text={item.body} className="text-body" />
        ) : (
          <button onClick={() => setEditingBody(true)} className="text-body text-(--color-muted) hover:text-(--color-ink)">
            Добавить описание
          </button>
        )}
      </section>

      {item.checklist.length > 0 && (
        <section className="mb-5">
          <h3 className="text-meta text-(--color-muted) mb-1.5">
            Чеклист · {item.checklist.filter(s => s.done).length} из {item.checklist.length}
          </h3>
          <ul className="space-y-0.5">
            {item.checklist.map((s, i) => (
              <li key={i}>
                <button
                  role="checkbox" aria-checked={s.done}
                  onClick={() => toggleCheck(i)}
                  className="w-full flex items-start gap-2.5 py-1.5 px-1 rounded-xl text-left text-body hover:bg-(--color-raised)"
                >
                  {s.done
                    ? <CheckCircle size={20} weight="fill" className="shrink-0 text-(--color-accent)" />
                    : <Circle size={20} className="shrink-0 text-(--color-muted)" />}
                  <span className={s.done ? 'text-(--color-muted) line-through' : ''}>{s.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="pb-20">
        <h3 className="text-meta text-(--color-muted) mb-2">Комментарии</h3>
        {comments.length === 0 && <p className="text-meta text-(--color-muted)">Пока нет.</p>}
        <ul className="space-y-3">
          {comments.map(c => (
            <li key={c.id}>
              <div className="flex items-baseline gap-2 text-micro text-(--color-muted)">
                <span className="font-semibold text-(--color-ink-2)">{c.author === 'claude' ? 'Claude' : 'Ты'}</span>
                <time dateTime={c.created_at} title={fullDate(c.created_at)}>{relTime(c.created_at, new Date())}</time>
              </div>
              <Markdown text={c.body} className="text-body mt-0.5" />
            </li>
          ))}
        </ul>
      </section>

      {/* Поле комментария прилипает к низу шторки: писать можно, не
          проматывая длинное описание. */}
      <div className="sticky bottom-0 -mx-5 px-5 pt-2 pb-1 bg-(--color-surface) border-t border-(--color-line)">
        <form
          onSubmit={e => { e.preventDefault(); sendComment(); }}
          className="flex items-end gap-2"
        >
          <AutoTextarea
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); } }}
            placeholder="комментарий"
            aria-label="Комментарий"
            disabled={sending}
            className="flex-1 min-w-0 max-h-40 py-2 px-3 rounded-xl bg-(--color-raised) text-body outline-none
                       focus:ring-2 focus:ring-(--color-accent)"
          />
          <Button type="submit" variant="primary" size="icon" aria-label="Отправить"
                  disabled={!newComment.trim() || sending} className="shrink-0">
            <PaperPlaneRight size={18} weight="fill" />
          </Button>
        </form>
      </div>
    </Sheet>
  );
}

function TaskActions({ item, onChanged, onClose }: { item: Item; onChanged: () => void; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'idle' | 'confirm'>('idle');

  const run = async (patch: Partial<Item>) => {
    const { error } = await sb.from('items').update(patch).eq('id', item.id);
    if (error) { toasts.show(error.message); return; }
    onChanged();
  };

  const onDelete = async (e: Event) => {
    const next = confirmStep(step, 'delete');
    setStep(next.state);
    // Первый шаг не закрывает меню — пункт меняется на подтверждение.
    if (!next.perform) { e.preventDefault(); return; }
    const { error } = await sb.from('items').delete().eq('id', item.id);
    if (error) { toasts.show(error.message); return; }
    onChanged();
    onClose();
  };

  return (
    <Menu.Root open={open} onOpenChange={o => { setOpen(o); if (!o) setStep(confirmStep(step, 'close').state); }}>
      <Menu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="Действия с задачей"><DotsThree size={20} weight="bold" /></Button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className="z-[60] min-w-56 rounded-2xl bg-(--color-surface) shadow-menu p-1.5">
          {item.status === 'done' && !item.archived_at && (
            <Menu.Item onSelect={() => run({ archived_at: new Date().toISOString() })} className={itemCls}>
              <Archive size={18} className="text-(--color-muted)" />В архив
            </Menu.Item>
          )}
          {item.archived_at && (
            <Menu.Item onSelect={() => run({ status: 'doing', archived_at: null })} className={itemCls}>
              <ArrowCounterClockwise size={18} className="text-(--color-muted)" />Вернуть в работу
            </Menu.Item>
          )}
          <Menu.Item onSelect={onDelete} className={`${itemCls} text-(--color-danger)`}>
            <Trash size={18} />{step === 'confirm' ? 'Удалить навсегда?' : 'Удалить'}
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

const itemCls = `flex items-center gap-2.5 h-10 px-3 rounded-xl outline-none cursor-pointer text-body
                 data-[highlighted]:bg-(--color-raised)`;
