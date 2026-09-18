/**
 * A small markdown parser, just big enough for what the agents actually write.
 *
 * The review panel used to print the raw file into a <pre>, so a genuinely
 * well written document arrived as a wall of asterisks, pipes and hashes
 * instead of formatted text. These files use headings, bold ledes, comparison
 * tables, blockquotes and JSON fences, and all of it has to render as what it is.
 *
 * Parsing is pure and lives here so it is testable in node; the component is a
 * thin renderer over these blocks. Nothing here produces HTML, so there is no
 * innerHTML anywhere in the path and agent-authored files cannot inject markup.
 */
export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; href: string };

export type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'code'; lang: string; text: string }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'rule' };

/** Agent files are data, not trusted markup: only these schemes may link out. */
const SAFE_HREF = /^(https?:|mailto:|#|\/)/i;

const INLINE_RE = /(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(`[^`]+`)|(\b_[^_]+_\b|(?<![*\w])\*[^*\s][^*]*\*)/;

export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  let rest = line;

  while (rest) {
    const m = INLINE_RE.exec(rest);
    if (!m || m.index === undefined) break;
    if (m.index > 0) out.push({ type: 'text', text: rest.slice(0, m.index) });
    const tok = m[0];

    if (tok.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)!;
      const [, text, href] = link;
      // An unsafe scheme keeps its label and loses its link, rather than
      // silently vanishing or becoming clickable.
      out.push(SAFE_HREF.test(href) ? { type: 'link', text, href } : { type: 'text', text });
    } else if (tok.startsWith('**')) {
      out.push({ type: 'bold', text: tok.slice(2, -2) });
    } else if (tok.startsWith('`')) {
      out.push({ type: 'code', text: tok.slice(1, -1) });
    } else {
      out.push({ type: 'italic', text: tok.slice(1, -1) });
    }
    rest = rest.slice(m.index + tok.length);
  }

  if (rest) out.push({ type: 'text', text: rest });
  return out.length ? out : [{ type: 'text', text: line }];
}

const cells = (row: string): string[] =>
  row
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());

const isDivider = (line: string): boolean => /^\s*\|?[\s:-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes('-');

export function parseMarkdown(md: string): Block[] {
  const lines = (md ?? '').split('\n');
  const out: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (!t) {
      i += 1;
      continue;
    }

    // fenced code: verbatim until the closing fence or EOF
    if (t.startsWith('```')) {
      const lang = t.slice(3).trim();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // consume the closer
      out.push({ type: 'code', lang, text: body.join('\n') });
      continue;
    }

    if (/^(-{3,}|\*{3,}|={3,})$/.test(t)) {
      out.push({ type: 'rule' });
      i += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(t);
    if (heading) {
      out.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      i += 1;
      continue;
    }

    // table: a pipe row followed by a divider row
    if (t.startsWith('|') && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const header = cells(t);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(cells(lines[i]));
        i += 1;
      }
      out.push({ type: 'table', header, rows });
      continue;
    }

    if (t.startsWith('>')) {
      const body: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        body.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      out.push({ type: 'quote', text: body.join(' ').trim() });
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(t);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(t);
    if (bullet || numbered) {
      const ordered = !!numbered;
      const items: string[] = [];
      while (i < lines.length) {
        const s = lines[i].trim();
        const m = ordered ? /^\d+[.)]\s+(.*)$/.exec(s) : /^[-*+]\s+(.*)$/.exec(s);
        if (!m) break;
        items.push(m[1].trim());
        i += 1;
      }
      out.push({ type: 'list', ordered, items });
      continue;
    }

    // paragraph: soft-wrapped lines join until a blank line or a new block
    const para: string[] = [];
    while (i < lines.length) {
      const s = lines[i].trim();
      if (
        !s ||
        s.startsWith('#') ||
        s.startsWith('>') ||
        s.startsWith('|') ||
        s.startsWith('```') ||
        /^(-{3,}|\*{3,}|={3,})$/.test(s) ||
        /^[-*+]\s+/.test(s) ||
        /^\d+[.)]\s+/.test(s)
      ) {
        break;
      }
      para.push(s);
      i += 1;
    }
    if (para.length) out.push({ type: 'paragraph', text: para.join(' ') });
  }

  return out;
}
