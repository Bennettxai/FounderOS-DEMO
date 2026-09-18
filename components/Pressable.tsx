import Link from 'next/link';
import type { ComponentProps, ElementType, ReactNode } from 'react';

type Tone = 'primary' | 'secondary' | 'ghost' | 'row';
type Kind = 'c' | 'r';

const TONE: Record<Tone, string> = {
  primary:
    'is-primary inline-flex h-[26px] items-center gap-1.5 rounded-ctl border border-os-text px-3 font-mono text-[10.5px] font-bold text-os-ink',
  secondary:
    'is-dark inline-flex h-[26px] items-center gap-1.5 rounded-ctl border border-os-border bg-os-bg px-2.5 font-mono text-[10.5px] font-semibold text-os-muted',
  ghost:
    'is-dark inline-grid h-[26px] w-[26px] place-items-center rounded-ctl border border-transparent bg-transparent text-os-dim hover:border-os-border',
  row: 'is-row block',
};

/** The one clickable primitive of the interaction rebrand: hover lens + press
    sink + focus ring, themed per tone. Renders a Link when given an href. */
export function Pressable<T extends ElementType = 'button'>({
  as,
  tone = 'secondary',
  kind,
  className = '',
  children,
  ...rest
}: { as?: T; tone?: Tone; kind?: Kind; className?: string; children: ReactNode } & Omit<
  ComponentProps<T>,
  'as' | 'children'
>) {
  const Tag: ElementType = as ?? ('href' in rest && rest.href ? Link : 'button');
  const k = kind ?? (tone === 'row' ? 'r' : 'c');
  return (
    <Tag data-lens={k} className={`pressable ${TONE[tone]} ${className}`} {...(rest as object)}>
      {children}
    </Tag>
  );
}

export function Chip({ on, className = '', ...rest }: { on?: boolean } & ComponentProps<'button'>) {
  return (
    <button
      data-lens="c"
      className={`pressable inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[10px] font-semibold active:scale-[.94] ${
        on ? 'border-os-text bg-os-text text-os-ink hover:bg-white' : 'is-dark border-os-border bg-os-bg text-os-muted'
      } ${className}`}
      {...rest}
    />
  );
}
