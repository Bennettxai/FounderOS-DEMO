/**
 * Single source of truth for the app's primary navigation. The Sidebar renders
 * these groups in order; the CommandPalette derives its digit (1–9) shortcuts
 * from the same visible order, so the two can never drift apart again.
 */
import {
  Home,
  MessageSquare,
  Share2,
  Clapperboard,
  Handshake,
  Users,
  ListChecks,
  Sparkles,
  Network,
  Brain,
  Wallet,
  Filter,
  Workflow,
  Map,
  Plug,
  BarChart3,
  LayoutGrid,
  Layers,
  Stethoscope,
  CandlestickChart,
  MessagesSquare,
  Gauge,
  Crosshair,
  Waypoints,
} from 'lucide-react';

export type NavItem = { href: string; label: string; icon: typeof Home };

export const NAV_OPERATE: NavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/comms', label: 'Comms', icon: MessageSquare },
  { href: '/funnel', label: 'Funnel', icon: Filter },
  { href: '/workflows', label: 'Workflows', icon: Workflow },
  { href: '/social', label: 'Social', icon: Share2 },
  { href: '/content', label: 'Content', icon: Clapperboard },
  { href: '/brand-deals', label: 'Brand Deals', icon: Handshake },
  { href: '/finances', label: 'Finances', icon: Wallet },
  { href: '/trading', label: 'Trading', icon: CandlestickChart },
  // Slab import: last in Operate on purpose, outside the nine digit shortcuts.
  { href: '/adpilot', label: 'AdPilot', icon: Crosshair },
];

// The agent workforce: the roster and the org chart that maps how they report.
export const NAV_AGENTS: NavItem[] = [
  { href: '/agents', label: 'Agents', icon: Users },
  { href: '/chats', label: 'Chats', icon: MessagesSquare },
  { href: '/tasks', label: 'Tasks', icon: ListChecks },
  { href: '/skills', label: 'Skills', icon: Sparkles },
  { href: '/org', label: 'Org Chart', icon: Network },
  // Slab import: the system drawn from its own registries.
  { href: '/blueprint', label: 'Blueprint', icon: Waypoints },
];

// The knowledge layer the agents draw on. G-Brain is the pure knowledge
// graph; Doctor holds the engine's health readouts (pillar health, doctor,
// storage layers, pipeline, query path) so the graph tab stays a single view.
export const NAV_INTELLIGENCE: NavItem[] = [
  { href: '/brain', label: 'G-Brain', icon: Brain },
  { href: '/doctor', label: 'Doctor', icon: Stethoscope },
];

export const NAV_SYSTEM: NavItem[] = [
  { href: '/integrations', label: 'Connections', icon: Plug },
  { href: '/usage', label: 'Usage', icon: Gauge },
  { href: '/roadmap', label: 'Roadmap', icon: Map },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/reference', label: 'Reference Model', icon: LayoutGrid },
];

// At the very bottom: persona templates that can run variants of this platform.
export const NAV_LIBRARY: NavItem[] = [{ href: '/personas', label: 'Personas', icon: Layers }];

/** Visible top-to-bottom order across all groups. */
export const NAV_ORDER: string[] = [
  ...NAV_OPERATE,
  ...NAV_AGENTS,
  ...NAV_INTELLIGENCE,
  ...NAV_SYSTEM,
  ...NAV_LIBRARY,
].map((n) => n.href);

/** Digit keys 1–9 jump to the first nine views in visible order. */
export const DIGIT_VIEWS: string[] = NAV_ORDER.slice(0, 9);
