import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) =>
  readFileSync(join(process.cwd(), p), 'utf8');

describe('application shell', () => {
  test('sidebar uses Startup branding and Startup storage keys', () => {
    const sidebar = read('components/Sidebar.tsx');

    expect(sidebar).toContain('STARTUP');
    expect(sidebar).toContain('Investment Company');

    expect(sidebar).toContain('startup.sidebar.w');
    expect(sidebar).toContain('startup.sidebar.collapsed');

    expect(sidebar.toLowerCase()).not.toContain('bennett');
  });

  test('topbar uses the Startup command palette event', () => {
    const topbar = read('components/Topbar.tsx');

    expect(topbar).toContain("'startup:palette'");
    expect(topbar.toLowerCase()).not.toContain('bennett');
  });

  test('command palette listens to the same event', () => {
    const palette = read('components/CommandPalette.tsx');

    expect(palette).toContain("'startup:palette'");
    expect(palette).not.toContain("'alex:palette'");
  });

  test('sidebar retains the reusable OS mark', () => {
    const sidebar = read('components/Sidebar.tsx');

    expect(sidebar).toContain('OsMark');
  });
});