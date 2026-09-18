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
  adsmith: { slug: 'adsmith', name: 'Adsmith' },
  ledger: { slug: 'ledger', name: 'Ledger' },
  calendar: { slug: 'googlecalendar', name: 'Google Calendar' },
  ghl: { slug: 'gohighlevel', name: 'GoHighLevel' },
  gmail: { slug: 'gmail', name: 'Gmail' },
  dmflow: { slug: 'dmflow', name: 'DMFlow' },
  notion: { slug: 'notion', name: 'Notion' },
  'proposal-gen': { slug: 'proposal-gen', name: 'Proposal Generator' },
  skool: { slug: 'skool', name: 'Skool' },
  slack: { slug: 'slack', name: 'Slack' },
  trakyo: { slug: 'trakyo', name: 'Trakyo' },
  postly: { slug: 'postly', name: 'Postly' },
  camera: { slug: 'camera', name: 'Camera' },
  gsend: { slug: 'gsend', name: 'gsend' },
  instagram: { slug: 'instagram', name: 'Instagram' },
  linkedin: { slug: 'linkedin', name: 'LinkedIn' },
  premiere: { slug: 'premiere', name: 'Premiere Pro' },
  telegram: { slug: 'telegram', name: 'Telegram' },
  youtube: { slug: 'youtube', name: 'YouTube' },
};

export function toolBrand(toolId: string): ToolBrand {
  return TOOL_BRANDS[toolId] ?? { slug: toolId, name: toolId };
}
