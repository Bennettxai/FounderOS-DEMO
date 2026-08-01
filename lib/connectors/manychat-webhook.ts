import { SocialDmMessageSchema, type SocialDmMessage } from '@/lib/schemas';

// Parser for the payload ManyChat POSTs via its "External Request" action. The
// body is user-defined in ManyChat, so we accept the common field-name variants
// ({{contact.id}} → subscriber_id / contact_id / id, etc.) and default sensibly.
// ManyChat's API can't be polled for DMs, so this push path is how the /social
// inbox goes live.

function str(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
}

/**
 * Map a ManyChat webhook body to a SocialDmMessage, or null if it lacks a
 * subscriber id. `now` supplies the fallback timestamp (injectable for tests).
 */
export function parseManyChatWebhook(
  raw: unknown,
  now: () => string = () => new Date().toISOString(),
): SocialDmMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;

  const subscriberId = str(p.subscriber_id) ?? str(p.contact_id) ?? str(p.id);
  if (!subscriberId) return null;

  const name = str(p.name) ?? str(p.full_name) ?? str(p.first_name) ?? subscriberId;
  const handle = str(p.handle) ?? str(p.ig_username) ?? str(p.username) ?? null;
  const text = str(p.text) ?? str(p.message) ?? str(p.last_input_text) ?? '';
  const direction = str(p.direction) === 'out' ? 'out' : 'in';
  const ts = str(p.ts) ?? str(p.timestamp) ?? now();
  const tag = str(p.tag) ?? str(p.message_tag) ?? null;
  const id = str(p.message_id) ?? `mc-${subscriberId}-${ts}`;

  return SocialDmMessageSchema.parse({
    id,
    platform: 'instagram',
    subscriberId,
    name,
    handle,
    text,
    direction,
    tag,
    ts,
    source: 'manychat',
  });
}
