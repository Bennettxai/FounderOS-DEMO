/**
 * Ollama connector — the local model server that backs every NikOS agent.
 * Reads the live model catalog (/api/tags) and load state (/api/ps), so the
 * board shows real models on disk, their sizes/quants, and how many are
 * currently resident in memory — not just "is port 11434 answering".
 *
 * Overlaps intentionally with local-stack (which only pings the port): this
 * one reports the *inventory* so a green tile means a usable model fleet,
 * not merely a listening socket.
 */
import type { ConnectorStatus } from '@/lib/connectors/types';

const OLLAMA = process.env.NIKOS_OLLAMA_URL ?? 'http://localhost:11434';

type OllamaModel = {
  name?: string;
  size?: number;
  details?: { parameter_size?: string; quantization_level?: string; family?: string };
};

type OllamaProcess = { name?: string; model?: string };

function fmtSize(bytes: number | undefined): string {
  if (!bytes) return '?';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)}GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)}MB`;
  return `${bytes} B`;
}

async function fetchJson<T>(url: string, timeoutMs = 2500): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function ollamaStatus(): Promise<ConnectorStatus> {
  const [tags, ps] = await Promise.all([
    fetchJson<{ models?: OllamaModel[] }>(`${OLLAMA}/api/tags`),
    fetchJson<{ models?: OllamaProcess[] }>(`${OLLAMA}/api/ps`),
  ]);

  if (tags == null) {
    return {
      id: 'ollama',
      name: 'Ollama (Models)',
      kind: 'orchestration',
      state: 'not_configured',
      detail: `No Ollama server answering at ${OLLAMA} — start it to serve local models to agents.`,
    };
  }

  const models = tags.models ?? [];
  const loaded = ps?.models?.length ?? 0;
  const totalBytes = models.reduce((sum, m) => sum + (m.size ?? 0), 0);
  const summary = models
    .map((m) => {
      const params = m.details?.parameter_size ?? '?';
      const quant = m.details?.quantization_level ?? '';
      const base = (m.name ?? '').replace('hf.co/', '');
      return `${base} (${params} ${quant})`.trim();
    })
    .join(' · ');

  const meta: Record<string, string | number> = {
    models: models.length,
    loaded,
    totalGB: Number((totalBytes / 1e9).toFixed(1)),
  };
  for (const m of models) {
    if (!m.name) continue;
    meta[m.name] = `${fmtSize(m.size)} · ${m.details?.parameter_size ?? '?'} · ${
      m.details?.quantization_level ?? '?'
    }`;
  }

  return {
    id: 'ollama',
    name: 'Ollama (Models)',
    kind: 'orchestration',
    state: models.length > 0 ? 'connected' : 'error',
    detail:
      models.length > 0
        ? `${models.length} local models · ${fmtSize(totalBytes)} on disk · ${loaded} loaded · ${summary}`
        : 'Ollama up but no models pulled.',
    meta,
  };
}
