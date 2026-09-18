import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GET } from '@/app/api/skills/[slug]/route';
import { readUserSkills, readSkillMarkdown } from '@/lib/skills-catalog';

/**
 * The /skills reader must offer the raw SKILL.md as a download
 * (GET /api/skills/[slug]?download=1) and the catalog must honor
 * FOUNDER_OS_SKILLS_DIR so all of this is testable off-machine.
 */

const FIXTURE = fs.mkdtempSync(path.join(os.tmpdir(), 'founder-os-skills-'));
const MD = `---\nname: demo-skill\ndescription: A demo skill for tests.\n---\n\n# Demo skill\n\nBody text.\n`;

beforeAll(() => {
  fs.mkdirSync(path.join(FIXTURE, 'demo-skill'), { recursive: true });
  fs.writeFileSync(path.join(FIXTURE, 'demo-skill', 'SKILL.md'), MD);
  process.env.FOUNDER_OS_SKILLS_DIR = FIXTURE;
});

afterAll(() => {
  delete process.env.FOUNDER_OS_SKILLS_DIR;
  fs.rmSync(FIXTURE, { recursive: true, force: true });
});

describe('FOUNDER_OS_SKILLS_DIR override', () => {
  it('readUserSkills lists the fixture skill', () => {
    const skills = readUserSkills();
    expect(skills.map((s) => s.slug)).toContain('demo-skill');
  });

  it('readSkillMarkdown reads the fixture SKILL.md', () => {
    expect(readSkillMarkdown('demo-skill')).toBe(MD);
  });
});

describe('GET /api/skills/[slug]', () => {
  it('returns JSON markdown by default (reader path unchanged)', async () => {
    const res = await GET(new Request('http://x/api/skills/demo-skill'), { params: { slug: 'demo-skill' } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { markdown: string };
    expect(body.markdown).toBe(MD);
  });

  it('?download=1 returns the raw file as a markdown attachment', async () => {
    const res = await GET(new Request('http://x/api/skills/demo-skill?download=1'), { params: { slug: 'demo-skill' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="demo-skill-SKILL.md"');
    expect(await res.text()).toBe(MD);
  });

  it('404s on a missing skill for both modes', async () => {
    const plain = await GET(new Request('http://x/api/skills/nope'), { params: { slug: 'nope' } });
    expect(plain.status).toBe(404);
    const dl = await GET(new Request('http://x/api/skills/nope?download=1'), { params: { slug: 'nope' } });
    expect(dl.status).toBe(404);
  });

  it('rejects path traversal slugs', async () => {
    const res = await GET(new Request('http://x/api/skills/..%2F..'), { params: { slug: '../..' } });
    expect(res.status).toBe(404);
  });
});
