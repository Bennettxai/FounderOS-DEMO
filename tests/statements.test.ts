import { describe, it, expect } from 'vitest';
import { parseStatementCsv, categorize, parseCardStatementText } from '@/lib/statements';

describe('parseStatementCsv', () => {
  it('parses a signed-amount CSV (negative = out), normalizing dates', () => {
    const csv = [
      'Date,Description,Amount',
      '06/15/2026,"AMAZON WEB SERVICES",-57.00',
      '06/14/2026,"STRIPE PAYOUT",1234.56',
      '2026-06-13,Coffee,-4.50',
    ].join('\n');
    expect(parseStatementCsv(csv)).toEqual([
      { date: '2026-06-15', description: 'AMAZON WEB SERVICES', amountCents: 5700, direction: 'out' },
      { date: '2026-06-14', description: 'STRIPE PAYOUT', amountCents: 123456, direction: 'in' },
      { date: '2026-06-13', description: 'Coffee', amountCents: 450, direction: 'out' },
    ]);
  });

  it('handles separate Debit/Credit columns + alternate header names', () => {
    const csv = [
      'Transaction Date,Details,Debit,Credit',
      '06/01/2026,RENT,2000.00,',
      '06/02/2026,CLIENT PAYMENT,,5000.00',
    ].join('\n');
    expect(parseStatementCsv(csv)).toEqual([
      { date: '2026-06-01', description: 'RENT', amountCents: 200000, direction: 'out' },
      { date: '2026-06-02', description: 'CLIENT PAYMENT', amountCents: 500000, direction: 'in' },
    ]);
  });

  it('treats accounting parentheses and $/commas as negative/out', () => {
    const csv = ['Date,Description,Amount', '06/10/2026,Adobe,"($52.99)"'].join('\n');
    expect(parseStatementCsv(csv)[0]).toEqual({
      date: '2026-06-10',
      description: 'Adobe',
      amountCents: 5299,
      direction: 'out',
    });
  });

  it('skips blank and unparseable rows instead of guessing', () => {
    const csv = ['Date,Description,Amount', '', '06/15/2026,OK,-1.00', 'garbage,row,notanumber', ',,'].join('\n');
    const rows = parseStatementCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe('OK');
  });

  it('returns [] when there is no header it understands', () => {
    expect(parseStatementCsv('')).toEqual([]);
    expect(parseStatementCsv('foo,bar\n1,2')).toEqual([]);
  });

  it('handles quoted fields that span multiple lines (e.g. Amex Extended Details)', () => {
    const csv = [
      'Date,Description,Amount',
      '06/15/2026,"AWS',
      'extended details line two",57.00', // the quoted Description wraps a newline
      '06/16/2026,Coffee,4.50',
    ].join('\n');
    const rows = parseStatementCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].description).toContain('AWS');
    expect(rows[0].date).toBe('2026-06-15');
    expect(rows[1].description).toBe('Coffee');
  });

  it('inverts sign for Amex/credit-card exports (charge positive → expense out)', () => {
    const csv = [
      'Date,Description,Card Member,Amount,Appears On Your Statement As',
      '06/15/2026,OPENAI,CASEY EXAMPLE,52.99,OPENAI',
      '06/10/2026,AUTOPAY PAYMENT - THANK YOU,CASEY EXAMPLE,-2000.00,AUTOPAY',
    ].join('\n');
    const rows = parseStatementCsv(csv);
    const charge = rows.find((r) => r.description.startsWith('OPENAI'))!;
    expect(charge.direction).toBe('out'); // positive Amex amount = a charge = spend
    expect(charge.amountCents).toBe(5299);
    const payment = rows.find((r) => r.description.startsWith('AUTOPAY'))!;
    expect(payment.direction).toBe('in'); // negative = payment/credit (not an expense)
  });
});

describe('categorize', () => {
  const out = (description: string) => categorize({ date: '2026-06-01', description, amountCents: 100, direction: 'out' });
  it('maps known merchants to spend categories', () => {
    expect(out('AMAZON WEB SERVICES')).toBe('Infrastructure');
    expect(out('Facebook Ads')).toBe('Advertising');
    expect(out('OpenAI subscription')).toBe('Software');
    expect(out('UPWORK contractor')).toBe('Contractors');
  });
  it('labels inbound rows as Income', () => {
    expect(categorize({ date: '2026-06-01', description: 'STRIPE PAYOUT', amountCents: 100, direction: 'in' })).toBe('Income');
  });
  it('falls back to Uncategorized for unknown out-rows', () => {
    expect(out('Some Random Merchant LLC')).toBe('Uncategorized');
  });

  it("uses the export's own Category column (top-level) when description has no keyword", () => {
    const csv = [
      'Date,Description,Card Member,Amount,Category',
      '06/15/2026,SOMECO STORE,FOUNDER,40.00,Merchandise & Supplies-Internet Purchase',
    ].join('\n');
    const row = parseStatementCsv(csv)[0];
    expect(row.sourceCategory).toBe('Merchandise & Supplies');
    expect(categorize(row)).toBe('Merchandise & Supplies');
  });

  it('keyword rules still win over the export category for known merchants', () => {
    const row = { date: '2026-06-01', description: 'FACEBK ADS', amountCents: 100, direction: 'out' as const, sourceCategory: 'Business Services' };
    expect(categorize(row)).toBe('Advertising');
  });
});

describe('parseCardStatementText (PDF-extracted credit card statements)', () => {
  const AMEX = `
The Platinum Card®
Prepared for
CASEY EXAMPLE
Closing Date 07/26/26        Account Ending 0-00000

Payments and Credits
07/03/26*  ONLINE PAYMENT - THANK YOU                              -$1,000.00

New Charges
07/01/26   NORTHWIND CLOUD        SAMPLE CITY XX             $100.00
07/04/26   ORBIT MARKET RT4G2     SAMPLE CITY XX              $25.00
07/14/26   SKYLARK AIR            SAMPLE CITY XX             $400.00
Total New Charges                                            $525.00
`;

  it('pulls dated charge lines with the closing-date year', () => {
    const rows = parseCardStatementText(AMEX);
    const first = rows.find((r) => r.description.startsWith('NORTHWIND'));
    expect(first).toMatchObject({ date: '2026-07-01', amountCents: 10000, direction: 'out' });
    expect(rows.filter((r) => r.direction === 'out')).toHaveLength(3);
  });

  it('reads a negative amount as money coming back in, not spend', () => {
    const rows = parseCardStatementText(AMEX);
    const payment = rows.find((r) => r.description.includes('ONLINE PAYMENT'));
    expect(payment).toMatchObject({ direction: 'in', amountCents: 100000 });
  });

  it('ignores summary lines that carry no transaction date', () => {
    const rows = parseCardStatementText(AMEX);
    expect(rows.some((r) => /Total New Charges/i.test(r.description))).toBe(false);
  });

  it('resolves MM/DD lines against the statement year', () => {
    const rows = parseCardStatementText(`Statement Date: 01/15/2027\n01/02  SPOTIFY USA  $11.99\n`);
    expect(rows[0]).toMatchObject({ date: '2027-01-02', amountCents: 1199, direction: 'out' });
  });

  it('returns nothing for text that is not a statement', () => {
    expect(parseCardStatementText('hello world\nno money here')).toEqual([]);
  });
});
