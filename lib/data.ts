import path from 'node:path';
import fs from 'node:fs';
import { openDb, type FounderDb } from '@/lib/db';
import { SEED_VERSION, seedDatabase, syncSeededProposals } from '@/lib/seed';
import { resolveDbPath } from '@/lib/paths';

/**
 * App-level singleton. demo-first, real-ready: every page and API route reads
 * through this seeded SQLite database, so swapping in live sources later is a
 * repo-level change, not a UI rewrite.
 */
let instance: FounderDb | null = null;

export function getDb(): FounderDb {
  if (instance) return instance;
  // Resolved per platform: Railway volume (DATA_DIR) > Vercel /tmp > repo data/.
  // On Railway the volume persists, so the DB is durable, not per-cold-start.
  // FOUNDER_OS_DB still overrides everything. See lib/paths.ts.
  const dbPath = resolveDbPath('founder-os.db', process.env.FOUNDER_OS_DB);
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  instance = openDb(dbPath);
  // Seed on first touch so a fresh clone boots looking alive. Each clause
  // back-fills databases created before that table existed; seedDatabase is
  // idempotent (INSERT OR REPLACE), so re-running only adds what's missing.
  if (
    // A seed whose CONTENT changed must reach databases that already exist.
    // Every clause below only fires on an EMPTY table, so on the host — full
    // for months — the seed had stopped running entirely, and rows deleted
    // from lib/seed.ts (the retired Notion and WebinarJam entries) went on
    // being served in production. The version stamp forces one re-seed per
    // change, which is also what prunes anything that left the seed.
    instance.meta.get('seed_version') !== SEED_VERSION ||
    instance.departments.all().length === 0 ||
    instance.workflows.all().length === 0 ||
    instance.skills.all().length === 0 ||
    instance.social.accounts().length === 0 ||
    instance.emailList.snapshots().length === 0 ||
    instance.social.dmSnapshots().length === 0 ||
    instance.social.dmMessages().length === 0 ||
    instance.leadMagnets.all().length === 0 ||
    instance.trading.latestSnapshot() === null ||
    // Without this clause the host — whose DB predates the table — would show
    // an empty Deliverables section forever, because the guard never fires.
    instance.proposals.all().length === 0 ||
    // Same reason for the scheduled jobs: the host's DB predates agent_crons
    // carrying seeded rows, so without this clause the 9am comms digest would
    // never exist in production and the cron tick would find nothing due.
    instance.agentCrons.all().length === 0
  ) {
    seedDatabase(instance);
  }
  // The guard above only fires on an EMPTY table, so an edit to an existing
  // seeded row (a corrected client name, a newly generated proposal) would
  // never reach a database that already exists. Proposals are the operator-facing
  // content that changes often, so they re-sync every boot; see the function
  // for why that is safe.
  syncSeededProposals(instance);
  return instance;
}
