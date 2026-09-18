import fs from 'node:fs';
import path from 'node:path';
import { getBrainProvider, type BrainStatus } from '@/lib/brain';
import { createGBrainProvider, gbrainStorePath } from '@/lib/connectors/gbrain';
import { foldersToClusters } from '@/lib/brain-viz';
import type { BrainOverview } from '@/lib/schemas';

/**
 * Data for the satellites around the G-Brain graph: the identity block, the
 * page counter, the legend with its freshness split. Everything is a fact
 * off the store on disk and the provider's own status; nothing is estimated.
 * Served by /api/brain/satellites so the page never waits on it.
 */

export type BrainSatelliteData = {
  mounted: boolean;
  statusLine: string;
  pages: number;
  folders: number;
  clusters: Array<{ label: string; pages: number }>;
  /** Share of notes touched within 30 days; null when there are no notes. */
  freshPct: number | null;
  /** Share of notes untouched for 90 days or more; null when there are no notes. */
  stalePct: number | null;
};

const DAY = 86_400_000;

/** Pure: overview + note mtimes + provider status into the satellite facts. */
export function summarizeSatellites(input: {
  overview: Pick<BrainOverview, 'store'> & Partial<BrainOverview>;
  mtimes: number[];
  status: BrainStatus;
  now?: number;
}): BrainSatelliteData {
  const now = input.now ?? Date.now();
  const pages = input.overview.store.totalFiles;
  const clusters = foldersToClusters(input.overview.store.folders).map((c) => ({ label: c.label, pages: c.pages }));
  const n = input.mtimes.length;
  const fresh = input.mtimes.filter((t) => now - t <= 30 * DAY).length;
  const stale = input.mtimes.filter((t) => now - t >= 90 * DAY).length;
  const mounted = pages > 0;
  const statusLine = mounted
    ? `${input.status.provider} · ${input.status.connected ? 'connected' : 'offline'} · ${input.status.detail}`.slice(0, 120)
    : `${input.status.provider} · no notes mounted`;
  return {
    mounted,
    statusLine,
    pages,
    folders: input.overview.store.folders.length,
    clusters,
    freshPct: n > 0 ? Math.round((fresh / n) * 100) : null,
    stalePct: n > 0 ? Math.round((stale / n) * 100) : null,
  };
}

/** mtimes of every markdown note under the store, without reading contents. */
export function noteMtimes(storePath: string = gbrainStorePath()): number[] {
  const out: number[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith('.md')) {
        try {
          out.push(fs.statSync(p).mtimeMs);
        } catch {
          /* unreadable note: skip, never invent a date */
        }
      }
    }
  };
  walk(storePath);
  return out;
}

/** The route's body: folders off disk, status off the configured provider. */
export async function readBrainSatellites(): Promise<BrainSatelliteData> {
  const [overview, status] = await Promise.all([createGBrainProvider().overview(), getBrainProvider().status()]);
  return summarizeSatellites({ overview, mtimes: noteMtimes(overview.store.path), status });
}
