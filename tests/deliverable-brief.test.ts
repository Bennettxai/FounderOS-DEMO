import { describe, expect, test } from 'vitest';
import { briefFrom } from '@/lib/deliverable-brief';

/**
 * The Needs You row used to print FILENAMES. It took the filename, stripped the
 * dashes and showed the words, so `STAGED-note-tenth-rail.json` became
 * "note tenth rail" — while the file itself opens with a written English
 * sentence explaining exactly what it is.
 *
 * Every sample below is invented content in the shape the agents actually emit.
 */
describe('briefFrom - the title comes from the file, not the filename', () => {
  test('an H1 is the title, verbatim', () => {
    const b = briefFrom(
      'sample-mentorship-decision-2026-08-20.md',
      '# Duo mentorship AR - one decision, two mentees (Casey Example + Robin Sample)\n\nPrepared 2026-08-20. Every figure below re-derived at source this run.\n',
    );
    expect(b.title).toBe('Duo mentorship AR - one decision, two mentees (Casey Example + Robin Sample)');
    expect(b.title).not.toContain('#');
  });

  test('a bolded lede becomes the title when there is no heading', () => {
    const b = briefFrom(
      'napkin-unsent-draft-send-oracle-2026-08-19.md',
      '**At 11:37 this board told you one paragraph stood between you and $4,000 from Acme Design. You had already written it at 3:09 this morning.**\n\nThe 11:37 comment was right about the deal.\n',
    );
    expect(b.title).toContain('$4,000 from Acme Design');
    expect(b.title).not.toContain('**');
    // and NEVER the filename mush nobody could read
    expect(b.title.toLowerCase()).not.toContain('unsent draft send oracle');
  });

  test('a JSON deliverable is unwrapped: the body is the document', () => {
    const b = briefFrom(
      'STAGED-note-tenth-rail.json',
      JSON.stringify({
        body:
          '**There is a tenth payment rail. It is a lender, and it is the rail your program sales are financed through.**\n\nIt is **Examplepay**. It turned up in the chat archive.',
      }),
    );
    expect(b.title).toContain('tenth payment rail');
    expect(b.title).not.toContain('{');
    expect(b.title).not.toContain('body');
    expect(b.summary).toContain('Examplepay');
  });

  test('the summary carries on where the title stopped, and is not a copy of it', () => {
    const b = briefFrom(
      'x.md',
      '# Acme Design - corrected proposal send email (pricing removed)\n\n**Status:** Corrected 2026-08-21. Pricing references removed per the review note.\n',
    );
    expect(b.title).toBe('Acme Design - corrected proposal send email (pricing removed)');
    expect(b.summary).toContain('Pricing references removed');
    expect(b.summary).not.toBe(b.title);
  });

  test('a long title is clipped to something a row can show', () => {
    const b = briefFrom('x.md', `# ${'word '.repeat(80)}\n`);
    expect(b.title.length).toBeLessThanOrEqual(120);
  });

  test('markdown furniture is stripped from the title', () => {
    const b = briefFrom('x.md', '## **`Some` _title_** with [a link](http://x.com)\n\nBody.\n');
    expect(b.title).toBe('Some title with a link');
  });

  test('an unreadable or empty file falls back to a cleaned filename, never a crash', () => {
    expect(briefFrom('sample-lesson-plan.md', '').title).toBe('sample lesson plan');
    expect(briefFrom('x.json', 'not json at all {{{').title).toBeTruthy();
    expect(() => briefFrom('x.md', ' ')).not.toThrow();
  });

  test('a table or code fence never leaks into the title', () => {
    const b = briefFrom('x.md', '| a | b |\n|---|---|\n| 1 | 2 |\n\nReal sentence here.\n');
    expect(b.title).not.toContain('|');
    expect(b.title).toContain('Real sentence');
  });

  test('a date suffix and STAGED prefix are dropped from the fallback title', () => {
    const b = briefFrom('STAGED-note-payout-classification-2026-08-19.json', '');
    expect(b.title).not.toMatch(/STAGED|2026-08-19/);
    expect(b.title).toContain('payout classification');
  });
});

/**
 * The shapes a real board throws at it: truncated JSON heads, pretty-printed
 * JSON, explicit title fields, late section headings. Each of these once
 * produced a title nobody could read.
 */
describe('briefFrom - what a board throws at it', () => {
  test('a JSON head TRUNCATED mid-document still yields the body, not a brace', () => {
    // 4KB of a 30KB file is not valid JSON, so JSON.parse throws and the old
    // code fell through to showing the raw text, which starts with `{"body": "`.
    const truncated = '{"body": "There is a tenth payment rail.\\n\\nIt is Examplepay, a lender, and it is the rail your program sale';
    const b = briefFrom('STAGED-note-tenth-rail.json', truncated);
    expect(b.title).toBe('There is a tenth payment rail.');
    expect(b.title).not.toContain('{');
    expect(b.title).not.toContain('body');
  });

  test('pretty-printed JSON is unwrapped too, not just the single-line form', () => {
    const b = briefFrom('x.json', '{\n  "body": "The follow-up email to Acme Design was never sent."\n}');
    expect(b.title).toBe('The follow-up email to Acme Design was never sent.');
  });

  test('an explicit JSON title field wins, because the agent already wrote one', () => {
    const b = briefFrom(
      'STAGED-1fbc533e-description-fix.json',
      '{\n  "title": "Casey Example paid $1,500 by transfer (not $0). Thank them, do not chase them.",\n  "description": "CORRECTED 2026-08-19."\n}',
    );
    expect(b.title).toBe('Casey Example paid $1,500 by transfer (not $0). Thank them, do not chase them.');
    expect(b.summary).toContain('CORRECTED');
  });

  test('a SECTION heading further down does not hijack the title from the lede', () => {
    // This shape opens with a bolded lede and only later has "## The draft that
    // already exists". The old rule took any heading anywhere, so every one of
    // these files was titled by its second section instead of by what it is about.
    const b = briefFrom(
      'napkin-unsent-draft-send-oracle-2026-08-19.md',
      '**At 11:37 this board told you one paragraph stood between you and $4,000 from Acme Design.**\n\nSome prose.\n\n## The draft that already exists\n\nMore.\n',
    );
    expect(b.title).toContain('$4,000 from Acme Design');
    expect(b.title).not.toBe('The draft that already exists');
  });

  test('a heading that genuinely opens the document still wins', () => {
    const b = briefFrom('x.md', '# Duo mentorship AR\n\nPrepared 2026-08-20.\n');
    expect(b.title).toBe('Duo mentorship AR');
  });

  test('JSON with no prose key falls back to the filename, never raw braces', () => {
    const b = briefFrom(
      'sample-checkout-gateway-config-2026-08-20T0535Z.json',
      '{"success":true,"data":{"checkout_session_secret":"405312ec"}}',
    );
    expect(b.title).not.toContain('{');
    expect(b.title).toContain('sample checkout gateway config');
  });

  test('an email greeting is not a title', () => {
    const b = briefFrom(
      'outbound-reply-STAGED-uid41.txt',
      'Hi Sam,\n\nThanks for the brief. The framing is exactly how I think about content.\n',
    );
    expect(b.title).not.toBe('Hi Sam,');
    expect(b.title).toContain('Thanks for the brief');
  });

  test('an indented heading still loses its hashes', () => {
    // "# (warning) DO NOT SEND - SUPERSEDED" once kept its hash, because plain()
    // anchored ^# against the UNTRIMMED line while the heading test ran on the
    // trimmed one.
    expect(briefFrom('x.md', '   # DO NOT SEND - SUPERSEDED (ticket 463)\n\nBody.\n').title)
      .toBe('DO NOT SEND - SUPERSEDED (ticket 463)');
    expect(briefFrom('x.json', '{"title": "# DO NOT SEND"}').title).toBe('DO NOT SEND');
  });
});

/**
 * Both of these rendered with the hash still attached AFTER the first trim fix
 * shipped, which is what proved the problem was not the deploy.
 */
describe('briefFrom - a heading nested in a blockquote', () => {
  test('"> # TITLE" loses BOTH markers, not just one', () => {
    // plain() stripped ^# and then ^>, in that order. A line starting with
    // "> #" never matched the ^# rule, so the hash survived the whole way to
    // the row. Order is the entire bug.
    const b = briefFrom(
      'STAGED-corrected-draft.md',
      '> # ⛔ **DO NOT SEND** — **SUPERSEDED 2026-08-22 (ticket 463)**\n>\n> This draft is the post-call proposal send.\n',
    );
    expect(b.title).not.toContain('#');
    expect(b.title).not.toContain('>');
    expect(b.title).toContain('DO NOT SEND');
    expect(b.title).toContain('SUPERSEDED 2026-08-22 (ticket 463)');
  });

  test('the same for a multi-level quote', () => {
    expect(briefFrom('x.md', '>> ## Nested heading\n\nBody.\n').title).toBe('Nested heading');
  });

  test('a plain blockquote with no heading is still cleaned', () => {
    expect(briefFrom('x.md', '> Casey Example also working with a studio doing $8k a month\n').title)
      .toBe('Casey Example also working with a studio doing $8k a month');
  });
});
