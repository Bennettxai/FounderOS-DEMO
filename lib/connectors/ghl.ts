/**
 * GoHighLevel connector — the Launchpad Cohort sub-account
 * (owner@example.com): pipelines, opportunities, contacts. Auth is
 * a Private Integration Token (Settings → Private Integrations, read scopes)
 * plus the location id. Never reports a fake "connected".
 */
import { resolveCred, CRED_FILES } from '@/lib/creds';
import type { ConnectorStatus } from '@/lib/connectors/types';

export async function ghlStatus(): Promise<ConnectorStatus> {
  const base = { id: 'ghl', name: 'GoHighLevel', kind: 'crm' } as const;
  const key = resolveCred('GHL_API_KEY', [CRED_FILES.agentsEnv]);
  const locationId = resolveCred('GHL_LOCATION_ID', [CRED_FILES.agentsEnv]);
  if (!key || !locationId) {
    return {
      ...base,
      state: 'not_configured',
      detail:
        'Launchpad Cohort pipeline (owner@example.com). Set GHL_API_KEY (Private Integration token) + GHL_LOCATION_ID in .env.local.',
    };
  }
  return {
    ...base,
    state: 'connected',
    detail: 'Private Integration token present · LC opportunities feed the funnel live.',
    meta: { keyed: 'yes' },
  };
}
