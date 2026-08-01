/**
 * Engagement math for the Social view. Pure helpers — the like-to-view ratio
 * (a.k.a. engagement rate) and its average across posts. Honest about missing
 * data: a post with no views yields null, never a faked zero or a div-by-zero.
 */

/** Like-to-view ratio as a percentage; null when views isn't a positive number. */
export function likeToViewRatio(likes: number, views: number): number | null {
  if (!Number.isFinite(likes) || !Number.isFinite(views) || views <= 0) return null;
  return (likes / views) * 100;
}

/** Mean like-to-view ratio across the posts that have a usable view count. */
export function averageLikeToView(posts: { likes: number; views: number }[]): number | null {
  const ratios = posts
    .map((p) => likeToViewRatio(p.likes, p.views))
    .filter((r): r is number => r != null);
  if (ratios.length === 0) return null;
  return ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
}

/** Render a ratio as "8.9%", or an em dash when there's nothing to show. */
export function formatRatioPct(ratio: number | null): string {
  return ratio == null ? '—' : `${ratio.toFixed(1)}%`;
}
