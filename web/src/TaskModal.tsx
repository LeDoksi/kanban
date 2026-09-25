import { useEffect, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { sb, setStatus } from './supabase';
import type { Item, Comment, Epic } from './supabase';
import { selectableEpics } from './epics';
import { Editable } from './Editable';
import { Sheet } from './ui/Sheet';
import { Button } from './ui/Button';
import { Markdown } from './ui/Markdown';
import { relTime } from './time';

const STATUS_LABEL: Record<Item['status'], string> = {
  backlog: 'Backlog', hold: 'Hold', doing: 'В работе',
  waiting: 'Нужно от тебя', done: 'Готово',
};

const TYPE_LABEL: Record<Item['type'], string> = {
  task: 'задача', bug: 'баг', chore: 'долг',
};

export function TaskModal(
  { item, epics, allItems, onClose, onChanged, onOpenEpic }: {
    item: Item; epics: Epic[]; allItems: Item[];
    onClose: () => void; onChanged: () => void;
    onOpenEpic?: (epicId: string) => void;
  },
) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [err, setErr] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingBody, setEditingBody] = useState(false);
  const [titleDraft, setTitleDraft] = useState(item.title);
  const [bodyDraft, setBodyDraft] = useState(item.body ?? '');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    sb.from('comments').select('*')
      .eq('item_id', item.id).order('created_at')
      .then(({ data, error }) => {
        if (error) { setErr(error.message); return; }
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
    if (readErr) { setErr(readErr.message); return; }
    const current = (data?.checklist ?? item.checklist) as typeof item.checklist;
    const list = current.map((s, idx) =>
      idx === i ? { ...s, done: !s.done } : s);
    const { error } = await sb.from('items')
      .update({ checklist: list }).eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
  };

  const move = async (status: Item['status']) => {
    const { error } = await setStatus(item.id, status);
    if (error) { setErr(error.message); return; }
    onChanged();
  };

  const setType = async (type: Item['type']) => {
    const { error } = await sb.from('items').update({ type }).eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
  };

  const setEpic = async (epicId: string) => {
    const { error } = await sb.from('items')
      .update({ epic_id: epicId || null }).eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
  };

  const archive = async () => {
    const { error } = await sb.from('items')
      .update({ archived_at: new Date().toISOString() }).eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
  };

  const restore = async () => {
    const { error } = await sb.from('items')
      .update({ status: 'doing', archived_at: null }).eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
  };

  const remove = async () => {
    if (!confirm(`Удалить «${item.title}» навсегда?`)) return;
    const { error } = await sb.from('items').delete().eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
    onClose();
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
    if (error) { setErr(error.message); return; }
    setNewComment('');
    const { data, error: readErr } = await sb.from('comments').select('*')
      .eq('item_id', item.id).order('created_at');
    if (readErr) { setErr(readErr.message); return; }
    setComments((data ?? []) as Comment[]);
  };

  const saveTitle = async () => {
    setEditingTitle(false);
    const clean = titleDraft.trim();
    if (!clean || clean === item.title) { setTitleDraft(item.title); return; }
    const { error } = await sb.from('items').update({ title: clean }).eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
  };

  const saveBody = async () => {
    setEditingBody(false);
    const clean = bodyDraft.trim() || null;
    if (clean === item.body) return;
    const { error } = await sb.from('items').update({ body: clean }).eq('id', item.id);
    if (error) { setErr(error.message); return; }
    onChanged();
  };

  return (
    <Sheet onClose={onClose} maxWidth="max-w-lg">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <span className="text-micro font-mono text-(--color-muted)">
            {item.id}
          </span>
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); }}
              className="block w-full text-title font-medium bg-transparent
                         border-b border-(--color-line) outline-none"
            />
          ) : (
            <Editable
              as="h2"
              onEdit={() => setEditingTitle(true)}
              className="text-title font-medium cursor-text"
            >
              {item.title}
            </Editable>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Закрыть" className="-mr-2 -mt-1">
          <X size={20} />
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {(Object.keys(STATUS_LABEL) as Item['status'][]).map(s => (
          <button
            key={s}
            onClick={() => move(s)}
            className={`text-micro px-2 py-1 rounded-full border ${
              item.status === s
                ? 'border-(--color-accent) text-(--color-accent-ink)'
                : 'border-(--color-line) text-(--color-muted)'
            }`}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5 mb-4">
        {(Object.keys(TYPE_LABEL) as Item['type'][]).map(t => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`text-micro px-2 py-1 rounded-full border ${
              item.type === t
                ? 'border-(--color-accent) text-(--color-accent-ink)'
                : 'border-(--color-line) text-(--color-muted)'
            }`}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {/* select сжимается, а не кнопка: с длинным названием эпика select
          растягивался на всю ширину и выталкивал «открыть эпик» за край —
          на телефоне модалку приходилось листать вбок (KAN-111). */}
      <div className="flex items-center gap-2 mb-3">
        <select
          value={item.epic_id ?? ''}
          onChange={e => setEpic(e.target.value)}
          className="min-w-0 flex-1 h-7 px-1.5 rounded text-micro bg-transparent
                     border border-(--color-line) text-(--color-muted) truncate"
        >
          <option value="">— без эпика —</option>
          {selectableEpics(epics, allItems, item.epic_id).map(ep => (
            <option key={ep.id} value={ep.id}>{ep.title}</option>
          ))}
        </select>
        {item.epic_id && onOpenEpic && (
          <button
            onClick={() => onOpenEpic(item.epic_id!)}
            className="shrink-0 whitespace-nowrap text-meta text-(--color-muted) hover:text-(--color-ink) underline"
          >
            открыть эпик
          </button>
        )}
      </div>

      {err && <p className="text-body text-(--color-danger) mb-3">{err}</p>}

      {editingBody ? (
        <textarea
          autoFocus
          value={bodyDraft}
          onChange={e => setBodyDraft(e.target.value)}
          onBlur={saveBody}
          onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) saveBody(); }}
          rows={3}
          placeholder="описание"
          className="w-full p-2 mb-4 rounded-lg bg-(--color-raised) text-body
                     border border-(--color-line) outline-none resize-none
                     focus:border-(--color-accent)"
        />
      ) : item.body ? (
        <Editable
          as="div"
          onEdit={() => setEditingBody(true)}
          className="text-body mb-4 cursor-text min-h-[1.5em]"
        >
          <Markdown text={item.body} />
        </Editable>
      ) : (
        <Editable
          as="p"
          onEdit={() => setEditingBody(true)}
          className="text-body mb-4 cursor-text min-h-[1.5em]"
        >
          <span className="text-(--color-muted)">описание — клик, чтобы добавить</span>
        </Editable>
      )}

      {item.blocks.length > 0 && (
        <p className="text-meta text-(--color-muted) mb-3">
          блокирует: {item.blocks.join(', ')}
        </p>
      )}

      {item.checklist.length > 0 && (
        <ul className="space-y-1.5 mb-4">
          {item.checklist.map((s, i) => (
            <li key={i} className="flex items-center gap-2 text-body">
              <input
                type="checkbox"
                checked={s.done}
                onChange={() => toggleCheck(i)}
              />
              <span className={s.done ? 'text-(--color-muted) line-through' : ''}>
                {s.text}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-(--color-line) pt-3">
        {comments.length > 0 && (
          <div className="space-y-2 mb-2">
            {comments.map(c => (
              <div key={c.id} className="text-meta">
                <span className="text-(--color-muted)">
                  {relTime(c.created_at, new Date())} {c.author}:
                </span>{' '}
                <Markdown text={c.body} className="inline" />
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') sendComment(); }}
            placeholder="комментарий"
            disabled={sending}
            // min-w-0 — иначе flex-1 не даёт полю сжаться меньше его
            // content-width, и кнопка «Отправить» вылезает за модалку
            // на узких экранах (390px).
            className="flex-1 min-w-0 h-8 px-2 rounded-lg bg-(--color-raised) text-body
                       border border-(--color-line) outline-none
                       focus:border-(--color-accent)"
          />
          <Button
            variant="primary"
            size="sm"
            className="shrink-0"
            onClick={sendComment}
            disabled={!newComment.trim() || sending}
          >
            Отправить
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-(--color-line)">
        {item.status === 'done' && !item.archived_at && (
          <button onClick={archive} className="text-meta text-(--color-muted) hover:text-(--color-ink)">
            В архив
          </button>
        )}
        {item.archived_at && (
          <button onClick={restore} className="text-meta text-(--color-muted) hover:text-(--color-ink)">
            Вернуть в работу
          </button>
        )}
        <button onClick={remove} className="text-meta text-(--color-danger) ml-auto">
          Удалить
        </button>
      </div>
    </Sheet>
  );
}
