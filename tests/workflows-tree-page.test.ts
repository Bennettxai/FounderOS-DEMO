import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * /workflows renders the process map as a grid of collapsed cards that expand
 * in place into a vertical tree with real forks, a step-detail drawer, and a
 * builder that writes the same workflows table. Real roster, real run history.
 */
describe('/workflows: the tree replaces the chain map', () => {
  const page = read('app/workflows/page.tsx');

  test('the tree is wired with owner avatars and run history from the real roster', () => {
    expect(page).toContain('<WorkflowTree');
    expect(page).toMatch(/from '@\/components\/WorkflowTree'/);
    expect(page).toContain('agentPresence');
    expect(page).toContain('runsByOwner');
    expect(page).toContain('agentAvatars');
    expect(page).toContain('db.agents.all()');
    expect(page).not.toContain('WorkflowMap');
  });

  test('the page rises in with the slab motion', () => {
    expect(page).toMatch(/from '@\/components\/motion'/);
    expect(page).toContain('<Rise');
  });

  test('no em dashes', () => {
    expect(page).not.toContain('—');
  });
});

describe('/workflows: the ported components honour the house rules', () => {
  test.each(['components/WorkflowTree.tsx', 'components/WorkflowBuilder.tsx', 'components/AgentAvatar.tsx'])('%s', (file) => {
    const src = read(file);
    expect(src).not.toContain('—');
    expect(src).not.toMatch(/transition-(colors|all)\b/);
    expect(src).not.toMatch(/\bpressable\b/);
    expect(src).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(src).not.toMatch(/rgba?\(\s*\d/i);
    expect(src).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  test('the old chain map is gone', () => {
    expect(existsSync(join(process.cwd(), 'components/WorkflowMap.tsx'))).toBe(false);
  });

  test('the tree node surfaces ride the colorway tokens', () => {
    const css = read('app/globals.css');
    for (const name of ['--wft-node-bg', '--wft-node-bg-hover']) {
      const m = css.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
      expect(m, `${name} defined`).not.toBeNull();
      expect(m![1]).toContain('var(--');
      expect(m![1]).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(\s*\d/i);
    }
  });
});

describe('/workflows: the API and schema the builder needs', () => {
  test('the five routes exist', () => {
    for (const p of ['app/api/workflows/route.ts', 'app/api/workflows/[id]/route.ts', 'app/api/workflows/draft/route.ts', 'app/api/workflows/draft/logic.ts', 'app/api/workflows/shared.ts']) {
      expect(existsSync(join(process.cwd(), p)), p).toBe(true);
    }
  });

  test('existing workflow rows still parse: detail and branch default rather than fail', () => {
    const schemas = read('lib/schemas.ts');
    expect(schemas).toContain('WorkflowBranchSchema');
    expect(schemas).toMatch(/detail:\s*z\.string\(\)\.default\(''\)/);
    expect(schemas).toMatch(/branch:\s*WorkflowBranchSchema\.nullable\(\)\.default\(null\)/);
  });
});
