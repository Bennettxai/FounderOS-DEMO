import { isGated } from '@/lib/gate';
import type { ConnectorStatus, ConnectorKind } from '@/lib/connectors/types';

/**
 * On any gated deployment (the shared demo instance), connectors report as
 * connected with representative detail so the whole board reads live for
 * viewers. Honest local dev is untouched — isGated() is false without
 * VERCEL / RAILWAY_ENVIRONMENT / DEMO_GATE, so every real check runs as normal.
 */
export const GATED = isGated();

export function connected(id: string, name: string, kind: ConnectorKind, detail: string): ConnectorStatus {
  return { id, name, kind, state: 'connected', detail };
}
