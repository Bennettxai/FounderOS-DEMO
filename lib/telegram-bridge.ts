/**
 * Telegram bridge — the pure half.
 *
 * This is the front door to the OS from a phone: a message lands here, becomes
 * a comment on the Paperclip cockpit issue (which wakes the Conductor), and the
 * Conductor's reply comes back out. The IO half lives in
 * scripts/telegram-bridge.ts.
 *
 * SECURITY: this path can reach an agent with shell access on the host, so
 * authorization fails CLOSED. No allowlist means nothing is accepted, a bot
 * sender is refused even on the right chat, and refusals carry no reason so a
 * stranger cannot use the bot as an oracle.
 *
 * Long polling is deliberate: no inbound port, no public webhook URL, and it
 * works from behind the private network with nothing exposed.
 */

export type TelegramChat = { id: number };
export type TelegramFrom = { id: number; is_bot?: boolean };
export type TelegramVoice = { file_id: string; duration?: number; mime_type?: string };

export type TelegramMessage = {
  message_id: number;
  chat: TelegramChat;
  from?: TelegramFrom;
  date: number;
  text?: string;
  voice?: TelegramVoice;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  /** present on edits and channel posts; both are refused (no verified sender) */
  edited_message?: unknown;
  channel_post?: unknown;
};

export type AuthResult = { ok: true; chatId: number } | { ok: false };

/** Telegram rejects anything over 4096 characters in one message. */
export const TELEGRAM_LIMIT = 4096;

/**
 * The only thing standing between a Telegram account and a shell on the host.
 * Everything that is not an explicitly allowed human sending a fresh message
 * is refused, silently.
 */
export function authorizeUpdate(
  update: TelegramUpdate,
  opts: { allowedChatIds: number[] },
): AuthResult {
  // fail closed: an unconfigured allowlist accepts nobody
  if (!opts.allowedChatIds || opts.allowedChatIds.length === 0) return { ok: false };
  // edits and channel posts do not carry a sender we can trust
  if (update.edited_message || update.channel_post) return { ok: false };

  const message = update.message;
  if (!message) return { ok: false };
  if (message.from?.is_bot) return { ok: false };

  const chatId = message.chat?.id;
  if (typeof chatId !== 'number') return { ok: false };
  // the sender must be the owner too, not just the room
  if (message.from && message.from.id !== chatId) return { ok: false };
  if (!opts.allowedChatIds.includes(chatId)) return { ok: false };

  return { ok: true, chatId };
}

export type ParsedUpdate =
  | { kind: 'text'; text: string; chatId: number }
  | { kind: 'voice'; fileId: string; chatId: number };

/** What the message actually is. Null when there is nothing we can act on. */
export function parseUpdate(update: TelegramUpdate): ParsedUpdate | null {
  const m = update.message;
  if (!m) return null;
  const chatId = m.chat?.id;
  if (typeof chatId !== 'number') return null;
  if (m.voice?.file_id) return { kind: 'voice', fileId: m.voice.file_id, chatId };
  const text = m.text?.trim();
  if (text) return { kind: 'text', text, chatId };
  return null;
}

/** Long-poll offset: one past the highest id seen, so nothing replays. */
export function nextOffset(updates: TelegramUpdate[], current: number): number {
  if (!updates.length) return current;
  return Math.max(current, ...updates.map((u) => u.update_id + 1));
}

type ThreadComment = {
  id: string;
  body: string;
  authorType: 'user' | 'agent';
  authorAgentId: string | null;
  createdAt: string;
};

/**
 * The agent replies worth sending back: agent-authored, strictly newer than the
 * last thing we forwarded, oldest first so a multi-part answer reads in order.
 * The operator's own messages are never echoed back.
 */
export function newAgentReplies<T extends ThreadComment>(thread: T[], sinceISO: string): T[] {
  const since = Date.parse(sinceISO);
  return thread
    .filter((c) => c.authorType === 'agent')
    .filter((c) => {
      const at = Date.parse(c.createdAt);
      return Number.isFinite(at) && at > since;
    })
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/**
 * Split to Telegram's limit, preferring a line break near the edge so fenced
 * code and lists do not get cut mid-line.
 */
export function chunkForTelegram(body: string, limit = TELEGRAM_LIMIT): string[] {
  if (body.length <= limit) return [body];
  const out: string[] = [];
  let rest = body;
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const br = window.lastIndexOf('\n');
    // only honour a break in the last quarter, else we waste most of a message
    const cut = br > limit * 0.75 ? br : limit;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut === br ? cut + 1 : cut);
  }
  if (rest) out.push(rest);
  return out;
}
