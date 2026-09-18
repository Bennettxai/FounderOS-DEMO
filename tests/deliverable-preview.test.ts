import { describe, expect, test } from 'vitest';
import {
  PREVIEW_MAX_CHARS,
  clampPreview,
  isPreviewable,
  previewKind,
} from '@/lib/deliverable-preview';

/**
 * the operator, 2026-08-20: "In the task lanes on the agent tab I want to be able to
 * review the shit in the actual views. I need to be able to click on each task.
 * I can't fucking see anything."
 *
 * He could not see anything because the only affordance on a task was a link to
 * `?file=<id>`, which the route serves as `Content-Disposition: attachment`.
 * Clicking a task downloaded it. To review work in the OS the content has to
 * come back as data the page can render, which means deciding per file whether
 * it CAN be rendered at all.
 *
 * These rules are pure and tested here so the route stays a thin handler, and
 * so a wrong guess (rendering a 40MB mp4 as text) is caught by a test rather
 * than by locking up his browser.
 */
describe('previewKind', () => {
  test('the formats agents actually stage are text', () => {
    // Every ask in the Needs You queue is one of these: staged replies, plans,
    // decisions and drafts are markdown or plain text.
    for (const name of [
      'STAGED-reply-to-dana.md',
      'plan-gate-2026-08-20.txt',
      'audit.json',
      'leads.csv',
      'notes.log',
      'config.yml',
      'config.yaml',
    ]) {
      expect(previewKind(name), name).toBe('text');
    }
  });

  test('html is text, not a rendered frame', () => {
    // A proposal page is html. Rendering it in an iframe would execute someone
    // else's script inside the OS origin; showing the source is the safe read.
    expect(previewKind('proposal.html')).toBe('text');
  });

  test('images and pdfs are their own kinds', () => {
    expect(previewKind('chart.png')).toBe('image');
    expect(previewKind('shot.JPEG')).toBe('image');
    expect(previewKind('brief.pdf')).toBe('pdf');
  });

  test('svg is an image, never inlined as text', () => {
    // svg is technically text, but it is also a script vector. Treat it as an
    // image so it goes through an <img> tag, which does not execute script.
    expect(previewKind('logo.svg')).toBe('image');
  });

  test('anything else is binary and only downloadable', () => {
    for (const name of ['clip.mp4', 'bundle.zip', 'voice.mp3', 'noext']) {
      expect(previewKind(name), name).toBe('binary');
    }
  });

  test('extension matching is case-insensitive and uses the LAST dot', () => {
    expect(previewKind('Report.FINAL.MD')).toBe('text');
    expect(previewKind('archive.md.zip')).toBe('binary');
  });
});

describe('isPreviewable', () => {
  test('everything except binary can be shown in the panel', () => {
    expect(isPreviewable('a.md')).toBe(true);
    expect(isPreviewable('a.png')).toBe(true);
    expect(isPreviewable('a.pdf')).toBe(true);
    expect(isPreviewable('a.zip')).toBe(false);
  });
});

describe('clampPreview', () => {
  test('short content passes through untouched and unflagged', () => {
    expect(clampPreview('hello')).toEqual({ text: 'hello', truncated: false });
  });

  test('oversized content is cut and flagged so the UI can say so', () => {
    const big = 'x'.repeat(PREVIEW_MAX_CHARS + 500);
    const out = clampPreview(big);
    expect(out.truncated).toBe(true);
    expect(out.text).toHaveLength(PREVIEW_MAX_CHARS);
  });

  test('exactly at the limit is not truncated', () => {
    // Off-by-one here would put a "truncated" warning on a complete file and
    // make him think he was missing something.
    const exact = 'x'.repeat(PREVIEW_MAX_CHARS);
    expect(clampPreview(exact)).toEqual({ text: exact, truncated: false });
  });
});
