/**
 * The agent emblem — the Vantage mark (public/vantage-emblem.png,
 * background keyed out and cropped).
 *
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
