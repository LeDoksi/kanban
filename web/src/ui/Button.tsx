import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'icon';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-(--color-accent) text-(--color-on-accent) font-medium',
  secondary: 'bg-(--color-raised) text-(--color-ink)',
  ghost: 'text-(--color-muted) hover:text-(--color-ink) hover:bg-(--color-raised)',
  danger: 'text-(--color-danger) hover:bg-(--color-raised)',
};

const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-meta',
  md: 'h-10 px-4 text-body',
  icon: 'size-10 justify-center',
};

// Все кнопки — пилюли. Нажатие чуть проседает (scale 0.98): на телефоне
// это единственный отклик до ответа сети.
export function Button(
  { variant = 'secondary', size = 'md', className = '', ...props }:
    ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size },
) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 rounded-full
                 transition-[transform,background-color,color] duration-150
                 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none
                 focus-visible:outline-2 focus-visible:outline-offset-2
                 focus-visible:outline-(--color-accent)
                 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    />
  );
}
