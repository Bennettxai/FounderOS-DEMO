import { describe, expect, test } from 'vitest';
import { buildCommsLanes } from '@/lib/comms-lanes';
import type { CommsItem } from '@/lib/comms';
import type { ContactTag } from '@/lib/schemas';
import type { ConnectorStatus } from '@/lib/connectors/types';

const status = (id: string, state: ConnectorStatus['state']): ConnectorStatus => ({
  id,
  name: id,
  kind: 'email',
  state,
  detail: `${id} ${state}`,
});

const inboxes = [
  { id: 'inbox-1', name: 'Ops' },
  { id: 'inbox-2', name: 'Personal' },
  { id: 'inbox-3', name: 'Founders' },
  { id: 'inbox-4', name: 'Billing' },
];

const emails: CommsItem[] = [
  { source: 'email', account: 'inbox-1', title: 'Ops — Acme Corp', sender: 'Acme Corp', replyTo: 'billing@acme.com', preview: 'invoice', ts: '2026-07-27T10:00:00.000Z', unread: 1 },
  { source: 'email', account: 'inbox-1', title: 'Ops — Bob', sender: 'Bob', replyTo: 'bob@example.com', preview: 'hi', ts: '2026-07-27T09:00:00.000Z', unread: 1 },
  { source: 'email', account: 'inbox-3', title: 'Founders — Carol', sender: 'Carol', preview: 'deck', ts: '2026-07-27T08:00:00.000Z', unread: 0 },
];

const whatsapp: CommsItem[] = [
  { source: 'whatsapp', title: 'Dan', sender: 'Dan', preview: 'yo', ts: '2026-07-27T07:00:00.000Z', unread: 2 },
];

const tags: ContactTag[] = [{ person: 'Acme Corp', channel: 'email', tag: 'client', tier: 1 }];

describe('buildCommsLanes', () => {
  const lanes = buildCommsLanes({
    inboxes,
    emails,
    emailState: status('email', 'connected'),
    whatsapp,
    whatsappState: status('whatsapp', 'connected'),
    tags,
  });

  test('emits the four inbox lanes in order, then whatsapp — no Wispr lane (removed 2026-08-04)', () => {
    expect(lanes.map((l) => l.id)).toEqual(['inbox-1', 'inbox-2', 'inbox-3', 'inbox-4', 'whatsapp']);
    expect(lanes.map((l) => l.source)).toEqual(['email', 'email', 'email', 'email', 'whatsapp']);
    expect(lanes[0].name).toBe('Ops');
  });

  test('routes each email to its own account lane and sums unread', () => {
    const byId = new Map(lanes.map((l) => [l.id, l]));
    expect(byId.get('inbox-1')!.items.map((i) => i.sender)).toEqual(['Acme Corp', 'Bob']);
    expect(byId.get('inbox-1')!.unread).toBe(2);
    expect(byId.get('inbox-2')!.items).toHaveLength(0); // empty inbox still gets a lane
    expect(byId.get('inbox-3')!.items.map((i) => i.sender)).toEqual(['Carol']);
    expect(byId.get('inbox-4')!.items).toHaveLength(0);
  });

  test('email items carry the reply address + subject so the reader can respond', () => {
    const inbox1 = lanes.find((l) => l.id === 'inbox-1')!;
    const acme = inbox1.items.find((i) => i.sender === 'Acme Corp')!;
    expect(acme.replyTo).toBe('billing@acme.com');
    expect(acme.preview).toBe('invoice'); // subject doubles as the preview line
    // a message without an address is still shown, just not replyable
    const carol = lanes.find((l) => l.id === 'inbox-3')!.items[0];
    expect(carol.replyTo).toBeUndefined();
  });

  test('stamps contact priority on matching senders', () => {
    const inbox1 = lanes.find((l) => l.id === 'inbox-1')!;
    expect(inbox1.items.find((i) => i.sender === 'Acme Corp')!.priority).toBe(1);
    expect(inbox1.items.find((i) => i.sender === 'Bob')!.priority).toBeUndefined();
  });

  test('whatsapp lane carries its items', () => {
    const wa = lanes.find((l) => l.id === 'whatsapp')!;
    expect(wa.unread).toBe(2);
    expect(wa.items[0].sender).toBe('Dan');
  });

  test('lane state + detail come from the source connector status', () => {
    expect(lanes.find((l) => l.id === 'inbox-2')!.state).toBe('connected');
    expect(lanes.find((l) => l.id === 'whatsapp')!.detail).toBe('whatsapp connected');
  });
});
