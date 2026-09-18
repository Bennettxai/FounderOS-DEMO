import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Mock 3b (interaction rebrand handoff, artboard 3b): "/doctor — pillar radar +
 * brain core kept, rounded; rerun the doctor: skeleton rows while checking,
 * health ring re-fills, checks fade in".
 *
 * The rerun stopped being a page reload with a spinner on it. One run state is
 * shared by the header button, the health ring and the checks column, so the
 * whole screen tells the same story at the same time: press, the checks go to
 * shimmer, the ring re-fills to the new score, the checks come back in.
 */
describe('/doctor mock-3b: one shared run state', () => {
  const run = read('components/DoctorRun.tsx');

  test('the run lives in a client context both the button and the checks read', () => {
    expect(run.startsWith("'use client'")).toBe(true);
    expect(run).toContain('createContext');
    expect(run).toContain('useDoctorRun');
    expect(run).toContain('DoctorRunProvider');
  });

  test('it actually re-reads the doctor rather than only refreshing the route', () => {
    expect(run).toContain('/api/brain/overview');
    expect(run).toContain('router.refresh()');
  });

  test('it carries busy plus the checks the rerun returned', () => {
    expect(run).toContain('busy');
    expect(run).toContain('checks');
  });
});

describe('/doctor mock-3b: the rerun button is the command it runs', () => {
  const btn = read('components/DoctorRerun.tsx');

  test('idle says the command, busy says checking, done says the score', () => {
    expect(btn).toContain('gbrain doctor --fast');
    expect(btn).toContain('checking');
    expect(btn).toContain('useDoctorRun');
  });

  test('it is the primary three-state control, on the shared pressable', () => {
    expect(btn).toContain('AsyncButton');
    expect(btn).toContain('tone="primary"');
    expect(btn).toContain('showElapsed');
    // the press vocabulary comes from the primitive, not a hand-rolled button
    expect(read('components/Pressable.tsx')).toContain('data-lens={k}');
  });
});

describe('/doctor mock-3b: skeleton rows, then checks fade in', () => {
  const checks = read('components/DoctorChecks.tsx');

  test('busy renders shimmer skeleton rows, not an empty list', () => {
    expect(checks.startsWith("'use client'")).toBe(true);
    expect(checks).toContain('skeleton');
    // five bars in the artboard
    expect(checks).toMatch(/\[180, 210, 160, 200, 170\]|180.*210.*160.*200.*170/s);
  });

  test('each check enters with om-in rather than appearing', () => {
    expect(checks).toContain('animate-enter');
    expect(checks).toContain('check.name');
    expect(checks).toContain('check.message');
  });

  test('the health ring re-fills on a transition, never a radius animation', () => {
    expect(checks).toContain('conic-gradient');
    expect(checks).toContain('900ms');
    expect(checks).not.toContain('transition-[border-radius]');
  });
});

describe('/doctor mock-3b: radius rule', () => {
  const page = read('app/doctor/page.tsx');
  const checks = read('components/DoctorChecks.tsx');

  test('the premium tokens are gone from the doctor screen', () => {
    expect(page).not.toContain('rounded-lg-t');
    expect(page).not.toContain('rounded-md-t');
    expect(page).not.toContain('rounded-sm-t');
    expect(checks).not.toContain('rounded-lg-t');
  });

  test('the two chart cards and the pipeline stages are 10px panels', () => {
    expect(page).toContain('rounded-panel');
    const stage = page.slice(page.indexOf('function Stage('), page.indexOf('function Arrow('));
    expect(stage).toContain('rounded-panel');
    // the step badge is a control, 6px
    expect(stage).toContain('rounded-ctl');
  });

  test('the Storage layers box stays structural — no radius at all', () => {
    const box = page.slice(page.indexOf('{/* Core status'), page.indexOf('{/* The pipeline'));
    expect(box).toContain('Storage layers');
    expect(box).not.toMatch(/rounded-(panel|tile|ctl|lg-t|md-t|sm-t|lg|md|sm|xl|2xl)/);
  });
});

describe('/doctor mock-3b: the page wires the shared run', () => {
  const page = read('app/doctor/page.tsx');

  test('the provider wraps the screen and the checks component replaces the inline list', () => {
    expect(page).toContain('DoctorRunProvider');
    expect(page).toContain('DoctorChecks');
    expect(page).not.toContain('doctor.checks.map(');
  });
});
