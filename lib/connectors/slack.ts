import { WebClient } from '@slack/web-api';
import type { ConnectorStatus } from '@/lib/connectors/types';

export type SlackMessage = { channel: string; user: string; text: string; ts: string };

function client(env: Record<string, string | undefined>): WebClient | null {
  return env.SLACK_BOT_TOKEN ? new WebClient(env.SLACK_BOT_TOKEN) : null;
}

export async function slackStatus(env: Record<string, string | undefined> = process.env): Promise<ConnectorStatus> {
  const slack = client(env);
  if (!slack) {
    return {
      id: 'slack',
      name: 'Slack',
      kind: 'slack',
      state: 'not_configured',
      detail: 'Set SLACK_BOT_TOKEN (xoxb-…) in .env.local. Needs channels:read, channels:history, users:read scopes.',
    };
  }
  try {
    const auth = await slack.auth.test();
    return {
      id: 'slack',
      name: 'Slack',
      kind: 'slack',
      state: 'connected',
      detail: `Connected to ${auth.team} as ${auth.user}`,
      meta: { team: String(auth.team ?? ''), user: String(auth.user ?? '') },
    };
  } catch (err) {
    return {
      id: 'slack',
      name: 'Slack',
      kind: 'slack',
      state: 'error',
      detail: `Token set but auth failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export type SlackSendResult = { ok: boolean; detail: string };

/** Post a reply into a channel by name. Fails honestly without a token. */
export async function sendSlackMessage(
  channelName: string,
  text: string,
  env: Record<string, string | undefined> = process.env,
): Promise<SlackSendResult> {
  const slack = client(env);
  if (!slack) return { ok: false, detail: 'SLACK_BOT_TOKEN not set — add it under Connections → API keys' };
  try {
    const list = await slack.conversations.list({ types: 'public_channel,private_channel', limit: 200 });
    const channel = list.channels?.find((c) => c.name === channelName.replace(/^#/, ''));
    if (!channel?.id) return { ok: false, detail: `channel #${channelName} not found or bot not invited` };
    await slack.chat.postMessage({ channel: channel.id, text });
    return { ok: true, detail: `sent to #${channelName}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

export async function recentMessages(
  limit = 10,
  env: Record<string, string | undefined> = process.env,
): Promise<SlackMessage[]> {
  const slack = client(env);
  if (!slack) throw new Error('SLACK_BOT_TOKEN is not set');
  const channels = await slack.conversations.list({ limit: 10, exclude_archived: true, types: 'public_channel' });
  const messages: SlackMessage[] = [];
  for (const channel of channels.channels ?? []) {
    if (!channel.id || !channel.is_member) continue;
    const history = await slack.conversations.history({ channel: channel.id, limit: 5 });
    for (const msg of history.messages ?? []) {
      messages.push({
        channel: channel.name ?? channel.id,
        user: msg.user ?? 'unknown',
        text: msg.text ?? '',
        ts: msg.ts ?? '',
      });
    }
  }
  return messages.sort((a, b) => Number(b.ts) - Number(a.ts)).slice(0, limit);
}
