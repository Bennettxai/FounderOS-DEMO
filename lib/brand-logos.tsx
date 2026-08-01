import * as simpleIcons from 'simple-icons';

/**
 * Brand marks for the connections marketplace. Three sources, in order:
 *   1. HANDMADE  — full-colour SVGs for brands simple-icons dropped (Slack) or
 *      where we want the real multi-colour logo.
 *   2. simple-icons — the canonical single-colour glyph + official brand hex,
 *      looked up by slug (`gmail` -> `siGmail`, `googlecalendar` -> ...).
 *   3. LETTERMARK — an intentional coloured initial tile for niche brands with
 *      no logo in either source (Attio, Beehiiv, our own aliases).
 * A slug that matches none of the three is a typo — `hasBrandMark` returns
 * false so the catalog test catches it.
 */

type SiIcon = { title: string; hex: string; path: string };

// slug -> { viewBox, node } for hand-authored multi-colour marks.
const HANDMADE: Record<string, { viewBox: string; node: React.ReactNode }> = {
  slack: {
    viewBox: '0 0 122.8 122.8',
    node: (
      <>
        <path
          d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9zm6.5 0c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z"
          fill="#E01E5A"
        />
        <path
          d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2zm0 6.5c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z"
          fill="#36C5F0"
        />
        <path
          d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2zm-6.5 0c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z"
          fill="#2EB67D"
        />
        <path
          d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9zm0-6.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z"
          fill="#ECB22E"
        />
      </>
    ),
  },
};

// Brands we intentionally render as a coloured initial (no logo available).
// slug -> brand hex used to tint the tile + initial.
const LETTERMARK: Record<string, string> = {
  salesforce: '#00A1E0',
  attio: '#4A6CF7',
  beehiiv: '#FFC864',
  openai: '#10A37F',
  plaid: '#000000',
  onedrive: '#0078D4',
  canva: '#00C4CC',
  gohighlevel: '#2A9D8F',
  zernio: '#6E56CF',
  arcads: '#FF6A3D',
  fanbasis: '#22C55E',
  trakyo: '#EAB308',
  webinarjam: '#2563EB',
  pava: '#A855F7',
  manychat: '#0084FF',
  skool: '#E4573D',
  'proposal-gen': '#00764f',
};

function siFor(slug: string): SiIcon | null {
  const name = 'si' + slug.charAt(0).toUpperCase() + slug.slice(1);
  const icon = (simpleIcons as Record<string, SiIcon | undefined>)[name];
  return icon ?? null;
}

/** Does this slug resolve to a real brand mark (handmade, simple-icons, or an
 *  intentional lettermark)? False = the slug is a typo. */
export function hasBrandMark(slug: string, name?: string): boolean {
  if (HANDMADE[slug] || siFor(slug) || slug in LETTERMARK) return true;
  return false;
}

// Perceived luminance of a #rrggbb hex, 0..1. Dark glyphs on a dark tile need a
// lightened fill instead of the true brand colour.
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function BrandLogo({
  slug,
  name,
  size = 40,
}: {
  slug: string;
  name: string;
  size?: number;
}) {
  const radius = Math.round(size * 0.28);
  const glyph = Math.round(size * 0.56);

  const handmade = HANDMADE[slug];
  if (handmade) {
    return (
      <span
        className="grid shrink-0 place-items-center"
        style={{ width: size, height: size, borderRadius: radius, background: 'rgba(255,255,255,0.05)' }}
      >
        <svg width={glyph} height={glyph} viewBox={handmade.viewBox} aria-hidden>
          {handmade.node}
        </svg>
      </span>
    );
  }

  const icon = siFor(slug);
  if (icon) {
    const brand = `#${icon.hex}`;
    const dark = luminance(brand) < 0.22;
    const fill = dark ? '#e6e7ea' : brand;
    const tile = dark ? 'rgba(255,255,255,0.06)' : `color-mix(in srgb, ${brand} 16%, transparent)`;
    return (
      <span
        className="grid shrink-0 place-items-center"
        style={{ width: size, height: size, borderRadius: radius, background: tile }}
      >
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" aria-hidden>
          <path d={icon.path} fill={fill} />
        </svg>
      </span>
    );
  }

  // lettermark
  const brand = LETTERMARK[slug] ?? '#8a8f98';
  const initial = (name || slug).trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      className="grid shrink-0 place-items-center font-semibold"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `color-mix(in srgb, ${brand} 20%, transparent)`,
        color: brand,
        fontSize: Math.round(size * 0.42),
      }}
      aria-hidden
    >
      {initial}
    </span>
  );
}
