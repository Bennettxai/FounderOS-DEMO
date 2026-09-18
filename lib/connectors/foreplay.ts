/**
 * Foreplay connector: Adscout's data source: Spyder competitor tracking,
 * the ~100M-ad Discovery database, and the operator's swipe file. Status is
 * key-presence plus the store's last-synced credit meter; it never spends
 * API credits just to render the Connections board.
 */
import { CRED_FILES, resolveCred } from '@/lib/creds';
import { FOREPLAY_KEY } from '@/lib/foreplay/client';
import { adStore } from '@/lib/foreplay/store';
import type { ConnectorStatus } from '@/lib/connectors/types';

export async function foreplayStatus(): Promise<ConnectorStatus> {
  const base = { id: 'foreplay', name: 'Foreplay', kind: 'creative' } as const;
  const key = resolveCred(FOREPLAY_KEY, [CRED_FILES.socialMedia, CRED_FILES.brainAgent]);
  if (!key) {
    return {
      ...base,
      state: 'not_configured',
      detail: 'Ad intelligence for Adscout (Spyder watchlist, Discovery search, sponsor dossiers). Set FOREPLAY_API_KEY in .env.local.',
    };
  }
  const usage = adStore.readUsage();
  const meta = adStore.readMeta();
  const credits = usage ? `${usage.remaining_credits.toLocaleString('en-US')}/${usage.total_credits.toLocaleString('en-US')} credits` : 'credits unknown until first sync';
  const synced = meta.lastSyncAt ? `last sync ${meta.lastSyncAt.slice(0, 16).replace('T', ' ')}` : 'never synced';
  return {
    ...base,
    state: 'connected',
    detail: `${credits} · ${synced}`,
    meta: usage ? { remaining: usage.remaining_credits, total: usage.total_credits } : undefined,
  };
}
