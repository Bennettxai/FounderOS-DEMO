import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import {
  DELIVERABLE_MIME,
  groupDeliverables,
  listDeliverables,
  resolveDeliverable,
  WORKSPACES_DIR,
} from '@/lib/board-deliverables';
import { clampPreview, previewKind } from '@/lib/deliverable-preview';
import { getDb } from '@/lib/data';

export const dynamic = 'force-dynamic';

/**
 * GET → the deliverables list as ordered folders (proposal
 * folders first, then agent files, newest first) plus
 * the operator's decisions, so the tab can hide what has
 * already been handled without a second round trip. Honest
 * empty when the workspace dir is absent (a machine
 * that doesn't host the board). `deliverables` is still
 * returned flat so nothing that reads it breaks.
 * GET ?file=<id>&mode=view → JSON the review panel can render. Deliverables
 * used to be visible only as a download link, with no way to preview the
 * content before committing to open it: the attachment branch below fixes
 * that by making every click a read instead of a download.
 * GET ?file=<id>&inline=1 → the bytes with an inline disposition, for <img> and
 * <iframe> sources on images and PDFs.
 * GET ?file=<id> → streams that file as a download, traversal-guarded
 * (logic + guard live in lib/board-deliverables).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const file = url.searchParams.get('file');

  if (!file) {
    const files = listDeliverables();
    const db = getDb();
    return NextResponse.json({
      groups: groupDeliverables(files, db.proposals.all()),
      deliverables: files,
      decisions: db.deliverableDecisions.all(),
      dir: WORKSPACES_DIR,
    });
  }

  const full = resolveDeliverable(file);
  if (!full) return NextResponse.json({ error: 'bad file key' }, { status: 400 });
  const name = path.basename(full);
  const kind = previewKind(name);

  if (url.searchParams.get('mode') === 'view') {
    // Only text is inlined into JSON. Images and PDFs come back as a kind the
    // panel renders from the `inline=1` URL instead, and binaries as a kind it
    // renders as "download only" — never as megabytes of mojibake.
    if (kind !== 'text') {
      return NextResponse.json({ id: file, name, kind, text: null, truncated: false });
    }
    try {
      const { text, truncated } = clampPreview(readFileSync(full, 'utf8'));
      return NextResponse.json({ id: file, name, kind, text, truncated });
    } catch {
      return NextResponse.json({ error: 'file not found' }, { status: 404 });
    }
  }

  try {
    const buf = readFileSync(full);
    const ext = path.extname(full).toLowerCase();
    const inline = url.searchParams.get('inline') === '1';
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': DELIVERABLE_MIME[ext] ?? 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name.replace(/"/g, '')}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'file not found' }, { status: 404 });
  }
}
