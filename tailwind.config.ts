import type { Config } from 'tailwindcss';

// Terminal direction tokens — source of truth mirrored as CSS vars in globals.css
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        // Wide-screen tiers for the layout shell (see app/layout.tsx).
        // `wide` ≈ large desktop monitor, `ultra` ≈ 32" / ultrawide.
        wide: '1800px',
        ultra: '2200px',
      },
      colors: {
        // Tokens read CSS vars (defined in globals.css) so a single
        // data-theme flip on <html> re-themes every os.* class at once.
        os: {
          bg: 'var(--bg)',
          bg2: 'var(--bg-2)',
          surface: 'var(--surface)',
          // `raised` predates the revamp (= surface-2); /org still uses it
          raised: 'var(--surface-2)',
          surface2: 'var(--surface-2)',
          surface3: 'var(--surface-3)',
          border: 'var(--border)',
          // hairline row dividers inside lists/tables (Monolith handoff)
          hairline: 'var(--hairline)',
          // `border-bright` predates the revamp (= border-strong)
          'border-bright': 'var(--border-strong)',
          'border-strong': 'var(--border-strong)',
          text: 'var(--text)',
          muted: 'var(--text-2)',
          dim: 'var(--text-3)',
          accent: 'var(--accent)',
          accent2: 'var(--accent-2)',
          ink: 'var(--accent-ink)',
          ok: 'var(--ok)',
          warn: 'var(--warn)',
          err: 'var(--err)',
        },
      },
      fontFamily: {
        // Monolith lettering: mono everywhere — Space Grotesk is retired.
        sans: ['var(--font-mono)', '"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        mono: ['var(--font-mono)', '"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        // premium pass: structural boxes round to the mock's scale
        // (chips 5, cards 8, panels 10); class names unchanged
        'sm-t': '5px',
        'md-t': '8px',
        'lg-t': '10px',
        // interaction rebrand: radius on controls and floating panels only
        ctl: '6px',
        panel: '10px',
        tile: '12px',
      },
      transitionTimingFunction: {
        os: 'cubic-bezier(.32,.72,0,1)',
        lens: 'cubic-bezier(.22,.61,.36,1)',
        spring: 'cubic-bezier(.34,1.56,.64,1)',
      },
      transitionDuration: { press: '200ms', base: '360ms', lens: '630ms', panel: '420ms' },
      boxShadow: {
        lift: '0 8px 22px rgba(0,0,0,.6)',
        ring: '0 0 0 3px rgba(242,242,242,.22)',
        focus: '0 0 0 3px rgba(242,242,242,.08)',
      },
      keyframes: {
        'om-in': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        'om-pop': {
          '0%': { transform: 'scale(.5)', opacity: '0' },
          '60%': { transform: 'scale(1.2)', opacity: '1' },
          '100%': { transform: 'scale(1)' },
        },
        'om-shimmer': { from: { backgroundPosition: '180% 0' }, to: { backgroundPosition: '-20% 0' } },
        'om-blink': { '0%,70%,100%': { opacity: '1' }, '85%': { opacity: '.25' } },
        'om-halo': { '0%': { transform: 'scale(.7)', opacity: '.6' }, '70%,100%': { transform: 'scale(2.1)', opacity: '0' } },
      },
      animation: {
        enter: 'om-in .3s cubic-bezier(.22,.61,.36,1) both',
        pop: 'om-pop .32s cubic-bezier(.34,1.56,.64,1) both',
        shimmer: 'om-shimmer 1.4s linear infinite',
        blink: 'om-blink 2.6s steps(1) infinite',
        halo: 'om-halo 1.9s ease-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
