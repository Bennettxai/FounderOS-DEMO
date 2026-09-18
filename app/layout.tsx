import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { CommandPalette } from '@/components/CommandPalette';
import { ConductorPanel } from '@/components/ConductorPanel';
import { Toaster } from '@/components/Toaster';
import { CohortBanner } from '@/components/CohortBanner';
import { CohortModal } from '@/components/CohortModal';
import { LensProvider } from '@/lib/hooks/useLens';
import { PageSpotlight } from '@/components/Spotlight';
import { getDb } from '@/lib/data';
import type { PaletteAgent } from '@/lib/palette';
import { THEME_INIT_SCRIPT } from '@/lib/theme';

const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'FOUNDER OS',
  description: 'Personal operating system and AI agent command center for a single person company',
};

/** The palette builds its own Go-to group from lib/nav; the layout only feeds
    it the agent roster (serializable rows — this is a server component). The
    old per-tool command flood is gone: the Connections entry covers /integrations. */
function paletteAgents(): PaletteAgent[] {
  return getDb()
    .agents.all()
    .map((a) => ({ id: a.id, name: a.name, role: a.role }));
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontMono.variable} suppressHydrationWarning>
      <head>
        {/* Apply the persisted theme before first paint — no dark↔light flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Toaster>
        <LensProvider />
        <PageSpotlight />
        <Sidebar />
        {/* os-shell yields to the Conductor dock: the panel sets --conductor-w
            and the whole content column glides left instead of being covered */}
        <div className="os-shell flex min-h-screen min-w-0 flex-col" style={{ marginLeft: 'var(--sidebar-w, 232px)', marginRight: 'var(--conductor-w, 0px)' }}>
          <Topbar />
          <main className="min-w-0 flex-1 px-8 pb-16 pt-7 wide:px-10 ultra:px-12">
            {/* Width tiers: 1280 on laptops · 1760 on large monitors ·
                full-bleed on 32"/ultrawide. See tailwind screens wide/ultra. */}
            <div className="mx-auto max-w-[1280px] wide:max-w-[1760px] ultra:max-w-none">
              {children}
              {/* Cohort invite — last thing on every view, by construction */}
              <CohortBanner />
            </div>
          </main>
        </div>
        <CommandPalette agents={paletteAgents()} />
        {/* Notion-style agent dock — the Conductor, aware of the current screen */}
        <ConductorPanel />
        {/* First-run welcome on the home screen — once per browser */}
        <CohortModal />
        </Toaster>
      </body>
    </html>
  );
}
