import { describe, expect, test, vi } from 'vitest';
import { extractReplyText, parseWorkflowDraft } from '@/app/api/workflows/draft/logic';

const VALID_DRAFT = {
  name: 'Weekly review',
  subtitle: 'Every Friday, the numbers get checked.',
  steps: [
    {
      title: 'Pull the numbers',
      detail: 'Gathers the week\'s metrics from every source.',
      ownerKind: 'agent',
      owner: 'Metrics Agent',
      hoursPerWeek: 1,
      tools: ['stripe'],
      automation: null,
      branchFromIndex: null,
      branchCondition: null,
    },
  ],
};

describe('extractReplyText', () => {
  test('pulls .result out of a claude -p --output-format json envelope', () => {
    const stdout = JSON.stringify({ type: 'result', result: 'hello world', session_id: 'abc' });
    expect(extractReplyText(stdout)).toBe('hello world');
  });

  test('pulls .message when there is no .result', () => {
    const stdout = JSON.stringify({ message: 'fallback text' });
    expect(extractReplyText(stdout)).toBe('fallback text');
  });

  test('falls back to the raw trimmed stdout when it is not an envelope object', () => {
    expect(extractReplyText('  just some plain text  \n')).toBe('just some plain text');
  });
});

describe('parseWorkflowDraft', () => {
  test('accepts a valid draft wrapped in a CLI envelope', () => {
    const stdout = JSON.stringify({ result: JSON.stringify(VALID_DRAFT) });
    const parsed = parseWorkflowDraft(stdout);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data.name).toBe('Weekly review');
  });

  test('strips a markdown code fence around the JSON', () => {
    const fenced = '```json\n' + JSON.stringify(VALID_DRAFT) + '\n```';
    const stdout = JSON.stringify({ result: fenced });
    const parsed = parseWorkflowDraft(stdout);
    expect(parsed.ok).toBe(true);
  });

  test('rejects non-JSON text with an honest error, never a fabricated draft', () => {
    const stdout = JSON.stringify({ result: 'Sure! Here is a plan for your workflow: first...' });
    const parsed = parseWorkflowDraft(stdout);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/not valid JSON/);
  });

  test('rejects JSON that does not match the workflow schema', () => {
    const stdout = JSON.stringify({ result: JSON.stringify({ name: 'Missing steps' }) });
    const parsed = parseWorkflowDraft(stdout);
    expect(parsed.ok).toBe(false);
  });

  test('rejects a step that branches from a forward index', () => {
    const bad = { ...VALID_DRAFT, steps: [{ ...VALID_DRAFT.steps[0], branchFromIndex: 0 }] };
    const stdout = JSON.stringify({ result: JSON.stringify(bad) });
    const parsed = parseWorkflowDraft(stdout);
    expect(parsed.ok).toBe(false);
  });
});

// ── Full route, CLI mocked ──────────────────────────────────────────────
// The route must never invoke the real `claude` binary in tests. We mock
// node:child_process.execFile so the POST handler is exercised end to end
// (including the retry-once-on-invalid-JSON path and the "CLI missing"
// degrade) without a process ever actually spawning.
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

describe('POST /api/workflows/draft (CLI mocked)', () => {
  test('returns the parsed draft on a clean valid reply', async () => {
    const { execFile } = await import('node:child_process');
    vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, JSON.stringify({ result: JSON.stringify(VALID_DRAFT) }), '');
      return { on: vi.fn() } as any;
    });

    const { POST } = await import('@/app/api/workflows/draft/route');
    const res = await POST(new Request('http://test/api/workflows/draft', { method: 'POST', body: JSON.stringify({ prompt: 'weekly review' }) }));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.draft.name).toBe('Weekly review');
  });

  test('retries once on an invalid first reply and succeeds on the second', async () => {
    const { execFile } = await import('node:child_process');
    let call = 0;
    vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      call += 1;
      if (call === 1) cb(null, JSON.stringify({ result: 'not json at all' }), '');
      else cb(null, JSON.stringify({ result: JSON.stringify(VALID_DRAFT) }), '');
      return { on: vi.fn() } as any;
    });

    const { POST } = await import('@/app/api/workflows/draft/route');
    const res = await POST(new Request('http://test/api/workflows/draft', { method: 'POST', body: JSON.stringify({ prompt: 'weekly review' }) }));
    const body = await res.json();
    expect(call).toBe(2);
    expect(body.ok).toBe(true);
  });

  test('reports an honest unavailable state when the binary is missing (ENOENT), never a fabricated draft', async () => {
    const { execFile } = await import('node:child_process');
    vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      const err = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
      cb(err, '', '');
      return { on: vi.fn() } as any;
    });

    const { POST } = await import('@/app/api/workflows/draft/route');
    const res = await POST(new Request('http://test/api/workflows/draft', { method: 'POST', body: JSON.stringify({ prompt: 'weekly review' }) }));
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.unavailable).toBe(true);
    expect(body.error).toMatch(/unavailable: build manually/);
  });

  test('rejects an empty prompt with 400 before ever touching the CLI', async () => {
    const { execFile } = await import('node:child_process');
    vi.mocked(execFile).mockClear();
    const { POST } = await import('@/app/api/workflows/draft/route');
    const res = await POST(new Request('http://test/api/workflows/draft', { method: 'POST', body: JSON.stringify({ prompt: '' }) }));
    expect(res.status).toBe(400);
    expect(execFile).not.toHaveBeenCalled();
  });
});
