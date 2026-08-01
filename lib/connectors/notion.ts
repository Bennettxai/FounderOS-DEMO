import { Client } from '@notionhq/client';
import type { ConnectorStatus } from '@/lib/connectors/types';

export type NotionPage = { id: string; title: string; lastEdited: string; url: string };

function client(env: Record<string, string | undefined>): Client | null {
  return env.NOTION_API_KEY ? new Client({ auth: env.NOTION_API_KEY }) : null;
}

export async function notionStatus(env: Record<string, string | undefined> = process.env): Promise<ConnectorStatus> {
  const notion = client(env);
  if (!notion) {
    return {
      id: 'notion',
      name: 'Notion',
      kind: 'notion',
      state: 'not_configured',
      detail: 'Set NOTION_API_KEY (internal integration secret) in .env.local and share target pages with it.',
    };
  }
  try {
    const me = await notion.users.me({});
    return {
      id: 'notion',
      name: 'Notion',
      kind: 'notion',
      state: 'connected',
      detail: `Connected as ${me.name ?? 'integration'}`,
    };
  } catch (err) {
    return {
      id: 'notion',
      name: 'Notion',
      kind: 'notion',
      state: 'error',
      detail: `Key set but auth failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function recentPages(
  limit = 10,
  env: Record<string, string | undefined> = process.env,
): Promise<NotionPage[]> {
  const notion = client(env);
  if (!notion) throw new Error('NOTION_API_KEY is not set');
  const res = await notion.search({
    page_size: limit,
    sort: { direction: 'descending', timestamp: 'last_edited_time' },
  });
  return res.results.map((page) => {
    const p = page as { id: string; url?: string; last_edited_time?: string; properties?: Record<string, unknown> };
    let title = 'Untitled';
    for (const prop of Object.values(p.properties ?? {})) {
      const t = prop as { type?: string; title?: { plain_text?: string }[] };
      if (t.type === 'title' && t.title?.length) {
        title = t.title.map((s) => s.plain_text ?? '').join('');
        break;
      }
    }
    return { id: p.id, title, lastEdited: p.last_edited_time ?? '', url: p.url ?? '' };
  });
}
