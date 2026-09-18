import type { Agent } from '@/lib/schemas';
import { agentSlug, toolSlug, type WikiEntry, type WikiIndex, type WikiRef } from '@/lib/brain-wiki';

/**
 * The wiki detail shown when you click an agent or a tool in the knowledge
 * graph.
 *
 * This used to be fiction. Every agent was reported to be defined by
 * `system.md`, `playbook.md`, `memory.md` and `<id>.config.md` — four files
 * that exist nowhere in the store, which really keeps one flat
 * `agents/<id>.md` per agent — and every tool's description came from a
 * hand-typed dictionary in this file that drifted from the store the moment
 * either changed.
 *
 * Now both read the actual page: its path on disk, the summary its author
 * wrote, the `- Key: Value` facts it states, and its real links in and out.
 * When a page does not exist the answer is `hasPage: false` and empty fields,
 * never a plausible-looking guess, so the panel can say "no page yet" and mean
 * it. Same honesty rule the connectors follow.
 *
 * Pure and client-safe: the index is read from disk by the server and handed
 * in (see lib/brain-wiki.ts).
 */

// Tools that are backed by an MCP server (vs. a plain integration/local tool).
// A hand-kept fact the store does not record; everything else here is read.
const MCP_SLUGS = new Set([
  'attio', 'notion', 'slack', 'gbrain', 'obsidian', 'miro', 'playwright', 'figma',
  'serena', 'context7', 'zernio', 'arcads', 'wispr', 'higgsfield', 'canva', 'gmail',
  'google-calendar', 'calendar', 'vercel', 'plaud',
]);

export type WikiServer = { slug: string; name: string; mcp: boolean; hasPage: boolean };

export type AgentWiki = {
  id: string;
  name: string;
  role: string;
  model: string;
  /** Whether the brain-store actually holds a page for this agent. */
  hasPage: boolean;
  /** The real file, relative to the repo root, or null when there is none. */
  path: string | null;
  /** The real file name(s) that define it — [] when the store has none. */
  files: string[];
  /** The page's own opening line. */
  summary: string;
  /** The `- Key: Value` facts the page states (Tier, Status, Runs on, …). */
  fields: Record<string, string>;
  /** Real outbound wikilinks; a broken one carries slug: null. */
  links: WikiRef[];
  /** Real inbound wikilinks: the pages that point at this agent. */
  backlinks: WikiRef[];
  /** The tools / MCP servers the agent is wired to. */
  servers: WikiServer[];
};

/** 'comms-feed' → 'Comms Feed' — the fallback name when no page names it. */
export function prettifySlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const STORE = 'brain-store';

function pageOf(index: WikiIndex | undefined, slug: string): WikiEntry | null {
  return index?.[slug] ?? null;
}

export function buildAgentWiki(agent: Agent, index?: WikiIndex): AgentWiki {
  const page = pageOf(index, agentSlug(agent.id));
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    model: agent.model,
    hasPage: page !== null,
    path: page ? `${STORE}/${page.path}` : null,
    files: page ? [page.path.split('/').pop()!] : [],
    summary: page?.summary ?? '',
    fields: page?.fields ?? {},
    links: page?.links ?? [],
    backlinks: page?.backlinks ?? [],
    servers: agent.tools.map((slug) => {
      const toolPage = pageOf(index, toolSlug(slug));
      return {
        slug,
        name: toolPage?.title ?? prettifySlug(slug),
        mcp: MCP_SLUGS.has(slug),
        hasPage: toolPage !== null,
      };
    }),
  };
}

export type ToolWiki = {
  slug: string;
  name: string;
  mcp: boolean;
  kind: string;
  hasPage: boolean;
  path: string | null;
  summary: string;
  fields: Record<string, string>;
  /** Who is wired to it right now, from live OS state (not from the page). */
  usedBy: string[];
  links: WikiRef[];
  /** The pages that link here — the store's own answer to "who uses this". */
  backlinks: WikiRef[];
};

export function buildToolWiki(slug: string, usedBy: string[] = [], index?: WikiIndex): ToolWiki {
  const mcp = MCP_SLUGS.has(slug);
  const page = pageOf(index, toolSlug(slug));
  return {
    slug,
    name: page?.title ?? prettifySlug(slug),
    mcp,
    kind: mcp ? 'MCP server' : 'integration',
    hasPage: page !== null,
    path: page ? `${STORE}/${page.path}` : null,
    summary: page?.summary ?? '',
    fields: page?.fields ?? {},
    usedBy,
    links: page?.links ?? [],
    backlinks: page?.backlinks ?? [],
  };
}
