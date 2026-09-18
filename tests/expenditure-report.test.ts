import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * /finances expenditure contract: the pie on the page changes month to month,
 * and clicking through opens a full-screen spending report showing the detected
 * subscriptions (including the cancelled ones) across the three card lanes.
 */
describe('monthly expenses change month to month', () => {
  const panel = read('components/MonthlyExpenses.tsx');
  const page = read('app/finances/page.tsx');

  test('the page hands the whole ledger to the panel, not one month of totals', () => {
    expect(page).toContain('MonthlyExpenses');
    expect(page).toMatch(/allRows\(\)/);
  });

  test('the panel picks a month and recomputes the pie from it', () => {
    expect(panel).toMatch(/^'use client'/);
    expect(panel).toMatch(/useState/);
    expect(panel).toContain('categoryTotals');
    expect(panel).toContain('SharePie');
  });

  test('the panel opens the full expenditure statement', () => {
    expect(panel).toContain('ExpenditureReport');
    expect(panel).toMatch(/expenditure statement/i);
  });
});

describe('the full expenditure statement', () => {
  const report = read('components/ExpenditureReport.tsx');

  test('is a fullscreen overlay that Escape closes', () => {
    expect(report).toMatch(/^'use client'/);
    expect(report).toContain('createPortal');
    expect(report).toMatch(/Escape/);
  });

  test('walks month to month', () => {
    expect(report).toContain('monthlyTotals');
    expect(report).toMatch(/prev|Previous|ChevronLeft/);
  });

  test('lists subscriptions with their cancelled state', () => {
    expect(report).toContain('detectSubscriptions');
    expect(report).toMatch(/cancelled/);
  });

  test('splits the month across the three card lanes', () => {
    expect(report).toContain('cardTotals');
    expect(report).toContain('cardLabel');
  });

  test('shows what the month actually went on', () => {
    expect(report).toMatch(/topMerchants|rows\b/);
  });
});

describe('the uploader takes card statements, not just bank ones', () => {
  const uploader = read('components/StatementUploader.tsx');

  test('offers the three card lanes', () => {
    expect(uploader).toContain('CARD_LANES');
    expect(uploader).toMatch(/card/);
  });

  test('sends the chosen lane with the upload', () => {
    expect(uploader).toMatch(/append\('card'/);
  });

  test('routes a card PDF to the ledger, not the bank-income summary', () => {
    // a PDF is only a bank statement when the lane says so
    expect(uploader).toMatch(/bank/);
    expect(uploader).toContain('/api/finances/statements');
  });
});

/**
 * Submitting a statement must auto-update the view it lands in.
 *
 * Three links in that chain, each pinned here: the uploader refreshes the
 * server data, the panel re-points itself at whatever month just landed
 * instead of holding the month it mounted on, and the upload names the month
 * so the view is visibly following the upload.
 */
describe('an upload updates the view it lands in', () => {
  const panel = read('components/MonthlyExpenses.tsx');
  const uploader = read('components/StatementUploader.tsx');
  const page = read('app/finances/page.tsx');

  test('the uploader pulls the new server data down on success', () => {
    expect(uploader).toContain('router.refresh()');
  });

  test('the uploader names the month that landed', () => {
    expect(uploader).toMatch(/monthName|months\[/);
  });

  test('the panel jumps to the uploaded month even when it already had rows', () => {
    expect(uploader).toContain('STATEMENT_UPLOADED');
    expect(uploader).toContain('dispatchEvent');
    expect(panel).toContain('STATEMENT_UPLOADED');
    expect(panel).toContain('addEventListener');
  });

  test('the page hands months down oldest-first, the way the steppers walk them', () => {
    expect(page).toContain('monthsAscending()');
    expect(page).not.toMatch(/ledgerMonths = ledger\.months\(\)/);
  });

  test('the panel follows the ledger instead of freezing on its mount month', () => {
    expect(panel).toContain('monthAfterRefresh');
    // the remembered month list is what tells it the ledger moved
    expect(panel).toMatch(/seenMonths|setSeenMonths/);
  });
});
