import { NextResponse } from 'next/server';
import { z } from 'zod';
import { archiveStatus, getArchiveJob, startArchiveJob, type ArchiveSource } from '@/lib/call-archive';
import { gbrainStorePath } from '@/lib/connectors/gbrain';
import { resolveAttioKey, resolveCred, CRED_FILES } from '@/lib/creds';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The call archive. GET: how many call pages the brain-store holds per
 * source, plus the running/last export job. POST {sources?: ['attio','fathom']}:
 * start an export into this box's brain-store (returns at once; poll GET).
 * Pure code, no LLM; safe to run on the host with the seats paused.
 */
function jobView() {
  const j = getArchiveJob();
  if (!j) return null;
  const { done: _done, ...rest } = j;
  return rest;
}

export async function GET() {
  return NextResponse.json({ archive: archiveStatus(gbrainStorePath()), job: jobView() }, { headers: { 'Cache-Control': 'no-store' } });
}

const Body = z.object({ sources: z.array(z.enum(['attio', 'fathom'])).min(1).optional() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const sources: ArchiveSource[] = parsed.data.sources ?? ['attio', 'fathom'];
  const job = startArchiveJob({
    sources,
    storeDir: gbrainStorePath(),
    keys: { attio: resolveAttioKey(), fathom: resolveCred('FATHOM_API_KEY', [CRED_FILES.brainAgent, CRED_FILES.socialMedia]) },
  });
  return NextResponse.json({ started: job.startedAt, state: job.state, sources: job.sources }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}
