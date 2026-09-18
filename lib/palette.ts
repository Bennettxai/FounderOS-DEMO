import { NAV_OPERATE, NAV_AGENTS, NAV_INTELLIGENCE, NAV_SYSTEM, NAV_LIBRARY } from '@/lib/nav';

export type PaletteKind = 'go' | 'run' | 'ask';
export type PaletteScope = 'all' | PaletteKind;

/** The slice of an agent row the palette needs — serializable across the
    server → client boundary (the layout builds it from the DB). */
export type PaletteAgent = { id: string; name: string; role: string };

export type PaletteCommand = {
  id: string;
  kind: PaletteKind;
  title: string;
  sub: string;
  glyph: string;
  /** go: internal route or http(s) external link. ask: optional page jump. */
  href?: string;
  aliases?: string[];
  /** run: target for POST /api/agents/:id/run */
  agentId?: string;
  /** ask: the message POSTed to /api/conductor/chat */
  prompt?: string;
};

// Search vocabulary the nav labels alone don't cover — what the operator actually
// types when he means each view.
const NAV_ALIASES: Record<string, string[]> = {
  '/': ['home', 'console', 'dashboard', 'overview'],
  '/comms': ['inbox', 'email', 'messages', 'slack', 'whatsapp', 'unread'],
  '/funnel': ['clients', 'journey', 'pipeline', 'vantage'],
  '/workflows': ['automations', 'crons'],
  '/social': ['instagram', 'tiktok', 'youtube', 'followers', 'zernio'],
  '/content': ['videos', 'posts', 'carousel'],
  '/brand-deals': ['sponsors', 'partnerships'],
  '/finances': ['money', 'stripe', 'revenue', 'expenses'],
  '/trading': ['robinhood', 'phantom', 'markets', 'portfolio'],
  '/agents': ['roster', 'workforce'],
  '/chats': ['conversations', 'threads'],
  '/tasks': ['todo', 'board', 'kanban'],
  '/skills': ['sops', 'playbooks'],
  '/org': ['hierarchy', 'chart', 'structure', 'pillars'],
  '/brain': ['gbrain', 'knowledge', 'memory', 'graph', 'recall'],
  '/doctor': ['health', 'diagnostics', 'checks'],
  '/integrations': ['connections', 'tools', 'creds', 'status'],
  '/usage': ['tokens', 'burn', 'quota', 'seats'],
  '/roadmap': ['phases', 'quarters', 'plan'],
  '/analytics': ['metrics', 'numbers'],
  '/reference': ['brm', 'domains', 'model'],
  '/personas': ['templates', 'variants'],
};

const NAV_GROUPS: [string, { href: string; label: string }[]][] = [
  ['Operate', NAV_OPERATE],
  ['Agents', NAV_AGENTS],
  ['Intelligence', NAV_INTELLIGENCE],
  ['System', NAV_SYSTEM],
  ['Library', NAV_LIBRARY],
];

// Off-OS jumps that used to live in the flat command list. Entries for
// retired connectors don't carry over.
const EXTERNAL: PaletteCommand[] = [
  { id: 'ext-command-center', kind: 'go', title: 'Command Center', sub: 'localhost:4000', glyph: '↗', href: 'http://localhost:4000', aliases: ['command-center', 'kanban', 'missions'] },
  { id: 'ext-remotion', kind: 'go', title: 'Remotion Studio', sub: 'localhost:3789', glyph: '↗', href: 'http://localhost:3789', aliases: ['video', 'render'] },
  { id: 'ext-skool', kind: 'go', title: 'Skool Community', sub: 'skool.com', glyph: '↗', href: 'https://www.skool.com', aliases: ['community', 'launchpad cohorts'] },
  { id: 'ext-fathom', kind: 'go', title: 'Fathom Calls', sub: 'fathom.video', glyph: '↗', href: 'https://fathom.video', aliases: ['meetings', 'recordings'] },
  { id: 'ext-plaud', kind: 'go', title: 'Plaud Recordings', sub: 'web.plaud.ai', glyph: '↗', href: 'https://web.plaud.ai', aliases: ['voice', 'recorder', 'memos'] },
];

const ASK: PaletteCommand[] = [
  {
    id: 'ask-attention', kind: 'ask', glyph: '?',
    title: 'What needs my attention?', sub: 'Conductor · triage comms and the board',
    prompt: 'What needs my attention right now? Triage comms and the board and give me the top items.',
  },
  {
    id: 'ask-status', kind: 'ask', glyph: '?',
    title: 'Agent status report', sub: 'Conductor · last run of every agent',
    prompt: 'Give me a status report: the last run of every agent and anything that failed.',
  },
  {
    id: 'ask-day', kind: 'ask', glyph: '?',
    title: 'Plan my day', sub: 'Conductor · calendar + open work',
    prompt: 'Plan my day from the calendar and the open work on the board.',
  },
  {
    id: 'ask-brain', kind: 'ask', glyph: '◎',
    title: 'Search G-Brain', sub: 'open the knowledge core query card',
    href: '/brain', aliases: ['gbrain', 'knowledge', 'query', 'recall'],
  },
];

/** One box, three groups: Go to (nav + external), Run (agent roster), Ask
    (Conductor prompts + G-Brain). Pure and serializable-in, so the layout can
    feed it DB rows and the client palette can build the list itself. */
export function buildPaletteCommands(agents: PaletteAgent[]): PaletteCommand[] {
  const go: PaletteCommand[] = NAV_GROUPS.flatMap(([group, items]) =>
    items.map(({ href, label }) => ({
      id: `go-${href}`,
      kind: 'go' as const,
      title: label,
      sub: group,
      glyph: '›',
      href,
      aliases: NAV_ALIASES[href],
    })),
  );
  const runs: PaletteCommand[] = agents.map((a) => ({
    id: `run-${a.id}`,
    kind: 'run',
    title: a.name,
    sub: a.role,
    glyph: '▸',
    agentId: a.id,
    aliases: [a.name.split(/\s+/)[0].toLowerCase()],
  }));
  return [...go, ...EXTERNAL, ...runs, ...ASK];
}

/** Scope narrows to one kind; then every query word must match somewhere in
    title / sub / aliases / kind — so "run inbox" finds the Inbox agent and
    "jump comms" finds the view. */
export function filterPalette(commands: PaletteCommand[], query: string, scope: PaletteScope): PaletteCommand[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return commands.filter((c) => {
    if (scope !== 'all' && c.kind !== scope) return false;
    if (words.length === 0) return true;
    const hay = `${c.title} ${c.sub} ${c.aliases?.join(' ') ?? ''} ${c.kind === 'go' ? 'go open jump' : c.kind}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
