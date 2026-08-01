/**
 * Trakyo connector — revenue attribution for Launchpad Cohort: ties content →
 * booked calls → payments so you can see which content drove revenue. Lives
 * under CRM & Revenue. Trakyo has no documented public API yet, so this is a
 * status-only connector: not_configured until a key shows up, connected once
 * TRAKYO_API_KEY is set (live request shape lands when the API is published).
 * Never reports a fake "connected".
 */
import { resolveCred, CRED_FILES } from '@/lib/creds';
import type { ConnectorStatus } from '@/lib/connectors/types';

const KEY = 'TRAKYO_API_KEY';

export async function trakyoStatus(): Promise<ConnectorStatus> {
  const base = { id: 'trakyo', name: 'Trakyo', kind: 'crm' } as const;
  const key = resolveCred(KEY, [CRED_FILES.agentsEnv, CRED_FILES.socialMedia]);
  if (!key) {
    return {
      ...base,
      state: 'not_configured',
      detail:
        'Revenue attribution (content → calls → payments) for Launchpad Cohort. Set TRAKYO_API_KEY once Trakyo exposes an API.',
    };
  }
  return {
    ...base,
    state: 'connected',
    detail: 'TRAKYO_API_KEY present · attribution lane ready (live query wiring lands with the public API).',
    meta: { keyed: 'yes' },
  };
}
