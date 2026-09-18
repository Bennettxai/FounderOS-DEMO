import { describe, expect, test } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  NAV_OPERATE,
  NAV_AGENTS,
  NAV_INTELLIGENCE,
  NAV_SYSTEM,
  NAV_LIBRARY,
  NAV_ORDER,
  DIGIT_VIEWS,
} from '@/lib/nav';

describe('shared nav config', () => {
  test('navigation contains only current company modules', () => {
    expect(NAV_OPERATE.map((n) => n.href)).toEqual([
      '/',
      '/workflows',
    ]);

    expect(NAV_AGENTS.map((n) => n.href)).toEqual([
      '/agents',
      '/tasks',
      '/skills',
      '/org',
    ]);

    expect(NAV_INTELLIGENCE.map((n) => n.href)).toEqual([
      '/brain',
    ]);

    expect(NAV_SYSTEM.map((n) => n.href)).toEqual([
      '/integrations',
      '/analytics',
    ]);

    expect(NAV_LIBRARY).toEqual([]);
  });

  test('NAV_ORDER follows visible navigation order', () => {
    expect(NAV_ORDER).toEqual(
      [
        ...NAV_OPERATE,
        ...NAV_AGENTS,
        ...NAV_INTELLIGENCE,
        ...NAV_SYSTEM,
        ...NAV_LIBRARY,
      ].map((item) => item.href),
    );
  });

  test('digit shortcuts map to current visible views', () => {
    expect(DIGIT_VIEWS).toEqual(NAV_ORDER.slice(0, 9));
  });

  test('every navigation target has a page route', () => {
    for (const href of NAV_ORDER) {
      const rel =
        href === '/'
          ? 'app/page.tsx'
          : `app/${href.replace(/^\//, '')}/page.tsx`;

      expect(
        existsSync(path.join(process.cwd(), rel)),
        `${href} should have a page.tsx`,
      ).toBe(true);
    }
  });
});