/**
 * Statement ingestion (Phase 2) — pure parsing + categorization of uploaded
 * bank / credit-card CSVs. No DB, no network. v1 targets common shapes
 * (Date / Description / Amount, or Debit+Credit columns); rows it can't read
 * are skipped honestly rather than guessed. The persisted ledger lives in a
 * separate store (lib/ledger.ts), never the shared app DB.
 */

export type Direction = 'in' | 'out';
export type ParsedRow = {
  date: string;
  description: string;
  amountCents: number;
  direction: Direction;
  /** the export's own category (top-level), e.g. Amex "Merchandise & Supplies" */
  sourceCategory?: string;
};
export type LedgerRow = ParsedRow & { category: string };

// Tokenize whole CSV text into records, honoring double-quoted fields that may
// contain commas AND embedded newlines (e.g. Amex "Extended Details" wraps a
// record across several physical lines). "" inside a quoted field → literal ".
function tokenizeCsv(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQ = false;
  let started = false; // has the current record any content yet?
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
    } else if (c === '"') {
      inQ = true;
      started = true;
    } else if (c === ',') {
      record.push(field);
      field = '';
      started = true;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (started || field !== '') {
        record.push(field);
        records.push(record);
      }
      field = '';
      record = [];
      started = false;
    } else {
      field += c;
      started = true;
    }
  }
  if (started || field !== '') {
    record.push(field);
    records.push(record);
  }
  return records;
}

const cell = (cells: string[], i: number): string => (i >= 0 ? (cells[i] ?? '').trim() : '');

function normDate(s: string): string | null {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const mm = m[1].padStart(2, '0');
    const dd = m[2].padStart(2, '0');
    const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yy}-${mm}-${dd}`;
  }
  return null;
}

// "$1,234.56" → 1234.56 ; "($50.00)" → -50.00 ; "" → null
function parseAmount(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const neg = /^\(.*\)$/.test(t) || t.startsWith('-');
  const cleaned = t.replace(/[$,()\s-]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : Math.abs(n);
}

const findCol = (headers: string[], names: string[]): number =>
  headers.findIndex((h) => names.some((n) => h.includes(n)));

/** Parse a bank/CC statement CSV into normalized rows. Robust to quoted fields
    with embedded commas/newlines, and to credit-card sign convention. */
export function parseStatementCsv(text: string): ParsedRow[] {
  const records = tokenizeCsv(text);
  if (records.length < 2) return [];
  const headers = records[0].map((h) => h.trim().toLowerCase());
  const dateCol = findCol(headers, ['date']);
  const descCol = findCol(headers, ['description', 'details', 'memo', 'name', 'payee']);
  const amountCol = findCol(headers, ['amount']);
  const debitCol = findCol(headers, ['debit', 'withdrawal']);
  const creditCol = findCol(headers, ['credit', 'deposit']);
  const categoryCol = findCol(headers, ['category']);
  // Credit-card exports (Amex etc.) list charges as POSITIVE — the opposite of
  // the bank "negative = money out" convention — so flip when we detect one.
  const cardConvention = headers.some((h) => h.includes('card member') || h.includes('appears on your statement'));
  const hasAmounts = amountCol >= 0 || (debitCol >= 0 && creditCol >= 0);
  if (dateCol < 0 || descCol < 0 || !hasAmounts) return [];

  const rows: ParsedRow[] = [];
  for (const cells of records.slice(1)) {
    const date = normDate(cell(cells, dateCol));
    const description = cell(cells, descCol);
    if (!date || !description) continue;

    let amount: number | null = null;
    if (amountCol >= 0) {
      amount = parseAmount(cell(cells, amountCol));
    } else {
      const debit = parseAmount(cell(cells, debitCol));
      const credit = parseAmount(cell(cells, creditCol));
      if (debit != null) amount = -Math.abs(debit);
      else if (credit != null) amount = Math.abs(credit);
    }
    if (amount == null) continue;

    const isOut = cardConvention ? amount > 0 : amount < 0;
    const rawCat = cell(cells, categoryCol);
    const sourceCategory = rawCat ? rawCat.split('-')[0].trim() : undefined; // Amex "Top-Sub" → "Top"
    rows.push({
      date,
      description,
      amountCents: Math.round(Math.abs(amount) * 100),
      direction: isOut ? 'out' : 'in',
      ...(sourceCategory ? { sourceCategory } : {}),
    });
  }
  return rows;
}

const CATEGORY_RULES: [RegExp, string][] = [
  [/facebook|meta ads|google ads|tiktok ads|advertis|\bads\b/i, 'Advertising'],
  [/aws|amazon web|vercel|supabase|cloudflare|digitalocean|render\.com|namecheap|domain|godaddy|hosting/i, 'Infrastructure'],
  [/upwork|fiverr|contractor|payroll|gusto|deel|wise|freelanc/i, 'Contractors'],
  [/attio|hubspot|salesforce|\bcrm\b/i, 'CRM & Revenue'],
  [/openai|anthropic|claude|cursor|figma|notion|github|slack|zoom|adobe|elevenlabs|higgsfield|software|saas|subscription/i, 'Software'],
];

/** Bucket a row into a spend category: keyword rules first (fine-grained for
    known merchants), then the export's own category, then Uncategorized.
    Inbound rows are Income. */
export function categorize(row: ParsedRow): string {
  if (row.direction === 'in') return 'Income';
  for (const [re, cat] of CATEGORY_RULES) if (re.test(row.description)) return cat;
  if (row.sourceCategory) return row.sourceCategory;
  return 'Uncategorized';
}
