/**
 * API key management for the Connections board. Keys live in .env.local
 * (gitignored) — this module lists slot status with MASKED values and
 * writes updates. Raw secret values never leave the server.
 */
import fs from 'node:fs';
import path from 'node:path';

export type KeySlot = { envVar: string; label: string; group: string; hint?: string };

export const KEY_SLOTS: KeySlot[] = [
  { envVar: 'INBOX_1_HOST', label: 'Inbox 1 host', group: 'Email' },
  { envVar: 'INBOX_1_USER', label: 'Inbox 1 user', group: 'Email' },
  { envVar: 'INBOX_1_PASS', label: 'Inbox 1 app password', group: 'Email', hint: 'Gmail app password' },
  { envVar: 'INBOX_2_HOST', label: 'Inbox 2 host', group: 'Email' },
  { envVar: 'INBOX_2_USER', label: 'Inbox 2 user', group: 'Email' },
  { envVar: 'INBOX_2_PASS', label: 'Inbox 2 app password', group: 'Email' },
  { envVar: 'INBOX_3_HOST', label: 'Inbox 3 host', group: 'Email' },
  { envVar: 'INBOX_3_USER', label: 'Inbox 3 user', group: 'Email' },
  { envVar: 'INBOX_3_PASS', label: 'Inbox 3 app password', group: 'Email' },
  { envVar: 'INBOX_4_HOST', label: 'Inbox 4 host', group: 'Email' },
  { envVar: 'INBOX_4_USER', label: 'Inbox 4 user', group: 'Email' },
  { envVar: 'INBOX_4_PASS', label: 'Inbox 4 app password', group: 'Email' },
  { envVar: 'SLACK_BOT_TOKEN', label: 'Slack bot token', group: 'Slack', hint: 'xoxb-… needs chat:write to reply from the OS' },
  { envVar: 'STRIPE_SECRET_KEY', label: 'Stripe secret key', group: 'Payments' },
  { envVar: 'PAYPAL_CLIENT_ID', label: 'PayPal client id', group: 'Payments' },
  { envVar: 'PAYPAL_CLIENT_SECRET', label: 'PayPal client secret', group: 'Payments' },
  { envVar: 'SQUARE_ACCESS_TOKEN', label: 'Square access token', group: 'Payments' },
  { envVar: 'WHOP_API_KEY', label: 'Whop API key', group: 'Payments' },
  { envVar: 'NOTION_API_KEY', label: 'Notion integration secret', group: 'Notion' },
  { envVar: 'MANYCHAT_API_KEY', label: 'ManyChat API key', group: 'Social', hint: 'ManyChat → Settings → API (Instagram DM automation)' },
  { envVar: 'GBRAIN_STORE', label: 'Brain-store path override', group: 'G-Brain' },
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
