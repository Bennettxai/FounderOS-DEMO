/**
 * Generate the brain-store markdown for the whole org: agents, SOPs, tools,
 * people, pillars — wikilinked so the G-Brain constellation gains real
 * structure. Hand-edited files (no generated marker) are never touched.
 *
 *   npm run brain:docs             → writes into ~/knowledge/brain-store
 *   BRAIN_DOCS_DIR=/tmp/x npm run brain:docs
 */
import os from 'node:os';
import path from 'node:path';
import { openDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { buildBrainDocs, writeBrainDocs } from '@/lib/brain-docs';

const root =
  process.env.BRAIN_DOCS_DIR ??
  process.env.GBRAIN_STORE ??
  path.join(os.homedir(), 'knowledge', 'brain-store');

const dbPath = process.env.FOUNDER_OS_DB ?? path.join(process.cwd(), 'data', 'founder-os.db');
const db = openDb(dbPath);
seedDatabase(db);

const docs = buildBrainDocs({
  departments: db.departments.all(),
  agents: db.agents.all(),
  people: db.people.all(),
  tasks: db.sopTasks.all(),
  tools: db.tools.all(),
});

const { written, skipped } = writeBrainDocs(docs, root);
db.close();

console.log(`brain-docs → ${root}`);
console.log(`  written: ${written}`);
console.log(`  skipped (hand-edited): ${skipped}`);
console.log(`  total docs: ${docs.length}`);
