import type { Agent } from '@/lib/schemas';

/**
 * The wiki-style detail shown when you click an agent in the knowledge graph:
 * the markdown files that define the agent and the servers/tools it connects to
 * (flagged when they're MCP servers). Brain-store paths are seeded/derived —
 * real-ready for when each agent's actual definition files get wired in.
 */

// Tools that are backed by an MCP server (vs. a plain integration/local tool).
const MCP_SLUGS = new Set([
  'attio', 'notion', 'slack', 'gbrain', 'obsidian', 'miro', 'playwright', 'figma',
  'serena', 'context7', 'zernio', 'arcads', 'wispr', 'higgsfield', 'canva', 'gmail',
  'google-calendar', 'calendar', 'vercel',
]);

export type WikiServer = { slug: string; name: string; mcp: boolean };
export type AgentWiki = {
  id: string;
  name: string;
  role: string;
  model: string;
  path: string; // brain-store definition folder
  files: string[]; // markdown files that make up the agent
  servers: WikiServer[]; // tools / MCP servers the agent is wired to
};

/** 'comms-feed' → 'Comms Feed' */
export function prettifySlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function buildAgentWiki(agent: Agent): AgentWiki {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    model: agent.model,
    path: `brain-store/agents/${agent.id}`,
    files: ['system.md', 'playbook.md', 'memory.md', `${agent.id}.config.md`],
    servers: agent.tools.map((slug) => ({ slug, name: prettifySlug(slug), mcp: MCP_SLUGS.has(slug) })),
  };
}

// Short, real-ready summaries for the tools agents lean on most. Anything not
// listed falls back to a generic line — swap for live tool docs later.
const TOOL_SUMMARY: Record<string, string> = {
  attio: 'CRM of record — companies, people, and deals across Vantage + Launchpad Cohort.',
  gbrain: 'The G-Brain CLI — hybrid search over the markdown brain-store + Supabase second brain.',
  'brain-store': 'Local markdown knowledge base; the source of truth G-Brain syncs from.',
  supabase: 'Postgres + pgvector "second brain" holding chunked embeddings.',
  zeroentropy: 'Embedding provider behind G-Brain hybrid retrieval.',
  'comms-feed': 'Unified inbox feed — WhatsApp, email, Slack, calendar in one stream.',
  zernio: 'Social posting + audience analytics across the five platforms.',
  manychat: 'DM automation across Instagram and Messenger.',
  notion: 'Docs + databases workspace.',
  obsidian: 'Local vault, incl. the Claude conversation archive.',
  miro: 'Visual boards for planning and maps.',
  wispr: 'Local dictation / flow capture.',
  arcads: 'AI UGC ad generation.',
  higgsfield: 'AI image / video / audio generation.',
  playwright: 'Headless browser automation (e.g. Skool).',
  stripe: 'Payments + balance + charges.',
  slack: 'Team channels, read + post via the bot.',
  openclaw: 'OpenClaw runtime the agents execute on.',
  ollama: 'Local model runtime.',
  remotion: 'Programmatic video rendering.',
};

export type ToolWiki = {
  slug: string;
  name: string;
  mcp: boolean;
  kind: string;
  path: string;
  summary: string;
  usedBy: string[];
};

export function buildToolWiki(slug: string, usedBy: string[] = []): ToolWiki {
  const mcp = MCP_SLUGS.has(slug);
  const name = prettifySlug(slug);
  return {
    slug,
    name,
    mcp,
    kind: mcp ? 'MCP server' : 'integration',
    path: `brain-store/tools/${slug}.md`,
    summary: TOOL_SUMMARY[slug] ?? `${name} — wired in through the ${mcp ? 'MCP server' : 'tool'} layer.`,
    usedBy,
  };
}
