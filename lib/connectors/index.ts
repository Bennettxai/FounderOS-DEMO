import { emailStatus } from '@/lib/connectors/email';
import { calendarStatus } from '@/lib/connectors/gcal';
import { slackStatus } from '@/lib/connectors/slack';
import { paymentsStatus } from '@/lib/connectors/payments';
import { zernioStatus } from '@/lib/connectors/zernio';
import { beehiivStatus } from '@/lib/connectors/beehiiv';
import { manychatStatus } from '@/lib/connectors/manychat';
import { attioStatus } from '@/lib/connectors/attio';
import { arcadsStatus } from '@/lib/connectors/arcads';
import { miroStatus } from '@/lib/connectors/miro';
import { wisprStatus } from '@/lib/connectors/wispr';
import { whatsappStatus } from '@/lib/connectors/whatsapp';
import { obsidianStatus } from '@/lib/connectors/obsidian';
import { localStackStatus } from '@/lib/connectors/local-stack';
import { llmStatus } from '@/lib/connectors/llm';
import { trakyoStatus } from '@/lib/connectors/trakyo';
import { fathomStatus } from '@/lib/connectors/fathom';
import { plaudStatus } from '@/lib/connectors/plaud';
import { robinhoodStatus } from '@/lib/connectors/robinhood';
import { getDb } from '@/lib/data';
import { docusignStatus } from '@/lib/connectors/docusign';
import { loomStatus } from '@/lib/connectors/loom';
import { metaAdsStatus } from '@/lib/connectors/meta-ads';
import { ghlStatus } from '@/lib/connectors/ghl';
import { paperclipStatus } from '@/lib/connectors/paperclip';
import { getBrainProvider } from '@/lib/brain';
import { resolveManychatKey, runtimeEnv } from '@/lib/creds';
import { GATED } from '@/lib/connectors/demo-status';
import type { ConnectorStatus } from '@/lib/connectors/types';

async function brainConnectorStatus(): Promise<ConnectorStatus> {
  if (GATED)
    return { id: 'gbrain', name: 'G-Brain', kind: 'brain', state: 'connected', detail: 'knowledge base · 900+ pages · live', meta: { provider: 'gbrain' } };
  const status = await getBrainProvider().status();
  return {
    id: 'gbrain',
    name: 'G-Brain',
    kind: 'brain',
    state: status.connected ? 'connected' : 'error',
    detail: status.detail,
    meta: { provider: status.provider },
  };
}

// Retired: WebinarJam and Notion are no longer tracked as systems on this
// board. Both were permanently red here because neither key ever existed.
// lib/connectors/notion.ts stays alive for the Notion Sync agent and the
// /brand-deals board; it just no longer counts as a system on this list.
const CHECKS: [string, ConnectorStatus['kind'], () => Promise<ConnectorStatus>][] = [
  ['gbrain', 'brain', brainConnectorStatus],
  ['llm', 'orchestration', llmStatus],
  ['paperclip', 'orchestration', paperclipStatus],
  ['whatsapp', 'social', whatsappStatus],
  ['zernio', 'social', zernioStatus],
  ['beehiiv', 'social', () => beehiivStatus(runtimeEnv())],
  [
    'manychat',
    'social',
    () => {
      // A working key may already live in the local MCP config used for the
      // manychat MCP registration, same reuse pattern as Attio; .env.local
      // still wins.
      const env = runtimeEnv();
      if (!env.MANYCHAT_API_KEY) env.MANYCHAT_API_KEY = resolveManychatKey();
      return manychatStatus(env);
    },
  ],
  ['attio', 'crm', attioStatus],
  ['trakyo', 'crm', trakyoStatus],
  ['fathom', 'crm', fathomStatus],
  ['plaud', 'knowledge', plaudStatus],
  ['docusign', 'crm', docusignStatus],
  ['loom', 'creative', loomStatus],
  ['meta-ads', 'ads', metaAdsStatus],
  ['ghl', 'crm', ghlStatus],
  ['arcads', 'creative', arcadsStatus],
  ['wispr', 'local', wisprStatus],
  ['local-stack', 'local', localStackStatus],
  ['obsidian', 'knowledge', obsidianStatus],
  ['miro', 'creative', miroStatus],
  ['email', 'email', () => emailStatus(runtimeEnv())],
  ['calendar', 'calendar', calendarStatus],
  ['slack', 'slack', () => slackStatus(runtimeEnv())],
  ['payments', 'payments', () => paymentsStatus(runtimeEnv())],
  ['robinhood', 'payments', () => Promise.resolve(robinhoodStatus(getDb().trading.latestSnapshot()))],
];

/**
 * Mock 3f: check ONE connector, for the "test" on a key row.
 *
 * allConnectorStatuses() fans out to every check; pressing test on the Slack
 * token should not go and shell gbrain and read the WhatsApp database. Errors
 * come back as a status here too, because a key row wants to hear "this is why
 * it failed", not a 500.
 */
export async function connectorStatusById(id: string): Promise<ConnectorStatus | null> {
  const found = CHECKS.find(([checkId]) => checkId === id);
  if (!found) return null;
  const [checkId, kind, check] = found;
  return check().catch(
    (err): ConnectorStatus => ({
      id: checkId,
      name: checkId,
      kind,
      state: 'error',
      detail: err instanceof Error ? err.message : String(err),
    }),
  );
}

export async function allConnectorStatuses(): Promise<ConnectorStatus[]> {
  return Promise.all(
    CHECKS.map(([id, kind, check]) =>
      check().catch(
        (err): ConnectorStatus => ({
          id,
          name: id,
          kind,
          state: 'error',
          detail: err instanceof Error ? err.message : String(err),
        }),
      ),
    ),
  );
}
