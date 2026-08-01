import { describe, it, expect } from 'vitest';
import { conductorEmblemClasses } from '@/components/ConductorEmblem';

/**
 * The Conductor emblem only comes alive while an agent is being chatted with.
 * That wiring — thinking ⇒ the `.thinking` class the CSS animations key off —
 * is the one piece of real logic worth locking; the rest is CSS/visual.
 */
describe('conductorEmblemClasses', () => {
  it('is a plain conductor-emblem when idle', () => {
    expect(conductorEmblemClasses(false)).toBe('conductor-emblem');
  });

  it('adds the thinking class while chatting so the animation runs', () => {
    expect(conductorEmblemClasses(true).split(' ')).toContain('thinking');
  });

  it('always keeps conductor-emblem as the base class', () => {
    expect(conductorEmblemClasses(true).split(' ')[0]).toBe('conductor-emblem');
  });

  it('passes an extra className through', () => {
    expect(conductorEmblemClasses(false, 'h-8 w-8').split(' ')).toEqual([
      'conductor-emblem',
      'h-8',
      'w-8',
    ]);
  });

  it('never emits an empty token (no trailing/double spaces)', () => {
    expect(conductorEmblemClasses(true, '')).toBe('conductor-emblem thinking');
    expect(conductorEmblemClasses(false, '').split(' ')).not.toContain('');
  });
});
