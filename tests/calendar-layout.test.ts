import { describe, expect, test } from 'vitest';
import { assignLanes, hourBounds } from '@/lib/calendar-layout';

describe('assignLanes', () => {
  test('empty input', () => {
    expect(assignLanes([])).toEqual([]);
  });

  test('non-overlapping (touching) events stay full width in lane 0', () => {
    const r = assignLanes([
      { startMin: 0, endMin: 60 },
      { startMin: 60, endMin: 120 },
    ]);
    expect(r).toEqual([
      { lane: 0, lanes: 1 },
      { lane: 0, lanes: 1 },
    ]);
  });

  test('two overlapping events split into two lanes', () => {
    const r = assignLanes([
      { startMin: 0, endMin: 60 },
      { startMin: 30, endMin: 90 },
    ]);
    expect(r).toEqual([
      { lane: 0, lanes: 2 },
      { lane: 1, lanes: 2 },
    ]);
  });

  test('clusters are independent — a later standalone event is full width', () => {
    const r = assignLanes([
      { startMin: 0, endMin: 60 },
      { startMin: 30, endMin: 90 },
      { startMin: 120, endMin: 180 },
    ]);
    expect(r).toEqual([
      { lane: 0, lanes: 2 },
      { lane: 1, lanes: 2 },
      { lane: 0, lanes: 1 },
    ]);
  });

  test('preserves input order in the returned array regardless of start order', () => {
    const r = assignLanes([
      { startMin: 120, endMin: 180 },
      { startMin: 0, endMin: 60 },
    ]);
    expect(r).toEqual([
      { lane: 0, lanes: 1 },
      { lane: 0, lanes: 1 },
    ]);
  });
});

describe('hourBounds', () => {
  test('defaults to 8–18 with no events', () => {
    expect(hourBounds([])).toEqual({ loHour: 8, hiHour: 18 });
  });

  test('enforces a minimum 8-hour span around a single event', () => {
    expect(hourBounds([{ startMin: 600, endMin: 630 }])).toEqual({ loHour: 10, hiHour: 18 });
  });

  test('pins the low bound at 0 for a midnight event and still spans 8h', () => {
    expect(hourBounds([{ startMin: 0, endMin: 30 }])).toEqual({ loHour: 0, hiHour: 8 });
  });

  test('widens to cover an early-to-late spread', () => {
    expect(hourBounds([{ startMin: 540, endMin: 600 }, { startMin: 1260, endMin: 1320 }])).toEqual({
      loHour: 9,
      hiHour: 22,
    });
  });
});
