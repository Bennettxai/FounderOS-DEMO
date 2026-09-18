import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * Every connector GET fetch must opt out of Next's prod Data Cache with
 * `cache: 'no-store'`. Learned twice now: the board served stale org state,
 * then PayKit served a months-old customer list in production and hid real
 * income behind a "live · $0" card. In dev nothing caches, so this class of
 * bug ships invisibly — hence a source-level guard instead of trusting review
 * to catch the next one.
 *
 * POST/PATCH/DELETE fetches are exempt: Next never caches them.
 */
const CONNECTORS = join(process.cwd(), 'lib', 'connectors');

/** Each `await fetch(` call and enough of its options to judge it. */
function fetchCalls(src: string): string[] {
  const out: string[] = [];
  let i = src.indexOf('await fetch(');
  while (i !== -1) {
    out.push(src.slice(i, i + 400));
    i = src.indexOf('await fetch(', i + 1);
  }
  return out;
}

const isWrite = (call: string): boolean => /method:\s*'(POST|PATCH|PUT|DELETE)'/.test(call);

describe('connector fetches are cache-honest', () => {
  const files = readdirSync(CONNECTORS).filter((f) => f.endsWith('.ts'));

  for (const file of files) {
    const src = readFileSync(join(CONNECTORS, file), 'utf8');
    const gets = fetchCalls(src).filter((c) => !isWrite(c));
    if (gets.length === 0) continue;

    test(`${file}: every GET fetch carries cache: 'no-store'`, () => {
      for (const call of gets) {
        expect(call, `un-annotated GET fetch in ${file}:\n${call.slice(0, 160)}`).toContain(
          "cache: 'no-store'",
        );
      }
    });
  }
});
