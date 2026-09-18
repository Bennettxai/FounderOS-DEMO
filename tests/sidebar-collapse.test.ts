import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const sidebar = read('components/Sidebar.tsx');
const layout = read('app/layout.tsx');

/**
 * the operator, 2026-08-14: collapse the rail to icons only, name them on hover,
 * and let the right border be dragged. Verified in a browser at the time
 * (232 -> 56 collapsed, drag to 340, tooltip visible); these pin the parts
 * that would silently rot.
 */
describe('sidebar collapse and resize', () => {
  test('the page follows the rail instead of hardcoding its width twice', () => {
    // the old ml-[232px] could not track a dragged width
    expect(layout).not.toMatch(/ml-\[232px\]/);
    expect(layout).toMatch(/marginLeft: 'var\(--sidebar-w, 232px\)'/);
    expect(sidebar).toMatch(/setProperty\('--sidebar-w'/);
  });

  test('collapsing hides the words but keeps the icons', () => {
    expect(sidebar).toMatch(/\{collapsed \? null : label\}/);
    expect(sidebar).toMatch(/COLLAPSED_W = 56/);
  });

  test('the hover label is rendered fixed, because the nav scroll box clips', () => {
    // an absolutely positioned label inside overflow-y-auto renders as a sliver
    expect(sidebar).toMatch(/fixed z-50/);
    expect(sidebar).toMatch(/onMouseEnter/);
    expect(sidebar).toMatch(/getBoundingClientRect\(\)\.top/);
  });

  test('the label cannot linger after expanding', () => {
    expect(sidebar).toMatch(/if \(!collapsed\) setTip\(null\)/);
  });

  test('the drag handle is bounded and resets on double click', () => {
    expect(sidebar).toMatch(/aria-label="Resize sidebar"/);
    expect(sidebar).toMatch(/cursor-col-resize/);
    expect(sidebar).toMatch(/Math\.min\(MAX_W, Math\.max\(MIN_W, ev\.clientX\)\)/);
    expect(sidebar).toMatch(/onDoubleClick=\{\(\) => setWidth\(DEFAULT_W\)\}/);
  });

  test('drag cleans up after itself rather than leaving global state set', () => {
    expect(sidebar).toMatch(/removeEventListener\('mousemove', onMove\)/);
    expect(sidebar).toMatch(/removeEventListener\('mouseup', onUp\)/);
    expect(sidebar).toMatch(/document\.body\.style\.userSelect = ''/);
  });

  test('the shape survives a reload', () => {
    expect(sidebar).toMatch(/localStorage\.getItem\('founderos\.sidebar\.collapsed'\)/);
    expect(sidebar).toMatch(/localStorage\.setItem\('founderos\.sidebar\.w'/);
  });

  test('the toggle is reachable without a mouse', () => {
    expect(sidebar).toMatch(/aria-label=\{collapsed \? 'Expand sidebar' : 'Collapse sidebar'\}/);
    expect(sidebar).toMatch(/aria-expanded=\{!collapsed\}/);
  });
});
