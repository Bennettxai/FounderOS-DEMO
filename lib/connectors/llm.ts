import { GATED, connected as gatedConnected } from '@/lib/connectors/demo-status';
/**
 * LLM connector — backs agent & Conductor chat through the Vercel AI Gateway.
 *
 * Mirrors the brain.ts provider shape: a real `gateway` provider (default) that
 * calls the AI SDK with a `"provider/model"` string, plus a `stub` provider
 * (LLM_PROVIDER=stub) that is deterministic and makes NO network call — so the
 * whole agent-chat stack is testable offline. Status stays honest: no
 * AI_GATEWAY_API_KEY ⇒ not_configured, never a fake "connected".
 */
import { z } from 'zod';
import { CRED_FILES, resolveCred } from '@/lib/creds';
import type { ConnectorStatus } from '@/lib/connectors/types';

export type LlmRole = 'system' | 'user' | 'assistant' | 'tool';
export type LlmMessage = { role: LlmRole; content: string };

export type LlmToolSpec = {
  name: string;
  description: string;
  parameters: z.ZodTypeAny;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
};

export type LlmToolCall = { name: string; args: unknown; result: unknown };

export type LlmChatRequest = {
  system?: string;
  messages: LlmMessage[];
  tools?: LlmToolSpec[];
  model?: string;
};

export type LlmChatResult = {
  text: string;
  toolCalls: LlmToolCall[];
  /** Token usage from the gateway, for run cost accounting. Absent on the stub. */
  usage?: { inputTokens: number; outputTokens: number };
};

export interface LlmProvider {
  name: string;
  chat(req: LlmChatRequest): Promise<LlmChatResult>;
}

const GATEWAY_KEY = 'AI_GATEWAY_API_KEY';
const FALLBACK_MODEL = 'anthropic/claude-sonnet-5';

/** Read at call time, not module load, so a model set on the box lands without a rebuild. */
const defaultModel = (): string => process.env.LLM_MODEL ?? FALLBACK_MODEL;

/**
 * Models to fall back to when the gateway refuses the preferred one. The key is
 * on the gateway's free tier, which answers every `anthropic/*` model with a
 * 403 RestrictedModelsError while these open-weight ones return 200 on the same
 * key, so the board keeps answering while paid credits stay an explicit
 * upgrade choice. Verified against the live key.
 */
export const FREE_TIER_MODELS = ['openai/gpt-oss-20b', 'alibaba/qwen-3-14b'] as const;

/** The preferred model first, then the models that work without credits. */
export function modelChain(preferred?: string): string[] {
  const chain = [preferred ?? defaultModel(), ...FREE_TIER_MODELS];
  return [...new Set(chain)];
}

/**
 * Is this a refusal that a different model would survive? A restricted or
 * unknown model is worth retrying down the chain; a rate limit, a missing key
 * or a gateway fault is not — retrying those just burns the chain and hides
 * the real error from the caller.
 */
export function isModelUnavailableError(err: unknown): boolean {
  const e = err as { statusCode?: number; status?: number; message?: unknown } | null;
  const message = typeof e?.message === 'string' ? e.message.toLowerCase() : '';
  if (message.includes('api_key') || message.includes('api key')) return false;
  if (/restrictedmodels|do not have access to this model|upgrade to paid credits/.test(message)) return true;
  if (/model[^.]{0,20}(not found|not available|unsupported|does not exist)/.test(message)) return true;
  const code = e?.statusCode ?? e?.status;
  return (code === 403 || code === 404) && !message.includes('rate limit');
}

/** process.env first (Next auto-loads .env.local), then the operator's cred files. */
function resolveGatewayKey(): string | undefined {
  return resolveCred(GATEWAY_KEY, [CRED_FILES.brainAgent, CRED_FILES.socialMedia]);
}

/** Stub trigger: a user message containing `use-tool:<name>` fires that tool. */
const STUB_TRIGGER = /use-tool:(\S+)/;

export const stubLlmProvider: LlmProvider = {
  name: 'stub',
  async chat(req) {
    const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');
    const text = lastUser ? `stub-reply: ${lastUser.content}` : 'stub-reply';
    const toolCalls: LlmToolCall[] = [];
    const trigger = lastUser?.content.match(STUB_TRIGGER);
    if (trigger && req.tools) {
      const spec = req.tools.find((t) => t.name === trigger[1]);
      if (spec) {
        const args: Record<string, unknown> = {};
        const result = await spec.execute(args);
        toolCalls.push({ name: spec.name, args, result });
      }
    }
    return { text, toolCalls };
  },
};

export function createGatewayProvider(model?: string): LlmProvider {
  return {
    name: 'gateway',
    async chat(req) {
      // Fail fast with an honest message instead of letting the SDK hang —
      // and hydrate process.env from the operator's cred files so a key that
      // exists outside .env.local still works.
      const key = resolveGatewayKey();
      if (!key) {
        throw new Error('AI_GATEWAY_API_KEY is not set — add it to .env.local to enable agent chat.');
      }
      if (!process.env.AI_GATEWAY_API_KEY) process.env.AI_GATEWAY_API_KEY = key;
      const { generateText, tool, stepCountIs, gateway } = await import('ai');
      const tools = Object.fromEntries(
        (req.tools ?? []).map((t) => [
          t.name,
          tool({ description: t.description, inputSchema: t.parameters, execute: t.execute }),
        ]),
      );
      const messages = req.messages
        .filter((m) => m.role !== 'tool')
        .map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content }));

      // Walk the chain: the preferred model, then the ones the key can use
      // without credits. Anything that is not a model problem throws straight
      // out, so a rate limit or a bad key still reads as itself.
      const attempt = (candidate: string) =>
        generateText({
          model: gateway(candidate),
          system: req.system,
          messages,
          tools: req.tools?.length ? tools : undefined,
          stopWhen: stepCountIs(6),
        });

      const chain = modelChain(req.model ?? model);
      let result: Awaited<ReturnType<typeof attempt>> | undefined;
      let lastError: unknown;
      for (const candidate of chain) {
        try {
          result = await attempt(candidate);
          break;
        } catch (err) {
          lastError = err;
          if (!isModelUnavailableError(err)) throw err;
        }
      }
      if (!result) throw lastError ?? new Error('no model in the chain answered');

      const toolCalls: LlmToolCall[] = [];
      for (const step of result.steps ?? []) {
        const calls = step.toolCalls ?? [];
        const results = step.toolResults ?? [];
        for (const c of calls) {
          // Match the result to its call by id — a failed/missing tool result
          // can leave `toolResults` shorter than `toolCalls`, so positional
          // alignment would attach the wrong output to every later call.
          const hit = results.find((r) => r.toolCallId === c.toolCallId);
          toolCalls.push({ name: c.toolName, args: c.input, result: hit?.output });
        }
      }
      return {
        text: result.text,
        toolCalls,
        usage: {
          inputTokens: result.usage?.inputTokens ?? 0,
          outputTokens: result.usage?.outputTokens ?? 0,
        },
      };
    },
  };
}

export function getLlmProvider(): LlmProvider {
  const name = process.env.LLM_PROVIDER ?? 'gateway';
  if (name === 'stub') return stubLlmProvider;
  return createGatewayProvider();
}

export function chat(req: LlmChatRequest): Promise<LlmChatResult> {
  return getLlmProvider().chat(req);
}

export async function llmStatus(): Promise<ConnectorStatus> {
  if (GATED) return gatedConnected('llm', 'LLM Gateway', 'orchestration', 'Claude Sonnet · via AI Gateway');
  const base = { id: 'llm', name: 'LLM (Gateway)', kind: 'orchestration' } as const;
  if (process.env.LLM_PROVIDER === 'stub') {
    return { ...base, state: 'connected', detail: 'stub provider active (tests)' };
  }
  const key = resolveGatewayKey();
  if (!key) {
    return {
      ...base,
      state: 'not_configured',
      detail: 'Set AI_GATEWAY_API_KEY in .env.local to enable agent chat via the Vercel AI Gateway.',
    };
  }
  return { ...base, state: 'connected', detail: `Vercel AI Gateway · default model ${defaultModel()}` };
}
