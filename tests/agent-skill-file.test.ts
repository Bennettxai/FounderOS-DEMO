import { describe, expect, test } from 'vitest';
import { readAgentSkill, openSkillQuestions, agentSkillPath } from '@/lib/agents/skill-file';

/**
 * The skill markdown is the prompt (same contract as the markets agent's
 * strategy.md). These pin the two properties that keep that honest: the file
 * must actually exist for the shipped agents, and a run must be able to tell
 * the operator what it is still missing.
 */
describe('agent skill files', () => {
  test('both new agents have a skill file on disk', () => {
    for (const folder of ['brand-deals', 'newsletter']) {
      expect(() => readAgentSkill(folder), agentSkillPath(folder)).not.toThrow();
      expect(readAgentSkill(folder).length).toBeGreaterThan(200);
    }
  });

  test('a missing skill file fails loudly instead of running on an empty prompt', () => {
    expect(() => readAgentSkill('no-such-agent')).toThrow(/missing or empty skill file/);
  });

  test('unchecked boxes become the questions the agent asks the operator', () => {
    const qs = openSkillQuestions(readAgentSkill('brand-deals'));
    expect(qs).toContain('Audience.');
    expect(qs).toContain('Payment terms.');
    // they live inside blockquotes in that file, which the parser must handle
    expect(qs.length).toBeGreaterThanOrEqual(8);
  });

  test('the newsletter agent knows what it is missing too', () => {
    expect(openSkillQuestions(readAgentSkill('newsletter')).length).toBeGreaterThanOrEqual(5);
  });

  test('a checked box stops being a question', () => {
    expect(openSkillQuestions('- [x] **Done thing.** blah\n- [ ] **Open thing.** blah')).toEqual([
      'Open thing.',
    ]);
  });

  test('questions inside a blockquote still count', () => {
    expect(openSkillQuestions('> - [ ] **Quoted thing.** blah')).toEqual(['Quoted thing.']);
  });
});
