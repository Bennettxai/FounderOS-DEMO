/**
 * Height for the Conductor composer's textarea.
 *
 * Typed text used to disappear after one line. The composer sized itself
 * from `input.split('\n').length`, which counts newline CHARACTERS rather
 * than the lines the browser actually drew. A long paragraph typed without
 * pressing Enter is one line by that measure, so the box stayed a single row
 * and scrolled the text just written out of view.
 *
 * The only honest source of truth for wrapped text is what the layout engine
 * reports, so the caller measures scrollHeight and this clamps it.
 */

/** One line at text-xs / leading-relaxed. Keeps an empty box clickable. */
export const COMPOSER_MIN_PX = 20;

/** ~10 lines. Past this the textarea scrolls rather than eating the panel. */
export const COMPOSER_MAX_PX = 200;

export function composerHeight(
  scrollHeight: number,
  max: number = COMPOSER_MAX_PX,
  min: number = COMPOSER_MIN_PX,
): number {
  // Server render and jsdom both report 0, and a detached node can report NaN.
  // None of those may become a 0px input.
  if (!Number.isFinite(scrollHeight) || scrollHeight <= min) return min;
  return Math.min(scrollHeight, max);
}
