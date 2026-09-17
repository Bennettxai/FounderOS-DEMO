import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getDb } from '@/lib/data';
import { PageHeader } from '@/components/PageHeader';
import { Rise } from '@/components/motion';
import { LeadMagnets } from '@/components/LeadMagnets';
import { NewLeadMagnet } from '@/components/NewLeadMagnet';
import { Badge } from '@/components/terminal';

export const dynamic = 'force-dynamic';

/**
 * Lead magnets, full page. Every landing page we ship, as a Notion-style
 * database with the real link on every row so you can open or copy one
 * straight to whoever asked for it.
 */
export default function LeadMagnetsPage() {
  const rows = getDb().leadMagnets.all();
  const live = rows.filter((r) => r.status === 'live').length;
  return (
    <div>
      <PageHeader
        eyebrow="content engine"
        title="Lead Magnets"
        right={<Badge tone="accent">{live} live</Badge>}
      />
      <Link
        href="/content"
        className="mb-4 inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-os-dim transition-colors hover:text-os-text"
      >
        <ArrowLeft className="h-3 w-3" /> Content
      </Link>
      <p className="mb-4 max-w-[720px] text-[12.5px] leading-relaxed text-os-muted">
        Every landing page we ship, with the live link on each row. Open it, or copy it straight
        to whoever asked.
      </p>
      <Rise i={1}>
        <NewLeadMagnet />
      </Rise>
      <Rise i={2}>
        <LeadMagnets rows={rows} showCopy manage />
      </Rise>
    </div>
  );
}
