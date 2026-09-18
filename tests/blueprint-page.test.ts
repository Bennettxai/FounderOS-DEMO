import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { NAV_AGENTS } from '@/lib/nav';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('/blueprint: present, reachable, honest', () => {
  test('page, lazy canvas, compiler, hierarchy, layout, API and ask route exist', () => {
    for (const p of [
      'app/blueprint/page.tsx',
      'app/blueprint/loading.tsx',
      'app/api/blueprint/route.ts',
      'app/api/blueprint/ask/route.ts',
      'lib/blueprint/compile.ts',
      'lib/blueprint/graph.ts',
      'lib/blueprint/hierarchy.ts',
      'lib/blueprint/hierarchy-layout.ts',
      'components/blueprint/BlueprintCanvasLazy.tsx',
      'components/blueprint/HierarchyWorkspace.tsx',
      'components/blueprint/AskBar.tsx',
      'components/useSvgCamera.ts',
    ]) {
      expect(existsSync(join(process.cwd(), p)), p).toBe(true);
    }
  });

  test('Blueprint sits in the Agents group right after the org chart', () => {
    const hrefs = NAV_AGENTS.map((n) => n.href);
    expect(hrefs.indexOf('/blueprint')).toBe(hrefs.indexOf('/org') + 1);
  });

  test('the ask route answers through the AI Gateway and is an honest 503 without it', () => {
    const route = read('app/api/blueprint/ask/route.ts');
    expect(route).toMatch(/from '@\/lib\/connectors\/llm'/);
    expect(route).toContain('llmStatus');
    expect(route).toContain('503');
    expect(route).not.toContain('wizard');
  });

  test('the app node is Founder OS, never Slab', () => {
    expect(read('lib/blueprint/hierarchy.ts')).toContain("APP_ID = 'k-founder'");
    expect(read('lib/blueprint/hierarchy.ts')).not.toMatch(/slab/i);
    expect(read('components/blueprint/AskBar.tsx')).not.toMatch(/slab/i);
  });

  test('bh kind colours and the bh classes are defined; no undefined rgb-triplet tokens survive', () => {
    const css = read('app/globals.css');
    for (const k of ['operator', 'command', 'app', 'router', 'agent', 'department', 'person', 'skill', 'connector', 'model', 'store', 'surface', 'daemon', 'machine', 'cloud', 'group']) {
      expect(css, k).toMatch(new RegExp(`--bh-k-${k}\\s*:`));
    }
    expect(css).toMatch(/\.bh-ask-answer\.is-thinking/);
    expect(css).not.toContain('--accent-rgb');
    expect(css).not.toContain('--glass-line-rgb');
    expect(css).not.toContain('--warn-text');
    for (const t of ['--glass-a', '--glass-b', '--glass-c', '--elevated', '--elevated-border']) {
      const m = css.match(new RegExp(`${t}\\s*:\\s*([^;]+);`));
      expect(m, `${t} defined`).not.toBeNull();
      expect(m![1]).toContain('var(--');
    }
    expect(css).not.toContain("[data-theme='red']");
  });

  test('the canvas sits under the 52px top bar and beside the resizable sidebar, not the donor shell', () => {
    const css = read('app/globals.css');
    const fit = css.slice(css.lastIndexOf('.bh-page,'));
    expect(fit).toMatch(/top:\s*52px/);
    expect(fit).toMatch(/left:\s*var\(--sidebar-w, 232px\)/);
  });
});

describe('/blueprint: house rules on every ported file', () => {
  const files = [
    'app/blueprint/page.tsx',
    'app/api/blueprint/route.ts',
    'app/api/blueprint/ask/route.ts',
    'components/useSvgCamera.ts',
    ...readdirSync(join(process.cwd(), 'components/blueprint')).map((f) => `components/blueprint/${f}`),
    ...readdirSync(join(process.cwd(), 'lib/blueprint')).map((f) => `lib/blueprint/${f}`),
  ];
  test.each(files)('%s', (file) => {
    const src = read(file);
    expect(src).not.toContain('—');
    expect(src).not.toMatch(/transition-(colors|all)\b/);
    expect(src).not.toMatch(/slab/i);
    expect(src).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
