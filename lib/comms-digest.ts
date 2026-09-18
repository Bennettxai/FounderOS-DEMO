import type { CommsItem } from '@/lib/comms';

/**
 * The 9am comms digest: who the operator actually needs to respond to.
 *
 * The priority order it encodes, highest first: people you have a call with
 * today, then clients and prospects, then students and family asking about
 * cohort work, then group chats, then brand-deal threads, and last anything
 * from a company or a piece of software. People rank above systems.
 *
 * Everything here is pure so the ranking is unit-testable; the connectors are
 * gathered in lib/comms-digest-run.ts and the job is fired by the cron tick.
 * The rule that matters most: a real human NEVER falls into `noise`. Only
 * detected bulk/automated senders do, because that tier is also the
 * unsubscribe list and dropping a client into it would lose the client.
 */

/** Priority order, highest first. Index doubles as the sort rank. */
export const TIER_ORDER = ['call', 'client', 'people', 'branddeal', 'group', 'noise'] as const;
export type DigestTier = (typeof TIER_ORDER)[number];

export type DigestContext = {
  /** Calendar event titles in/near the window — "people I have calls with". */
  meetingTitles: string[];
  /** Client + prospect names (Attio roster, proposal recipients). */
  clientNames: string[];
  students: string[];
  family: string[];
  now: number;
};

export type DigestEntry = {
  tier: DigestTier;
  rank: number; // TIER_ORDER index; ties broken by recency
  reason: string;
  source: CommsItem['source'];
  sender: string;
  title: string;
  preview: string;
  ts: string;
  replyTo?: string;
  account?: string;
  /** true when this rode over from an earlier report instead of arriving today */
  carried?: boolean;
  /** when it FIRST appeared in a report; set once and never moved */
  firstSeenAt?: string;
};

export type UnsubscribeCandidate = { sender: string; count: number; reason: string };

export type CommsDigest = {
  generatedAt: string;
  windowHours: number;
  entries: DigestEntry[];
  unsubscribes: UnsubscribeCandidate[];
  counts: Record<DigestTier, number>;
  total: number;
  /** Entries genuinely awaiting a reply: everything above group chatter. */
  needsReply: number;
};

const WINDOW_HOURS = 24;

/**
 * How long an unanswered entry keeps riding along.
 *
 * the operator, 2026-08-19: "if I don't clear out all of the people in that report,
 * I want you to stack the new report on top of the old one." The 24h window
 * still decides what is NEW; this decides how long something he never answered
 * stays in front of him. A cap exists so a month of ignored newsletters cannot
 * grow the report without bound.
 */
export const CARRY_MAX_DAYS = 30;

/**
 * How long a "cleared" mark is kept. MUST exceed CARRY_MAX_DAYS: if a read key
 * were pruned while its entry could still be carried, the entry would come back
 * the next morning as though he had never answered it. That is the exact bug
 * the old hand-written 7 days would have caused the moment carrying shipped.
 */
export const READ_RETENTION_DAYS = CARRY_MAX_DAYS + 15;

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Tokens worth matching on: drops initials and filler that match everything. */
function tokens(s: string): string[] {
  return norm(s)
    .split(' ')
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

/**
 * Words that never identify a PERSON. The operator's own brands are in here
 * deliberately: a calendar full of one company name would otherwise put every
 * sender carrying that name into the call tier.
 */
const STOP = new Set([
  'the', 'and', 'com', 'net', 'org', 'call', 'with', 'meeting', 'sync', 'chat', 'zoom', 'meet',
  're', 'fwd', 'gmail', 'group', 'inc', 'llc', 'ltd', 'team', 'founder', 'rivera',
  // brands, ventures and role words, not names
  'vantage', 'founderos', 'founder', 'launchpad cohort', 'launchpad cohorts', 'agency', 'cohort', 'core',
  'sales', 'demo', 'ops', 'support', 'admin', 'invited', 'you', 'new', 'via', 'linkedin',
]);

const BULK_LOCALPARTS = /^(no-?reply|do-?not-?reply|notifications?|alerts?|mailer|bounce|postmaster|support|info|hello|hi|team|news|newsletter|updates?|billing|receipts?|digest|marketing|noreply)$/i;

const BULK_SUBJECT = /\b(unsubscribe|newsletter|digest|webinar|invoice|receipt|your order|deployment|build (succeeded|failed)|password reset|verify your|security alert|sign-?in|new login|promo|% off|sale ends|limited time)\b/i;

const BULK_BODY = /\b(unsubscribe|manage (your )?(email )?preferences|opt ?out|view (this|in) browser|you (are )?receiv(ed|ing) this)\b/i;

/** Relayed list mail: "Someone via LinkedIn", "X via Substack". */
const BULK_RELAY = /\bvia (linkedin|substack|medium|quora|facebook|nextdoor|meetup|eventbrite)\b/i;

/**
 * Sender names that are an ORGANISATION, not a person. Each pattern here was
 * added because a sender of that shape had been sitting in the people tier.
 */
const BULK_ORG = /\b(ticketmaster|nextdoor|eventbrite|stubhub|club|theat(er|re)|arena|casino|store|shop|dealership|bank|airlines?|hotel|tickets?)\b|^trending on\b|^the .* (team|crew)$|^mail delivery|daemon|postmaster/i;

/** Machine mail: repo notifications, CI, deploys, monitors. */
const BULK_MACHINE = /\[[\w.-]+\/[\w.-]+\]|\b(run (failed|succeeded)|workflow run|build (failed|passed)|pipeline|pull request|commit|merged in|alert:|incident|uptime|delivery status notification|undeliverable|recap of your meeting)\b/i;

/**
 * Is this an automated / company sender rather than a person?
 * Conservative on purpose: a false positive here hides a client.
 *
 * Both text fields are searched, never one each. The connectors disagree about
 * which is which: lib/connectors/email.ts puts "<inbox> — <sender>" in `title`
 * and the SUBJECT in `preview`, while Slack puts the channel in `title` and
 * the message in `preview`. Probing live data caught this — a full day of mail
 * produced zero unsubscribe candidates, because every subject-shaped rule was
 * reading an inbox label.
 */
export function isBulkSender(sender: string, title: string, preview: string): boolean {
  const local = sender.includes('@') ? sender.split('@')[0] : '';
  if (local && BULK_LOCALPARTS.test(local.replace(/[._-]?\d+$/, ''))) return true;
  if (BULK_RELAY.test(sender) || BULK_ORG.test(sender)) return true;
  const text = `${title}\n${preview}`;
  return BULK_MACHINE.test(text) || BULK_BODY.test(text) || BULK_SUBJECT.test(text);
}

/** WhatsApp/Slack group threads: a member count or an obvious group label. */
export function isGroupChat(item: CommsItem): boolean {
  const s = item.sender ?? '';
  if (/\(\s*\d+\s*\)\s*$/.test(s)) return true; // "Cohort 1 (12)"
  return /\b(group|chat|crew|team|family|squad|community)\b/i.test(s) && item.source !== 'email';
}

const COHORT_RE = /\b(cohort|founderos|founder os|deploy day|railway|gbrain|g-brain|module|lesson|homework|onboarding|sop|workspace)\b/i;
const BRAND_RE = /\b(sponsor|sponsorship|partnership|collab|collaboration|brand deal|ambassador|paid promo|ugc|affiliate)\b/i;
const REPLY_RE = /\b(re:|following up|circling back|as discussed|per our call|proposal|quote|invoice attached|contract|next steps?|kick ?off)\b/i;

/**
 * Does `needle` identify the same person as one of `haystack`?
 *
 * Deliberately strict, because this decides the top of the report. One shared
 * short token is not identity: a common company word can match half a
 * calendar. A match needs either TWO tokens in the same entry (first + last
 * name) or one distinctive token of six characters or more (a surname).
 */
function nameHits(needle: string, haystack: string[]): boolean {
  const nt = tokens(needle);
  if (nt.length === 0) return false;
  return haystack.some((entry) => {
    const h = norm(entry);
    const hit = nt.filter((t) => h.includes(t));
    return hit.length >= 2 || hit.some((t) => t.length >= 6);
  });
}

export function classify(item: CommsItem, ctx: DigestContext): { tier: DigestTier; reason: string } {
  const sender = item.sender ?? '';
  const title = item.title ?? '';
  const preview = item.preview ?? '';
  const group = isGroupChat(item);
  const bulk = isBulkSender(sender, title, preview);

  // 1. Anyone he has a call with. Calendar titles carry the names (CalDAV
  //    gives no attendee list), so match the sender against the title text.
  if (!bulk && sender && nameHits(sender, ctx.meetingTitles)) {
    return { tier: 'call', reason: 'on your calendar — you have a call with them' };
  }

  // 2. A client or prospect. A reply landing on a proposal or deal thread is
  //    the case that matters most here, so REPLY_RE promotes too.
  if (!bulk && sender && nameHits(sender, ctx.clientNames)) {
    return { tier: 'client', reason: 'current client or prospect' };
  }
  if (!bulk && !group && REPLY_RE.test(`${title}\n${preview}`) && nameHits(sender, ctx.clientNames.concat(ctx.meetingTitles))) {
    return { tier: 'client', reason: 'replying on a proposal or deal thread' };
  }

  const text = `${title}\n${preview}`;

  // 3. Cohort questions beat group-chat noise even inside a group.
  if (COHORT_RE.test(text)) {
    return { tier: 'people', reason: 'cohort question' };
  }

  // 4. Students and family.
  if (sender && nameHits(sender, ctx.students)) return { tier: 'people', reason: 'your student' };
  if (sender && nameHits(sender, ctx.family)) return { tier: 'people', reason: 'family' };

  // 5. Group chatter, once the cohort check above has had its chance.
  if (group) return { tier: 'group', reason: 'group chat' };

  // 6. Brand deals: mid priority by his own ranking. Bulk-checked first, so a
  //    LinkedIn digest about someone else's "partnership" is not a brand deal.
  if (!bulk && BRAND_RE.test(text)) {
    return { tier: 'branddeal', reason: 'brand deal or partnership' };
  }

  // 7. Companies and software last; everyone else is a person worth reading.
  if (bulk) return { tier: 'noise', reason: 'automated or marketing sender' };
  return { tier: 'people', reason: 'a person wrote to you' };
}

/** Bulk senders in the window, noisiest first — the unsubscribe worklist. */
export function unsubscribeCandidates(items: CommsItem[], ctx: DigestContext): UnsubscribeCandidate[] {
  const counts = new Map<string, number>();
  for (const i of items) {
    if (classify(i, ctx).tier !== 'noise') continue;
    const s = i.sender ?? '';
    if (!s) continue;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([sender, count]) => ({
      sender,
      count,
      reason: count > 1 ? `${count} messages in 24h` : 'automated sender',
    }))
    .sort((a, b) => b.count - a.count || a.sender.localeCompare(b.sender));
}

export function buildDigest(items: CommsItem[], ctx: DigestContext, windowHours = WINDOW_HOURS): CommsDigest {
  const cutoff = ctx.now - windowHours * 3600_000;
  const fresh = items.filter((i) => {
    const t = Date.parse(i.ts);
    return Number.isFinite(t) && t >= cutoff && t <= ctx.now + 60_000;
  });

  const entries: DigestEntry[] = fresh.map((i) => {
    const { tier, reason } = classify(i, ctx);
    return {
      tier,
      rank: TIER_ORDER.indexOf(tier),
      reason,
      source: i.source,
      sender: i.sender ?? 'unknown',
      title: i.title,
      preview: i.preview,
      ts: i.ts,
      ...(i.replyTo ? { replyTo: i.replyTo } : {}),
      ...(i.account ? { account: i.account } : {}),
    };
  });

  const ordered = orderEntries(entries);
  return {
    generatedAt: new Date(ctx.now).toISOString(),
    windowHours,
    entries: ordered,
    unsubscribes: unsubscribeCandidates(fresh, ctx),
    ...tally(ordered),
  };
}

/** tier first, then NEW above held-over, then newest inside each group. */
function orderEntries(entries: DigestEntry[]): DigestEntry[] {
  return [...entries].sort(
    (a, b) =>
      a.rank - b.rank ||
      Number(!!a.carried) - Number(!!b.carried) ||
      Date.parse(b.ts) - Date.parse(a.ts),
  );
}

/** Recount a set of entries so the header never disagrees with the rows. */
function tally(entries: DigestEntry[]): Pick<CommsDigest, 'counts' | 'total' | 'needsReply'> {
  const counts = Object.fromEntries(TIER_ORDER.map((t) => [t, 0])) as Record<DigestTier, number>;
  for (const e of entries) counts[e.tier] += 1;
  return {
    counts,
    total: entries.length,
    needsReply: counts.call + counts.client + counts.people + counts.branddeal,
  };
}

/**
 * Stack this morning's report ON TOP of what is left of the older ones.
 *
 * An entry now leaves the report for exactly one reason: the operator cleared it.
 * Falling out of the 24-hour window is no longer one, which was the whole
 * complaint — the report was forgetting the very people it existed to chase.
 *
 * Pure on purpose: the caller supplies the previous entries and the cleared
 * keys, so this is fully testable and the runner stays the only thing that
 * touches the database.
 */
export function stackDigest(
  fresh: CommsDigest,
  previous: DigestEntry[],
  clearedKeys: Iterable<string>,
  now = Date.now(),
): CommsDigest {
  const cleared = new Set(clearedKeys);
  const seen = new Set(fresh.entries.map(entryKey));
  const oldest = now - CARRY_MAX_DAYS * 86_400_000;

  const carried: DigestEntry[] = [];
  for (const e of previous) {
    const key = entryKey(e);
    // fresh wins a collision: today's copy is the one with current context
    if (cleared.has(key) || seen.has(key)) continue;
    const t = Date.parse(e.ts);
    if (!Number.isFinite(t) || t < oldest) continue;
    seen.add(key);
    carried.push({ ...e, carried: true, firstSeenAt: e.firstSeenAt ?? e.ts });
  }

  const entries = orderEntries([...fresh.entries, ...carried]);
  return { ...fresh, entries, ...tally(entries) };
}

/**
 * A stable id for one message in the report.
 *
 * Must survive a rebuild: the 09:00 job regenerates the digest from scratch
 * and "run now" does it on demand, so anything positional or random would
 * resurrect every message the operator had already cleared. Channel + sender +
 * timestamp is what actually identifies a message, and deliberately NOT the
 * tier — re-tuning the ranking must not un-clear his inbox.
 */
export function entryKey(e: Pick<DigestEntry, 'source' | 'sender' | 'ts'>): string {
  return `${e.source}|${e.sender}|${e.ts}`;
}

export type ReplyTarget = {
  kind: 'email' | 'whatsapp' | 'slack' | 'none';
  /** Where clicking should go, or null when nothing honest can be offered. */
  href: string | null;
  label: string;
};

/**
 * Where a reply to this message actually goes.
 *
 * WhatsApp cannot be SENT to from the OS (the connector reads a local SQLite
 * copy, there is no send API), so the honest move is a deep link that opens
 * the real conversation — wa.me/<number>, built from the chat's JID. Group
 * threads have no dialable number, so they get no link rather than a broken
 * one. Email and Slack can genuinely be sent from here via /api/comms/reply.
 */
export function replyTarget(e: Pick<DigestEntry, 'source' | 'sender' | 'replyTo'>): ReplyTarget {
  if (e.source === 'email') {
    const to = e.replyTo ?? (e.sender.includes('@') ? e.sender : null);
    return { kind: 'email', href: to ? `mailto:${to}` : null, label: 'Reply' };
  }
  if (e.source === 'whatsapp') {
    const digits = (e.replyTo ?? '').replace(/\D/g, '');
    return { kind: 'whatsapp', href: digits ? `https://wa.me/${digits}` : null, label: 'WhatsApp' };
  }
  if (e.source === 'slack') {
    const ch = (e.replyTo ?? '').replace(/^#/, '');
    return { kind: 'slack', href: ch ? `slack://channel?team=&id=${ch}` : null, label: 'Slack' };
  }
  return { kind: 'none', href: null, label: '' };
}
