import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

describe('HTTP security boundary', () => {
  test('credential management exists only under the auth-gated admin API', () => {
    expect(existsSync(path.join(process.cwd(), 'app/api/keys/route.ts'))).toBe(false);
    expect(existsSync(path.join(process.cwd(), 'app/api/admin/keys/route.ts'))).toBe(true);
    expect(readFileSync(path.join(process.cwd(), 'components/ApiKeys.tsx'), 'utf8'))
      .not.toContain("'/api/keys'");
  });

  test('Next.js does not disclose its powered-by header', () => {
    const config = readFileSync(path.join(process.cwd(), 'next.config.mjs'), 'utf8');
    expect(config).toMatch(/poweredByHeader:\s*false/);
  });
});
