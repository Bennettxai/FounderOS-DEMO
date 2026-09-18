/**
 * The tools every agent gets, whatever else it declares.
 *
 * Until exactly one agent of thirty could read the knowledge base:
 * the Data Agent, because it happened to declare a `searchGBrain` tool. Every
 * other agent answered from its own connector and the model's guesswork, which
 * is how an agent ends up confidently inventing a price.
 *
 * The fix is not to route the other twenty-nine through the Data Agent. That
 * would add an LLM hop and a failure point to every lookup, and the Data Agent
 * is a stateless function, not a service. It is to make the READ shared: one
 * tool, one retrieval hub behind it, available to everyone.
 */
import { z } from 'zod';
import { getBrainProvider } from '@/lib/brain';
import { retrieveBrain } from '@/lib/brain-retrieval';
import type { LlmToolSpec } from '@/lib/connectors/llm';

export function sharedChatTools(): LlmToolSpec[] {
  return [
    {
      name: 'searchBrain',
      description:
        'Search the knowledge base (SOPs, tools, agents, people, org notes and past conversations) and return the passages that best answer a question. Read-only. Use it before stating any fact about how the operator works, what something costs, or what was decided.',
      parameters: z.object({ query: z.string().describe('the question, in the words you would ask it') }),
      execute: async (args) => {
        const query = typeof args.query === 'string' ? args.query : '';
        const { hits, ranked, error } = await retrieveBrain(getBrainProvider(), query);
        // The model must be able to tell "nothing is stored" from "the store was
        // unreachable", or it will report a gap as a fact.
        if (error) return { error, hits: [] };
        return { ranked, hits };
      },
    },
  ];
}
