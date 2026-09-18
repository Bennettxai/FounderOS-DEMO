import { afterEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { chat, isModelUnavailableError, llmStatus, modelChain } from '@/lib/connectors/llm';

const KEY = 'AI_GATEWAY_API_KEY';
const prevKey = process.env[KEY];
const prevProvider = process.env.LLM_PROVIDER;

afterEach(() => {
  if (prevKey === undefined) delete process.env[KEY];
  else process.env[KEY] = prevKey;
  if (prevProvider === undefined) delete process.env.LLM_PROVIDER;
  else process.env.LLM_PROVIDER = prevProvider;
  vi.restoreAllMocks();
});

describe('llmStatus — honest connector state', () => {
  test('not_configured when no gateway key is present', async () => {
    delete process.env[KEY];
    const status = await llmStatus();
    expect(status.state).toBe('not_configured');
    expect(status.kind).toBe('orchestration');
    expect(status.id).toBe('llm');
  });

  test('connected when the gateway key is present', async () => {
    process.env[KEY] = 'test-gateway-key';
    const status = await llmStatus();
    expect(status.state).toBe('connected');
    expect(status.detail.length).toBeGreaterThan(0);
  });
});

describe('stub provider chat — deterministic, no network', () => {
  test('echoes the last user message and makes no network call', async () => {
    process.env.LLM_PROVIDER = 'stub';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await chat({ messages: [{ role: 'user', content: 'hello there' }] });
    expect(res.text).toContain('hello there');
    expect(res.toolCalls).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('executes a tool when the prompt carries the trigger token', async () => {
    process.env.LLM_PROVIDER = 'stub';
    let calledWith: unknown = 'NOT_CALLED';
    const res = await chat({
      messages: [{ role: 'user', content: 'use-tool:lookup find the thing' }],
      tools: [
        {
          name: 'lookup',
          description: 'look something up',
          parameters: z.object({}),
          execute: async (args) => {
            calledWith = args;
            return { ok: true, value: 42 };
          },
        },
      ],
    });
    expect(calledWith).not.toBe('NOT_CALLED');
    expect(res.toolCalls.map((c) => c.name)).toContain('lookup');
    expect(res.toolCalls[0].result).toEqual({ ok: true, value: 42 });
  });
});

/**
 * the operator, 2026-09-04: "I needed you to fix the conductor and agent board.
 * They're not responsive to me."
 *
 * The board chat was 500ing on every message. The gateway key is on the free
 * tier, which answers `anthropic/*` with a 403 RestrictedModelsError while
 * open-weight models on the SAME key return 200. One dead model took the whole
 * chat down, so the chain below falls through to a model the key can actually
 * use instead of failing the request. Topping up credits is a spend decision;
 * the board should not wait on it.
 */
describe('model fallback — a model the key cannot use must not kill the chat', () => {
  test('reads the requested model first, then the free-tier fallbacks', () => {
    const chain = modelChain('anthropic/claude-sonnet-5');
    expect(chain[0]).toBe('anthropic/claude-sonnet-5');
    expect(chain.length).toBeGreaterThan(1);
    expect(new Set(chain).size).toBe(chain.length); // no model tried twice
  });

  test('every fallback after the first is an open-weight model the free tier allows', () => {
    for (const model of modelChain('anthropic/claude-sonnet-5').slice(1)) {
      expect(model.startsWith('anthropic/')).toBe(false);
    }
  });

  test('recognises the free-tier refusal as worth retrying on another model', () => {
    expect(
      isModelUnavailableError(
        new Error('Free tier users do not have access to this model. Upgrade to paid credits'),
      ),
    ).toBe(true);
    expect(isModelUnavailableError({ statusCode: 403, message: 'RestrictedModelsError' })).toBe(true);
    expect(isModelUnavailableError(new Error('model not found: bogus/model'))).toBe(true);
  });

  test('does not burn the chain on errors another model would not fix', () => {
    expect(isModelUnavailableError(new Error('rate limit exceeded'))).toBe(false);
    expect(isModelUnavailableError({ statusCode: 500, message: 'internal server error' })).toBe(false);
    expect(isModelUnavailableError(new Error('AI_GATEWAY_API_KEY is not set'))).toBe(false);
  });
});
