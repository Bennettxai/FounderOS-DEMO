/**
 * What a deliverable can be shown as inside the OS.
 *
 * Work needs to be reviewable in the actual views rather than blind.
 * The only affordance on a task used to be `?file=<id>`, which the route
 * serves as `Content-Disposition: attachment`. Every click was a download.
 * Reviewing work in the OS means the content has to come back as
 * something the page can render, and that starts with deciding, per file,
 * whether it can be rendered at all.
 *
 * Kept free of `node:` imports so the client components can classify a row
 * without a round trip.
 */
export type PreviewKind = 'text' | 'image' | 'pdf' | 'binary';

/** Formats the agents actually stage: replies, plans, decisions, drafts. */
const TEXT_EXTS = new Set(['.md', '.txt', '.json', '.csv', '.log', '.yml', '.yaml', '.html', '.htm']);

/** svg lives here deliberately. It is technically text, but it is also a script
 *  vector, so it goes through an <img> tag, which does not execute script,
 *  rather than being inlined into the page. */
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

/**
 * Enough to read a staged reply or a plan in full without handing the browser
 * a file big enough to lock it up. Truncation is surfaced in the UI rather than
 * silent, so a cut file never reads as a complete one.
 */
export const PREVIEW_MAX_CHARS = 200_000;

/** Last dot wins, case-insensitive. A leading dot is a dotfile, not an
 *  extension, so `.env` classifies as binary rather than as text. */
function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i <= 0 ? '' : name.slice(i).toLowerCase();
}

export function previewKind(name: string): PreviewKind {
  const ext = extOf(name);
  // Image is tested first so svg never falls through to the text branch.
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (TEXT_EXTS.has(ext)) return 'text';
  if (ext === '.pdf') return 'pdf';
  return 'binary';
}

/** Binary is download-only; everything else can render in the review panel. */
export function isPreviewable(name: string): boolean {
  return previewKind(name) !== 'binary';
}

export function clampPreview(
  text: string,
  max: number = PREVIEW_MAX_CHARS,
): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}
