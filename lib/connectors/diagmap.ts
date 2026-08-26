/**
 * Diagnostic Map connector — the canonical fleet for The-Diagnostic-Map.
 * Reads the generated Canonical/Fleet-Coverage.json (47 maps across 5
 * families) and checks freshness: the release dashboard should be newer than
 * the newest canonical map, else the fleet gate hasn't been re-run.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { NIKOS_PATHS } from '@/lib/nikos-paths';
import type { ConnectorStatus } from '@/lib/connectors/types';

export type FleetCoverage = {
  sourceHash?: string;
  total: number;
  families: Record<string, number>;
  maps: { filename: string; family: string; model: string; version?: string }[];
};

export function readFleetCoverage(): FleetCoverage | null {
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(NIKOS_PATHS.diagmap, 'Canonical', 'Fleet-Coverage.json'), 'utf8'),
    ) as { sourceHash?: unknown; total?: unknown; families?: Record<string, number>; maps?: unknown[] };
    const maps = Array.isArray(raw.maps) ? raw.maps : [];
    return {
      sourceHash: typeof raw.sourceHash === 'string' ? raw.sourceHash : undefined,
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

/** Canonical map files the dashboard was generated from (dashboard excluded). */
function canonicalMapFiles(): string[] {
  const canonical = path.join(NIKOS_PATHS.diagmap, 'Canonical');
  try {
    return fs
      .readdirSync(canonical)
      .filter((f) => f.endsWith('.html') && f !== 'Fleet-Coverage.html')
      .sort();
  } catch {
    return [];
  }
}

/** Content fingerprint over the canonical fleet — must match the generator's. */
export function fleetSourceHash(): string | null {
  const canonical = path.join(NIKOS_PATHS.diagmap, 'Canonical');
  try {
    const h = crypto.createHash('sha256');
    for (const name of canonicalMapFiles()) {
      h.update(name).update('\0');
      h.update(fs.readFileSync(path.join(canonical, name)));
    }
    return h.digest('hex');
  } catch {
    return null;
  }
}

/** True only when the generated dashboard genuinely differs from the canonical
 *  fleet. Content-based: a checkout that touches file mtimes is not "stale". */
export function fleetIsStale(): boolean {
  const hash = fleetSourceHash();
  if (hash == null) return false;
  const snapshotHash = readFleetCoverage()?.sourceHash;
  if (snapshotHash) return hash !== snapshotHash;
  // Legacy snapshot predating sourceHash: fall back to mtime comparison.
  const canonical = path.join(NIKOS_PATHS.diagmap, 'Canonical');
  try {
    const files = canonicalMapFiles();
    if (!files.length) return false;
    const newest = Math.max(...files.map((f) => fs.statSync(path.join(canonical, f)).mtimeMs));
    return fs.statSync(path.join(canonical, 'Fleet-Coverage.html')).mtimeMs < newest;
  } catch {
    return false;
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
  const stale = fleetIsStale();
  const familyList = Object.entries(fleet.families)
    .map(([f, n]) => `${f}×${n}`)
    .join(' ');
  const meta: Record<string, string | number> = {
    total: fleet.total,
    families: Object.keys(fleet.families).length,
    stale: stale ? 1 : 0,
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
