import { NextResponse } from 'next/server';
import { allConnectorStatuses } from '@/lib/connectors';

export const dynamic = 'force-dynamic';

export async function GET() {
  const connections = await allConnectorStatuses();
  return NextResponse.json({ connections });
}
