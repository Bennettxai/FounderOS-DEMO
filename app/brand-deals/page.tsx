import { getBrandDeals } from '@/lib/brand-deals';
import { DealBoard } from '@/components/brand-deals/DealBoard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GladOS Futurism (Zentra) layout: the title row lives inside the floating
// slab, so this page skips the shared PageHeader deliberately.
export default async function BrandDealsPage() {
  const snapshot = await getBrandDeals();
  return <DealBoard initial={snapshot} />;
}
