/**
 * Slack, seen through the client roster: one card per CURRENT client showing
 * the real last message, or an honest empty state.
 *
 * Two rules, both load-bearing:
 *
 *  1. Only current clients. The roster is the live Attio DEAL list, which is
 *     mostly cold pipeline (Contacted and Closed Lost dominate it). Won and
 *     active work is a client; a lead is not. A lead with a real Slack thread
 *     counts too, because talking in Slack is stronger evidence than a deal
 *     stage.
 *  2. Nothing is invented. Cards used to fabricate a last message, unread
 *     count, heat and a #channel hashed from the client id, badged "demo".
 *     A quiet client now says so.
 */
import type { RosterClient } from '@/lib/schemas';
import type { ConnectorStatus } from '@/lib/connectors/types';
import { recentMessages, slackStatus, type SlackMessage } from '@/lib/connectors/slack';
import { attioClients } from '@/lib/connectors/attio';

export type SlackClientCard = {
  id: string;
  name: string;
  /** The real Slack channel, or null when none is linked. Never invented. */
  channel: string | null;
  lastText: string;
  lastTs: string | null; // ISO, null when there is no thread
  unread: number;
  heat: 'hot' | 'warm' | 'cold' | null;
  waiting: 'you' | 'them' | 'none';
  live: boolean;
};

/**
 * Stages that mean "this is a client I'm working with", not a lead. Attio deal
 * stages come through raw, so both its wording and the OS's own are matched.
 */
const CURRENT_STATUS = /^(closed won|won|active|onboarding|delivering|retainer)$/i;

export function isCurrentClient(c: RosterClient): boolean {
  return CURRENT_STATUS.test(c.status.trim());
}

const DAY_MS = 86_400_000;

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Heat from how recently the last message landed relative to `now`. */
function heatFromAge(lastTsMs: number, now: number): SlackClientCard['heat'] {
  const age = now - lastTsMs;
  if (age < DAY_MS) return 'hot';
  if (age < 3 * DAY_MS) return 'warm';
  return 'cold';
}

/**
 * Build one card per client. A card is live when a Slack message's channel or
 * user matches the client name; otherwise it is a deterministic seeded card.
 * `now` is injected so the result is pure and testable.
 */
export function slackClientBoard(clients: RosterClient[], messages: SlackMessage[], now: number): SlackClientCard[] {
  const sorted = [...messages].sort((a, b) => Number(b.ts) - Number(a.ts));

  const cards = clients.map((c) => {
    const key = norm(c.name);
    // newest matching message first (Slack ts are unix seconds)
    const match =
      key.length >= 3
        ? sorted.find((m) => {
            const ch = norm(m.channel);
            const usr = norm(m.user);
            return ch.includes(key) || key.includes(ch) || usr.includes(key);
          })
        : undefined;

    if (match) {
      const lastTsMs = Number(match.ts) * 1000;
      const valid = Number.isFinite(lastTsMs) && lastTsMs > 0;
      return {
        id: c.id,
        name: c.name,
        channel: `#${match.channel.replace(/^#/, '')}`,
        lastText: match.text,
        lastTs: new Date(valid ? lastTsMs : now).toISOString(),
        unread: 0, // history read doesn't expose per-user unread; honest 0
        heat: heatFromAge(valid ? lastTsMs : now, now),
        // their message is the latest, so the ball is in your court
        waiting: 'you' as const,
        live: true,
      };
    }

    // No thread. Say so — the old code invented one here.
    return {
      id: c.id,
      name: c.name,
      channel: null,
      lastText: '',
      lastTs: null,
      unread: 0,
      heat: null,
      waiting: 'none' as const,
      live: false,
    };
  });

  // A lead with a real Slack thread IS current, whatever the deal stage says.
  const keep = cards.filter((card, i) => card.live || isCurrentClient(clients[i]));
  // live threads first, newest first; quiet clients after, by name
  return keep.sort((a, b) => {
    if (a.live !== b.live) return a.live ? -1 : 1;
    if (a.live && b.live) return Date.parse(b.lastTs!) - Date.parse(a.lastTs!);
    return a.name.localeCompare(b.name);
  });
}

/**
 * Live assembly: the real Attio roster narrowed to current clients, plus the
 * live Slack overlay. No placeholder roster: an empty board is the honest
 * answer when there are no current clients, and the connector status next to
 * it already explains whether Slack itself is reachable.
 */
export async function gatherSlackClientBoard(): Promise<{ cards: SlackClientCard[]; status: ConnectorStatus }> {
  const status = await slackStatus();
  const attio = await attioClients();

  let messages: SlackMessage[] = [];
  try {
    messages = await recentMessages(30);
  } catch {
    messages = []; // no token / auth failure — cards go quiet, status stays honest
  }

  return { cards: slackClientBoard(attio.clients, messages, Date.now()), status };
}

