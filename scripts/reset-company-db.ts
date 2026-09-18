import fs from 'node:fs';
import path from 'node:path';

import { openDb } from '../lib/db';
import { seedDatabase } from '../lib/seed';

/**
 * ONE-TIME COMPANY DATABASE RESET
 *
 * Permanently removes the legacy SQLite database,
 * recreates a clean schema and seeds only the
 * authoritative company foundation.
 *
 * This script is destructive by design.
 * It must NOT run automatically.
 */

const dbPath =
  process.env.FOUNDER_OS_DB ??
  path.join(process.cwd(), 'data', 'founder-os.db');

if (dbPath === ':memory:') {
  throw new Error('Refusing to reset an in-memory database.');
}

const databaseFiles = [
  dbPath,
  `${dbPath}-wal`,
  `${dbPath}-shm`,
];

console.log('Company database reset');
console.log(`Target: ${dbPath}`);
console.log('');

for (const file of databaseFiles) {
  if (!fs.existsSync(file)) {
    continue;
  }

  try {
    fs.rmSync(file, { force: true });
    console.log(`Deleted: ${file}`);
  } catch (error) {
    throw new Error(
      `Could not delete ${file}. Stop the development server and any program using the SQLite database, then run the reset again.`,
      { cause: error },
    );
  }
}

fs.mkdirSync(path.dirname(dbPath), {
  recursive: true,
});

const db = openDb(dbPath);

try {
  seedDatabase(db);

  const departments = db.departments.all();
  const agents = db.agents.all();

  const legacyCounts = {
    workflows: db.workflows.all().length,
    skills: db.skills.all().length,
    tools: db.tools.all().length,
    roadmap: db.roadmap.all().length,
    metrics: db.metrics.all().length,
    domains: db.domains.all().length,
    phases: db.phases.all().length,
    agentRuns: db.agentRuns.recent(1_000_000).length,
    agentMessages: db.agentMessages.recent(1_000_000).length,
    agentTasks: db.agentTasks.all().length,
    agentCrons: db.agentCrons.all().length,
    broadcasts: db.broadcasts.recent(1_000_000).length,
  };

  if (departments.length !== 3) {
    throw new Error(
      `Reset validation failed: expected 3 departments, found ${departments.length}.`,
    );
  }

  if (agents.length !== 19) {
    throw new Error(
      `Reset validation failed: expected 19 agents, found ${agents.length}.`,
    );
  }

  const remainingLegacyEntries =
    Object.entries(legacyCounts).filter(
      ([, count]) => count !== 0,
    );

  if (remainingLegacyEntries.length > 0) {
    const details = remainingLegacyEntries
      .map(([name, count]) => `${name}=${count}`)
      .join(', ');

    throw new Error(
      `Reset validation failed: legacy/runtime data is not empty (${details}).`,
    );
  }

  console.log('');
  console.log(
    'Clean company database created successfully.',
  );
  console.log(`Departments: ${departments.length}`);
  console.log(`Agents:      ${agents.length}`);
  console.log('Legacy/runtime datasets: 0');
  console.log('');
  console.log(
    'The company now starts with structure, but no fabricated history.',
  );
} finally {
  db.close();
}