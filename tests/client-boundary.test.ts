import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Nothing a 'use client' component imports (transitively, value imports
 * only) may pull a node built-in or a server-only package. tsc and vitest
 * are blind to this — only `next build` fails, and it failed on the host on
 * 2026-08-25 when CommsTabs reached lib/connectors/plaud.ts through the
 * recordings board. This walks the import graph so the suite catches it.
 */

const ROOT = process.cwd();
const EXT = ['.ts', '.tsx', '.js', '.jsx'];
const SERVER_ONLY = /^(node:|fs$|path$|os$|child_process$|crypto$|better-sqlite3$|net$|tls$|dns$)/;

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null; // a package: not walked
  for (const candidate of [base, ...EXT.map((e) => base + e), ...EXT.map((e) => path.join(base, 'index' + e))]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Value imports only — `import type` and `import { type X }` are erased. */
function valueImports(file: string): string[] {
  const src = fs.readFileSync(file, 'utf8');
  const out: string[] = [];
  const re = /^\s*(?:import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[1]) continue;
    const clause = m[2];
    // `{ type A, type B }` with nothing else is also erased
    const inner = clause.match(/^\{([^}]*)\}$/);
    if (inner && inner[1].split(',').every((s) => !s.trim() || s.trim().startsWith('type '))) continue;
    out.push(m[3]);
  }
  const sideEffect = /^\s*import\s*['"]([^'"]+)['"]/gm;
  while ((m = sideEffect.exec(src))) out.push(m[1]);
  return out;
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(p));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(p);
  }
  return out;
}

function clientEntries(): string[] {
  return [...listFiles(path.join(ROOT, 'components')), ...listFiles(path.join(ROOT, 'app'))].filter((f) =>
    /^\s*['"]use client['"]/.test(fs.readFileSync(f, 'utf8')),
  );
}

/** Returns the first server-only import reached, with the path that got there. */
function findLeak(entry: string): string | null {
  const seen = new Set<string>();
  const stack: { file: string; trail: string[] }[] = [{ file: entry, trail: [] }];
  while (stack.length) {
    const { file, trail } = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of valueImports(file)) {
      if (SERVER_ONLY.test(spec)) return [...trail, path.relative(ROOT, file), spec].join(' → ');
      const next = resolveImport(file, spec);
      if (next) stack.push({ file: next, trail: [...trail, path.relative(ROOT, file)] });
    }
  }
  return null;
}

describe("client components never reach node built-ins ('use client' import graph)", () => {
  const entries = clientEntries();
  test('there are client components to check', () => {
    expect(entries.length).toBeGreaterThan(5);
  });
  for (const entry of entries) {
    test(path.relative(ROOT, entry), () => {
      expect(findLeak(entry)).toBeNull();
    });
  }
});
