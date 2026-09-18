import { getDb } from '@/lib/data';
import { compileBlueprint } from '@/lib/blueprint/compile';
import { BlueprintCanvasLazy } from '@/components/blueprint/BlueprintCanvasLazy';

export const dynamic = 'force-dynamic';

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Blueprint: the system, drawn from itself. compileBlueprint assembles
 * the graph from the live registries on every request; the workspace reads
 * that graph as machines → groups → things, so the subline's counts and the
 * map itself genuinely change when the system does.
 */
export default async function BlueprintPage() {
  const graph = await compileBlueprint(getDb());
  const count = (kind: string) => graph.nodes.filter((n) => n.kind === kind).length;
  const subline = `${graph.nodes.length} components · ${count('agent')} agents · ${count('daemon')} daemons · ${count('host')} machines · compiled ${relativeTime(graph.compiledAt)}`;
  return <BlueprintCanvasLazy graph={graph} subline={subline} />;
}
