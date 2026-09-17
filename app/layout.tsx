import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';

import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { CommandPalette } from '@/components/CommandPalette';
import { getDb } from '@/lib/data';
import type { Command } from '@/lib/palette';
import { THEME_INIT_SCRIPT } from '@/lib/theme';

const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Money Machine',
  description: 'AI investment company operating system',
};

const NAV_COMMANDS: Command[] = [
  {
    id: 'nav-home',
    label: 'Home',
    keywords: 'dashboard overview company',
    href: '/',
    hint: 'view',
  },
  {
    id: 'nav-agents',
    label: 'Agents',
    keywords: 'agents employees runtime roster',
    href: '/agents',
    hint: 'view',
  },
  {
    id: 'nav-tasks',
    label: 'Tasks',
    keywords: 'tasks work assignments',
    href: '/tasks',
    hint: 'view',
  },
  {
    id: 'nav-skills',
    label: 'Skills',
    keywords: 'skills capabilities',
    href: '/skills',
    hint: 'view',
  },
  {
    id: 'nav-org',
    label: 'Org Chart',
    keywords: 'organization hierarchy departments teams',
    href: '/org',
    hint: 'view',
  },
  {
    id: 'nav-brain',
    label: 'Startup Brain',
    keywords: 'brain memory knowledge experience decisions lessons',
    href: '/brain',
    hint: 'view',
  },
  {
    id: 'nav-connections',
    label: 'Connections',
    keywords: 'integrations tools data sources',
    href: '/integrations',
    hint: 'view',
  },
  {
    id: 'nav-analytics',
    label: 'Analytics',
    keywords: 'analytics metrics performance kpi',
    href: '/analytics',
    hint: 'view',
  },
];

function buildCommands(): Command[] {
  const db = getDb();

  const agents: Command[] = db.agents.all().map((agent) => ({
    id: `agent-${agent.id}`,
    label: agent.name,
    keywords: `${agent.role} ${agent.description}`,
    href: '/agents',
    hint: 'agent',
  }));

  return [...NAV_COMMANDS, ...agents];
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={fontMono.variable}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: THEME_INIT_SCRIPT,
          }}
        />
      </head>

      <body>
        <Sidebar />

        <div className="ml-[232px] flex min-h-screen min-w-0 flex-col">
          <Topbar />

          <main className="min-w-0 flex-1 px-8 pb-16 pt-7 wide:px-10 ultra:px-12">
            <div className="mx-auto max-w-[1280px] wide:max-w-[1760px] ultra:max-w-none">
              {children}
            </div>
          </main>
        </div>

        <CommandPalette commands={buildCommands()} />
      </body>
    </html>
  );
}