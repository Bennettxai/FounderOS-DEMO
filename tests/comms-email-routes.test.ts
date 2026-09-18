import { beforeEach, describe, expect, test, vi } from 'vitest';

const connector = vi.hoisted(() => ({
  fetchEmailThread: vi.fn(),
  updateEmailThread: vi.fn(),
  sendEmailReply: vi.fn(),
  downloadEmailAttachment: vi.fn(),
  searchInboxEmails: vi.fn(),
  sendSlackMessage: vi.fn(),
}));

vi.mock('@/lib/connectors/email', () => ({
  fetchEmailThread: connector.fetchEmailThread,
  updateEmailThread: connector.updateEmailThread,
  sendEmailReply: connector.sendEmailReply,
  downloadEmailAttachment: connector.downloadEmailAttachment,
  searchInboxEmails: connector.searchInboxEmails,
  invalidateEmailCache: vi.fn(),
}));
vi.mock('@/lib/connectors/slack', () => ({ sendSlackMessage: connector.sendSlackMessage }));

const thread = {
  account: 'inbox-1',
  threadId: 'thread-42',
  subject: 'Quarterly plan',
  replyTo: 'pat@example.com',
  messages: [
    {
      uid: 91,
      messageId: '<message-42@example.com>',
      from: 'Pat <pat@example.com>',
      fromAddress: 'pat@example.com',
      to: ['me@example.com'],
      cc: [],
      sentByMe: false,
      subject: 'Quarterly plan',
      date: '2026-08-25T12:00:00.000Z',
      body: 'Here is the full context.',
      unread: true,
      starred: false,
      attachments: [],
    },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe('email thread API', () => {
  test('GET validates identifiers before touching IMAP', async () => {
    const { GET } = await import('@/app/api/comms/email/thread/route');
    const response = await GET(new Request('http://localhost/api/comms/email/thread?account=inbox-1'));
    expect(response.status).toBe(400);
    expect(connector.fetchEmailThread).not.toHaveBeenCalled();
  });

  test('GET returns the complete validated conversation', async () => {
    connector.fetchEmailThread.mockResolvedValue({ ok: true, value: thread });
    const { GET } = await import('@/app/api/comms/email/thread/route');
    const response = await GET(
      new Request('http://localhost/api/comms/email/thread?account=inbox-1&threadId=thread-42&uid=91'),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).messages[0].body).toContain('full context');
    expect(connector.fetchEmailThread).toHaveBeenCalledWith({
      accountId: 'inbox-1',
      threadId: 'thread-42',
      uid: 91,
    });
  });

  test('POST action validates and applies a whole-thread operation', async () => {
    connector.updateEmailThread.mockResolvedValue({ ok: true, value: { action: 'archive' } });
    const { POST } = await import('@/app/api/comms/email/action/route');
    const response = await POST(
      new Request('http://localhost/api/comms/email/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ account: 'inbox-1', threadId: 'thread-42', uid: 91, action: 'archive' }),
      }),
    );
    expect(response.status).toBe(200);
    expect(connector.updateEmailThread).toHaveBeenCalledWith({
      accountId: 'inbox-1',
      threadId: 'thread-42',
      uid: 91,
      action: 'archive',
    });
  });

  test('reply forwards RFC threading headers to SMTP', async () => {
    connector.sendEmailReply.mockResolvedValue({ ok: true });
    const { POST } = await import('@/app/api/comms/reply/route');
    const response = await POST(
      new Request('http://localhost/api/comms/reply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: 'email',
          account: 'inbox-1',
          to: 'pat@example.com',
          subject: 'Re: Quarterly plan',
          text: 'Agreed.',
          inReplyTo: '<message-42@example.com>',
          references: ['<message-1@example.com>', '<message-42@example.com>'],
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(connector.sendEmailReply).toHaveBeenCalledWith(
      expect.objectContaining({
        inReplyTo: '<message-42@example.com>',
        references: ['<message-1@example.com>', '<message-42@example.com>'],
      }),
    );
  });

  test('attachment download uses server metadata instead of a client supplied filename', async () => {
    connector.downloadEmailAttachment.mockResolvedValue({
      ok: true,
      value: { data: Buffer.from('pdf-data'), filename: 'proposal.pdf', contentType: 'application/pdf' },
    });
    const { GET } = await import('@/app/api/comms/email/attachment/route');
    const response = await GET(
      new Request('http://localhost/api/comms/email/attachment?account=inbox-1&threadId=thread-42&uid=91&part=2'),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain('proposal.pdf');
    expect(connector.downloadEmailAttachment).toHaveBeenCalledWith({
      accountId: 'inbox-1',
      threadId: 'thread-42',
      uid: 91,
      part: '2',
    });
  });

  test('search returns validated results from the entire selected inbox', async () => {
    connector.searchInboxEmails.mockResolvedValue({
      ok: true,
      value: [{
        id: 'inbox-1:91', sender: 'Pat', subject: 'Quarterly plan', preview: 'Quarterly plan',
        ts: '2026-08-25T12:00:00.000Z', unread: 1, emailUid: 91, emailThreadId: 'thread-42', starred: false,
      }],
    });
    const { GET } = await import('@/app/api/comms/email/search/route');
    const response = await GET(new Request('http://localhost/api/comms/email/search?account=inbox-1&q=quarterly'));
    expect(response.status).toBe(200);
    expect((await response.json()).items[0].emailThreadId).toBe('thread-42');
    expect(connector.searchInboxEmails).toHaveBeenCalledWith('inbox-1', 'quarterly', 50);
  });
});
