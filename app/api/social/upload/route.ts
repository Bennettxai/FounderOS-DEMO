import { NextResponse } from 'next/server';
import { zernioUploadTarget } from '@/lib/connectors/zernio';

export const dynamic = 'force-dynamic';

/**
 * Drag-and-drop media upload for the Social composer: the server trades the
 * file for a Late presigned slot, PUTs the bytes, and hands back the public
 * accessUrl the post will carry. The API key never reaches the browser.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'multipart "file" field required' }, { status: 400 });
  }
  try {
    const contentType = file.type || 'application/octet-stream';
    const { uploadUrl, accessUrl } = await zernioUploadTarget(file.name, contentType);
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: Buffer.from(await file.arrayBuffer()),
      signal: AbortSignal.timeout(120_000),
    });
    if (!put.ok) throw new Error(`media PUT failed: HTTP ${put.status}`);
    return NextResponse.json({ url: accessUrl, name: file.name, contentType }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
