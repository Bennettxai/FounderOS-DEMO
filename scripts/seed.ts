import path from 'node:path';
import fs from 'node:fs';
import { openDb } from '../lib/db';
import { seedDatabase } from '../lib/seed';

const dbPath = process.env.FOUNDER_OS_DB ?? path.join(process.cwd(), 'data', 'founder-os.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = openDb(dbPath);
seedDatabase(db);
console.log(`Seeded ${dbPath}`);
console.log(`  departments: ${db.departments.all().length}`);
console.log(`  agents:      ${db.agents.all().length}`);
console.log(`  tools:       ${db.tools.all().length}`);
console.log(`  roadmap:     ${db.roadmap.all().length}`);
db.close();
