import fs from 'node:fs';
import path from 'node:path';
import type { Agent, Department, Person, SopTask, Tool } from '@/lib/schemas';

/**
 * Generates the brain-store markdown for everything the org consists of:
 * one doc per agent (charter + instructions + harness), per SOP (built out
 * with purpose/trigger/steps/done/escalation), per tool (what it is, who
 * uses it), per human, and per pillar. Wikilinked throughout, so the G-Brain
 * constellation gains real structure from them. Deterministic; safe to
 * regenerate (hand-edited files without the marker are never touched).
 */

export const GENERATED_MARKER = 'generated: founder-os';

export type BrainDoc = { path: string; content: string };

type DocsInput = {
  departments: Department[];
  agents: Agent[];
  people: Person[];
  tasks: SopTask[];
  tools: Tool[];
};

const fm = (title: string, kind: string) =>
  `---\ntitle: ${title}\nkind: ${kind}\n${GENERATED_MARKER}\n---\n\n`;

const toolSlug = (t: Tool) => t.id.replace(/^tool-/, '');

const link = (name: string) => `[[${name}]]`;

const pillarSlugOf = (d: Department) => `pillar-${d.slug}`;

export function buildBrainDocs(input: DocsInput): BrainDoc[] {
  const { departments, agents, people, tasks, tools } = input;
  const docs: BrainDoc[] = [];

  const deptById = new Map(departments.map((d) => [d.id, d]));
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const taskByAssignee = new Map(tasks.map((t) => [`${t.assigneeKind}:${t.assigneeId}`, t]));
  const humanLeadByDept = new Map(people.map((p) => [p.departmentId, p]));

  const usersOfTool = (slug: string): string[] => [
    ...agents.filter((a) => a.tools.includes(slug)).map((a) => a.id),
    ...people.filter((p) => p.tools.includes(slug)).map((p) => p.id),
  ];

  // ── tools ────────────────────────────────────────────────────────────────
  for (const t of [...tools].sort((a, b) => a.id.localeCompare(b.id))) {
    const slug = toolSlug(t);
    const users = usersOfTool(slug);
    docs.push({
      path: `tools/${slug}.md`,
      content:
        fm(t.name, 'tool') +
        `# ${t.name}\n\n` +
        `${t.description}\n\n` +
        `- Category: ${t.category}\n` +
        `- Status: ${t.status}\n\n` +
        `## Used by\n\n` +
        (users.length ? users.map((u) => `- ${link(u)}`).join('\n') + '\n' : 'Nobody is wired to this tool yet.\n'),
    });
  }

  // ── agents ───────────────────────────────────────────────────────────────
  for (const a of [...agents].sort((x, y) => x.id.localeCompare(y.id))) {
    const dept = deptById.get(a.departmentId);
    const task = taskByAssignee.get(`agent:${a.id}`);
    const subs = agents.filter((s) => s.parentId === a.id).map((s) => s.id);
    const lead = humanLeadByDept.get(a.departmentId);
    docs.push({
      path: `agents/${a.id}.md`,
      content:
        fm(a.name, 'agent') +
        `# ${a.name}\n\n` +
        `${a.role} in ${dept ? link(pillarSlugOf(dept)) : a.departmentId}.\n\n` +
        `${a.description}\n\n` +
        `## Instructions\n\n` +
        (task
          ? `Executes ${link(task.id)} — ${task.title}.\n\n` +
            task.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') +
            '\n'
          : 'No SOP assigned yet.\n') +
        `\n## Harness\n\n` +
        `- Tier: ${a.tier}\n` +
        `- Runs on: ${a.instance} · ${a.model}\n` +
        `- Status: ${a.status}\n` +
        (a.parentId ? `- Reports to: ${link(a.parentId)}\n` : '') +
        (subs.length ? `- Sub-agents: ${subs.map(link).join(' ')}\n` : '') +
        (lead ? `- Human lead: ${link(lead.id)}\n` : '') +
        `\n## Tools\n\n` +
        (a.tools.length ? a.tools.map((s) => `- ${link(s)}`).join('\n') + '\n' : 'No tools wired.\n'),
    });
  }

  // ── SOPs (built out) ─────────────────────────────────────────────────────
  for (const t of [...tasks].sort((a, b) => a.id.localeCompare(b.id))) {
    const dept = deptById.get(t.departmentId);
    const ownerId = t.assigneeId;
    const owner = t.assigneeKind === 'agent' ? agentById.get(ownerId) : people.find((p) => p.id === ownerId);
    const runtime =
      t.assigneeKind === 'agent'
        ? `${(owner as Agent | undefined)?.instance ?? 'builtin'} · ${(owner as Agent | undefined)?.model ?? 'unknown'}`
        : 'human · judgment call';
    const lead = humanLeadByDept.get(t.departmentId);
    const escalateTo = t.assigneeKind === 'person' ? 'Alex' : lead ? `${lead.name} (${link(lead.id)})` : 'Alex';
    const firstStep = t.steps[0] ?? '';
    const lastStep = t.steps[t.steps.length - 1] ?? '';
    docs.push({
      path: `sops/${t.id}.md`,
      content:
        fm(t.title, 'sop') +
        `# ${t.title}\n\n` +
        `## Purpose\n\n${t.summary || t.title}\n\n` +
        `## Owner\n\n${link(ownerId)} — one worker, one job (monogamous by design).\nRuns on: ${runtime}.\n\n` +
        `## Trigger\n\n${firstStep ? `Kicks off when it is time to "${firstStep.toLowerCase()}" — on cadence or on the upstream event, whichever lands first.` : 'On cadence.'}\n\n` +
        `## Steps\n\n` +
        t.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') +
        '\n\n' +
        `## Definition of done\n\n${lastStep ? `The run is complete when "${lastStep.toLowerCase()}" has verifiably happened and is logged to the run history.` : 'Logged to the run history.'}\n\n` +
        `## Escalation\n\nIf any step fails twice in a row, or the data looks wrong, stop and escalate to ${escalateTo}. Never fake a green run.\n\n` +
        `## Pillar\n\n${dept ? link(pillarSlugOf(dept)) : t.departmentId}\n`,
    });
  }

  // ── people ───────────────────────────────────────────────────────────────
  for (const p of [...people].sort((a, b) => a.id.localeCompare(b.id))) {
    const dept = deptById.get(p.departmentId);
    const task = taskByAssignee.get(`person:${p.id}`);
    docs.push({
      path: `people/${p.id}.md`,
      content:
        fm(p.name, 'person') +
        `# ${p.name}\n\n` +
        `${p.role} in ${dept ? link(pillarSlugOf(dept)) : p.departmentId}.\n\n` +
        `## Their job\n\n` +
        (task ? `${link(task.id)} — ${task.title}.\n` : 'No SOP assigned yet.\n') +
        `\n## Works with\n\n` +
        (p.tools.length ? p.tools.map((s) => `- ${link(s)}`).join('\n') + '\n' : 'No tools wired.\n'),
    });
  }

  // ── pillars ──────────────────────────────────────────────────────────────
  for (const d of [...departments].sort((a, b) => a.order - b.order)) {
    const deptAgents = agents.filter((a) => a.departmentId === d.id);
    const deptPeople = people.filter((p) => p.departmentId === d.id);
    const deptTasks = tasks.filter((t) => t.departmentId === d.id);
    docs.push({
      path: `org/${pillarSlugOf(d)}.md`,
      content:
        fm(d.name, 'pillar') +
        `# ${d.name}\n\n` +
        `${d.tagline}\n\n` +
        `## Roster\n\n` +
        [
          ...deptPeople.map((p) => `- ${link(p.id)} — ${p.role} (human)`),
          ...deptAgents.map((a) => `- ${link(a.id)} — ${a.role} (${a.tier})`),
        ].join('\n') +
        '\n\n' +
        `## SOPs\n\n` +
        (deptTasks.length
          ? deptTasks.map((t) => `- ${link(t.id)} — ${t.title}`).join('\n') + '\n'
          : 'No SOPs yet.\n'),
    });
  }

  return docs;
}

/**
 * Write docs under `rootDir`, creating folders as needed. Files that exist
 * WITHOUT the generated marker are hand-edited and are never overwritten.
 */
export function writeBrainDocs(docs: BrainDoc[], rootDir: string): { written: number; skipped: number } {
  let written = 0;
  let skipped = 0;
  for (const doc of docs) {
    const full = path.join(rootDir, doc.path);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (fs.existsSync(full)) {
      const existing = fs.readFileSync(full, 'utf8');
      if (!existing.includes(GENERATED_MARKER)) {
        skipped += 1;
        continue;
      }
    }
    fs.writeFileSync(full, doc.content);
    written += 1;
  }
  return { written, skipped };
}
