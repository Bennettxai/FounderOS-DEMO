import type { SVGProps } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * The OS mark — the operator's Founder OS brand emblem: the chrome yin-yang circle,
 * extracted from the brand asset onto transparent (public/os-emblem.png) so it
 * drops cleanly onto the dark UI. `color` is kept for API compatibility but no
 * longer inks the mark (the emblem is chrome). The OS logo only — never the
 * "Founder" wordmark.
 */
export function OsMark({ size = 34, className }: { size?: number; color?: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/os-emblem.png"
      alt="Founder OS"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain' }}
      className={className}
    />
  );
}

/**
 * The same emblem as a drop-in LucideIcon — a nested <svg><image> so it can
 * ride inside the knowledge graph's SVG canvas (where a raw <img> is invalid)
 * and in HTML chrome alike. Board-agent nodes wear this.
 */
function OsMarkGlyphBase(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      {/* mark-adaptive: the chrome emblem reads near-white, which vanishes on
          the light themes, so it flattens to white on dark and black on light: without this the board agents disappeared in the light theme. */}
      <image
        href="/os-emblem.png"
        x={1}
        y={1}
        width={22}
        height={22}
        preserveAspectRatio="xMidYMid meet"
        className="mark-adaptive"
      />
    </svg>
  );
}

export const OsMarkGlyph = OsMarkGlyphBase as unknown as LucideIcon;
