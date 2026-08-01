import { describe, it, expect } from 'vitest';
import { parseSkillFrontmatter, skillGroup } from '@/lib/skills-catalog';

describe('parseSkillFrontmatter', () => {
  it('reads an inline name + description', () => {
    const md = `---\nname: codex\ndescription: Delegate a task to Codex.\n---\n\n# Codex\nbody`;
    expect(parseSkillFrontmatter(md)).toEqual({ name: 'codex', description: 'Delegate a task to Codex.' });
  });

  it('strips surrounding quotes', () => {
    const md = `---\nname: "nano-banana"\ndescription: 'Make images'\n---\n`;
    expect(parseSkillFrontmatter(md)).toEqual({ name: 'nano-banana', description: 'Make images' });
  });

  it('reads a literal block scalar (|), preserving line breaks', () => {
    const md = `---\nname: fc\ndescription: |\n  Line one.\n  Line two.\n---\n`;
    expect(parseSkillFrontmatter(md).description).toBe('Line one.\nLine two.');
  });

  it('reads a folded block scalar (>-), joining with spaces', () => {
    const md = `---\nname: dr\ndescription: >-\n  Folded line one\n  folded line two\n---\n`;
    expect(parseSkillFrontmatter(md).description).toBe('Folded line one folded line two');
  });

  it('returns empty when there is no frontmatter', () => {
    expect(parseSkillFrontmatter('# just a heading\ntext')).toEqual({});
  });
});

describe('skillGroup', () => {
  it('buckets skills into sensible groups', () => {
    expect(skillGroup('firecrawl-scrape')).toBe('Firecrawl');
    expect(skillGroup('firecrawl')).toBe('Firecrawl');
    expect(skillGroup('build')).toBe('Spec · build · review');
    expect(skillGroup('spec')).toBe('Spec · build · review');
    expect(skillGroup('codex')).toBe('Engineering');
    expect(skillGroup('mcp-builder')).toBe('Engineering');
    expect(skillGroup('nano-banana')).toBe('Creative');
    expect(skillGroup('proposal-generator')).toBe('Sales');
    expect(skillGroup('something-else')).toBe('Skills');
  });
});
