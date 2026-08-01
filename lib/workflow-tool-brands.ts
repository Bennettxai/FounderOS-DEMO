/**
 * Workflow step tools are stored as short ids ('ghl', 'calendar', 'gmail');
 * the map cards render them with the actual company logo. This is the id →
 * brand bridge: every id used by seeded workflows has an explicit entry
 * (enforced by tests/workflow-tool-brands.test.ts against hasBrandMark), and
 * unknown ids degrade to an identity that BrandLogo renders as a lettermark.
 * Pure data — safe to import anywhere; the logo rendering itself stays
 * server-side (BrandLogo pulls simple-icons, which must not enter the client
 * bundle).
 */

export type ToolBrand = { slug: string; name: string };

export const TOOL_BRANDS: Record<string, ToolBrand> = {
  arcads: { slug: 'arcads', name: 'Arcads' },
  attio: { slug: 'attio', name: 'Attio' },
  calendar: { slug: 'googlecalendar', name: 'Google Calendar' },
  ghl: { slug: 'gohighlevel', name: 'GoHighLevel' },
  gmail: { slug: 'gmail', name: 'Gmail' },
  manychat: { slug: 'manychat', name: 'ManyChat' },
  notion: { slug: 'notion', name: 'Notion' },
  'proposal-gen': { slug: 'proposal-gen', name: 'Proposal Generator' },
  skool: { slug: 'skool', name: 'Skool' },
  slack: { slug: 'slack', name: 'Slack' },
  trakyo: { slug: 'trakyo', name: 'Trakyo' },
  webinarjam: { slug: 'webinarjam', name: 'WebinarJam' },
  zernio: { slug: 'zernio', name: 'Zernio' },
};

export function toolBrand(toolId: string): ToolBrand {
  return TOOL_BRANDS[toolId] ?? { slug: toolId, name: toolId };
}
