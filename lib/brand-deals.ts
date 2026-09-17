/**
 * Brand-deal autopilot integration — reads the bdpilot Telegram-approval
 * daemon's state plus gsend's live draft list (both live on this host).
 *
 * READ-ONLY by design: the single human send gate is the operator's Telegram tap.
 * This module never writes bdpilot state — the daemon owns that file, and a
 * concurrent writer clobbers it (learned the hard way, twice).
 */

export type DealStage = 'approval' | 'sent' | 'skipped' | 'closed';

export type ChainMessage = { who: string; date: string; body: string };

export type DealOutcome = 'open' | 'won' | 'lost' | 'skipped';

export type Deal = {
  id: string;
  brand: string;
  email: string;
  subject: string;
  tag: 'UNIQUE' | 'NORMAL';
  tagReason: string;
  chainLen: number;
  summary: string | null;
  chain: ChainMessage[];
  stage: DealStage;
  lastEventAt: string | null;
  /** Latest anchor we quoted in the thread (parsed) or a human-set figure. */
  quotedUsd: number | null;
  quoteSource: 'parsed' | 'manual' | null;
  outcome: DealOutcome;
};

export type DealVolume = {
  /** Active pipeline: approvalUsd + awaitingUsd by construction. */
  openUsd: number;
  approvalUsd: number;
  awaitingUsd: number;
  wonUsd: number;
  lostUsd: number;
  quotedDeals: number;
};

export type DealEvent = {
  at: string;
  kind: 'announced' | 'sent' | 'skipped';
  dealId: string;
  brand: string;
};

export type BrandDealsSnapshot = {
  deals: Deal[];
  events: DealEvent[];
  counts: {
    approval: number;
    sent: number;
    skipped: number;
    closed: number;
    unique: number;
    won: number;
    lost: number;
  };
  volume: DealVolume;
  lastActivityAt: string | null;
  sources: { state: boolean; log: boolean; drafts: boolean };
};

export type DealOverrideRow = { dealId: string; outcome: DealOutcome; amountUsd: number | null };

type BdpilotState = {
  announced?: Record<string, number>;
  done?: string[];
  tags?: Record<string, [string, string]>;
  summaries?: Record<string, string | null>;
  chains?: Record<string, string[] | null>;
};

// ---------------------------------------------------------------- parsers

export function parseRecipient(raw: string): { name: string; email: string } {
  const m = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || m[2].trim(), email: m[2].trim() };
  return { name: raw.trim(), email: raw.trim() };
}

export function parsePendingList(text: string): Array<{ id: string; to: string; subject: string }> {
  const out: Array<{ id: string; to: string; subject: string }> = [];
  for (const line of text.split('\n')) {
    const parts = line.split('\t');
    if (parts.length === 3 && /^r-?\d+$/.test(parts[0])) {
      out.push({ id: parts[0], to: parts[1], subject: parts[2] });
    }
  }
  return out;
}

export function parseLog(text: string): {
  recipients: Map<string, string>;
  events: DealEvent[];
} {
  const recipients = new Map<string, string>();
  const events: DealEvent[] = [];
  for (const line of text.split('\n')) {
    const [at, msg] = line.split('\t');
    if (!at || !msg) continue;
    let m = msg.match(/^announced (r-?\d+) -> (.+)$/);
    if (m) {
      recipients.set(m[1], m[2]);
      events.push({ at, kind: 'announced', dealId: m[1], brand: '' });
      continue;
    }
    m = msg.match(/^sent (r-?\d+)$/);
    if (m) {
      events.push({ at, kind: 'sent', dealId: m[1], brand: '' });
      continue;
    }
    m = msg.match(/^skipped (r-?\d+)$/);
    if (m) events.push({ at, kind: 'skipped', dealId: m[1], brand: '' });
  }
  return { recipients, events };
}

function unescapeHtml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** bdpilot truncates header dates mid-token ("Fri, 1 May 2026 12:55:") — tidy. */
function tidyDate(s: string): string {
  const m = s.match(/(\d{1,2}\s+\w{3,}\s+\d{4}\s+\d{2}:\d{2})/);
  return m ? m[1] : s.replace(/[:\s]+$/, '');
}

/** bdpilot caches the chain as Telegram-HTML chunks; recover the messages. */
export function parseChain(chunks: string[] | null | undefined): {
  chainLen: number;
  chain: ChainMessage[];
} {
  if (!chunks || chunks.length === 0) return { chainLen: 0, chain: [] };
  const joined = chunks.join('');
  const chain: ChainMessage[] = [];
  const re = /<b>([\s\S]*?)<\/b>\s*<i>([\s\S]*?)<\/i>\s*<blockquote expandable>([\s\S]*?)<\/blockquote>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(joined))) {
    chain.push({
      who: unescapeHtml(m[1]).trim(),
      date: tidyDate(unescapeHtml(m[2]).trim()),
      body: unescapeHtml(m[3]).trim(),
    });
  }
  const header = joined.match(/Full chain, (\d+) message/);
  return { chainLen: header ? Number(header[1]) : chain.length, chain };
}

/** Display name the send daemon uses for OUR side of a thread (the operator or
 *  their manager). Chains are parsed from the approval bot's cached HTML, so
 *  this must match the name that bot prints. */
export const OUR_SIDE_NAME = process.env.GLADOS_SENDER_NAME?.trim() || 'Operator';

/** Pull the anchor we quoted from OUR side of the thread: the last of our
 *  messages that mentions money, taking its largest figure. "8.5k" and
 *  "$4,500" forms both count; figures outside 500..200,000 are noise. */
export function extractQuotedUsd(chain: ChainMessage[]): number | null {
  const ours = chain.filter((m) => m.who === OUR_SIDE_NAME);
  for (let i = ours.length - 1; i >= 0; i--) {
    const amounts: number[] = [];
    const text = ours[i].body;
    for (const m of text.matchAll(/(\d{1,3}(?:\.\d)?)\s*k\b/gi) as Iterable<RegExpMatchArray>) {
      amounts.push(Math.round(parseFloat(m[1]) * 1000));
    }
    for (const m of text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d{3,6})(?!\d)/g) as Iterable<RegExpMatchArray>) {
      amounts.push(Math.round(Number(m[1].replace(/,/g, ''))));
    }
    const sane = amounts.filter((a) => a >= 500 && a <= 200_000);
    if (sane.length > 0) return Math.max(...sane);
  }
  return null;
}

// -------------------------------------------------------------- assembly

export function assembleSnapshot(
  state: BdpilotState,
  logText: string,
  pendingText: string,
  sources: BrandDealsSnapshot['sources'],
  overrides: DealOverrideRow[] = [],
): BrandDealsSnapshot {
  const overrideById = new Map(overrides.map((o) => [o.dealId, o]));
  const announced = state.announced ?? {};
  const done = new Set(state.done ?? []);
  const tags = state.tags ?? {};
  const summaries = state.summaries ?? {};
  const chains = state.chains ?? {};

  const pending = parsePendingList(pendingText);
  const pendingById = new Map(pending.map((p) => [p.id, p]));
  const { recipients, events } = parseLog(logText);

  const sentIds = new Set(events.filter((e) => e.kind === 'sent').map((e) => e.dealId));
  const skippedIds = new Set(events.filter((e) => e.kind === 'skipped').map((e) => e.dealId));
  const lastEventById = new Map<string, string>();
  for (const e of events) lastEventById.set(e.dealId, e.at); // log is chronological

  const ids = new Set<string>([...Object.keys(announced), ...pendingById.keys()]);
  const deals: Deal[] = [];
  for (const id of ids) {
    const pendingRow = pendingById.get(id);
    const rawTo = pendingRow?.to ?? recipients.get(id) ?? '';
    const { name, email } = parseRecipient(rawTo);
    const [tag, tagReason] = tags[id] ?? ['NORMAL', ''];
    const { chainLen, chain } = parseChain(chains[id]);
    const override = overrideById.get(id);
    const outcome: DealOutcome = override?.outcome ?? 'open';
    let stage: DealStage;
    if (outcome === 'won' || outcome === 'lost') stage = 'closed';
    else if (outcome === 'skipped') stage = 'skipped';
    else if (done.has(id)) stage = skippedIds.has(id) && !sentIds.has(id) ? 'skipped' : 'sent';
    else if (pendingRow) stage = 'approval';
    else stage = 'sent';
    const parsedQuote = extractQuotedUsd(chain);
    deals.push({
      id,
      brand: name || '(unknown)',
      email,
      subject: pendingRow?.subject ?? '',
      tag: tag === 'UNIQUE' ? 'UNIQUE' : 'NORMAL',
      tagReason,
      chainLen,
      summary: summaries[id] ?? null,
      chain,
      stage,
      lastEventAt: lastEventById.get(id) ?? null,
      quotedUsd: override?.amountUsd ?? parsedQuote,
      quoteSource: override?.amountUsd != null ? 'manual' : parsedQuote != null ? 'parsed' : null,
      outcome,
    });
  }
  // One deal per counterparty: bdpilot announces every DRAFT (edits and new
  // replies in the same thread each get an id), but the business object is
  // the thread. Merge by email — pending beats sent, newest wins, UNIQUE and
  // the richest chain/summary/quote propagate.
  const STAGE_RANK: Record<DealStage, number> = { approval: 3, sent: 2, skipped: 1, closed: 4 };
  const byEmail = new Map<string, Deal>();
  for (const d of deals) {
    const key = d.email.toLowerCase() || d.id;
    const prev = byEmail.get(key);
    if (!prev) {
      byEmail.set(key, d);
      continue;
    }
    const newer = (d.lastEventAt ?? '') >= (prev.lastEventAt ?? '') ? d : prev;
    const primary =
      STAGE_RANK[d.stage] !== STAGE_RANK[prev.stage]
        ? STAGE_RANK[d.stage] > STAGE_RANK[prev.stage]
          ? d
          : prev
        : newer;
    const richerChain = d.chainLen >= prev.chainLen ? d : prev;
    byEmail.set(key, {
      ...primary,
      tag: d.tag === 'UNIQUE' || prev.tag === 'UNIQUE' ? 'UNIQUE' : 'NORMAL',
      tagReason: d.tag === 'UNIQUE' ? d.tagReason || prev.tagReason : prev.tagReason || d.tagReason,
      chainLen: richerChain.chainLen,
      chain: richerChain.chain,
      summary: primary.summary ?? prev.summary ?? d.summary,
      subject: primary.subject || prev.subject || d.subject,
      lastEventAt: newer.lastEventAt,
      quotedUsd:
        primary.quoteSource === 'manual'
          ? primary.quotedUsd
          : (primary.quotedUsd ?? prev.quotedUsd ?? d.quotedUsd),
      quoteSource:
        primary.quoteSource === 'manual'
          ? 'manual'
          : primary.quotedUsd != null
            ? primary.quoteSource
            : (prev.quoteSource ?? d.quoteSource),
    });
  }
  const merged = [...byEmail.values()];
  merged.sort((a, b) => (b.lastEventAt ?? '').localeCompare(a.lastEventAt ?? ''));
  deals.length = 0;
  deals.push(...merged);

  const brandById = new Map(deals.map((d) => [d.id, d.brand]));
  const recent = events
    .map((e) => ({ ...e, brand: brandById.get(e.dealId) ?? e.dealId }))
    .reverse()
    .slice(0, 30);

  const usd = (rows: Deal[]) => rows.reduce((n, d) => n + (d.quotedUsd ?? 0), 0);
  const approvalDeals = deals.filter((d) => d.stage === 'approval');
  const sentDeals = deals.filter((d) => d.stage === 'sent');
  const wonDeals = deals.filter((d) => d.outcome === 'won');
  const lostDeals = deals.filter((d) => d.outcome === 'lost');
  const approvalUsd = usd(approvalDeals);
  const awaitingUsd = usd(sentDeals);

  return {
    deals,
    events: recent,
    counts: {
      approval: approvalDeals.length,
      sent: sentDeals.length,
      skipped: deals.filter((d) => d.stage === 'skipped').length,
      closed: wonDeals.length + lostDeals.length,
      unique: deals.filter((d) => d.tag === 'UNIQUE').length,
      won: wonDeals.length,
      lost: lostDeals.length,
    },
    volume: {
      openUsd: approvalUsd + awaitingUsd,
      approvalUsd,
      awaitingUsd,
      wonUsd: usd(wonDeals),
      lostUsd: usd(lostDeals),
      quotedDeals: deals.filter((d) => d.quotedUsd != null).length,
    },
    lastActivityAt: recent[0]?.at ?? null,
    sources,
  };
}

// ---------------------------------------------------------------- loader

export type ExecFn = (
  bin: string,
  args: string[],
  opts: { timeout: number },
) => Promise<{ stdout: string; code: number }>;

const defaultExec: ExecFn = async (bin, args, opts) => {
  const { execFile } = await import('node:child_process');
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: opts.timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      resolve({ stdout: stdout ?? '', code: err ? 1 : 0 });
    });
  });
};

const EMPTY: BrandDealsSnapshot = {
  deals: [],
  events: [],
  counts: { approval: 0, sent: 0, skipped: 0, closed: 0, unique: 0, won: 0, lost: 0 },
  volume: { openUsd: 0, approvalUsd: 0, awaitingUsd: 0, wonUsd: 0, lostUsd: 0, quotedDeals: 0 },
  lastActivityAt: null,
  sources: { state: false, log: false, drafts: false },
};

let cache: { at: number; data: BrandDealsSnapshot } | null = null;
const TTL_MS = 30_000;

/** Outcome/quote writes must show up on the next read. */
export function invalidateBrandDealsCache(): void {
  cache = null;
}

export async function getBrandDeals(exec: ExecFn = defaultExec): Promise<BrandDealsSnapshot> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const { readFileSync } = await import('node:fs');
  const os = await import('node:os');
  const statePath = process.env.BDPILOT_STATE ?? `${os.homedir()}/.config/bdpilot/state.json`;
  const logPath = process.env.BDPILOT_LOG ?? `${os.homedir()}/.config/bdpilot/bdpilot.log`;

  let state: BdpilotState | null = null;
  let logText = '';
  try {
    state = JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    /* no daemon on this host */
  }
  try {
    logText = readFileSync(logPath, 'utf8');
  } catch {
    /* ok */
  }
  if (!state) return cache?.data ?? EMPTY;

  let pendingText = '';
  let drafts = false;
  const listFile = process.env.BDPILOT_LIST_FILE;
  if (listFile) {
    try {
      pendingText = readFileSync(listFile, 'utf8');
      drafts = true;
    } catch {
      /* ok */
    }
  } else {
    const gsend = process.env.GSEND_BIN ?? `${os.homedir()}/bin/gsend`;
    const r = await exec(gsend, ['list'], { timeout: 20_000 });
    if (r.code === 0) {
      pendingText = r.stdout;
      drafts = true;
    }
  }

  let overrides: DealOverrideRow[] = [];
  try {
    const { getDb } = await import('@/lib/data');
    overrides = getDb().brandDeals.all();
  } catch {
    /* overlay store unavailable — outcomes default to open */
  }

  const snap = assembleSnapshot(
    state,
    logText,
    pendingText,
    { state: true, log: logText.length > 0, drafts },
    overrides,
  );
  cache = { at: Date.now(), data: snap };
  return snap;
}
