import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Reads Alex's real Claude Code skills from ~/.claude/skills/<name>/SKILL.md,
 * honest about what's on disk (empty list when the directory is absent). The
 * full SKILL.md is loaded on demand via readSkillMarkdown so the /skills page
 * ships light. Frontmatter parsing is pure + tested.
 */

export type CatalogSkill = {
  slug: string; // directory name
  name: string; // frontmatter `name` (falls back to the slug)
  description: string; // frontmatter `description` (inline or block scalar)
  group: string; // display grouping
  path: string; // ~-relative path to the SKILL.md, for the reader header
};

const SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills');
const SLUG_RE = /^[a-zA-Z0-9._-]+$/;

/** Read one frontmatter field, handling inline, quoted, and block scalars (| / >). */
function readField(frontmatter: string, key: string): string | undefined {
  const lines = frontmatter.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(new RegExp(`^${key}:\\s*(.*)$`));
    if (!m) continue;
    const inline = m[1].trim();
    if (/^[|>][+-]?$/.test(inline)) {
      // block scalar: gather the following indented (or blank) lines
      const block: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j];
        if (l.trim() === '' || /^\s/.test(l)) block.push(l);
        else break;
      }
      // dedent by the smallest indent among non-blank lines
      const indents = block.filter((l) => l.trim() !== '').map((l) => l.match(/^\s*/)![0].length);
      const strip = indents.length ? Math.min(...indents) : 0;
      const dedented = block.map((l) => l.slice(strip));
      const folded = inline.startsWith('>');
      const joined = folded ? dedented.join(' ') : dedented.join('\n');
      return joined.replace(/\s+$/, '').replace(/^\s+/, '');
    }
    return inline.replace(/^["']|["']$/g, '');
  }
  return undefined;
}

export function parseSkillFrontmatter(md: string): { name?: string; description?: string } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const fm = m[1];
  const out: { name?: string; description?: string } = {};
  const name = readField(fm, 'name');
  const description = readField(fm, 'description');
  if (name !== undefined) out.name = name;
  if (description !== undefined) out.description = description;
  return out;
}

export function skillGroup(name: string): string {
  const n = name.toLowerCase();
  if (n.startsWith('firecrawl')) return 'Firecrawl';
  if (['build', 'spec', 'review'].includes(n)) return 'Spec · build · review';
  if (['codex', 'mcp-builder'].includes(n)) return 'Engineering';
  if (n === 'nano-banana') return 'Creative';
  if (n === 'proposal-generator') return 'Sales';
  return 'Skills';
}

/** List the real skills on disk (metadata only). Empty when the dir is absent. */
export function readUserSkills(dir: string = SKILLS_DIR): CatalogSkill[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: CatalogSkill[] = [];
  for (const e of entries) {
    // Read <name>/SKILL.md for every entry — no isDirectory() gate, because many
    // skills (firecrawl-*) are symlinks, for which isDirectory() is false. The
    // read attempt filters out plain files (auto-mode.md) and dirs without one.
    const file = path.join(dir, e.name, 'SKILL.md');
    let md: string;
    try {
      md = fs.readFileSync(file, 'utf8');
    } catch {
      continue; // not a skill dir (plain file, or no SKILL.md)
    }
    const fm = parseSkillFrontmatter(md);
    const name = fm.name ?? e.name;
    out.push({
      slug: e.name,
      name,
      description: fm.description ?? '',
      group: skillGroup(name),
      path: `~/.claude/skills/${e.name}/SKILL.md`,
    });
  }
  return out.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
}

/** Read one skill's full SKILL.md. Null on a bad slug or missing file (honest). */
export function readSkillMarkdown(slug: string, dir: string = SKILLS_DIR): string | null {
  if (!SLUG_RE.test(slug)) return null; // no path traversal
  try {
    return fs.readFileSync(path.join(dir, slug, 'SKILL.md'), 'utf8');
  } catch {
    return null;
  }
}
