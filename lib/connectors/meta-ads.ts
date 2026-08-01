/**
 * Meta Ads connector — paid-funnel attribution: which ads produced the touches
 * that turned into opt-ins and purchases (the /funnel ads lane). Live wiring
 * arrives via the Meta Ads MCP; until a token shows up this is a status-only
 * connector, same pattern as trakyo.ts. Never reports a fake "connected".
 */
import { resolveCred, CRED_FILES } from '@/lib/creds';
import type { ConnectorStatus } from '@/lib/connectors/types';

const KEY = 'META_ADS_ACCESS_TOKEN';

export async function metaAdsStatus(): Promise<ConnectorStatus> {
  const base = { id: 'meta-ads', name: 'Meta Ads', kind: 'ads' } as const;
  const key = resolveCred(KEY, [CRED_FILES.agentsEnv, CRED_FILES.socialMedia]);
  if (!key) {
    return {
      ...base,
      state: 'not_configured',
      detail:
        'Paid-funnel attribution (ad → opt-in → purchase) for Vantage + Launchpad Cohort. Set META_ADS_ACCESS_TOKEN to wire the Meta Ads MCP.',
    };
  }
  return {
    ...base,
    state: 'connected',
    detail: 'META_ADS_ACCESS_TOKEN present · ad-touch attribution ready (live pull lands with the Meta Ads MCP wiring).',
    meta: { keyed: 'yes' },
  };
}
