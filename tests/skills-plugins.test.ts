import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GET } from '@/app/api/skills/[slug]/route';
import { readPluginSkills, readSkillMarkdown } from '@/lib/skills-catalog';

/**
 * Plugin skills — the ones the operator uses through Claude Code plugins
 * (superpowers, vercel, slack, …) — join the /skills catalog. They resolve
 * through installed_plugins.json so only the LIVE version of each plugin is
 * listed, never stale cache dirs. Slugs are namespaced `plugin:skill`, the
 * same names the CLI uses.
 */

const FIXTURE = fs.mkdtempSync(path.join(os.tmpdir(), 'founder-os-plugins-'));
const LIVE = path.join(FIXTURE, 'cache', 'official', 'myplugin', '1.0.0');
const STALE = path.join(FIXTURE, 'cache', 'official', 'myplugin', '0.9.0');
const BARE = path.join(FIXTURE, 'cache', 'official', 'no-skills-plugin', '1.0.0');
const MD = `---\nname: alpha\ndescription: First plugin skill.\n---\n\n# Alpha\n\nBody.\n`;

beforeAll(() => {
  fs.mkdirSync(path.join(LIVE, 'skills', 'alpha'), { recursive: true });
  fs.writeFileSync(path.join(LIVE, 'skills', 'alpha', 'SKILL.md'), MD);
  // a stale cached version that installed_plugins.json does NOT point at
  fs.mkdirSync(path.join(STALE, 'skills', 'old-skill'), { recursive: true });
  fs.writeFileSync(path.join(STALE, 'skills', 'old-skill', 'SKILL.md'), '---\nname: old-skill\n---\n');
  // an installed plugin with no skills directory at all
  fs.mkdirSync(BARE, { recursive: true });
  fs.writeFileSync(
    path.join(FIXTURE, 'installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'myplugin@official': [
          { scope: 'user', installPath: LIVE, version: '1.0.0' },
          { scope: 'project', installPath: LIVE, version: '1.0.0' }, // dup entry — must not double-list
        ],
        'no-skills-plugin@official': [{ scope: 'user', installPath: BARE, version: '1.0.0' }],
        'ghost@official': [{ scope: 'user', installPath: path.join(FIXTURE, 'nope'), version: '0.0.1' }],
      },
    }),
  );
  process.env.FOUNDER_OS_PLUGINS_DIR = FIXTURE;
});

afterAll(() => {
  delete process.env.FOUNDER_OS_PLUGINS_DIR;
  fs.rmSync(FIXTURE, { recursive: true, force: true });
});

describe('readPluginSkills', () => {
  it('lists live plugin skills with namespaced slugs and frontmatter metadata', () => {
    const skills = readPluginSkills();
    const alpha = skills.find((s) => s.slug === 'myplugin:alpha');
    expect(alpha).toBeDefined();
    expect(alpha!.name).toBe('alpha');
    expect(alpha!.description).toBe('First plugin skill.');
    expect(alpha!.group).toBe('Plugin · myplugin');
    expect(alpha!.path.endsWith('skills/alpha/SKILL.md')).toBe(true);
  });

  it('lists each skill once even when the manifest has duplicate entries', () => {
    const slugs = readPluginSkills().map((s) => s.slug);
    expect(slugs.filter((s) => s === 'myplugin:alpha')).toHaveLength(1);
  });

  it('ignores stale cached versions the manifest does not point at', () => {
    const slugs = readPluginSkills().map((s) => s.slug);
    expect(slugs).not.toContain('myplugin:old-skill');
  });

  it('skips plugins without skills and missing install paths, honestly', () => {
    const slugs = readPluginSkills().map((s) => s.slug);
    expect(slugs.some((s) => s.startsWith('no-skills-plugin:'))).toBe(false);
    expect(slugs.some((s) => s.startsWith('ghost:'))).toBe(false);
  });

  it('returns [] when the plugins dir is absent', () => {
    expect(readPluginSkills(path.join(FIXTURE, 'not-a-dir'))).toEqual([]);
  });
});

describe('readSkillMarkdown with plugin slugs', () => {
  it('reads a plugin SKILL.md through its namespaced slug', () => {
    expect(readSkillMarkdown('myplugin:alpha')).toBe(MD);
  });

  it('nulls on unknown plugin or skill', () => {
    expect(readSkillMarkdown('nope:alpha')).toBeNull();
    expect(readSkillMarkdown('myplugin:nope')).toBeNull();
  });

  it('rejects traversal in either half of the slug', () => {
    expect(readSkillMarkdown('..:alpha')).toBeNull();
    expect(readSkillMarkdown('myplugin:../evil')).toBeNull();
    expect(readSkillMarkdown('myplugin:alpha:extra')).toBeNull();
  });
});

describe('GET /api/skills/[slug] with plugin slugs', () => {
  it('serves the plugin SKILL.md as JSON', async () => {
    const res = await GET(new Request('http://x/api/skills/myplugin:alpha'), {
      params: { slug: 'myplugin:alpha' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { markdown: string };
    expect(body.markdown).toBe(MD);
  });

  it('sanitizes the colon out of the download filename', async () => {
    const res = await GET(new Request('http://x/api/skills/myplugin:alpha?download=1'), {
      params: { slug: 'myplugin:alpha' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="myplugin-alpha-SKILL.md"');
  });
});
