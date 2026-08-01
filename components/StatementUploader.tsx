'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';

/** Phase-2 statement uploader: posts a bank/CC CSV to the ingestion route, then
    refreshes so the expenses-by-category section reflects the real parsed spend. */
export function StatementUploader() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus(`Parsing ${file.name}…`);
    // CSV → transaction ledger (categorized expenses); PDF → bank statement
    // summary (per-business income/net).
    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(isPdf ? '/api/finances/bank-statement' : '/api/finances/statements', {
        method: 'POST',
        body,
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(`✗ ${data.error ?? 'upload failed'}`);
      } else if (isPdf) {
        setStatus(`✓ ${data.summary.business} ${data.summary.month}: ${'$' + (data.summary.creditsCents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })} in`);
        router.refresh();
      } else {
        setStatus(`✓ ${data.inserted} new of ${data.parsed} parsed rows`);
        router.refresh();
      }
    } catch (err) {
      setStatus(`✗ ${err instanceof Error ? err.message : 'upload failed'}`);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg-t border border-dashed border-os-border-strong bg-os-surface px-5 py-8 text-center">
      <Upload className="h-5 w-5 text-os-dim" strokeWidth={1.6} />
      <div className="text-[13px] font-semibold text-os-muted">Upload statements</div>
      <p className="max-w-[260px] font-mono text-[10.5px] leading-relaxed text-os-dim">
        Drop a credit-card <strong>CSV</strong> (categorized spend) or a bank statement <strong>PDF</strong>
        (per-business income). Stored locally (gitignored), never committed.
      </p>
      <label className="cursor-pointer rounded-sm-t border border-os-border-strong px-3 py-1.5 font-mono text-[11px] text-os-accent transition-colors hover:bg-os-surface2">
        {busy ? 'Working…' : 'Choose CSV or PDF'}
        <input type="file" accept=".csv,text/csv,.pdf,application/pdf" className="hidden" onChange={onFile} disabled={busy} />
      </label>
      {status && <div className="mt-1 max-w-[260px] font-mono text-[10px] text-os-dim">{status}</div>}
    </div>
  );
}
