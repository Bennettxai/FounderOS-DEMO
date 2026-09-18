import { describe, expect, test } from 'vitest';
import { mergeRecordings, formatDuration } from '@/lib/recordings';

/**
 * The Recordings tab on /comms: one list, newest first, from two recorders —
 * Plaud (the device in the room / on the phone) and Fathom (the notetaker on
 * Zoom calls). Pure merge; the page wires the live connectors.
 */

describe('mergeRecordings', () => {
  test('interleaves both sources newest first and tags each row with its source', () => {
    const rows = mergeRecordings(
      [
        { id: 'p1', title: 'Site walk', at: '2026-08-25T18:00:00Z', durationMinutes: 40 },
        { id: 'p2', title: 'Voice memo', at: '2026-08-23T09:00:00Z', durationMinutes: 2 },
      ],
      [{ title: 'Discovery call', url: 'https://fathom.video/calls/1', at: '2026-08-24T15:00:00Z', durationMinutes: 42 }],
    );
    expect(rows.map((r) => r.title)).toEqual(['Site walk', 'Discovery call', 'Voice memo']);
    expect(rows.map((r) => r.source)).toEqual(['plaud', 'fathom', 'plaud']);
    expect(rows[1].url).toBe('https://fathom.video/calls/1');
    expect(rows[0].id).toBe('plaud-p1');
    expect(rows[1].id).toBe('fathom-https://fathom.video/calls/1');
  });

  test('a malformed date sorts to the bottom instead of throwing', () => {
    const rows = mergeRecordings(
      [{ id: 'p1', title: 'bad', at: '', durationMinutes: null }],
      [{ title: 'good', url: null, at: '2026-08-24T15:00:00Z', durationMinutes: 1 }],
    );
    expect(rows[0].title).toBe('good');
  });
});

describe('formatDuration', () => {
  test('reads like a human: minutes under an hour, h/m above', () => {
    expect(formatDuration(null)).toBe('');
    expect(formatDuration(0)).toBe('<1m');
    expect(formatDuration(4)).toBe('4m');
    expect(formatDuration(81)).toBe('1h21m');
    expect(formatDuration(120)).toBe('2h');
  });
});
