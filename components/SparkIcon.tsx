/**
 * The agent emblem — the real Vantage mark (public/vantage-emblem.png,
 * processed from ~/vantage/"VANTAGE LOGO": background keyed out, cropped).
 *
 * The PNG is used as a CSS mask over a solid color, so `shade` tints the exact
 * brand silhouette to any color — black for the Conductor, each department's
 * life-area color for its agents, etc. (The mint PNG was invisible on the
 * light theme's white; masking fixes that.)
 */
export const EMBLEM_MINT = '#00ffab';

export function SparkIcon({
  size = 28,
  shade = 'var(--accent)',
  className = '',
}: {
  shade?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label="Vantage"
      className={`emblem inline-block shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: shade,
        // color drives the hover drop-shadow glow (.emblem in globals.css)
        color: shade,
        WebkitMaskImage: 'url(/vantage-emblem.png)',
        maskImage: 'url(/vantage-emblem.png)',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      }}
    />
  );
}
