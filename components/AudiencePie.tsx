import { SharePie } from '@/components/SharePie';
import { formatFollowers } from '@/components/SocialStats';
import type { PieItem } from '@/lib/social-chart';

/** Audience share as a donut: one slice per account, total reach at center. */
export function AudiencePie({
  items,
  total,
  framed = true,
  stacked = false,
  donutPx,
}: {
  items: PieItem[];
  total: number;
  framed?: boolean;
  stacked?: boolean;
  donutPx?: number;
}) {
  return (
    <SharePie
      items={items}
      total={total}
      centerLabel="total reach"
      format={formatFollowers}
      framed={framed}
      stacked={stacked}
      donutPx={donutPx}
      ariaLabel="Audience share by account"
    />
  );
}
