/**
 * Primary navigation for the investment company.
 * Keep this file minimal: only current or planned company modules belong here.
 */

import {
  Home,
  Users,
  ListChecks,
  Sparkles,
  Network,
  Brain,
  Plug,
  BarChart3,
  Workflow,
} from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
};

export const NAV_OPERATE: NavItem[] = [
  {
    href: '/',
    label: 'Home',
    icon: Home,
  },
  {
    href: '/workflows',
    label: 'Workflows',
    icon: Workflow,
  },
];

export const NAV_AGENTS: NavItem[] = [
  {
    href: '/agents',
    label: 'Agents',
    icon: Users,
  },
  {
    href: '/tasks',
    label: 'Tasks',
    icon: ListChecks,
  },
  {
    href: '/skills',
    label: 'Skills',
    icon: Sparkles,
  },
  {
    href: '/org',
    label: 'Org Chart',
    icon: Network,
  },
];

export const NAV_INTELLIGENCE: NavItem[] = [
  {
    href: '/brain',
    label: 'Startup Brain',
    icon: Brain,
  },
];

export const NAV_SYSTEM: NavItem[] = [
  {
    href: '/integrations',
    label: 'Connections',
    icon: Plug,
  },
  {
    href: '/analytics',
    label: 'Analytics',
    icon: BarChart3,
  },
];

export const NAV_LIBRARY: NavItem[] = [];

export const NAV_ORDER: string[] = [
  ...NAV_OPERATE,
  ...NAV_AGENTS,
  ...NAV_INTELLIGENCE,
  ...NAV_SYSTEM,
  ...NAV_LIBRARY,
].map((item) => item.href);

export const DIGIT_VIEWS: string[] = NAV_ORDER.slice(0, 9);