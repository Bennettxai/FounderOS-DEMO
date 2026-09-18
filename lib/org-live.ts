import type { PaperclipAgent } from '@/lib/connectors/paperclip';

/**
 * /org live overlay — matches the Paperclip board's agents onto the OS's
 * pillar structure by NAME (the department leads on the board were created
 * with the pillar names: Sales, Marketing/Growth, TECH, Finances,
 * Communications). The /org markup stays frozen; this only decides which
 * existing nodes wear a live status.
 */
export type LiveOrgOverlay = {
  conductor: PaperclipAgent | null;
  /** department id → its live board lead (only where a name matches) */
  byDepartment: Record<string, PaperclipAgent>;
  /** board agents with no pillar slot (Forge, Hermes Workers, …) */
  extras: PaperclipAgent[];
};

export function overlayLiveOrg(
  departments: { id: string; name: string }[],
  liveAgents: PaperclipAgent[],
): LiveOrgOverlay {
  const byName = new Map(departments.map((d) => [d.name.toLowerCase(), d.id]));
  const byDepartment: Record<string, PaperclipAgent> = {};
  let conductor: PaperclipAgent | null = null;
  const extras: PaperclipAgent[] = [];
  for (const agent of liveAgents) {
    const key = agent.name.toLowerCase();
    if (key === 'conductor') {
      conductor = agent;
    } else {
      const deptId = byName.get(key);
      if (deptId) byDepartment[deptId] = agent;
      else extras.push(agent);
    }
  }
  return { conductor, byDepartment, extras };
}

/** Status → dot classes for the live chip (matches the terminal design system). */
export const LIVE_DOT: Record<PaperclipAgent['status'], string> = {
  running: 'bg-os-ok animate-pulse',
  idle: 'bg-os-muted',
  paused: 'bg-os-warn',
  error: 'bg-os-err',
};
