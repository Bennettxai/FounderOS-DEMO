/**
 * The /comms messaging board, split by source into lanes: the four email
 * inboxes each on their own, plus WhatsApp. (The Wispr notes lane was removed * — dictations aren't comms.) Pure assembly in buildCommsLanes
 * (unit-tested); gatherCommsLanes wires the live connectors. Each lane carries
 * its own connector state so the header can read honest
 * (connected / not_configured / error) per source.
 */
import { contactPriority, type CommsItem } from '@/lib/comms';
import type { ContactTag } from '@/lib/schemas';
import type { ConnectorState, ConnectorStatus } from '@/lib/connectors/types';
import { parseInboxConfigs, latestEmails, emailStatus } from '@/lib/connectors/email';
import { recentChats, whatsappStatus } from '@/lib/connectors/whatsapp';
import { getDb } from '@/lib/data';

export type LaneSource = 'email' | 'whatsapp';

export type CommsLaneItem = {
  id: string;
  sender: string;
  preview: string;
  ts: string;
  unread: number;
  priority?: 1 | 2 | 3;
  replyTo?: string; // sender's email address — present ⇒ the reader can respond
  subject?: string;
  emailUid?: number;
  emailThreadId?: string;
  emailMessageId?: string;
  starred?: boolean;
  kind?: string;
  app?: string | null;
};

export type CommsLane = {
  id: string;
  name: string;
  source: LaneSource;
  state: ConnectorState;
  detail: string;
  items: CommsLaneItem[];
  unread: number;
};

const byTsDesc = (a: CommsLaneItem, b: CommsLaneItem) => Date.parse(b.ts) - Date.parse(a.ts);

function makeLane(
  id: string,
  name: string,
  source: LaneSource,
  status: ConnectorStatus,
  items: CommsLaneItem[],
  tags: ContactTag[],
): CommsLane {
  const stamped = items
    .map((it) => {
      const p = tags.length ? contactPriority(it.sender, tags) : undefined;
      return p === undefined ? it : { ...it, priority: p };
    })
    .sort(byTsDesc);
  return {
    id,
    name,
    source,
    state: status.state,
    detail: status.detail,
    items: stamped,
    unread: stamped.reduce((sum, i) => sum + (i.unread ?? 0), 0),
  };
}

export function buildCommsLanes(input: {
  inboxes: { id: string; name: string }[];
  emails: CommsItem[];
  emailState: ConnectorStatus;
  whatsapp: CommsItem[];
  whatsappState: ConnectorStatus;
  tags: ContactTag[];
}): CommsLane[] {
  const { inboxes, emails, emailState, whatsapp, whatsappState, tags } = input;
  const lanes: CommsLane[] = [];

  // one lane per configured inbox (in slot order); the four share the aggregate
  // email connector status, since a configured inbox is reachable as a whole
  for (const box of inboxes) {
    const items: CommsLaneItem[] = emails
      .filter((e) => e.account === box.id)
      .map((e, i) => ({
        id: `${box.id}:${e.ts}:${i}`,
        sender: e.sender ?? e.title,
        preview: e.preview,
        ts: e.ts,
        unread: e.unread ?? 0,
        ...(e.replyTo ? { replyTo: e.replyTo } : {}),
        ...(e.subject ? { subject: e.subject } : {}),
        ...(e.emailUid ? { emailUid: e.emailUid } : {}),
        ...(e.emailThreadId ? { emailThreadId: e.emailThreadId } : {}),
        ...(e.emailMessageId ? { emailMessageId: e.emailMessageId } : {}),
        ...(e.starred !== undefined ? { starred: e.starred } : {}),
      }));
    lanes.push(makeLane(box.id, box.name, 'email', emailState, items, tags));
  }

  const waItems: CommsLaneItem[] = whatsapp.map((w, i) => ({
    id: `whatsapp:${w.ts}:${i}`,
    sender: w.sender ?? w.title,
    preview: w.preview,
    ts: w.ts,
    unread: w.unread ?? 0,
  }));
  lanes.push(makeLane('whatsapp', 'WhatsApp', 'whatsapp', whatsappState, waItems, tags));

  return lanes;
}

/**
 * Live assembly: reads every source connector, then builds the lanes. Returns
 * the source connector statuses too so the page's status row can reuse them
 * instead of re-hitting IMAP/local SQLite a second time.
 */
export async function gatherCommsLanes(): Promise<{
  lanes: CommsLane[];
  emailState: ConnectorStatus;
  whatsappState: ConnectorStatus;
}> {
  const inboxCfgs = parseInboxConfigs(process.env);
  const [emails, emailState, whatsapp, whatsappState] = await Promise.all([
    latestEmails(40),
    emailStatus(),
    recentChats(40),
    whatsappStatus(),
  ]);
  const tags = getDb().contactTags.all();
  const inboxes = inboxCfgs.map((c) => ({ id: c.id, name: c.name }));
  return {
    lanes: buildCommsLanes({ inboxes, emails, emailState, whatsapp, whatsappState, tags }),
    emailState,
    whatsappState,
  };
}
