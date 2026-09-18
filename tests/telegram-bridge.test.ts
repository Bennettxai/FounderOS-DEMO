import { describe, it, expect } from 'vitest';
import {
  authorizeUpdate,
  parseUpdate,
  nextOffset,
  newAgentReplies,
  chunkForTelegram,
  type TelegramUpdate,
} from '@/lib/telegram-bridge';

/**
 * The Telegram bridge is a remote-control path into a machine that holds
 * Stripe keys and inbox passwords, so the authorization rules are the part
 * that has to be right. Everything here is pure: the IO lives in
 * scripts/telegram-bridge.ts and is thin on purpose.
 */

const msg = (over: Partial<{ chatId: number; text: string; updateId: number; voice: boolean }> = {}): TelegramUpdate => ({
  update_id: over.updateId ?? 1,
  message: {
    message_id: 10,
    chat: { id: over.chatId ?? 4242 },
    from: { id: over.chatId ?? 4242, is_bot: false },
    date: 1786000000,
    ...(over.voice
      ? { voice: { file_id: 'AwACAgEAAx', duration: 3, mime_type: 'audio/ogg' } }
      : { text: over.text ?? 'hello' }),
  },
});

describe('authorizeUpdate — the only thing between Telegram and a shell', () => {
  it('accepts the owner chat id', () => {
    expect(authorizeUpdate(msg({ chatId: 4242 }), { allowedChatIds: [4242] })).toEqual({ ok: true, chatId: 4242 });
  });

  it('rejects any other chat id', () => {
    expect(authorizeUpdate(msg({ chatId: 9999 }), { allowedChatIds: [4242] }).ok).toBe(false);
  });

  it('rejects when no allowlist is configured, rather than allowing everyone', () => {
    // a misconfigured deploy must fail closed
    expect(authorizeUpdate(msg({ chatId: 4242 }), { allowedChatIds: [] }).ok).toBe(false);
  });

  it('rejects messages from bots even on the allowed chat', () => {
    const u = msg({ chatId: 4242 });
    u.message!.from!.is_bot = true;
    expect(authorizeUpdate(u, { allowedChatIds: [4242] }).ok).toBe(false);
  });

  it('rejects channel posts and edits, which carry no verified sender', () => {
    expect(authorizeUpdate({ update_id: 2, channel_post: { chat: { id: 4242 } } } as TelegramUpdate, { allowedChatIds: [4242] }).ok).toBe(false);
    expect(authorizeUpdate({ update_id: 3, edited_message: { chat: { id: 4242 } } } as TelegramUpdate, { allowedChatIds: [4242] }).ok).toBe(false);
  });

  it('never reveals why it refused (no oracle for strangers)', () => {
    const res = authorizeUpdate(msg({ chatId: 1 }), { allowedChatIds: [4242] });
    expect(res).toEqual({ ok: false });
  });
});

describe('parseUpdate', () => {
  it('reads a text message', () => {
    expect(parseUpdate(msg({ text: 'ship the carousel' }))).toEqual({
      kind: 'text',
      text: 'ship the carousel',
      chatId: 4242,
    });
  });

  it('reads a voice note as a file to fetch, not as text', () => {
    expect(parseUpdate(msg({ voice: true }))).toEqual({
      kind: 'voice',
      fileId: 'AwACAgEAAx',
      chatId: 4242,
    });
  });

  it('returns null for anything it cannot act on', () => {
    expect(parseUpdate({ update_id: 5, message: { message_id: 1, chat: { id: 4242 }, date: 1 } } as TelegramUpdate)).toBeNull();
  });
});

describe('nextOffset — long-poll bookkeeping', () => {
  it('is highest update_id + 1 so nothing is replayed', () => {
    expect(nextOffset([{ update_id: 7 } as TelegramUpdate, { update_id: 9 } as TelegramUpdate], 0)).toBe(10);
  });

  it('never moves backwards on an empty poll', () => {
    expect(nextOffset([], 42)).toBe(42);
  });
});

describe('newAgentReplies — what to send back', () => {
  const c = (id: string, authorType: 'user' | 'agent', body: string, createdAt: string) => ({
    id,
    body,
    authorType,
    authorAgentId: authorType === 'agent' ? 'conductor' : null,
    createdAt,
  });

  it('returns only agent comments newer than the last one seen', () => {
    const thread = [
      c('1', 'user', 'my question', '2026-08-16T10:00:00Z'),
      c('2', 'agent', 'the answer', '2026-08-16T10:00:30Z'),
    ];
    expect(newAgentReplies(thread, '2026-08-16T10:00:00Z').map((r) => r.id)).toEqual(['2']);
  });

  it('never echoes the operator back to himself', () => {
    const thread = [c('1', 'user', 'my question', '2026-08-16T10:00:05Z')];
    expect(newAgentReplies(thread, '2026-08-16T10:00:00Z')).toEqual([]);
  });

  it('returns them oldest first so a multi-part answer arrives in order', () => {
    const thread = [
      c('3', 'agent', 'second', '2026-08-16T10:02:00Z'),
      c('2', 'agent', 'first', '2026-08-16T10:01:00Z'),
    ];
    expect(newAgentReplies(thread, '2026-08-16T10:00:00Z').map((r) => r.body)).toEqual(['first', 'second']);
  });
});

describe('chunkForTelegram', () => {
  it('leaves a short message alone', () => {
    expect(chunkForTelegram('hello')).toEqual(['hello']);
  });

  it('splits past the 4096 hard limit', () => {
    const parts = chunkForTelegram('x'.repeat(9000));
    expect(parts.length).toBeGreaterThan(1);
    expect(Math.max(...parts.map((p) => p.length))).toBeLessThanOrEqual(4096);
    expect(parts.join('')).toHaveLength(9000);
  });

  it('prefers a line break near the limit so code blocks are not cut mid-line', () => {
    const body = `${'a'.repeat(4000)}\n${'b'.repeat(200)}`;
    const [first] = chunkForTelegram(body);
    expect(first.endsWith('a')).toBe(true);
  });
});
