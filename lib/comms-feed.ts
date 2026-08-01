import { mergeFeed, type CommsItem } from '@/lib/comms';
import { latestEmails } from '@/lib/connectors/email';
import { recentChats } from '@/lib/connectors/whatsapp';
import { recentMessages } from '@/lib/connectors/slack';

/** Gather the unified comms feed from every source that is reachable. */
export async function gatherCommsFeed(limit = 40): Promise<CommsItem[]> {
  const [whatsapp, email, slack] = await Promise.allSettled([
    recentChats(15),
    latestEmails(5),
    process.env.SLACK_BOT_TOKEN
      ? recentMessages(15).then((messages) =>
          messages.map(
            (m): CommsItem => ({
              source: 'slack',
              title: `#${m.channel} — ${m.user}`,
              sender: m.user,
              replyTo: m.channel,
              preview: m.text.slice(0, 140),
              ts: new Date(Number(m.ts) * 1000).toISOString(),
            }),
          ),
        )
      : Promise.resolve([] as CommsItem[]),
  ]);
  const items: CommsItem[] = [
    ...(whatsapp.status === 'fulfilled' ? whatsapp.value : []),
    ...(email.status === 'fulfilled' ? email.value : []),
    ...(slack.status === 'fulfilled' ? slack.value : []),
  ];
  return mergeFeed(items, limit);
}
