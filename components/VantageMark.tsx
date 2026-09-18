import type { SVGProps } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * The Vantage logo (public/vantage-mark.png, from the operator's local
 * vantage-case-studies folder) as a drop-in LucideIcon: a nested <svg> with
 * an <image> works both in HTML chrome (legend chips, directory rows) and
 * inside the graph's SVG canvas, where a raw <img> would be invalid. The
 * source bitmap is mint, but the mark renders WHITE in the UI
 * — the filter flattens it to pure white, alpha preserved.
 */
function VantageMarkBase(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      {/* mark-adaptive: white on dark canvases, black on the light themes.
          The filter lives in globals.css because an SVG <image> cannot be
          reached by a Tailwind class. */}
      <image
        href="/vantage-mark.png"
        x={1.5}
        y={1.5}
        width={21}
        height={21}
        preserveAspectRatio="xMidYMid meet"
        className="mark-adaptive"
      />
    </svg>
  );
}

export const VantageMark = VantageMarkBase as unknown as LucideIcon;
