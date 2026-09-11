import { useState } from 'react';
import { sb } from './supabase';

export function NewProject({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !name.trim() || !prefix.trim()) {
      setError('Заполни слаг, имя и префикс');
      return;
    }
    setBusy(true);
    const { error } = await sb.from('projects').insert({
      id: id.trim(),
      name: name.trim(),
      prefix: prefix.trim().toUpperCase(),
      description: description.trim() || null,
      repo_path: repoPath.trim() || null,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }

    const created = id.trim();
    setId(''); setName(''); setPrefix(''); setRepoPath('');
    setDescription(''); setOpen(false);
    onCreated(created);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="h-8 px-3 rounded-lg border border-(--color-line) text-sm"
      >
        Новый проект
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="w-72 space-y-2">
      <input
        autoFocus
        value={id}
        onChange={e => { setId(e.target.value); setError(''); }}
        placeholder="слаг: family-app"
        className="w-full h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                   border border-(--color-line) outline-none"
      />
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="имя: Семейное приложение"
        className="w-full h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                   border border-(--color-line) outline-none"
      />
      <input
        value={prefix}
        onChange={e => setPrefix(e.target.value)}
        placeholder="префикс: FAM"
        className="w-full h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                   border border-(--color-line) outline-none"
      />
      <input
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="описание (необязательно)"
        className="w-full h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                   border border-(--color-line) outline-none"
      />
      <input
        value={repoPath}
        onChange={e => setRepoPath(e.target.value)}
        placeholder="путь к папке на компе (необязательно)"
        className="w-full h-8 px-2 rounded-lg bg-(--color-panel) text-sm
                   border border-(--color-line) outline-none"
      />
      <p className="text-[11px] text-(--color-muted)">
        Путь нужен, чтобы я сама находила проект по рабочей папке — без него
        придётся называть проект явно.
      </p>

      {error && <p className="text-xs text-(--color-danger-ink)">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 h-8 rounded-lg bg-(--color-ink)
                     text-(--color-ground) text-sm"
        >
          {busy ? '…' : 'Создать'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(''); }}
          className="h-8 px-3 rounded-lg border border-(--color-line)
                     text-sm text-(--color-muted)"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
