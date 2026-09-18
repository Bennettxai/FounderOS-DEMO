import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * An agent's prompt, read off disk at run time.
 *
 * Same contract as `agents/markets/strategy.md`: the markdown file IS the
 * prompt. the operator edits `agents/<folder>/skill.md` and the agent behaves
 * differently on the very next run, with no deploy and no code change. That is
 * the whole point of the folder layout, so never inline a copy of a skill in
 * TypeScript "as a default" — two sources of truth means the file silently
 * stops being the one that matters.
 */
export function agentSkillPath(folder: string): string {
  return path.join(process.cwd(), 'agents', folder, 'skill.md');
}

export function readAgentSkill(folder: string): string {
  const file = agentSkillPath(folder);
  try {
    const text = readFileSync(file, 'utf8').trim();
    if (!text) throw new Error('empty');
    return text;
  } catch {
    // Loud rather than silent: an agent running on an empty prompt would still
    // produce confident-sounding output, which is the worst failure mode here.
    throw new Error(`missing or empty skill file: agents/${folder}/skill.md`);
  }
}

/**
 * The checklist items the operator has not filled in yet, pulled from the skill
 * file's own `- [ ]` boxes. Surfacing these on every run is how the agent asks
 * for what it needs instead of quietly guessing.
 */
export function openSkillQuestions(skill: string): string[] {
  // The optional '> ' prefix matters: the open questions sit inside blockquotes
  // in the brand deal skill, and without it every one of them goes unseen.
  return [...skill.matchAll(/^\s*(?:>\s*)?- \[ \] \*\*(.+?)\*\*/gm)].map((m) => m[1]);
}
