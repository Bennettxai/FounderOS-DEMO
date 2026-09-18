import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getDb } from '@/lib/data';
import { PageHeader } from '@/components/PageHeader';
import { LeadMagnets } from '@/components/LeadMagnets';
import { NewLeadMagnet } from '@/components/NewLeadMagnet';
import { Rise } from '@/components/motion';
import { Badge } from '@/components/terminal';

export const dynamic = 'force-dynamic';

/**
 * Lead magnets, full page. Every landing page we ship, as a Notion-style
 * database with the real link on every row so the operator can open or copy one
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
        className="mb-4 inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-os-dim linky"
      >
        <ArrowLeft className="h-3 w-3" /> Content
      </Link>
      <Rise as="p" i={1} className="mb-4 max-w-[720px] text-[12.5px] leading-relaxed text-os-muted">
        Every landing page we ship, with the live link on each row. Open it, or copy it straight
        to whoever asked.
      </Rise>
      <Rise i={2}>
        <NewLeadMagnet />
      </Rise>
      <Rise i={3}>
        <LeadMagnets rows={rows} showCopy manage />
      </Rise>
    </div>
  );
}
