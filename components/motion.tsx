import type { CSSProperties, ElementType, ReactNode } from 'react';

/**
 * Slab motion, OS-wide. The brand-deals slab's entry beat as a
 * shared wrapper: the element rises in (opacity + 10px + a hair of scale) on
 * the house ease, staggered by its index at 90ms a step. Server-safe: it is
 * a class and a CSS variable, nothing else. Reduced motion lands instantly
 * (see the.rise guard in globals.css).
 *
 * <Rise i={2} className="rise-card..."> a card that also lifts on hover
 * <Rise as="section" i={4} className="mb-5">
 */
export function Rise({
  i = 0,
  as,
  className = '',
  style,
  children,
  ...rest
}: {
  i?: number;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
} & Record<string, unknown>) {
  const Tag = (as ?? 'div') as ElementType;
  const vars = { ...style, '--rise-i': i } as CSSProperties;
  return (
    <Tag className={`rise ${className}`.trim()} style={vars} {...rest}>
      {children}
    </Tag>
  );
}
