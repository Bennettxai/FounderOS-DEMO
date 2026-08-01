import { describe, expect, test } from 'vitest';
import { filterCommands, type Command } from '@/lib/palette';

const COMMANDS: Command[] = [
  { id: 'nav-home', label: 'Home', keywords: 'dashboard today overview', href: '/' },
  { id: 'nav-agents', label: 'Agents', keywords: 'runtime run real', href: '/agents' },
  { id: 'nav-connections', label: 'Connections', keywords: 'integrations tools status', href: '/integrations' },
  { id: 'tool-gbrain', label: 'G-Brain', keywords: 'knowledge brain search supabase zeroentropy', href: '/integrations' },
  { id: 'agent-inbox-triage', label: 'Inbox Triage', keywords: 'email imap unread', href: '/agents' },
];

describe('filterCommands', () => {
  test('returns everything for an empty query', () => {
    expect(filterCommands(COMMANDS, '')).toEqual(COMMANDS);
  });

  test('matches case-insensitively on the label', () => {
    const hits = filterCommands(COMMANDS, 'agents');
    expect(hits.map((c) => c.id)).toContain('nav-agents');
  });

  test('matches on keywords, not just labels', () => {
    const hits = filterCommands(COMMANDS, 'unread');
    expect(hits.map((c) => c.id)).toEqual(['agent-inbox-triage']);
  });

  test('ranks label prefix matches above keyword matches', () => {
    const hits = filterCommands(COMMANDS, 'g');
    expect(hits[0].id).toBe('tool-gbrain');
  });

  test('matches all terms of a multi-word query', () => {
    expect(filterCommands(COMMANDS, 'brain search').map((c) => c.id)).toEqual(['tool-gbrain']);
    expect(filterCommands(COMMANDS, 'brain zzz')).toEqual([]);
  });
});
