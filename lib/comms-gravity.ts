import type { CommsItem } from '@/lib/comms';

/**
 * The gravity-funnel model behind the /comms canvas. Messages fall into three
 * lanes (work · personal · misc/unknown) and sink toward the reply box by
 * priority — red (tier 1) lowest and nearest, untagged white highest and
 * furthest. Pure + tested so the visual layer stays a thin renderer.
 */

export type CommsLane = 'work' | 'personal' | 'misc';

export const COMMS_LANES: { id: CommsLane; label: string }[] = [
  { id: 'work', label: 'Work' },
  { id: 'personal', label: 'Personal' },
  { id: 'misc', label: 'Misc / Unknown' },
];

// A personal-looking email inbox. Generic on purpose — never hardcode Alex's
// real brand inboxes (they must not leak into the FounderOS demo).
const PERSONAL_INBOX_RE = /\b(personal|gmail|icloud|proton|outlook|private|me)\b/i;

// Generic work signals shipped with the app. Alex's real work brands
// (Vantage, Launchpad Cohort, specific people, …) live in COMMS_WORK_KEYWORDS
// in .env.local, NOT here — the committed default must stay brand-free so it is
// safe for the public FounderOS demo.
export const DEFAULT_WORK_KEYWORDS = [
  'invoice',
  'contract',
  'proposal',
  'onboarding',
  'partnership',
  'statement of work',
  'purchase order',
];

/** Parse a comma-separated COMMS_WORK_KEYWORDS value into trimmed, non-empty terms. */
export function parseWorkKeywords(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** The inbox an email came from: its title is "<Inbox> — <sender>". */
function inboxName(item: CommsItem): string {
  return (item.title.split(' — ')[0] ?? '').trim();
}

/** True when the message reads as work — any keyword appears in its inbox,
    sender, or subject. Used to pull work mail out of the misc lane. */
function matchesWork(item: CommsItem, workKeywords: string[]): boolean {
  if (workKeywords.length === 0) return false;
  const hay = `${item.title} ${item.sender ?? ''} ${item.preview}`.toLowerCase();
  return workKeywords.some((k) => {
    const kw = k.trim().toLowerCase();
    return kw.length > 0 && hay.includes(kw);
  });
}

/**
 * Which lane a message belongs in. Channel identity wins — WhatsApp is personal,
 * Slack is work. For email: a work keyword forces work (even over a personal
 * inbox); otherwise a personal-named inbox is personal, a known (tagged) sender
 * is work, and an unknown sender is misc.
 */
export function commsLane(item: CommsItem, workKeywords: string[] = []): CommsLane {
  if (item.source === 'whatsapp') return 'personal';
  if (item.source === 'slack') return 'work';
  if (matchesWork(item, workKeywords)) return 'work';
  if (PERSONAL_INBOX_RE.test(inboxName(item))) return 'personal';
  return item.priority === undefined ? 'misc' : 'work';
}

/** How far a node sinks toward the reply box: 1 = nearest/bottom, 0 = far/top.
    Priority pulls it down; an untagged sender floats up and away. */
export function gravityDepth(priority: CommsItem['priority']): number {
  switch (priority) {
    case 1:
      return 1;
    case 2:
      return 0.68;
    case 3:
      return 0.38;
    default:
      return 0.1;
  }
}

// The band nearest the reply box still sits a little off the bottom edge; the
// furthest floats near (but not off) the top.
const NEAR_PCT = 3;
const SPAN_PCT = 74;

/** A tier's vertical band, as a CSS `bottom` percentage (0 = bottom edge). */
export function laneBottomPct(priority: CommsItem['priority']): number {
  return NEAR_PCT + (1 - gravityDepth(priority)) * SPAN_PCT;
}
