import type { RuntimeAgent, AgentRunResult } from '@/lib/agents/runtime';
import { chat } from '@/lib/connectors/llm';
import { beehiivPosts } from '@/lib/connectors/beehiiv';
import { buildNewsletterBrief, briefSummary, type NewsletterBrief } from '@/lib/agents/newsletter-brief';
import { readAgentSkill, openSkillQuestions } from '@/lib/agents/skill-file';

/**
 * Newsletter Agent.
 *
 * Reads what the list actually opened and clicked out of Beehiiv, turns it into
 * a brief that is honest about how thin the history is, then drafts against
 * `agents/newsletter/skill.md`. Drafts only: nothing is scheduled or sent.
 */
export const NEWSLETTER_AGENT_FOLDER = 'newsletter';

/** The deterministic half of what the model sees. Kept out of run() so a test
 *  can assert the model is told when the evidence is thin. */
export function newsletterPrompt(brief: NewsletterBrief): string {
  const lines: string[] = [
    brief.sends
      ? `${brief.sends} sends on record. Median ${brief.medianOpenRate}% open, ${brief.medianClickRate}% click.`
      : 'No sends on record.',
  ];

  if (!brief.confident) {
    lines.push(
      'THE HISTORY IS TOO THIN TO BE EVIDENCE. Do not describe a trend, a pattern or "what works". Say plainly in your closing line that there is not enough data yet.',
    );
  }
  if (brief.bestBySubject) {
    lines.push(`Best opens: "${brief.bestBySubject.title}" at ${brief.bestBySubject.openRate}%. That is a subject-line lesson.`);
  }
  if (brief.bestByBody) {
    lines.push(`Best clicks: "${brief.bestByBody.title}" at ${brief.bestByBody.clickRate}%. That is a body and offer lesson.`);
  }
  if (brief.worst) {
    lines.push(`Weakest: "${brief.worst.title}" at ${brief.worst.openRate}% open.`);
  }
  if (brief.unsubscribeWarning) lines.push(brief.unsubscribeWarning);
  if (brief.recentTitles.length) {
    lines.push(`Recent issues, newest first, do not pitch these again: ${brief.recentTitles.join(' · ')}`);
  }
  lines.push('Write the next issue. Draft only. Never state a metric that is not above.');
  return lines.join('\n');
}

async function run(): Promise<AgentRunResult> {
  const skill = readAgentSkill(NEWSLETTER_AGENT_FOLDER);
  const posts = await beehiivPosts();

  if (posts === null) {
    return {
      ok: false,
      summary: 'Beehiiv is not connected (BEEHIIV_API_KEY / BEEHIIV_PUBLICATION_ID missing), so there is no send history to write against.',
    };
  }

  const brief = buildNewsletterBrief(posts);
  const reply = await chat({
    system: skill,
    messages: [{ role: 'user', content: newsletterPrompt(brief) }],
  });

  return {
    ok: true,
    summary: briefSummary(brief),
    data: {
      brief,
      draft: reply.text,
      awaitingFromfounder: openSkillQuestions(skill),
    },
    tokensIn: reply.usage?.inputTokens,
    tokensOut: reply.usage?.outputTokens,
  };
}

export const newsletterAgent: RuntimeAgent = {
  id: 'newsletter-agent',
  name: 'Newsletter Agent',
  description:
    'Reads Beehiiv send performance, builds an honest brief (including when the history is too thin to draw from), and drafts the next issue against the skill file. Drafts only, never schedules or sends.',
  departmentId: 'dept-marketing-growth',
  run,
};
