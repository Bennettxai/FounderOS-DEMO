/**
 * FounderOS cohort invite — the demo's one growth surface.
 *
 * Two placements share this module so the copy and the URL can never drift:
 *  - `CohortModal`  — a one-time welcome pop-up on the home screen, the first
 *                     time someone clones the repo and runs `npm run dev`.
 *  - `CohortBanner` — a permanent footer CTA under every view.
 */

/** Where both placements send people. */
export const COHORT_URL = 'https://founderos.example.com';

/** The line that sits at the bottom of every page. */
export const COHORT_CTA =
  'Want help setting this up? Go to the FounderOS cohort to learn how to build the entire thing end-to-end and get it into production.';

/** localStorage flag — set once the welcome pop-up has been dismissed. */
export const COHORT_STORAGE_KEY = 'founderos-cohort-invite';

/** Value written on dismissal (any non-null value suppresses the pop-up). */
export const COHORT_SEEN = 'seen';

/**
 * The pop-up is a welcome, not a nag: home screen only, and only until it has
 * been dismissed once in this browser.
 */
export function shouldShowCohortModal({
  pathname,
  stored,
}: {
  pathname: string;
  stored: string | null;
}): boolean {
  if (stored) return false;
  const route = pathname.replace(/\/+$/, '');
  return route === '';
}
