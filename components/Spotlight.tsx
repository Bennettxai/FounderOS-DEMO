/** Cursor spotlight for page-level cards. The parent must carry data-spot
    (useLens sets --sx/--sy on it) and position:relative + overflow-hidden. */
export function Spotlight() {
  return <span aria-hidden className="spotlight" />;
}

/** The page-wide glow: one fixed layer over the whole viewport, sidebar
    included, following the cursor via --px/--py on :root (set by useLens).
    Mount once in the root layout. Stays under the palette, dock and toasts. */
export function PageSpotlight() {
  return <span aria-hidden className="spotlight is-page" />;
}
