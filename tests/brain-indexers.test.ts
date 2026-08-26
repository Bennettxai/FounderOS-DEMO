import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { brainzContracts, hermesSkillDocs, parseFrontmatter } from '@/lib/brain';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures', 'brain');
const SKILLS = path.join(FIXTURES, 'hermes', 'skills');
const SCHEMAS = path.join(FIXTURES, 'brainz', 'schemas');

describe('parseFrontmatter', () => {
  test('parses single-line key: value pairs', () => {
    expect(
      parseFrontmatter('---\nname: ollama-local\ndescription: Run Ollama.\n---\n# body'),
    ).toEqual({
      name: 'ollama-local',
      description: 'Run Ollama.',
    });
  });

  test('folds > block scalars into a single line', () => {
    const fm = parseFrontmatter('---\ndescription: >\n  Folded line one\n  Folded line two\n---\nbody');
    expect(fm.description).toBe('Folded line one Folded line two');
  });

  test('strips surrounding quotes from values', () => {
    const fm = parseFrontmatter('---\ndescription: "quoted desc"\n---\nbody');
    expect(fm.description).toBe('quoted desc');
  });

  test('returns {} when content has no frontmatter', () => {
    expect(parseFrontmatter('# Plain markdown, no frontmatter')).toEqual({});
  });

  test('returns {} when the frontmatter block is unterminated', () => {
    expect(parseFrontmatter('---\nname: no-closer')).toEqual({});
  });
});

describe('hermesSkillDocs', () => {
  test('indexes root *.md and <skill>/SKILL.md entry points, sorted by name', () => {
    const docs = hermesSkillDocs(SKILLS);
    expect(docs.map((d) => d.name)).toEqual(['HyperFrames', 'ollama-local', 'README', 'smallcode']);
  });

  test('excludes deep references, nested guides, bare dirs, and dotfiles', () => {
    const docs = hermesSkillDocs(SKILLS);
    const names = docs.map((d) => d.name);
    expect(names).not.toContain('client-sdk');
    expect(names).not.toContain('deep-guide');
    expect(names).not.toContain('empty-skill');
    expect(names).not.toContain('hidden-skill');
    expect(docs).toHaveLength(4);
  });

  test('embeds frontmatter name and description', () => {
    const docs = hermesSkillDocs(SKILLS);
    const hyper = docs.find((d) => d.name === 'HyperFrames')!;
    expect(hyper.description).toBe('Turn web frames into flat artifacts for the NeuroFrame pipeline.');
    const ollama = docs.find((d) => d.name === 'ollama-local')!;
    expect(ollama.description).toBe('Run Ollama as the local model server for NikOS agents.');
  });

  test('strips quotes from descriptions', () => {
    const docs = hermesSkillDocs(SKILLS);
    const smallcode = docs.find((d) => d.name === 'smallcode')!;
    expect(smallcode.description).toBe('SmallCode runs against Ollama at OLLAMA_URL');
  });

  test('falls back to filename and empty description without frontmatter', () => {
    const docs = hermesSkillDocs(SKILLS);
    const readme = docs.find((d) => d.name === 'README')!;
    expect(readme.description).toBe('');
    expect(readme.body).toContain('# Hermes Skills');
  });

  test('body excludes the frontmatter block', () => {
    const docs = hermesSkillDocs(SKILLS);
    const smallcode = docs.find((d) => d.name === 'smallcode')!;
    expect(smallcode.body.startsWith('# SmallCode Skill')).toBe(true);
    expect(smallcode.body).not.toContain('description:');
  });
});

describe('brainzContracts', () => {
  test('indexes *.json schemas sorted by filename (dotfiles included)', () => {
    const contracts = brainzContracts(SCHEMAS);
    expect(contracts.map((c) => c.name)).toEqual(['.hidden.json', 'pick.v1.json', 'research-brief.v1.json']);
  });

  test('reads title, description, and field docs', () => {
    const contracts = brainzContracts(SCHEMAS);
    const pick = contracts.find((c) => c.name === 'pick.v1.json')!;
    expect(pick.title).toBe('Pick');
    expect(pick.description).toBe('Canonical pick record produced by the pick bots.');
    expect(pick.fields).toBe(
      'pick_id — Stable id across retries. · sport — Sport the pick targets. · symbol — Ticker when the pick is a trade. · status',
    );
  });

  test('falls back to filename for a missing title', () => {
    const contracts = brainzContracts(SCHEMAS);
    const brief = contracts.find((c) => c.name === 'research-brief.v1.json')!;
    expect(brief.title).toBe('research-brief.v1.json');
    expect(brief.fields).toBe('target_bot — Bot the brief is prepared for.');
  });

  test('skips invalid JSON and ignores non-.json files', () => {
    const contracts = brainzContracts(SCHEMAS);
    expect(contracts.map((c) => c.name)).not.toContain('broken.json');
    expect(contracts.map((c) => c.name)).not.toContain('not-a-contract.txt');
  });
});