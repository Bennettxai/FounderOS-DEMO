import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { openDb } from '@/lib/db';
import { chatWithAgent } from '@/lib/agents/chat';
import { realAgents } from '@/lib/agents/real';

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
  test('data-agent exposes a read-only searchGBrain tool', () => {
    const dataAgent = realAgents.find((a) => a.id === 'data-agent')!;
    expect(dataAgent.chatTools).toBeTypeOf('function');
    const tools = dataAgent.chatTools!();
    expect(tools.map((t) => t.name)).toContain('searchGBrain');
  });

  test('a triggered tool call executes the connector and persists a tool turn', async () => {
    const db = openDb(':memory:');
    const res = await chatWithAgent(db, realAgents, 'data-agent', 'use-tool:searchGBrain revenue split');
    const rows = db.agentMessages.byAgent('data-agent');
    expect(rows.map((m) => m.role)).toEqual(['user', 'tool', 'assistant']);
    const toolRow = rows.find((m) => m.role === 'tool')!;
    expect(toolRow.toolCalls.map((c) => c.name)).toContain('searchGBrain');
    const result = toolRow.toolCalls[0].result as { sources: string[]; results: unknown[] };
    expect(Array.isArray(result.results)).toBe(true); // connector actually ran
    expect(result.sources.length).toBeGreaterThan(0); // boundary reported back
    expect(res.reply.length).toBeGreaterThan(0);
  });

  test('a scoped agent reports the exact boundary it searched within', async () => {
    const db = openDb(':memory:');
    await chatWithAgent(db, realAgents, 'sportsclaw', 'use-tool:searchGBrain pick');
    const toolRow = db.agentMessages.byAgent('sportsclaw').find((m) => m.role === 'tool')!;
    const result = toolRow.toolCalls[0].result as { sources: string[]; results: unknown[] };
    expect(result.sources).toEqual(['brainz-contracts']);
    expect(Array.isArray(result.results)).toBe(true);
  });

  test('an all-sources agent reports the full corpus as its boundary', async () => {
    const db = openDb(':memory:');
    await chatWithAgent(db, realAgents, 'data-agent', 'use-tool:searchGBrain revenue');
    const toolRow = db.agentMessages.byAgent('data-agent').find((m) => m.role === 'tool')!;
    const result = toolRow.toolCalls[0].result as { sources: string[]; results: unknown[] };
    expect(result.sources).toEqual([
      'canonical-maps',
      'diagmap-docs',
      'knowledge-graph',
      'hermes-skills',
      'hermes-refs',
      'brainz-contracts',
    ]);
  });
});
