import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary';
type Size = 'sm' | 'md';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-(--color-accent) text-(--color-on-accent)',
  secondary: 'bg-(--color-raised) border border-(--color-line)',
};

const SIZE: Record<Size, string> = {
  sm: 'h-7 px-2 text-2xs',
  md: 'h-8 px-3 text-sm',
};

export function Button(
  { variant = 'secondary', size = 'md', className = '', ...props }:
    ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size },
) {
  return (
    <button
      {...props}
      className={`rounded-lg transition-colors disabled:opacity-40
                 disabled:pointer-events-none focus-visible:outline-2
                 focus-visible:outline-offset-2
                 focus-visible:outline-(--color-accent)
                 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    />
  );
}
