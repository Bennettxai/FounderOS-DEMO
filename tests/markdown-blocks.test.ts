import { describe, expect, test } from 'vitest';
import { parseInline, parseMarkdown } from '@/lib/markdown-blocks';

/**
 * the operator, 2026-08-21: "when I approve them it's just fucking Markdown and
 * gibberish. Format this fucking correctly."
 *
 * The review panel printed the raw file into a <pre>, so a document that is
 * genuinely well written arrived as a wall of asterisks, pipes and hashes.
 * These agents write real markdown: headings, bold ledes, tables of "what they
 * asked for / what the draft says", blockquotes of his own words. All of it
 * has to render.
 *
 * Parsing is pure and lives here so it can be tested in node; the component is
 * a thin renderer over these blocks.
 */
describe('parseMarkdown - block structure', () => {
  test('headings carry their level', () => {
    expect(parseMarkdown('# One\n\n## Two')).toEqual([
      { type: 'heading', level: 1, text: 'One' },
      { type: 'heading', level: 2, text: 'Two' },
    ]);
  });

  test('a blank-line separated run is one paragraph, not one per line', () => {
    const out = parseMarkdown('first line\nsecond line\n\nnew para');
    expect(out).toEqual([
      { type: 'paragraph', text: 'first line second line' },
      { type: 'paragraph', text: 'new para' },
    ]);
  });

  test('bullet and numbered lists become one list block', () => {
    expect(parseMarkdown('- a\n- b\n')).toEqual([{ type: 'list', ordered: false, items: ['a', 'b'] }]);
    expect(parseMarkdown('1. a\n2. b\n')).toEqual([{ type: 'list', ordered: true, items: ['a', 'b'] }]);
  });

  test('a table is parsed into a header and rows, not printed as pipes', () => {
    const md = '| what they asked | what the draft says |\n|---|---|\n| followers | IG 20,000 |\n';
    expect(parseMarkdown(md)).toEqual([
      {
        type: 'table',
        header: ['what they asked', 'what the draft says'],
        rows: [['followers', 'IG 20,000']],
      },
    ]);
  });

  test('a fenced code block keeps its content verbatim, markdown and all', () => {
    const md = '```json\n{"a": **1**}\n```\n';
    expect(parseMarkdown(md)).toEqual([{ type: 'code', lang: 'json', text: '{"a": **1**}' }]);
  });

  test('a blockquote of his own words is its own block', () => {
    expect(parseMarkdown('> Kai Morgan also working with a studio')).toEqual([
      { type: 'quote', text: 'Kai Morgan also working with a studio' },
    ]);
  });

  test('a horizontal rule is a rule, not a paragraph of dashes', () => {
    expect(parseMarkdown('a\n\n---\n\nb')).toEqual([
      { type: 'paragraph', text: 'a' },
      { type: 'rule' },
      { type: 'paragraph', text: 'b' },
    ]);
  });

  test('empty input yields no blocks rather than a crash', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('   \n\n  ')).toEqual([]);
  });
});

describe('parseInline - the marks inside a line', () => {
  test('bold, italic and code become spans, and the markers disappear', () => {
    expect(parseInline('a **b** c `d` e')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'bold', text: 'b' },
      { type: 'text', text: ' c ' },
      { type: 'code', text: 'd' },
      { type: 'text', text: ' e' },
    ]);
  });

  test('a link keeps its href and shows its label', () => {
    expect(parseInline('see [the call](https://fathom.video/calls/1)')).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'link', text: 'the call', href: 'https://fathom.video/calls/1' },
    ]);
  });

  test('a javascript: href is refused, because these files come from agents', () => {
    // The label survives, the link does not. Asserted as intent rather than an
    // exact array: a nested-paren href leaves a stray ')' as literal text,
    // which is fine, and markdown does not reliably support those anyway.
    for (const md of ['[x](javascript:alert(1))', '[x](javascript:doThing)', '[x](data:text/html,hi)']) {
      const out = parseInline(md);
      expect(out.some((n) => n.type === 'link')).toBe(false);
      expect(out.map((n) => n.text).join('')).toContain('x');
    }
  });

  test('plain text passes through as one span', () => {
    expect(parseInline('nothing special')).toEqual([{ type: 'text', text: 'nothing special' }]);
  });

  test('an unclosed marker is left as literal text rather than eating the rest', () => {
    expect(parseInline('a ** b')).toEqual([{ type: 'text', text: 'a ** b' }]);
  });
});
