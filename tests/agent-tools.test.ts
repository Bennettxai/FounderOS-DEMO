import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { openDb } from '@/lib/db';
import { chatWithAgent } from '@/lib/agents/chat';
import { realAgents } from '@/lib/agents/real';
import { sharedChatTools } from '@/lib/agents/brain-tool';

const prevLlm = process.env.LLM_PROVIDER;
const prevBrain = process.env.BRAIN_PROVIDER;
beforeAll(() => {
  process.env.LLM_PROVIDER = 'stub';
  process.env.BRAIN_PROVIDER = 'stub'; // deterministic, offline brain search
});
afterAll(() => {
  if (prevLlm === undefined) delete process.env.LLM_PROVIDER;
  else process.env.LLM_PROVIDER = prevLlm;
  if (prevBrain === undefined) delete process.env.BRAIN_PROVIDER;
  else process.env.BRAIN_PROVIDER = prevBrain;
});

describe('agent chat tools', () => {
  // The brain search used to be declared by data-agent alone. It moved into
  // the shared tool set on 2026-08-25 so all thirty agents can read the
  // knowledge base; data-agent keeps it, it just no longer owns it.
  test('data-agent can search the knowledge base', () => {
    const dataAgent = realAgents.find((a) => a.id === 'data-agent')!;
    const tools = [...sharedChatTools(), ...(dataAgent.chatTools?.() ?? [])];
    expect(tools.map((t) => t.name)).toContain('searchBrain');
  });

  test('a triggered tool call executes the connector and persists a tool turn', async () => {
    const db = openDb(':memory:');
    const res = await chatWithAgent(db, realAgents, 'data-agent', 'use-tool:searchBrain revenue split');
    const rows = db.agentMessages.byAgent('data-agent');
    expect(rows.map((m) => m.role)).toEqual(['user', 'tool', 'assistant']);
    const toolRow = rows.find((m) => m.role === 'tool')!;
    expect(toolRow.toolCalls.map((c) => c.name)).toContain('searchBrain');
    expect(toolRow.toolCalls[0].result).toHaveProperty('hits'); // connector actually ran
    expect(res.reply.length).toBeGreaterThan(0);
  });
});
