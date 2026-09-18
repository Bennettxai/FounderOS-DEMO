/**
 * The Ollama lane is status-only, and says so.
 *
 * Verified: ollama.com publishes no usage API -- the CLI's only
 * account verb is `signin`, and probing ollama.com/api endpoints returns
 * Method Not Allowed. Plan consumption is visible on their website and
 * nowhere else. Faking a bar here would violate the house rule (honest
 * states, never fake "connected"), so the card shows what is real: whether
 * the local server is up, which models are loaded, and which of those are
 * cloud models that bill the plan (`:cloud` tags / a remote_host) versus
 * local ones that bill electricity.
 */

export type OllamaLane = {
  state: 'up' | 'down';
  models: { name: string; cloud: boolean }[];
  note: string;
};

export async function ollamaLane(
  baseUrl: string = process.env.OLLAMA_BASE_URL?.replace(/\/v1\/?$/, '') || 'http://localhost:11434',
): Promise<OllamaLane> {
  const note = 'ollama.com publishes no usage API — plan burn is visible only at ollama.com/settings';
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(1500), cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { models?: { name?: string; remote_host?: string }[] };
    const models = (body.models ?? [])
      .filter((m): m is { name: string; remote_host?: string } => typeof m.name === 'string')
      .map((m) => ({ name: m.name, cloud: Boolean(m.remote_host) || m.name.endsWith(':cloud') }));
    return { state: 'up', models, note };
  } catch {
    return { state: 'down', models: [], note };
  }
}
