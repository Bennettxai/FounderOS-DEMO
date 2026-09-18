/**
 * Theme-remappable knowledge-graph colors.
 *
 * Life-area hues arrive on graph nodes as literal hex (lib/life-map.ts is the
 * one place color enters the otherwise black & white OS). Wrapping each hex in
 * a per-hex CSS variable lets a theme re-skin the graph from its token block in
 * app/globals.css — Daylight (mono-light) swaps every hue for its optical
 * inversion so the graph reads like the inverted G-Brain cover —
 * while every other theme falls through to the original hex, and flipping
 * data-theme re-colors the graph live with no re-render.
 */
const HEX6 = /^#([0-9a-fA-F]{6})$/;

export function themedNodeColor(color: string): string {
  const m = HEX6.exec(color);
  return m ? `var(--kg-c-${m[1].toLowerCase()}, ${color})` : color;
}
