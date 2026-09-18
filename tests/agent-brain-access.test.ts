import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { openDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { chatWithAgent, systemPromptFor } from '@/lib/agents/chat';
import { realAgents } from '@/lib/agents/real';
import { AMBIENT_BUDGET_CHARS, ambientPack, clearAmbientCache } from '@/lib/agents/ambient';
import { sharedChatTools } from '@/lib/agents/brain-tool';

const prevLlm = process.env.LLM_PROVIDER;
const prevBrain = process.env.BRAIN_PROVIDER;

beforeAll(() => {
  process.env.LLM_PROVIDER = 'stub';
  process.env.BRAIN_PROVIDER = 'stub';
});
afterAll(() => {
  if (prevLlm === undefined) delete process.env.LLM_PROVIDER;
  else process.env.LLM_PROVIDER = prevLlm;
  if (prevBrain === undefined) delete process.env.BRAIN_PROVIDER;
  else process.env.BRAIN_PROVIDER = prevBrain;
});

const agentById = (id: string) => realAgents.find((a) => a.id === id)!;

describe('every agent can read the knowledge base', () => {
  test('the shared tool set carries searchBrain', () => {
    expect(sharedChatTools().map((t) => t.name)).toContain('searchBrain');
  });

  test('an agent that never declared a tool of its own still gets it', async () => {
    // crm-pulse reads Attio and nothing else. Before this it could not see a
    // single page of the knowledge base.
    const db = openDb(':memory:');
    const res = await chatWithAgent(db, realAgents, 'crm-pulse', 'use-tool:searchBrain vantage pricing');
    const rows = db.agentMessages.byAgent('crm-pulse');
    expect(rows.map((m) => m.role)).toEqual(['user', 'tool', 'assistant']);
    expect(rows[1].toolCalls[0].name).toBe('searchBrain');
    expect(res.reply).toBeTruthy();
  });

  test("an agent's own tools survive alongside the shared ones", async () => {
    const db = openDb(':memory:');
    const own = agentById('stack-monitor').chatTools?.() ?? [];
    if (own.length === 0) return; // nothing to protect on this agent
    const res = await chatWithAgent(db, realAgents, 'stack-monitor', `use-tool:${own[0].name}`);
    const rows = db.agentMessages.byAgent('stack-monitor');
    expect(rows[1].toolCalls[0].name).toBe(own[0].name);
    expect(res.reply).toBeTruthy();
  });

  test('no agent ends up with two tools of the same name', () => {
    for (const agent of realAgents) {
      const names = [...sharedChatTools(), ...(agent.chatTools?.() ?? [])].map((t) => t.name);
      expect(new Set(names).size, `${agent.id} has a duplicate tool name`).toBe(names.length);
    }
  });
});

describe('ambientPack', () => {
  test('tells the agent where it sits and what the OS knows right now', () => {
    const db = openDb(':memory:');
    seedDatabase(db);
    db.agentRuns.insert({
      id: 'run-1',
      agentId: 'crm-pulse',
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      finishedAt: new Date().toISOString(),
      ok: false,
      summary: 'Attio key rejected',
      model: null,
      tokensIn: null,
      tokensOut: null,
      costUsd: null,
    });
    clearAmbientCache();
    const pack = ambientPack(db, agentById('crm-pulse'));
    db.close();

    expect(pack).toContain('Sales'); // its department, by name
    expect(pack).toContain('Attio key rejected'); // live OS state, not seeded prose
  });

  test('stays inside its budget so it cannot crowd out the conversation', () => {
    const db = openDb(':memory:');
    for (let i = 0; i < 40; i++) {
      db.agentRuns.insert({
        id: `run-${i}`,
        agentId: 'crm-pulse',
        startedAt: new Date(Date.now() - i * 1000).toISOString(),
        finishedAt: new Date().toISOString(),
        ok: false,
        summary: `a very long failure summary that repeats itself ${'x'.repeat(120)}`,
        model: null,
        tokensIn: null,
        tokensOut: null,
        costUsd: null,
      });
    }
    clearAmbientCache();
    const pack = ambientPack(db, agentById('crm-pulse'));
    db.close();
    expect(pack.length).toBeLessThanOrEqual(AMBIENT_BUDGET_CHARS);
  });

  test('is cached, so thirty agents in a broadcast do not each re-read sqlite', () => {
    const db = openDb(':memory:');
    let reads = 0;
    const counted = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === 'agentRuns') reads++;
        return Reflect.get(target, prop, receiver);
      },
    }) as typeof db;

    clearAmbientCache();
    ambientPack(counted, agentById('crm-pulse'));
    const afterFirst = reads;
    ambientPack(counted, agentById('crm-pulse'));
    db.close();

    expect(afterFirst).toBeGreaterThan(0);
    expect(reads).toBe(afterFirst); // second call served from cache
  });
});

describe('the system prompt carries the pack', () => {
  test('ambient context is included when given', () => {
    const prompt = systemPromptFor(agentById('crm-pulse'), undefined, 'OS state: 3 deals stalled.');
    expect(prompt).toContain('OS state: 3 deals stalled.');
  });

  test('and the prompt is unchanged when there is none', () => {
    const agent = agentById('crm-pulse');
    expect(systemPromptFor(agent, undefined, undefined)).toBe(systemPromptFor(agent));
  });
});
