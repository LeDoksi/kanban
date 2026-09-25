import { Bug, Wrench } from '@phosphor-icons/react';
import type { Item } from '../supabase';

// Баг и акцент близки по тону, поэтому тип всегда несёт иконку, а не
// только цвет. Обычная задача бейджа не получает.
export function TypeBadge({ type }: { type: Item['type'] }) {
  if (type === 'task') return null;
  const bug = type === 'bug';
  const Icon = bug ? Bug : Wrench;
  return (
    <span className={`inline-flex items-center gap-1 text-micro ${
      bug ? 'text-(--color-danger)' : 'text-(--color-muted)'
    }`}>
      <Icon size={13} />
      {bug ? 'баг' : 'долг'}
    </span>
  );
}
