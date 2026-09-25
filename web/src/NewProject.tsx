import { useState } from 'react';
import { sb } from './supabase';
import { slugify, prefixify } from './slug';
import { Button } from './ui/Button';
import { toasts } from './ui/toast';

// Раньше форма сама разворачивалась по кнопке «Новый проект»; теперь она
// шаг внутри шторки проектов (ProjectDrawer держит open/назад), здесь
// только поля и отправка.
export function NewProject({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [prefix, setPrefix] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [prefixTouched, setPrefixTouched] = useState(false);
  const [repoPath, setRepoPath] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const onName = (v: string) => {
    setName(v);
    const auto = slugify(v);
    if (!slugTouched) setSlug(auto);
    if (!prefixTouched) setPrefix(prefixify(auto));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim() || !prefix.trim()) {
      toasts.show('Напиши имя — слаг и префикс подставятся сами');
      return;
    }
    setBusy(true);
    const { error } = await sb.from('projects').insert({
      id: slug.trim(),
      name: name.trim(),
      prefix: prefix.trim().toUpperCase(),
      description: description.trim() || null,
      repo_path: repoPath.trim() || null,
    });
    setBusy(false);
    if (error) { toasts.show(error.message); return; }

    const created = slug.trim();
    setName(''); setSlug(''); setPrefix('');
    setSlugTouched(false); setPrefixTouched(false);
    setRepoPath(''); setDescription('');
    onCreated(created);
  };

  return (
    <form onSubmit={submit} className="w-full space-y-2">
      <input
        autoFocus
        value={name}
        onChange={e => onName(e.target.value)}
        placeholder="имя: Семейное приложение"
        className="w-full h-10 px-3 rounded-xl bg-(--color-raised) text-body
                   outline-none focus:ring-2 focus:ring-(--color-accent)"
      />
      <div className="flex gap-2">
        <input
          value={slug}
          onChange={e => { setSlug(e.target.value); setSlugTouched(true); }}
          placeholder="слаг"
          className="flex-1 h-10 px-3 rounded-xl bg-(--color-raised) text-body
                     outline-none focus:ring-2 focus:ring-(--color-accent)"
        />
        <input
          value={prefix}
          onChange={e => { setPrefix(e.target.value); setPrefixTouched(true); }}
          placeholder="префикс"
          className="w-24 h-10 px-3 rounded-xl bg-(--color-raised) text-body
                     outline-none focus:ring-2 focus:ring-(--color-accent)"
        />
      </div>
      <input
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="описание (необязательно)"
        className="w-full h-10 px-3 rounded-xl bg-(--color-raised) text-body
                   outline-none focus:ring-2 focus:ring-(--color-accent)"
      />
      <input
        value={repoPath}
        onChange={e => setRepoPath(e.target.value)}
        placeholder="путь к папке на компе (необязательно)"
        className="w-full h-10 px-3 rounded-xl bg-(--color-raised) text-body
                   outline-none focus:ring-2 focus:ring-(--color-accent)"
      />
      <p className="text-micro text-(--color-muted)">
        Путь нужен, чтобы я сама находила проект по рабочей папке — без него
        придётся называть проект явно.
      </p>

      <Button type="submit" variant="primary" disabled={busy} className="w-full justify-center">
        {busy ? '…' : 'Создать'}
      </Button>
    </form>
  );
}
