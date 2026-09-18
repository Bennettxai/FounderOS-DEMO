import { GATED, connected as gatedConnected } from '@/lib/connectors/demo-status';
import { ImapFlow, type FetchMessageObject, type ListResponse, type MessageAddressObject } from 'imapflow';
import type { ConnectorStatus } from '@/lib/connectors/types';
import type { CommsItem } from '@/lib/comms';
import {
  EmailThreadSchema,
  EmailInboxItemSchema,
  findEmailAttachments,
  htmlEmailToText,
  selectReadablePart,
  threadReferences,
  type EmailThread,
  type EmailInboxItem,
} from '@/lib/email-thread';

import { checkOutboundMail } from '@/lib/mail-guard.mjs';

export type InboxConfig = {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  pass: string;
  smtpHost: string; // for sending replies
  smtpPort: number;
};

const MAX_INBOXES = 4;

export function parseInboxConfigs(env: Record<string, string | undefined>): InboxConfig[] {
  const inboxes: InboxConfig[] = [];
  for (let slot = 1; slot <= MAX_INBOXES; slot++) {
    const host = env[`INBOX_${slot}_HOST`];
    const user = env[`INBOX_${slot}_USER`];
    const pass = env[`INBOX_${slot}_PASS`];
    if (!host || !user || !pass) continue;
    inboxes.push({
      id: `inbox-${slot}`,
      name: env[`INBOX_${slot}_NAME`] ?? user,
      host,
      port: Number(env[`INBOX_${slot}_PORT`] ?? 993),
      user,
      pass,
      smtpHost: env[`INBOX_${slot}_SMTP_HOST`] ?? host.replace(/^imap\./, 'smtp.'),
      smtpPort: Number(env[`INBOX_${slot}_SMTP_PORT`] ?? 465),
    });
  }
  return inboxes;
}

/**
 * Send a real email reply over SMTP using the matching inbox's credentials.
 * Honest: returns `{ ok: false, error }` instead of throwing when no inbox is
 * configured, the recipient is empty, or SMTP fails — the UI falls back to a
 * mailto: draft on a non-ok result.
 */
export async function sendEmailReply(
  reply: { accountId?: string; to: string; subject: string; text: string; inReplyTo?: string; references?: string[] },
  env: Record<string, string | undefined> = process.env,
): Promise<{ ok: boolean; error?: string }> {
  const inboxes = parseInboxConfigs(env);
  if (inboxes.length === 0) return { ok: false, error: 'no inbox configured (set INBOX_n_* in .env.local)' };
  if (!reply.to || reply.to.trim() === '') return { ok: false, error: 'no recipient address' };
  const cfg = inboxes.find((i) => i.id === reply.accountId) ?? inboxes[0];
  // This route sits behind the app's access gate and defaults to inboxes[0],
  // so an unapproved recipient here sends as the operator to anyone. Refuse
  // before we touch SMTP.
  const allowed = checkOutboundMail({ from: cfg.user, to: reply.to }, env);
  if (!allowed.ok) return { ok: false, error: allowed.error };
  try {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort,
      secure: cfg.smtpPort === 465,
      auth: { user: cfg.user, pass: cfg.pass },
    });
    await transport.sendMail({
      from: cfg.user,
      to: reply.to,
      subject: reply.subject,
      text: reply.text,
      ...(reply.inReplyTo ? { inReplyTo: reply.inReplyTo } : {}),
      ...(reply.references?.length ? { references: threadReferences(reply.references, reply.inReplyTo) } : {}),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type InboxUnread = { inbox: string; unread: number; error?: string };

/** Shared IMAP client options with fail-fast timeouts: a throttled Gmail
 * connect must degrade the dashboard (error entry, zero counts), never stall
 * the render. */
export function imapClientOptions(config: InboxConfig) {
  return {
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    logger: false as const,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  };
}

async function unreadCount(config: InboxConfig): Promise<InboxUnread> {
  const client = new ImapFlow(imapClientOptions(config));
  try {
    await client.connect();
    const status = await client.status('INBOX', { unseen: true });
    return { inbox: config.name, unread: status.unseen ?? 0 };
  } catch (err) {
    return { inbox: config.name, unread: 0, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await client.logout().catch(() => {});
  }
}

let unreadCache: { at: number; counts: InboxUnread[] } | null = null;

/**
 * Every /comms render opened one IMAP connection PER INBOX for these counts, on
 * top of the message fetch. Same short window as the message cache, and only a
 * result where at least one inbox answered is kept, so a total outage retries
 * instead of being pinned.
 */
export async function unreadCounts(env: Record<string, string | undefined> = process.env): Promise<InboxUnread[]> {
  const now = Date.now();
  if (unreadCache && now - unreadCache.at < EMAIL_CACHE_TTL_MS) return unreadCache.counts;
  const inboxes = parseInboxConfigs(env);
  const counts = await Promise.all(inboxes.map(unreadCount));
  if (counts.some((c) => !c.error)) unreadCache = { at: Date.now(), counts };
  return counts;
}

/**
 * /comms renders on the server, so every page view used to pay for four fresh
 * IMAP round trips: connect, TLS, LOGIN, SELECT, FETCH, per inbox. Measured on
 * the host that was 9.5s while every other page was under 0.4s.
 *
 * Deepening the feed to 40 per inbox made that worse, so the result is cached
 * instead of the depth being given back.
 *
 * The TTL deliberately EXCEEDS the 15-minute refresh sweep. A cold render was
 * measured at 18.4s, so if the window were shorter than the sweep, whoever
 * opened /comms first after an expiry would eat that wait. Instead the sweep
 * repopulates the cache before it can expire and the background job pays the
 * cost. Freshness is then bounded by the sweep, which is the cadence the operator
 * chose, not by this number.
 *
 * Only successes are cached, so a transient IMAP failure retries rather than
 * being pinned for the window.
 */
export const EMAIL_CACHE_TTL_MS = 20 * 60_000;
let emailCache: { at: number; limit: number; items: CommsItem[] } | null = null;

/** Drops the cache so a reply or a test sees fresh state immediately. */
export function invalidateEmailCache(): void {
  emailCache = null;
  unreadCache = null;
}

/** Latest message envelopes across every configured inbox, for the Comms feed. */
export async function latestEmails(
  limitPerInbox = 40,
  env: Record<string, string | undefined> = process.env,
): Promise<CommsItem[]> {
  const now = Date.now();
  // A cache built at a DEEPER limit already contains everything a shallower
  // request wants, so serve it. Requiring an exact match meant the home feed
  // (which asks for 5/inbox) missed the cache warmed for /comms (40/inbox) and
  // paid the full IMAP cost — measured at 18.2s on the home page.
  if (emailCache && emailCache.limit >= limitPerInbox && now - emailCache.at < EMAIL_CACHE_TTL_MS) {
    return emailCache.items;
  }
  const inboxes = parseInboxConfigs(env);
  const items: CommsItem[] = [];
  await Promise.all(
    inboxes.map(async (config) => {
      const client = new ImapFlow(imapClientOptions(config));
      try {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX');
        try {
          const mailbox = client.mailbox;
          const exists = typeof mailbox === 'object' && mailbox ? mailbox.exists : 0;
          if (!exists) return;
          const start = Math.max(1, exists - limitPerInbox + 1);
          for await (const msg of client.fetch(`${start}:*`, { envelope: true, flags: true, threadId: true })) {
            const from = msg.envelope?.from?.[0];
            const replyTo = msg.envelope?.replyTo?.[0]?.address ?? from?.address;
            items.push({
              source: 'email',
              title: `${config.name} — ${from?.name || from?.address || 'unknown sender'}`,
              sender: from?.name || from?.address || 'unknown sender',
              replyTo,
              account: config.id,
              preview: msg.envelope?.subject ?? '(no subject)',
              subject: msg.envelope?.subject ?? '(no subject)',
              emailUid: msg.uid,
              emailThreadId: msg.threadId,
              emailMessageId: msg.envelope?.messageId,
              ts: (msg.envelope?.date ?? new Date(0)).toISOString(),
              unread: msg.flags?.has('\\Seen') ? 0 : 1,
              starred: msg.flags?.has('\\Flagged') ?? false,
            });
          }
        } finally {
          lock.release();
        }
      } catch {
        // inbox-level failures already surface via emailStatus; skip in feed
      } finally {
        await client.logout().catch(() => {});
      }
    }),
  );
  // Only a real result is cached; an empty list may mean every inbox errored,
  // and pinning that for 90s would turn a blip into a blank comms page.
  if (items.length > 0) emailCache = { at: Date.now(), limit: limitPerInbox, items };
  return items;
}

function inboxItemFromMessage(config: InboxConfig, msg: FetchMessageObject): EmailInboxItem {
  const from = msg.envelope?.from?.[0];
  const replyTo = msg.envelope?.replyTo?.[0]?.address ?? from?.address;
  const subject = msg.envelope?.subject ?? '(no subject)';
  return EmailInboxItemSchema.parse({
    id: `${config.id}:${msg.uid}`,
    sender: from?.name || from?.address || 'unknown sender',
    subject,
    preview: subject,
    ts: (msg.envelope?.date ?? new Date(0)).toISOString(),
    unread: msg.flags?.has('\\Seen') ? 0 : 1,
    ...(replyTo ? { replyTo } : {}),
    emailUid: msg.uid,
    ...(msg.threadId ? { emailThreadId: msg.threadId } : {}),
    ...(msg.envelope?.messageId ? { emailMessageId: msg.envelope.messageId } : {}),
    starred: msg.flags?.has('\\Flagged') ?? false,
  });
}

/** Search the full INBOX, not only the recent rows rendered on the dashboard. */
export async function searchInboxEmails(
  accountId: string,
  query: string,
  limit = 50,
  env: Record<string, string | undefined> = process.env,
): Promise<EmailConnectorResult<EmailInboxItem[]>> {
  const config = configFor(accountId, env);
  if (!config) return { ok: false, error: 'email account is not configured' };
  const client = new ImapFlow(imapClientOptions(config));
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const found = await client.search(
        { or: [{ subject: query }, { from: query }, { body: query }] },
        { uid: true },
      );
      if (!found || found.length === 0) return { ok: true, value: [] };
      const uids = found.slice(-Math.max(1, Math.min(limit, 100)));
      const rows = await client.fetchAll(uids, { uid: true, envelope: true, flags: true, threadId: true }, { uid: true });
      return {
        ok: true,
        value: rows.map((row) => inboxItemFromMessage(config, row)).sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)),
      };
    } finally {
      lock.release();
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await client.logout().catch(() => {});
  }
}

const displayAddress = (address?: MessageAddressObject): string => {
  if (!address) return '';
  return address.name && address.address ? `${address.name} <${address.address}>` : address.address ?? address.name ?? '';
};

const specialMailbox = (boxes: ListResponse[], use: string, fallback: string): string =>
  boxes.find((box) => box.specialUse === use)?.path ?? fallback;

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function decodeBody(buffer: Buffer, charset?: string): string {
  try {
    return new TextDecoder(charset || 'utf-8').decode(buffer);
  } catch {
    return buffer.toString('utf8');
  }
}

function configFor(accountId: string, env: Record<string, string | undefined>): InboxConfig | undefined {
  return parseInboxConfigs(env).find((inbox) => inbox.id === accountId);
}

export type EmailConnectorResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Load every message in a Gmail conversation from All Mail, including sent mail. */
export async function fetchEmailThread(
  request: { accountId: string; threadId?: string; messageId?: string; uid?: number },
  env: Record<string, string | undefined> = process.env,
): Promise<EmailConnectorResult<EmailThread>> {
  const config = configFor(request.accountId, env);
  if (!config) return { ok: false, error: 'email account is not configured' };
  const client = new ImapFlow(imapClientOptions(config));
  try {
    await client.connect();
    const boxes = await client.list();
    const mailbox = specialMailbox(boxes, '\\All', 'INBOX');
    const lock = await client.getMailboxLock(mailbox);
    try {
      let uids: number[] | false = false;
      if (request.threadId) uids = await client.search({ threadId: request.threadId }, { uid: true });
      if ((!uids || uids.length === 0) && request.messageId) {
        uids = await client.search({ header: { 'message-id': request.messageId } }, { uid: true });
      }
      if ((!uids || uids.length === 0) && mailbox === 'INBOX' && request.uid) uids = [request.uid];
      if (!uids || uids.length === 0) return { ok: false, error: 'conversation was not found' };

      const rows = await client.fetchAll(
        uids,
        { uid: true, envelope: true, flags: true, bodyStructure: true, threadId: true },
        { uid: true },
      );
      const messages = [];
      for (const row of rows) {
        const readable = selectReadablePart(row.bodyStructure);
        let body = '(No readable text body.)';
        if (readable) {
          const downloaded = await client.download(String(row.uid), readable.part, { uid: true, maxBytes: 2_000_000 });
          const raw = decodeBody(await streamToBuffer(downloaded.content), downloaded.meta.charset);
          body = readable.html ? htmlEmailToText(raw) : raw.replace(/\r\n/g, '\n').trim();
        }
        const from = row.envelope?.from?.[0];
        const sentByMe = from?.address?.toLowerCase() === config.user.toLowerCase();
        messages.push({
          uid: row.uid,
          ...(row.emailId ? { emailId: row.emailId } : {}),
          ...(row.envelope?.messageId ? { messageId: row.envelope.messageId } : {}),
          from: displayAddress(from) || 'unknown sender',
          ...(from?.address ? { fromAddress: from.address } : {}),
          to: (row.envelope?.to ?? []).map(displayAddress).filter(Boolean),
          cc: (row.envelope?.cc ?? []).map(displayAddress).filter(Boolean),
          sentByMe,
          subject: row.envelope?.subject ?? '(no subject)',
          date: new Date(row.envelope?.date ?? row.internalDate ?? 0).toISOString(),
          body,
          unread: !(row.flags?.has('\\Seen') ?? false),
          starred: row.flags?.has('\\Flagged') ?? false,
          attachments: findEmailAttachments(row.bodyStructure),
        });
      }
      messages.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      const lastInbound = [...messages].reverse().find((message) => !message.sentByMe && message.fromAddress);
      return {
        ok: true,
        value: EmailThreadSchema.parse({
          account: request.accountId,
          threadId: request.threadId ?? rows[0]?.threadId ?? request.messageId ?? String(request.uid),
          subject: messages.at(-1)?.subject ?? '(no subject)',
          ...(lastInbound?.fromAddress ? { replyTo: lastInbound.fromAddress } : {}),
          messages,
        }),
      };
    } finally {
      lock.release();
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await client.logout().catch(() => {});
  }
}

export type EmailThreadAction = 'archive' | 'trash' | 'read' | 'unread' | 'star' | 'unstar';

/** Apply an inbox action to the whole Gmail conversation. */
export async function updateEmailThread(
  request: { accountId: string; threadId: string; uid?: number; action: EmailThreadAction },
  env: Record<string, string | undefined> = process.env,
): Promise<EmailConnectorResult<{ action: EmailThreadAction }>> {
  const config = configFor(request.accountId, env);
  if (!config) return { ok: false, error: 'email account is not configured' };
  const client = new ImapFlow(imapClientOptions(config));
  try {
    await client.connect();
    const boxes = await client.list();
    const allMail = specialMailbox(boxes, '\\All', 'INBOX');
    const lock = await client.getMailboxLock(allMail);
    try {
      let uids = await client.search({ threadId: request.threadId }, { uid: true });
      if ((!uids || uids.length === 0) && allMail === 'INBOX' && request.uid) uids = [request.uid];
      if (!uids || uids.length === 0) return { ok: false, error: 'conversation was not found' };
      if (request.action === 'read') await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
      if (request.action === 'unread') await client.messageFlagsRemove(uids, ['\\Seen'], { uid: true });
      if (request.action === 'star') await client.messageFlagsAdd(uids, ['\\Flagged'], { uid: true });
      if (request.action === 'unstar') await client.messageFlagsRemove(uids, ['\\Flagged'], { uid: true });
      if (request.action === 'archive') {
        if (client.capabilities.has('X-GM-EXT-1')) {
          await client.messageFlagsRemove(uids, ['\\Inbox'], { uid: true, useLabels: true });
        } else {
          const archive = specialMailbox(boxes, '\\Archive', 'Archive');
          await client.messageMove(uids, archive, { uid: true });
        }
      }
      if (request.action === 'trash') {
        const trash = specialMailbox(boxes, '\\Trash', 'Trash');
        await client.messageMove(uids, trash, { uid: true });
      }
      return { ok: true, value: { action: request.action } };
    } finally {
      lock.release();
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function downloadEmailAttachment(
  request: { accountId: string; threadId: string; uid: number; part: string },
  env: Record<string, string | undefined> = process.env,
): Promise<EmailConnectorResult<{ data: Buffer; filename: string; contentType: string }>> {
  const config = configFor(request.accountId, env);
  if (!config) return { ok: false, error: 'email account is not configured' };
  const client = new ImapFlow(imapClientOptions(config));
  try {
    await client.connect();
    const boxes = await client.list();
    const allMail = specialMailbox(boxes, '\\All', 'INBOX');
    const lock = await client.getMailboxLock(allMail);
    try {
      const threadUids = await client.search({ threadId: request.threadId }, { uid: true });
      if (!threadUids || !threadUids.includes(request.uid)) return { ok: false, error: 'attachment message was not found in this conversation' };
      const message = await client.fetchOne(String(request.uid), { bodyStructure: true }, { uid: true });
      if (!message) return { ok: false, error: 'attachment message was not found' };
      const attachment = findEmailAttachments(message.bodyStructure).find((candidate) => candidate.part === request.part);
      if (!attachment) return { ok: false, error: 'attachment was not found' };
      const downloaded = await client.download(String(request.uid), request.part, { uid: true, maxBytes: 25_000_000 });
      return {
        ok: true,
        value: {
          data: await streamToBuffer(downloaded.content),
          filename: attachment.filename,
          contentType: attachment.contentType,
        },
      };
    } finally {
      lock.release();
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function emailStatus(env: Record<string, string | undefined> = process.env): Promise<ConnectorStatus> {
  if (GATED) return gatedConnected('email', 'Email', 'email', '4 inboxes · IMAP');
  const inboxes = parseInboxConfigs(env);
  if (inboxes.length === 0) {
    return {
      id: 'email',
      name: 'Email Inboxes',
      kind: 'email',
      state: 'not_configured',
      detail: 'No inboxes configured. Set INBOX_1_HOST / _USER / _PASS (up to 4 slots) in .env.local.',
      meta: { configured: 0, slots: MAX_INBOXES },
    };
  }
  const counts = await unreadCounts(env);
  const errors = counts.filter((c) => c.error);
  const totalUnread = counts.reduce((sum, c) => sum + c.unread, 0);
  if (errors.length === counts.length) {
    return {
      id: 'email',
      name: 'Email Inboxes',
      kind: 'email',
      state: 'error',
      detail: `All ${counts.length} inbox connections failed: ${errors[0].error}`,
      meta: { configured: inboxes.length },
    };
  }
  return {
    id: 'email',
    name: 'Email Inboxes',
    kind: 'email',
    state: 'connected',
    detail: `${inboxes.length} inbox${inboxes.length > 1 ? 'es' : ''} · ${totalUnread} unread${
      errors.length ? ` · ${errors.length} failing` : ''
    }`,
    meta: { configured: inboxes.length, unread: totalUnread },
  };
}
