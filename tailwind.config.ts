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
        // class names stay so no component edits; the values go sharp
        'sm-t': '0px',
        'md-t': '0px',
        'lg-t': '0px',
      },
    },
  },
  plugins: [],
};

export default config;
