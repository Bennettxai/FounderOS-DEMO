import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Two honesty fixes.
 *
 * 1. ManyChat read "planned" in the Content section while the connector was
 *    reporting connected against a live Instagram Pro account. A seeded status
 *    that contradicts a live connector is the exact thing this OS is not
 *    supposed to do.
 * 2. The sidebar footer hardcoded "localhost:4100", which is a lie whenever
 *    the OS is served from the host, and it was pinned nowrap so it overflowed
 *    the rail and got clipped.
 */
describe('ManyChat reads live, not planned', () => {
  let db: FounderDb;

  test('the ManyChat agent is not marked planned', () => {
    db = openDb(':memory:');
    try {
      seedDatabase(db);
      const agent = db.agents.all().find((a) => a.id === 'dmflow-mcp');
      expect(agent, 'the ManyChat MCP agent should exist').toBeDefined();
      expect(agent!.status).not.toBe('planned');
    } finally {
      db.close();
    }
  });

  test('the ManyChat tool reads connected, and stops claiming it needs a key', () => {
    db = openDb(':memory:');
    try {
      seedDatabase(db);
      const tool = db.tools.all().find((t) => t.id === 'tool-dmflow');
      expect(tool, 'the ManyChat tool should exist').toBeDefined();
      expect(tool!.status).toBe('connected');
      expect(tool!.description).not.toMatch(/needs MANYCHAT_API_KEY/i);
    } finally {
      db.close();
    }
  });
});

describe('sidebar footer tells the truth about where it is running', () => {
  const sidebar = read('components/Sidebar.tsx');

  test('the host is read at runtime, not hardcoded to localhost', () => {
    expect(sidebar).not.toContain('localhost:4100 · sqlite · real agents');
    expect(sidebar).toContain('location.host');
  });

  test('the footer line can wrap instead of overflowing the rail', () => {
    // the old markup pinned this line nowrap at 10px inside a 232px rail,
    // so "real agents" ran off the edge and got clipped
    const footer = sidebar.slice(sidebar.indexOf('systems live'));
    const line = footer.slice(0, footer.indexOf('</div>', footer.indexOf('sqlite')));
    expect(line).not.toContain('whitespace-nowrap');
  });
});
