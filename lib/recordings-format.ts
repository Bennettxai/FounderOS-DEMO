/**
 * Client-safe half of the recordings lane: the row shape and its duration
 * formatter, with NO node imports. RecordingsBoard (rendered inside the
 * 'use client' CommsTabs) imports from here; the connectors live in
 * lib/recordings.ts, which only server code may import. Splitting them is
 * what keeps `node:path` out of the browser bundle (the Plaud * deploy failed exactly there, and only `next build` can see it).
 */
import type { ConnectorStatus } from '@/lib/connectors/types';

export type RecordingSource = 'plaud' | 'fathom';

export type Recording = {
  id: string;
  source: RecordingSource;
  title: string;
  at: string;
  durationMinutes: number | null;
  url: string | null;
  /** Where the recording landed in the knowledge base, once ingested. */
  brain?: 'gbrain' | 'store' | null;
};

export type RecordingsBoard = { recordings: Recording[]; sources: ConnectorStatus[] };

/** The recordings Plaud ships in every new account (onboarding copy and a
 * demo conversation). They are transcribed, so the ingest skips them by
 * exact title and the board labels them "sample". */
const PLAUD_SAMPLE_TITLES = new Set([
  'welcome to plaud.ai',
  'how to use plaud',
  'steve jobs & bill gates: a conversation that shaped technology',
]);

export function isPlaudSample(title: string): boolean {
  return PLAUD_SAMPLE_TITLES.has(title.trim().toLowerCase());
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return '';
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}m`;
}
