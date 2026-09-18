import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/data';
import { latestEmails } from '@/lib/connectors/email';
import { recentChats } from '@/lib/connectors/whatsapp';
import { recentMessages } from '@/lib/connectors/slack';
import { upcomingEvents } from '@/lib/connectors/gcal';
import { attioClients } from '@/lib/connectors/attio';
import { buildDigest, stackDigest, type CommsDigest, type DigestContext, type DigestEntry } from '@/lib/comms-digest';
import type { CommsItem } from '@/lib/comms';

/**
 * Gather the last 24 hours across every channel and rank it.
 *
 * The four inboxes, WhatsApp and Slack are read through the SAME connectors
 * /comms uses, so the digest and the page can never disagree about what
 * arrived. Every source is independently guarded: one dead connector degrades
 * the report (and says so in `sources`) instead of losing the whole morning.
 *
 * Context for the ranking comes from live systems too — the calendar supplies
 * who has calls booked, Attio the client roster, and contact_tags the
 * students and family the operator has tagged on /comms. Tag someone there and
 * tomorrow's digest ranks them; that unity across sources is the point.
 */
export type DigestSourceState = { source: string; ok: boolean; count: number; error?: string };

export type DigestRunResult = {
  digest: CommsDigest;
  sources: DigestSourceState[];
};

async function guarded(
  source: string,
  fn: () => Promise<CommsItem[]>,
): Promise<{ items: CommsItem[]; state: DigestSourceState }> {
  try {
    const items = await fn();
    return { items, state: { source, ok: true, count: items.length } };
  } catch (err) {
    return {
      items: [],
      state: { source, ok: false, count: 0, error: err instanceof Error ? err.message : String(err) },
    };
  }
}

/** Slack history has no CommsItem shape of its own — map it onto one. */
async function slackItems(): Promise<CommsItem[]> {
  const msgs = await recentMessages(60);
  return msgs.map((m) => ({
    source: 'slack' as const,
    title: `#${m.channel.replace(/^#/, '')}`,
    preview: m.text,
    ts: new Date(Number(m.ts) * 1000).toISOString(),
    sender: m.user || `#${m.channel}`,
    replyTo: m.channel,
  }));
}

export async function gatherDigestContext(now = Date.now()): Promise<DigestContext> {
  const [events, attio] = await Promise.all([
    upcomingEvents(process.env, { days: 7, limit: 40 }).catch(() => []),
    attioClients().catch(() => ({ clients: [] as { name: string }[] })),
  ]);

  const tags = (() => {
    try {
      return getDb().contactTags.all();
    } catch {
      return [];
    }
  })();

  return {
    meetingTitles: events.map((e) => e.title).filter(Boolean),
    clientNames: attio.clients.map((c) => c.name).filter(Boolean),
    students: tags.filter((t) => /student|cohort/i.test(t.tag)).map((t) => t.person),
    family: tags.filter((t) => /family|personal/i.test(t.tag)).map((t) => t.person),
    now,
  };
}

/**
 * What the previous report still owes him: its entries, plus everything he has
 * cleared. Never throws — a database problem must degrade to "no carry-over",
 * not lose this morning's report.
 */
function backlog(): { previous: DigestEntry[]; cleared: string[] } {
  try {
    const db = getDb();
    const last = db.commsDigests.latest();
    const previous = last
      ? ((JSON.parse(last.payload) as DigestRunResult).digest?.entries ?? [])
      : [];
    return { previous, cleared: db.digestReads.keys() };
  } catch {
    return { previous: [], cleared: [] };
  }
}

export async function runCommsDigest(now = Date.now()): Promise<DigestRunResult> {
  const [email, whatsapp, slack, ctx] = await Promise.all([
    guarded('email', () => latestEmails(120)),
    guarded('whatsapp', () => recentChats(80)),
    guarded('slack', slackItems),
    gatherDigestContext(now),
  ]);

  const items = [...email.items, ...whatsapp.items, ...slack.items];
  // The 24h window decides what is NEW; the previous report decides what is
  // still owed, since the operator does not want an unanswered thread to
  // clear out just because a new report ran, so it rides along underneath.
  const { previous, cleared } = backlog();
  const digest = stackDigest(buildDigest(items, ctx), previous, cleared, now);
  return { digest, sources: [email.state, whatsapp.state, slack.state] };
}

/** Run it and persist, so /comms can render this morning's report on load. */
export async function runAndStoreCommsDigest(now = Date.now()): Promise<DigestRunResult> {
  const result = await runCommsDigest(now);
  try {
    getDb().commsDigests.insert({
      id: randomUUID(),
      generatedAt: result.digest.generatedAt,
      payload: JSON.stringify(result),
    });
  } catch {
    // storage failure must not lose the report the caller already holds
  }
  return result;
}

/** One-line headline for the run log and the agent summary. */
export function digestSummary(r: DigestRunResult): string {
  const c = r.digest.counts;
  const dead = r.sources.filter((s) => !s.ok).map((s) => s.source);
  const held = r.digest.entries.filter((e) => e.carried).length;
  const scope = held ? `${r.digest.total} open (${held} held over)` : `${r.digest.total} in 24h`;
  const head = `${r.digest.needsReply} need a reply (${c.call} call · ${c.client} client · ${c.people} people · ${c.branddeal} brand) of ${scope}; ${r.digest.unsubscribes.length} to unsubscribe`;
  return dead.length ? `${head} — ${dead.join(', ')} unavailable` : head;
}
