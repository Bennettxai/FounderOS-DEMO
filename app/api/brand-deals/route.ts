import { NextResponse } from 'next/server';
import { fetchBrandDeals } from '@/lib/connectors/brand-deals';

export const dynamic = 'force-dynamic';

/** The Brand Deals board as JSON: live from Notion when NOTION_API_KEY is
 *  planted, seeded examples until then, honest about which it is. */
export async function GET() {
  const result = await fetchBrandDeals();
  return NextResponse.json(result);
}
