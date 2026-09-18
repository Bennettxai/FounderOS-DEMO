import { describe, expect, test, vi } from 'vitest';
import { classifyInterject, performInterject, type InterjectDeps } from '@/lib/interject';
import { POST } from '@/app/api/interject/route';

/**
 * The home Interject composer routes free text without an LLM: a task goes to
 * the Paperclip board (the Conductor triages it), "tell/ask <agent>" also
 * lands on the board with the relay phrasing intact, and everything else is a
 * G-Brain inbox note. The classifier order is pinned: the task patterns win
 * over the agent ones, so "ask sales to make a task" files as a task.
 */

describe('classifyInterject', () => {
  test('a leading task: prefix or a todo/task word routes to task', () => {
    expect(classifyInterject('task: call Dana back about the site')).toBe('task');
    expect(classifyInterject('TODO order a spare power supply')).toBe('task');
    expect(classifyInterject('add a task for the proposal follow-up')).toBe('task');
  });

  test('tell/ask <agent> routes to agent', () => {
    expect(classifyInterject('tell sales to follow up with Dana')).toBe('agent');
    expect(classifyInterject('Ask finance about the Wise wire')).toBe('agent');
  });

  test('the task patterns win over the agent ones', () => {
    expect(classifyInterject('ask sales to make a task for this')).toBe('task');
  });

  test('anything else is a note', () => {
    expect(classifyInterject('price is only the 3rd objection on Vantage calls')).toBe('note');
    expect(classifyInterject('')).toBe('note');
  });
});

const deps = (over: Partial<InterjectDeps> = {}): InterjectDeps => ({
  createTask: vi.fn().mockResolvedValue({ ref: 'OS-301', url: 'https://board/issue/OS-301' }),
  captureNote: vi.fn().mockResolvedValue({ ok: true, slug: 'inbox/2026-09-07-note' }),
  ...over,
});

describe('performInterject', () => {
  const now = new Date('2026-09-07T15:00:00Z');

  test('a task strips the prefix for the title, keeps the full text in the description', async () => {
    const d = deps();
    const r = await performInterject('task: call Dana back\nthey want the workshop agenda', undefined, d, now);
    expect(r).toMatchObject({ ok: true, route: 'task', ref: 'OS-301', url: 'https://board/issue/OS-301' });
    expect(d.createTask).toHaveBeenCalledTimes(1);
    const [title, description] = vi.mocked(d.createTask).mock.calls[0];
    expect(title).toBe('call Dana back');
    expect(description).toContain('they want the workshop agenda');
    expect(d.captureNote).not.toHaveBeenCalled();
  });

  test('an agent interject keeps the relay phrasing as the board title', async () => {
    const d = deps();
    const r = await performInterject('tell sales to follow up with Dana', undefined, d, now);
    expect(r.ok).toBe(true);
    expect(r.route).toBe('agent');
    const [title] = vi.mocked(d.createTask).mock.calls[0];
    expect(title).toBe('tell sales to follow up with Dana');
  });

  test('a very long first line is clamped to a sane board title', async () => {
    const d = deps();
    await performInterject(`task: ${'x'.repeat(300)}`, undefined, d, now);
    const [title] = vi.mocked(d.createTask).mock.calls[0];
    expect(title.length).toBeLessThanOrEqual(120);
  });

  test('a note captures to the dated inbox slug', async () => {
    const d = deps();
    const r = await performInterject('the host fans are loud today', undefined, d, now);
    expect(r).toMatchObject({ ok: true, route: 'note' });
    expect(d.captureNote).toHaveBeenCalledWith({
      text: 'the host fans are loud today',
      title: 'Interject 2026-09-07',
      slug: 'inbox/2026-09-07-note',
    });
    expect(d.createTask).not.toHaveBeenCalled();
  });

  test('an explicit route override wins over classification', async () => {
    const d = deps();
    const r = await performInterject('the host fans are loud today', 'task', d, now);
    expect(r.route).toBe('task');
    expect(d.createTask).toHaveBeenCalledTimes(1);
  });

  test('a failed board create reports honestly instead of throwing', async () => {
    const d = deps({ createTask: vi.fn().mockRejectedValue(new Error('paperclip creds missing')) });
    const r = await performInterject('task: call Dana', undefined, d, now);
    expect(r.ok).toBe(false);
    expect(r.route).toBe('task');
    expect(r.error).toContain('paperclip creds missing');
  });

  test('a failed capture surfaces the brain error', async () => {
    const d = deps({ captureNote: vi.fn().mockResolvedValue({ ok: false, error: 'gbrain unreachable' }) });
    const r = await performInterject('remember this', undefined, d, now);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('gbrain unreachable');
  });
});

describe('POST /api/interject', () => {
  test('rejects invalid JSON', async () => {
    const res = await POST(new Request('http://x/api/interject', { method: 'POST', body: 'not json' }));
    expect(res.status).toBe(400);
  });

  test('rejects an empty interject', async () => {
    const res = await POST(
      new Request('http://x/api/interject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '   ' }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
