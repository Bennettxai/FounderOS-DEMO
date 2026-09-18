/**
 * The X mark: the current platform logo, not the legacy Twitter bird, for social.
 *
 * The glyph is simple-icons' `siX` path, inlined rather than imported: the
 * simple-icons package is server-only in this repo (see lib/brand-logos.tsx),
 * and the social and analytics platform maps hand their icons to components
 * that render on both sides of the boundary.
 *
 * Shaped like a lucide icon (24x24 viewBox, `currentColor`, className passes
 * the size) so it drops into the existing PLATFORM_ICON maps unchanged.
 */
export function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z" />
    </svg>
  );
}
