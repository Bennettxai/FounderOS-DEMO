import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { themedNodeColor } from '@/lib/kg-colors';

/**
 * Daylight G-Brain graph pass (2026-08-20): the operator wants the knowledge graph
 * in mono-light to read like the inverted cover graph from the Zero API
 * carousel — cyan tools, ink agents, royal-blue humans, teal memory core, and
 * every life-area hue swapped for its optical inversion. Data colors route
 * through per-hex CSS vars so only mono-light remaps them and live theme
 * switching keeps working.
 */
describe('knowledge-graph themed colors', () => {
  test('themedNodeColor wraps hex colors in a per-hex CSS var with the hex as fallback', () => {
    expect(themedNodeColor('#ef4444')).toBe('var(--kg-c-ef4444, #ef4444)');
    expect(themedNodeColor('#EF4444')).toBe('var(--kg-c-ef4444, #EF4444)');
  });

  test('themedNodeColor passes non-hex colors through untouched', () => {
    expect(themedNodeColor('var(--brain-1)')).toBe('var(--brain-1)');
    expect(themedNodeColor('#abc')).toBe('#abc'); // only 6-digit hex is remappable
  });

  test('Daylight remaps every life-area hue to its inversion, plus the graph chrome', () => {
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
    const block = css.match(/:root\[data-theme='mono-light'\] \{[^}]+\}/)?.[0] ?? '';
    // the six life-area inversions (Sales→cyan, Comms→amber, Finances→magenta,
    // TECH→lime, Clients→crimson, Marketing→royal blue) + white→ink
    for (const v of [
      '--kg-c-ef4444',
      '--kg-c-3b82f6',
      '--kg-c-22c55e',
      '--kg-c-a855f7',
      '--kg-c-14b8a6',
      '--kg-c-f59e0b',
      '--kg-c-fafafa',
      '--kg-mem',
      '--kg-synapse',
      '--kg-person',
      '--kg-employee',
    ]) {
      expect(block, v).toContain(`${v}:`);
    }
    // tools go light cyan, not the old red
    expect(block).not.toContain('--kg-tool: #d92d20');
  });

  test('the graph components resolve node colors through themedNodeColor and the chrome vars', () => {
    const kg = readFileSync(join(process.cwd(), 'components/KnowledgeGraph.tsx'), 'utf8');
    expect(kg).toContain('themedNodeColor');
    expect(kg).toContain('var(--kg-mem');
    expect(kg).toContain('var(--kg-synapse');
    expect(kg).toContain('var(--kg-person');
    expect(kg).toContain('var(--kg-employee');
    const neural = readFileSync(join(process.cwd(), 'components/NeuralGraph.tsx'), 'utf8');
    expect(neural).not.toContain("'#e35c35'");
  });
});
