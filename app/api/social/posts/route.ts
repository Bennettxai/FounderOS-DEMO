import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getDb } from '@/lib/data';
import { SocialPlatformSchema, type SocialPost } from '@/lib/schemas';
import { zernioPublish } from '@/lib/connectors/zernio';

export const dynamic = 'force-dynamic';

/** The post queue, newest first. */
export async function GET() {
  return NextResponse.json({ posts: getDb().socialPosts.all() });
}

const CreateSchema = z.object({
  caption: z.string().min(1, 'caption is required'),
  platforms: z.array(SocialPlatformSchema).min(1, 'pick at least one platform'),
  mediaUrl: z.string().url().nullish(),
  mediaUrls: z.array(z.string().url()).optional(),
  scheduledFor: z.string().nullish(),
});

/**
 * Post for REAL via Zernio/Late (the operator). Immediate posts publish
 * now; scheduledFor rides to Late so their scheduler fires it. The record
 * lands in the local queue with an honest status: published / queued
 * (scheduled) / failed (with the error surfaced). Publishing is skipped
 * under NODE_ENV=test so the suite never hits the live API.
 */
export async function POST(request: Request) {
  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const mediaUrls = parsed.data.mediaUrls?.length
    ? parsed.data.mediaUrls
    : parsed.data.mediaUrl
      ? [parsed.data.mediaUrl]
      : [];

  let status: SocialPost['status'] = 'queued';
  let publishError: string | null = null;
  if (process.env.NODE_ENV !== 'test') {
    const result = await zernioPublish({
      caption: parsed.data.caption,
      mediaUrls,
      platforms: parsed.data.platforms,
      scheduledFor: parsed.data.scheduledFor ?? null,
    });
    if (result.ok) status = parsed.data.scheduledFor ? 'queued' : 'published';
    else {
      status = 'failed';
      publishError = result.error;
    }
  }

  const post: SocialPost = {
    id: randomUUID(),
    caption: parsed.data.caption,
    mediaUrl: mediaUrls[0] ?? null,
    platforms: parsed.data.platforms,
    status,
    scheduledFor: parsed.data.scheduledFor ?? null,
    createdAt: new Date().toISOString(),
  };
  getDb().socialPosts.enqueue(post);
  return NextResponse.json(
    publishError ? { post, error: publishError } : { post },
    { status: publishError ? 502 : 201 },
  );
}
