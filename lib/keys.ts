/**
 * API key management for the Connections board. Keys live in .env.local
 * (gitignored) — this module lists slot status with MASKED values and
 * writes updates. Raw secret values never leave the server.
 */
import fs from 'node:fs';
import path from 'node:path';

export type KeySlot = {
  envVar: string;
  label: string;
  group: string;
  hint?: string;
  /**
   * The connector this slot feeds, when one exists.
   *
   * Mock 3f puts a "test" on every key row, and a test that does not actually
   * reach the far end is worse than no test: it would report a rotated-but-dead
   * key as fine. So a slot names the connector whose live check answers for it,
   * and the row without one simply has nothing to press.
   */
  connectorId?: string;
};

export const KEY_SLOTS: KeySlot[] = [
  { envVar: 'INBOX_1_HOST', label: 'Inbox 1 host', group: 'Email', connectorId: 'email' },
  { envVar: 'INBOX_1_USER', label: 'Inbox 1 user', group: 'Email', connectorId: 'email' },
  { envVar: 'INBOX_1_PASS', label: 'Inbox 1 app password', group: 'Email', hint: 'Gmail app password', connectorId: 'email' },
  { envVar: 'INBOX_2_HOST', label: 'Inbox 2 host', group: 'Email', connectorId: 'email' },
  { envVar: 'INBOX_2_USER', label: 'Inbox 2 user', group: 'Email', connectorId: 'email' },
  { envVar: 'INBOX_2_PASS', label: 'Inbox 2 app password', group: 'Email', connectorId: 'email' },
  { envVar: 'INBOX_3_HOST', label: 'Inbox 3 host', group: 'Email', connectorId: 'email' },
  { envVar: 'INBOX_3_USER', label: 'Inbox 3 user', group: 'Email', connectorId: 'email' },
  { envVar: 'INBOX_3_PASS', label: 'Inbox 3 app password', group: 'Email', connectorId: 'email' },
  { envVar: 'INBOX_4_HOST', label: 'Inbox 4 host', group: 'Email', connectorId: 'email' },
  { envVar: 'INBOX_4_USER', label: 'Inbox 4 user', group: 'Email', connectorId: 'email' },
  { envVar: 'INBOX_4_PASS', label: 'Inbox 4 app password', group: 'Email', connectorId: 'email' },
  { envVar: 'SLACK_BOT_TOKEN', label: 'Slack bot token', group: 'Slack', hint: 'xoxb-… needs chat:write to reply from the OS', connectorId: 'slack' },
  { envVar: 'STRIPE_SECRET_KEY', label: 'Stripe secret key', group: 'Payments', connectorId: 'payments' },
  // A public Solana address, not a secret — it is a slot so the wallet can be
  // changed on the host without a rebuild. Read-only: no signing key exists.
  { envVar: 'NOTION_API_KEY', label: 'Notion integration secret', group: 'Knowledge', hint: 'internal integration; share Brand Deals Hub with it' },
  { envVar: 'PHANTOM_WALLET_ADDRESS', label: 'Phantom wallet address (public)', group: 'Payments', hint: 'Solana address, read-only balance', connectorId: 'payments' },
  { envVar: 'STRIPE_VANTAGE_KEY', label: 'Stripe · Vantage secret key', group: 'Payments', connectorId: 'payments' },
  { envVar: 'PAYKIT_LC_KEY', label: 'PayKit · Launchpad Cohort API key', group: 'Payments', hint: 'x-api-key for /public-api; rotating it here beats a redeploy', connectorId: 'payments' },
  { envVar: 'PAYKIT_VANTAGE_KEY', label: 'PayKit · Vantage API key', group: 'Payments', connectorId: 'payments' },
  { envVar: 'PAYPAL_CLIENT_ID', label: 'PayPal client id', group: 'Payments', connectorId: 'payments' },
  { envVar: 'PAYPAL_CLIENT_SECRET', label: 'PayPal client secret', group: 'Payments', connectorId: 'payments' },
  { envVar: 'SQUARE_ACCESS_TOKEN', label: 'Square access token', group: 'Payments', connectorId: 'payments' },
  { envVar: 'WHOP_API_KEY', label: 'Whop API key', group: 'Payments', connectorId: 'payments' },
  { envVar: 'DOCUSIGN_INTEGRATION_KEY', label: 'DocuSign integration key', group: 'Contracts', hint: 'DocuSign admin → Apps & Keys', connectorId: 'docusign' },
  { envVar: 'DOCUSIGN_USER_ID', label: 'DocuSign user ID', group: 'Contracts', hint: 'the API user GUID under Apps & Keys', connectorId: 'docusign' },
  { envVar: 'DOCUSIGN_ACCOUNT_ID', label: 'DocuSign account ID', group: 'Contracts', connectorId: 'docusign' },
  { envVar: 'DOCUSIGN_PRIVATE_KEY_B64', label: 'DocuSign RSA key (base64)', group: 'Contracts', hint: 'base64 -i private.key | pbcopy', connectorId: 'docusign' },
  { envVar: 'NOTION_API_KEY', label: 'Notion integration secret', group: 'Notion' },
  { envVar: 'MANYCHAT_API_KEY', label: 'ManyChat API key', group: 'Social', hint: 'ManyChat → Settings → API (Instagram DM automation)', connectorId: 'manychat' },
  { envVar: 'HERMES_GATEWAY_URL', label: 'Hermes gateway URL', group: 'Agents', hint: 'the worker-pool gateway the stack check pings; defaults to a local loopback port on the host', connectorId: 'local-stack' },
  { envVar: 'GBRAIN_STORE', label: 'Brain-store path override', group: 'G-Brain', connectorId: 'gbrain' },
  { envVar: 'PLAUD_REFRESH_TOKEN', label: 'Plaud refresh token', group: 'Knowledge', hint: 'refresh_token from the Plaud MCP token file after `claude mcp` signs in; the OS mints its own access tokens', connectorId: 'plaud' },
];

export function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 4) return '••••';
  return `••••${value.slice(-4)}`;
}

export type KeyStatus = KeySlot & { present: boolean; masked: string };

export function listKeyStatuses(env: Record<string, string | undefined> = process.env): KeyStatus[] {
  return KEY_SLOTS.map((slot) => {
    const value = env[slot.envVar] ?? '';
    return { ...slot, present: value.length > 0, masked: maskSecret(value) };
  });
}

const ENV_NAME_RE = /^[A-Z_][A-Z0-9_]*$/;

/** Update or append KEY=value in an env file, preserving everything else. */
export function upsertEnvLocal(filePath: string, key: string, value: string): void {
  if (!ENV_NAME_RE.test(key)) throw new Error(`invalid env var name: ${key}`);
  if (/[\n\r]/.test(value)) throw new Error('value must be a single line');

  let lines: string[] = [];
  try {
    lines = fs.readFileSync(filePath, 'utf8').split('\n');
  } catch {
    // file does not exist yet — start fresh
  }

  const prefix = `${key}=`;
  let replaced = false;
  const next = lines.map((line) => {
    if (!replaced && line.trim().startsWith(prefix)) {
      replaced = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!replaced) {
    while (next.length > 0 && next[next.length - 1].trim() === '') next.pop();
    next.push(`${key}=${value}`);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${next.join('\n')}\n`, 'utf8');
}
