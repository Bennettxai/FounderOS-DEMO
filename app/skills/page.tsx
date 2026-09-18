import { getDb } from '@/lib/data';
import { PageHeader } from '@/components/PageHeader';
import { SkillsGrid, type SkillCard } from '@/components/SkillsGrid';
import { readPluginSkills, readUserSkills } from '@/lib/skills-catalog';
import { Rise } from '@/components/motion';

export const dynamic = 'force-dynamic';

const truncate = (t: string, n = 110) => (t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, '')}…` : t);

export default function SkillsPage() {
  // All three catalogs on one wall: the real Claude Code skills read live
  // from disk (the local skills directory plus every installed plugin's
  // skills; SKILL.md loads on demand via /api/skills/[slug]) alongside the
  // operator skill cards that have always lived in this section.
  const real = [...readUserSkills(), ...readPluginSkills()];
  const realCards: SkillCard[] = real.map((s) => ({
    id: s.slug,
    name: s.name,
    group: s.group,
    kind: 'claude' as const,
    description: truncate(s.description),
    meta: s.path,
    filePath: s.path,
  }));

  const db = getDb();
  const agentNames = Object.fromEntries(db.agents.all().map((a) => [a.id, a.name]));
  const operatorCards: SkillCard[] = db.skills.all().map((s) => ({
    id: s.id,
    name: s.name,
    group: `Operator · ${s.category}`,
    kind: 'operator' as const,
    description: truncate(s.description),
    meta: s.ownerAgentId ? (agentNames[s.ownerAgentId] ?? s.ownerAgentId) : 'unassigned',
    filePath: `skills/${s.id}/SKILL.md`,
    status: s.status,
    markdown: s.markdown,
  }));

  const cards = [...realCards, ...operatorCards];
  const sourceNote =
    real.length > 0
      ? `${real.length} skills live from the local skills directory (user + plugins) + ${operatorCards.length} operator skills · open any card to read or download its SKILL.md.`
      : `${operatorCards.length} operator skills (no local skills directory on this machine) · open any card to read or download its SKILL.md.`;

  return (
    <div>
      <PageHeader eyebrow="capability library" title="Skills" />
      <Rise i={1}>
        <SkillsGrid cards={cards} sourceNote={sourceNote} />
      </Rise>
    </div>
  );
}
