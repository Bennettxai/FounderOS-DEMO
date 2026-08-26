/**
 * Diagnostic Map connector — the canonical fleet for The-Diagnostic-Map.
 * Reads the generated Canonical/Fleet-Coverage.json (47 maps across 5
 * families) and checks freshness: the release dashboard should be newer than
 * the newest canonical map, else the fleet gate hasn't been re-run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { NIKOS_PATHS } from '@/lib/nikos-paths';
import type { ConnectorStatus } from '@/lib/connectors/types';

export type FleetCoverage = {
  total: number;
  families: Record<string, number>;
  maps: { filename: string; family: string; model: string; version?: string }[];
};

export function readFleetCoverage(): FleetCoverage | null {
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(NIKOS_PATHS.diagmap, 'Canonical', 'Fleet-Coverage.json'), 'utf8'),
    ) as { total?: unknown; families?: Record<string, number>; maps?: unknown[] };
    const maps = Array.isArray(raw.maps) ? raw.maps : [];
    return {
      total: typeof raw.total === 'number' ? raw.total : maps.length,
      families: raw.families ?? {},
      maps: maps.map((m) => {
        const map = m as { filename?: unknown; family?: unknown; model?: unknown; version?: unknown };
        return {
          filename: typeof map.filename === 'string' ? map.filename : '',
          family: typeof map.family === 'string' ? map.family : '',
          model: typeof map.model === 'string' ? map.model : '',
          version: typeof map.version === 'string' ? map.version : '',
        };
      }),
    };
  } catch {
    return null;
  }
}

/** Newest canonical map mtime vs the generated dashboard mtime, in ms. */
export function fleetFreshnessMs(): number | null {
  const canonical = path.join(NIKOS_PATHS.diagmap, 'Canonical');
  try {
    const maps = fs
      .readdirSync(canonical)
      .filter((f) => f.endsWith('.html'))
      .map((f) => fs.statSync(path.join(canonical, f)).mtimeMs);
    if (maps.length === 0) return null;
    const newestMap = Math.max(...maps);
    const dashboard = fs.statSync(path.join(canonical, 'Fleet-Coverage.html')).mtimeMs;
    return dashboard - newestMap;
  } catch {
    return null;
  }
}

export async function diagmapStatus(): Promise<ConnectorStatus> {
  if (!fs.existsSync(NIKOS_PATHS.diagmap)) {
    return {
      id: 'diagmap',
      name: 'Diagnostic Maps',
      kind: 'knowledge',
      state: 'not_configured',
      detail: `No The-Diagnostic-Map repo at ${NIKOS_PATHS.diagmap} — set NIKOS_DIAGMAP_PATH.`,
    };
  }
  const fleet = readFleetCoverage();
  if (!fleet) {
    return {
      id: 'diagmap',
      name: 'Diagnostic Maps',
      kind: 'knowledge',
      state: 'error',
      detail: 'Repo present but Canonical/Fleet-Coverage.json is missing or unreadable.',
    };
  }
  const freshness = fleetFreshnessMs();
  const stale = freshness !== null && freshness < 0;
  const familyList = Object.entries(fleet.families)
    .map(([f, n]) => `${f}×${n}`)
    .join(' ');
  const meta: Record<string, string | number> = {
    total: fleet.total,
    families: Object.keys(fleet.families).length,
    stale: stale ? 1 : 0,
    freshnessMs: freshness ?? -1,
  };
  return {
    id: 'diagmap',
    name: 'Diagnostic Maps',
    kind: 'knowledge',
    state: 'connected',
    detail: `${fleet.total} canonical maps (${familyList}) · dashboard ${
      stale ? 'STALE — re-run the fleet gate' : 'current'
    }`,
    meta,
  };
}
