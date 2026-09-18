import { PageHeader } from '@/components/PageHeader';
import UsageBoard from '@/components/UsageBoard';
import { Rise } from '@/components/motion';

export const dynamic = 'force-dynamic';

export default function UsagePage() {
  return (
    <div className="px-6 py-5">
      <PageHeader eyebrow="token burn" title="Usage" />
      <Rise i={1} className="mt-4">
        <UsageBoard />
      </Rise>
    </div>
  );
}
