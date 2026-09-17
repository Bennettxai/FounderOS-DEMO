import fs from 'node:fs';
import path from 'node:path';

import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';

/**
 * Application database singleton.
 *
 * The database starts with structural company information only:
 * departments and registered agents.
 *
 * Operational history must be created exclusively by real company activity.
 */
let instance: FounderDb | null = null;

export function getDb(): FounderDb {
  if (instance) {
    return instance;
  }

  const dbPath =
    process.env.FOUNDER_OS_DB ??
    path.join(process.cwd(), 'data', 'founder-os.db');

  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), {
      recursive: true,
    });
  }

  instance = openDb(dbPath);

  /**
   * Seed only when the structural company foundation is missing.
   *
   * Empty workflows, tasks, skills, memories, portfolio records or
   * performance history are valid states and must never trigger demo data.
   */
  const departments = instance.departments.all();
  const agents = instance.agents.all();

  if (
    departments.length !== 3 ||
    agents.length !== 19
  ) {
    seedDatabase(instance);
  }

  return instance;
}