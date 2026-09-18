/**
 * The Recordings tab on /comms: every recorded conversation in one list,
 * newest first, from the two recorders the operator actually carries —
 *   plaud  — the AI voice recorder: in-person meetings, site walks, memos
 *   fathom — the notetaker on Zoom sales calls
 * mergeRecordings is pure (unit-tested); gatherRecordings wires the live
 * connectors and never throws — an unreachable recorder is an empty
 * contribution plus an honest state on its tab header.
 *
 * SERVER ONLY: this pulls the connectors (node:fs et al). Client components
 * import the row type + formatter from lib/recordings-format.ts instead.
 */
import { recentFathomMeetings, fathomStatus, type FathomMeeting } from '@/lib/connectors/fathom';
import { recentPlaudRecordings, plaudStatus, type PlaudRecording } from '@/lib/connectors/plaud';
import type { ConnectorStatus } from '@/lib/connectors/types';
import type { Recording, RecordingsBoard } from '@/lib/recordings-format';
import { getDb } from '@/lib/data';
import { markIngested } from '@/lib/plaud-ingest';

export { formatDuration } from '@/lib/recordings-format';
export type { Recording, RecordingSource, RecordingsBoard } from '@/lib/recordings-format';

const stamp = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : -Infinity;
};

export function mergeRecordings(plaud: PlaudRecording[], fathom: FathomMeeting[]): Recording[] {
  const rows: Recording[] = [
    ...plaud.map((r) => ({ id: `plaud-${r.id}`, source: 'plaud' as const, title: r.title, at: r.at, durationMinutes: r.durationMinutes, url: null })),
    ...fathom.map((m) => ({
      id: `fathom-${m.url ?? `${m.at}-${m.title}`}`,
      source: 'fathom' as const,
      title: m.title,
      at: m.at,
      durationMinutes: m.durationMinutes,
      url: m.url,
    })),
  ];
  return rows.sort((a, b) => stamp(b.at) - stamp(a.at));
}

export async function gatherRecordings(limit = 30): Promise<RecordingsBoard> {
  const [plaud, fathom, plaudState, fathomState] = await Promise.all([
    recentPlaudRecordings(limit).catch(() => [] as PlaudRecording[]),
    recentFathomMeetings(limit).catch(() => [] as FathomMeeting[]),
    plaudStatus().catch((err): ConnectorStatus => ({ id: 'plaud', name: 'Plaud', kind: 'knowledge', state: 'error', detail: String(err) })),
    fathomStatus().catch((err): ConnectorStatus => ({ id: 'fathom', name: 'Fathom', kind: 'crm', state: 'error', detail: String(err) })),
  ]);
  let ingested: Parameters<typeof markIngested>[1] = [];
  try {
    ingested = getDb().plaudIngests.all();
  } catch {
    /* a DB hiccup must not blank the tab; rows just show without the brain mark */
  }
  return { recordings: markIngested(mergeRecordings(plaud, fathom).slice(0, limit), ingested), sources: [plaudState, fathomState] };
}
