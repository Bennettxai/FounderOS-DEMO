import { describe, it, expect } from 'vitest';
import {
  parseBankStatementSummary,
  businessSeries,
  rangeTotalCents,
  type BankSummary,
} from '@/lib/bank-statements';

// Mirrors the Acme Holdings LLC "Business Checking Account Statement" pdftotext shape:
// label on one line, the $value at the start of the next.
const SAMPLE = [
  'Business Checking Account Statement',
  'Acme Holdings LLC',
  'Statement Date: 04/30/2026',
  'Account Ending: *7001 Account Name: General Operations',
  'Statement Summary',
  'Beginning Balance as of 04/01/2026',
  '$12,000.00 Earned Period',
  'Total Credits This Period',
  '$21,000.00 Days in Statement Period',
  'Total Debits This Period',
  '-$19,000.00 Interest Rate1',
  'Ending Balance as of 04/30/2026',
  '$17,500.00',
].join('\n');

describe('parseBankStatementSummary', () => {
  it('pulls account, business, month, credits, debits, net from the summary', () => {
    expect(parseBankStatementSummary(SAMPLE)).toEqual({
      account: '7001',
      business: 'General Operations',
      month: '2026-04',
      creditsCents: 2100000,
      debitsCents: 1900000,
      netCents: 2100000 - 1900000,
    });
  });

  it('handles the Vantage (7002) account', () => {
    const s = SAMPLE.replace('*7001 Account Name: General Operations', '*7002 Account Name: Vantage');
    const out = parseBankStatementSummary(s)!;
    expect(out.account).toBe('7002');
    expect(out.business).toBe('Vantage');
  });

  it('returns null when it is not a parseable statement summary', () => {
    expect(parseBankStatementSummary('just some random text')).toBeNull();
    expect(parseBankStatementSummary('')).toBeNull();
  });
});

const sum = (account: string, business: string, month: string, credits: number, debits: number): BankSummary => ({
  account,
  business,
  month,
  creditsCents: credits,
  debitsCents: debits,
  netCents: credits - debits,
});

describe('businessSeries', () => {
  it('groups by business, sorts months ascending, dedupes by month', () => {
    const series = businessSeries([
      sum('7001', 'General Operations', '2026-04', 25899_28, 21695_58),
      sum('7002', 'Vantage', '2026-04', 40000_00, 12000_00),
      sum('7001', 'General Operations', '2026-03', 18000_00, 15000_00),
      sum('7001', 'General Operations', '2026-04', 25899_28, 21695_58), // dup month → one
    ]);
    expect(series.map((s) => s.business)).toEqual(['General Operations', 'Vantage']);
    const genops = series.find((s) => s.business === 'General Operations')!;
    expect(genops.months.map((m) => m.month)).toEqual(['2026-03', '2026-04']);
  });
});

describe('rangeTotalCents', () => {
  const months = [
    { month: '2026-01', creditsCents: 1000, debitsCents: 0, netCents: 1000 },
    { month: '2026-02', creditsCents: 2000, debitsCents: 0, netCents: 2000 },
    { month: '2026-03', creditsCents: 3000, debitsCents: 0, netCents: 3000 },
    { month: '2026-04', creditsCents: 4000, debitsCents: 0, netCents: 4000 },
  ];
  it('sums income (credits) over the last N months; "all" sums everything', () => {
    expect(rangeTotalCents(months, 1)).toBe(4000); // latest month (30d)
    expect(rangeTotalCents(months, 3)).toBe(9000); // last 3 months
    expect(rangeTotalCents(months, 'all')).toBe(10000);
    expect(rangeTotalCents(months, 12)).toBe(10000); // fewer than 12 → all available
  });
});
