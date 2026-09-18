/**
 * Turn an agent deliverable into a title and a summary a human can read.
 *
 * The Needs You row used to render the FILENAME: `STAGED-os-note-42.json` had
 * its dashes stripped and came out as "os note 42", while the file it names
 * opens with a written English sentence saying exactly what it is. The agents
 * were writing plain English the whole time; the queue just never looked
 * inside.
 *
 * So: read the head of the file, take the real title out of it, and keep the
 * filename only as the last-resort fallback for a file we cannot read.
 */
export type Brief = {
  /** A real title, from the document. Clipped to fit a row. */
  title: string;
  /** One line of what it is, continuing where the title stopped. */
  summary: string;
};

const TITLE_MAX = 120;
const SUMMARY_MAX = 200;

/** Keys the agents put prose under, best first. */
const PROSE_KEYS = ['body', 'comment', 'text', 'content', 'markdown', 'description'];

/** Strip markdown furniture so a heading reads as a sentence. */
function plain(md: string): string {
  // Trim FIRST: the heading test runs on a trimmed line, so an indented
  // heading reached here with leading spaces and kept its hashes.
  return md
    .trim()
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/(^|[\s(])[*_]([^*_]+)[*_]/g, '$1$2')
    // Quote and heading markers strip TOGETHER and repeatedly. Doing `^#`
    // first and `^>` second meant "> # TITLE" kept its hash, which is exactly
    // what two real files on the board looked like.
    .replace(/^(?:\s*[>#]+\s*)+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clip(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
}

/** First sentence, or the whole thing when it has no sentence break. */
function firstSentence(s: string): string {
  const m = s.match(/^(.*?[.!?])(\s|$)/);
  return (m ? m[1] : s).trim();
}

/**
 * Lines that are structure rather than prose. A table row or a fence opener as
 * a title is exactly the kind of thing that made the queue unreadable.
 */
function isFurniture(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (t.startsWith('|') || /^[-|: ]+$/.test(t)) return true;
  if (t.startsWith('```') || t.startsWith('---') || t.startsWith('===')) return true;
  if (/^[-*+]\s/.test(t) || /^\d+\.\s/.test(t)) return true;
  return false;
}

/** "Hi Sam," is not what a task is about. */
function isGreeting(line: string): boolean {
  return /^(hi|hey|hello|dear|good (morning|afternoon|evening))\b[^.!?]{0,40},?$/i.test(line.trim());
}

/** `STAGED-note-payout-classification-2026-08-19.json` -> `note payout classification`. */
export function titleFromFilename(name: string): string {
  const cleaned = name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/^STAGED-/i, '')
    .replace(/-?DELIVER-BEFORE-\d{4}Z/i, '')
    .replace(/-?\d{4}-\d{2}-\d{2}(T\d{4}Z)?/gi, '')
    .replace(/-(COMMENT|PATCH|FINAL|RESOLVED|UNBLOCKED|VERIFIED)$/i, '')
    .replace(/^ben\d+-/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return cleaned || name;
}

/**
 * Pull one string value out of a JSON head that is TOO TRUNCATED TO PARSE.
 *
 * The list only reads the first 4KB of each file, and these documents run to
 * tens of KB, so `JSON.parse` throws on almost every real one. Before this,
 * that threw the reader back onto the raw text and the operator saw `{"body": "…`
 * as the title of eight different tasks.
 */
function scrapeJsonString(head: string, key: string): string | null {
  const at = new RegExp(`"${key}"\\s*:\\s*"`).exec(head);
  if (!at) return null;
  let raw = '';
  for (let i = at.index + at[0].length; i < head.length; i += 1) {
    const ch = head[i];
    if (ch === '\\') {
      raw += head.slice(i, i + 2);
      i += 1;
      continue;
    }
    if (ch === '"') break;
    raw += ch;
  }
  // A cut-off head can end on a half-written escape; drop it and try again.
  for (const candidate of [raw, raw.slice(0, -1), raw.slice(0, -2)]) {
    try {
      const out = JSON.parse(`"${candidate}"`) as string;
      if (out.trim()) return out;
    } catch {
      /* try the next trim */
    }
  }
  return null;
}

/**
 * A JSON deliverable is an envelope, not the document. Unwrap it into an
 * explicit title (when the agent wrote one) plus the prose body.
 */
function unwrap(name: string, head: string): { title: string | null; doc: string } {
  if (!/\.json$/i.test(name)) return { title: null, doc: head };

  try {
    const parsed: unknown = JSON.parse(head);
    if (parsed && typeof parsed === 'object') {
      const rec = parsed as Record<string, unknown>;
      const title = typeof rec.title === 'string' && rec.title.trim() ? rec.title.trim() : null;
      for (const key of PROSE_KEYS) {
        const v = rec[key];
        if (typeof v === 'string' && v.trim()) return { title, doc: v };
      }
      return { title, doc: '' };
    }
  } catch {
    /* truncated head: fall through to scraping */
  }

  const title = scrapeJsonString(head, 'title');
  for (const key of PROSE_KEYS) {
    const doc = scrapeJsonString(head, key);
    if (doc) return { title, doc };
  }
  // Config blobs and API receipts have no prose at all. Returning the raw JSON
  // here is what put `{"success":true,"data":{...}}` on a row.
  return { title, doc: '' };
}

export function briefFrom(name: string, head: string): Brief {
  const { title: jsonTitle, doc } = unwrap(name, head ?? '');
  const lines = doc.split('\n');

  const isHeading = (l: string) => /^#{1,6}\s+\S/.test(l.trim());
  const headingAt = lines.findIndex(isHeading);
  const proseAt = lines.findIndex((l) => !isFurniture(l) && !isHeading(l) && !isGreeting(l));

  const prosePlain = lines
    .filter((l) => !isFurniture(l) && !isHeading(l) && !isGreeting(l))
    .map(plain)
    .filter(Boolean);

  let title = '';
  let rest = '';

  // A heading only titles the document if it OPENS it. Half these files start
  // with a bolded lede and have "## The draft that already exists" further
  // down; taking any heading anywhere titled them by their second section.
  const headingLeads = headingAt !== -1 && (proseAt === -1 || headingAt < proseAt);

  if (jsonTitle) {
    title = plain(jsonTitle);
    rest = prosePlain.join(' ');
  } else if (headingLeads) {
    title = plain(lines[headingAt]);
    rest = prosePlain.filter((p) => p !== title).join(' ');
  } else {
    const lede = prosePlain[0] ?? '';
    title = firstSentence(lede);
    rest = `${lede.slice(title.length)} ${prosePlain.slice(1).join(' ')}`.trim();
  }

  if (!title) title = titleFromFilename(name);

  // The summary is a run of prose clipped to length, NOT one sentence. These
  // documents open with a short claim and put the name of the thing in the
  // sentence after it ("There is a tenth payment rail." / "It is FlexPay."), so
  // stopping at the first full stop threw away the only word he needed.
  return { title: clip(title, TITLE_MAX), summary: clip(rest, SUMMARY_MAX) };
}
