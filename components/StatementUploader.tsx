'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';
import { CARD_LANES, DEFAULT_CARD, type CardId } from '@/lib/cards';
import { STATEMENT_UPLOADED, type StatementUploadedDetail } from '@/lib/statement-events';

type Target = CardId | 'bank';

const monthName = (month: string): string =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

const TARGETS: { id: Target; label: string }[] = [
  ...CARD_LANES.map((c) => ({ id: c.id as Target, label: c.label })),
  { id: 'bank', label: 'Bank statement · income' },
];

/**
 * Statement uploader. The lane says what the file IS: a card statement (CSV or
 * PDF) lands in the spend ledger under that card, a bank statement lands in the
 * per-business income store. Before this, every PDF was assumed to be a bank
 * statement, so credit-card PDFs had nowhere to go.
 */
export function StatementUploader() {
  const router = useRouter();
  const [target, setTarget] = useState<Target>(DEFAULT_CARD);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function upload(file: File) {
    const bank = target === 'bank';
    setBusy(true);
    setStatus(`Parsing ${file.name}…`);
    try {
      const body = new FormData();
      body.append('file', file);
      if (!bank) body.append('card', target);
      const res = await fetch(bank ? '/api/finances/bank-statement' : '/api/finances/statements', {
        method: 'POST',
        body,
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(`✗ ${data.error ?? 'upload failed'}`);
      } else if (bank) {
        setStatus(
          `✓ ${data.summary.business} ${data.summary.month}: ${'$' + (data.summary.creditsCents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })} in`,
        );
        router.refresh();
      } else {
        // Name the month that landed and tell the expenses panel about it, so
        // the refreshed page opens on the data he just submitted instead of
        // holding whatever month was on screen before.
        const landed: string[] = Array.isArray(data.uploadedMonths) ? data.uploadedMonths : [];
        const newest = landed.length > 0 ? landed[landed.length - 1] : null;
        setStatus(`✓ ${data.inserted} new of ${data.parsed} parsed rows${newest ? ` · ${monthName(newest)}` : ''}`);
        router.refresh();
        if (landed.length > 0) {
          const detail: StatementUploadedDetail = { months: landed };
          window.dispatchEvent(new CustomEvent(STATEMENT_UPLOADED, { detail }));
        }
      }
    } catch (err) {
      setStatus(`✗ ${err instanceof Error ? err.message : 'upload failed'}`);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await upload(file);
    e.target.value = '';
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && !busy) void upload(file);
      }}
      className={`state-fade flex h-full flex-col items-center justify-center gap-2 rounded-panel border border-dashed bg-os-surface px-5 py-6 text-center ${
        dragOver ? 'border-os-accent' : 'border-os-border-strong'
      }`}
    >
      <Upload className="h-5 w-5 text-os-dim" strokeWidth={1.6} />
      <div className="text-[13px] font-semibold text-os-muted">Upload statements</div>

      <div className="flex w-full max-w-[260px] flex-col gap-1">
        {TARGETS.map((t) => (
          <button data-lens="c"
            key={t.id}
            type="button"
            onClick={() => setTarget(t.id)}
            className={`pressable rounded-sm-t border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${
 t.id === target ? 'border-os-accent text-os-accent' : 'border-os-border text-os-dim hover:bg-os-surface2'
 }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="max-w-[260px] font-mono text-[10px] leading-relaxed text-os-dim">
        Drop a CSV or PDF here, or pick one below.{' '}
        {target === 'bank'
          ? 'Bank statement: per-business income and net.'
          : 'Card statement: categorized spend and subscriptions for this lane.'}{' '}
        Parsed locally, stored gitignored, never committed.
      </p>

      <label className="pressable cursor-pointer rounded-ctl bg-os-text text-os-ink px-3 py-1.5 font-mono text-[11px] font-semibold hover:bg-white">
        {busy ? 'Working…' : '↑ Upload statement'}
        <input
          type="file"
          accept=".csv,text/csv,.pdf,application/pdf,.txt,text/plain"
          className="hidden"
          onChange={onFile}
          disabled={busy}
        />
      </label>
      {status && <div className="animate-enter mt-1 max-w-[260px] font-mono text-[10px] text-os-dim">{status}</div>}
    </div>
  );
}
