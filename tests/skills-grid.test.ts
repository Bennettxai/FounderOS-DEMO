import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Mock 5g (the operator, 2026-09-07): /skills drops the grouped icon sections for
 * one filtered card wall — a filter input, All / Claude Code / Operator /
 * Draft chips with live counts, and cards that read eyebrow (source ·
 * scope), status, title, two-line description, footer path-or-owner. The
 * SKILL.md reader modal and download stay exactly as they were.
 */
describe('/skills mock-5g card wall', () => {
  const grid = read('components/SkillsGrid.tsx');
  const page = read('app/skills/page.tsx');

  test('a filter input narrows the wall by text', () => {
    expect(grid).toMatch(/placeholder="filter skills/);
    expect(grid).toMatch(/setQuery/);
  });

  test('All / Claude Code / Operator / Draft chips carry live counts', () => {
    expect(grid).toMatch(/from '@\/components\/Pressable'/);
    expect(grid).toContain("'Claude Code'");
    expect(grid).toContain("'Operator'");
    expect(grid).toContain("'Draft'");
    expect(grid).toMatch(/setFilter/);
  });

  test('cards read eyebrow / status / title / clamped description / footer meta', () => {
    expect(grid).toMatch(/Claude Code · /);
    expect(grid).toMatch(/line-clamp-2/);
    expect(grid).toMatch(/\{c\.meta\}/); // footer path or owner on the card itself
  });

  test('the page tags each card claude vs operator and keeps honest counts', () => {
    expect(page).toMatch(/kind: 'claude'/);
    expect(page).toMatch(/kind: 'operator'/);
  });

  test('no em dashes in the source note', () => {
    expect(page).not.toContain('—');
  });
});
