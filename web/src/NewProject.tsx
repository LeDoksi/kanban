import { useState } from 'react';
import { sb } from './supabase';
import { slugify, prefixify } from './slug';
import { Button } from './ui/Button';

export function NewProject({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [prefix, setPrefix] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [prefixTouched, setPrefixTouched] = useState(false);
  const [repoPath, setRepoPath] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onName = (v: string) => {
    setName(v);
    setError('');
    const auto = slugify(v);
    if (!slugTouched) setSlug(auto);
    if (!prefixTouched) setPrefix(prefixify(auto));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim() || !prefix.trim()) {
      setError('Напиши имя — слаг и префикс подставятся сами');
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
    if (error) { setError(error.message); return; }

    const created = slug.trim();
    setName(''); setSlug(''); setPrefix('');
    setSlugTouched(false); setPrefixTouched(false);
    setRepoPath(''); setDescription(''); setOpen(false);
    onCreated(created);
  };

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Новый проект
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="w-full space-y-2">
      <input
        autoFocus
        value={name}
        onChange={e => onName(e.target.value)}
        placeholder="имя: Семейное приложение"
        className="w-full h-8 px-2 rounded-lg bg-(--color-raised) text-sm
                   border border-(--color-line) outline-none
                   focus:border-(--color-accent)"
      />
      <div className="flex gap-2">
        <input
          value={slug}
          onChange={e => { setSlug(e.target.value); setSlugTouched(true); setError(''); }}
          placeholder="слаг"
          className="flex-1 h-8 px-2 rounded-lg bg-(--color-raised) text-sm
                     border border-(--color-line) outline-none
                     focus:border-(--color-accent)"
        />
        <input
          value={prefix}
          onChange={e => { setPrefix(e.target.value); setPrefixTouched(true); setError(''); }}
          placeholder="префикс"
          className="w-20 h-8 px-2 rounded-lg bg-(--color-raised) text-sm
                     border border-(--color-line) outline-none
                     focus:border-(--color-accent)"
        />
      </div>
      <input
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="описание (необязательно)"
        className="w-full h-8 px-2 rounded-lg bg-(--color-raised) text-sm
                   border border-(--color-line) outline-none
                   focus:border-(--color-accent)"
      />
      <input
        value={repoPath}
        onChange={e => setRepoPath(e.target.value)}
        placeholder="путь к папке на компе (необязательно)"
        className="w-full h-8 px-2 rounded-lg bg-(--color-raised) text-sm
                   border border-(--color-line) outline-none
                   focus:border-(--color-accent)"
      />
      <p className="text-2xs text-(--color-muted)">
        Путь нужен, чтобы я сама находила проект по рабочей папке — без него
        придётся называть проект явно.
      </p>

      {error && <p className="text-xs text-(--color-danger)">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={busy} className="flex-1">
          {busy ? '…' : 'Создать'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => { setOpen(false); setError(''); }}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
