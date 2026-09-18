import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Every component must be imported somewhere — no dead files. If a component is
// intentionally kept unused (rare), add its basename here with a reason.
const KNOWN_ORPHANS: string[] = [
  // The old unified /comms feed, superseded by the per-source lane board
  // (CommsBoard + SlackClientBoard). Kept for a one-line revert until the board
  // is proven out; delete both this entry and the file once it is.
  'CommsGravity',
  // The per-source lane board, superseded by the three-pane messaging view
  // (CommsThreePane — interaction rebrand step 3). Kept for a one-line revert
  // until the panes are proven out; delete both this entry and the file then.
  'CommsBoard',
  // The combined audience graph left the home console in the interaction
  // rebrand (Needs You / Interject / Done today took the fold). /social still
  // covers the data; kept for a one-line revert until the operator signs off on the
  // new home, then delete both this entry and the file.
  'HomeSocialGraph',
];

const ROOT = process.cwd();

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(full, out);
    else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('no orphaned components', () => {
  const corpus = [...sourceFiles(path.join(ROOT, 'app')), ...sourceFiles(path.join(ROOT, 'components'))].map((f) => ({
    f,
    text: readFileSync(f, 'utf8'),
  }));
  const components = readdirSync(path.join(ROOT, 'components')).filter((n) => n.endsWith('.tsx'));

  function isImported(base: string, selfPath: string): boolean {
    // matches `from '.../Base'` and `import('.../Base')`, alias or relative
    const re = new RegExp(`(from|import\\()\\s*['"][^'"]*/${base}['"]`);
    return corpus.some(({ f, text }) => f !== selfPath && re.test(text));
  }

  const orphans = components
    .map((n) => n.replace(/\.tsx$/, ''))
    .filter((base) => !isImported(base, path.join(ROOT, 'components', `${base}.tsx`)));

  test('every component is imported somewhere (except flagged known orphans)', () => {
    const unexpected = orphans.filter((o) => !KNOWN_ORPHANS.includes(o));
    expect(unexpected, `unexpected orphaned component(s): ${unexpected.join(', ')}`).toEqual([]);
  });

  test('the known-orphan allowlist has no stale entries', () => {
    for (const base of KNOWN_ORPHANS) {
      expect(components, `${base} allowlisted but file is gone — remove from KNOWN_ORPHANS`).toContain(`${base}.tsx`);
      expect(orphans, `${base} is no longer an orphan — remove from KNOWN_ORPHANS`).toContain(base);
    }
  });
});
