import { NextResponse } from 'next/server';

import { getDb } from '@/lib/data';
import { realAgents } from '@/lib/agents/real';
import { chatWithAgent } from '@/lib/agents/chat';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  req: Request,
  {
    params,
  }: {
    params: {
      id: string;
    };
  },
) {
  let message = '';
  let screenContext: string | undefined;

  try {
    const body = (await req.json()) as {
      message?: unknown;
      context?: unknown;
    };

    message =
      typeof body.message === 'string'
        ? body.message.trim()
        : '';

    screenContext =
      typeof body.context === 'string' &&
      body.context.trim()
        ? body.context.slice(0, 4000)
        : undefined;
  } catch {
    // Empty or invalid bodies are rejected below.
  }

  if (!message) {
    return NextResponse.json(
      {
        error: 'message is required',
      },
      {
        status: 400,
      },
    );
  }

  const agentExists = realAgents.some(
    (agent) => agent.id === params.id,
  );

  if (!agentExists) {
    return NextResponse.json(
      {
        error: `unknown agent: ${params.id}`,
      },
      {
        status: 404,
      },
    );
  }

  try {
    const result = await chatWithAgent(
      getDb(),
      realAgents,
      params.id,
      message,
      {
        screenContext,
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
      },
    );
  }
}