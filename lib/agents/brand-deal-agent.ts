import type { RuntimeAgent, AgentRunResult } from '@/lib/agents/runtime';
import { chat } from '@/lib/connectors/llm';
import { getDb } from '@/lib/data';
import { triageDeals, triageSummary, type DealAction } from '@/lib/agents/brand-deal-triage';
import { readAgentSkill, openSkillQuestions } from '@/lib/agents/skill-file';

/**
 * Brand Deal Agent.
 *
 * Split three ways on purpose:
 * - the OS brand deal store supplies the pipeline,
 * - `brand-deal-triage.ts` decides what is urgent (rules, tested),
 * - `agents/brand-deals/skill.md` decides how to talk about it (prompt).
 *
 * The model never picks which deals matter, so it cannot quietly drop the
 * unpaid invoice because the draft read better without it.
 */
export const BRAND_DEAL_AGENT_FOLDER = 'brand-deals';

/** Deterministic context block handed to the model. Extracted so a test can
 *  read exactly what the model was told, without calling one. */
export function brandDealPrompt(actions: DealAction[], dealCount: number, today: string): string {
  if (!actions.length) {
    return `Today is ${today}. The pipeline has ${dealCount} deals and the triage rules found nothing that needs the operator today. Say that in one line. Do not invent work.`;
  }
  const lines = actions.map(
    (a, i) =>
      `${i + 1}. [${a.kind}, urgency ${a.urgency}] ${a.brand}: ${a.detail} (${a.notionUrl})`,
  );
  return [
    `Today is ${today}. The pipeline has ${dealCount} deals.`,
    'These are the only actions you may write about. They came from the triage rules, not from you. Do not add, merge or drop any of them, and keep this order.',
    '',
    ...lines,
  ].join('\n');
}

async function run(): Promise<AgentRunResult> {
  const skill = readAgentSkill(BRAND_DEAL_AGENT_FOLDER);
  // Deals come from the OS's own store. The operator is moving off Notion,
  // so nothing here reaches for it, and an empty store is an honest empty run
  // rather than a broken connector.
  const deals = getDb().brandDeals.all().filter((d) => !d.seeded);

  if (!deals.length) {
    return {
      ok: true,
      summary: 'No brand deals in the OS yet, so there is nothing to work. Ingest a deal and the agent has something to do.',
      data: { dealCount: 0, actions: [], awaitingFromfounder: openSkillQuestions(skill) },
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const actions = triageDeals(deals, today);
  const missing = openSkillQuestions(skill);

  const reply = await chat({
    system: skill,
    messages: [{ role: 'user', content: brandDealPrompt(actions, deals.length, today) }],
  });

  return {
    ok: true,
    summary: triageSummary(actions, deals.length),
    data: {
      today,
      dealCount: deals.length,
      actions,
      draft: reply.text,
      // Every run tells the operator what it is still negotiating blind about.
      awaitingFromfounder: missing,
    },
    tokensIn: reply.usage?.inputTokens,
    tokensOut: reply.usage?.outputTokens,
  };
}

export const brandDealAgent: RuntimeAgent = {
  id: 'brand-deal-agent',
  name: 'Brand Deal Agent',
  description:
    'Negotiates as Vera, the operator\'s brand deal manager. Ranks what needs answering today (overdue work, unpaid invoices, deadlines inside a week, follow-ups due, negotiations with no number) and drafts each message. A tested contact governor decides whether a thread may be touched at all. Drafts only, never sends.',
  departmentId: 'dept-marketing-growth',
  run,
};
