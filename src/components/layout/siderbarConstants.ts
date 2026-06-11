import {
  Code2, Users, Server, LineChart, Building2,
  Database, Globe, Briefcase, Zap, Package,
  BarChart2, Monitor, Cpu, Layers, GitBranch,
  Target, Inbox, UserCheck, LayoutGrid,
  type LucideIcon,
} from 'lucide-react';

export const TEAM_ICON_MAP: Record<string, LucideIcon> = {
  Code2, Users, Server, LineChart, Building2,
  Database, Globe, Briefcase, Zap, Package,
  BarChart2, Monitor, Cpu, Layers, GitBranch,
  Target, Inbox, UserCheck, LayoutGrid,
};

export function getTeamIcon(iconName: string | null | undefined): LucideIcon {
  return TEAM_ICON_MAP[iconName ?? ''] ?? LayoutGrid;
}

export function teamColors(hex: string) {
  return { dot: hex, glow: `${hex}47`, border: `${hex}A6` };
}

export function teamSidebarColors(hex: string) {
  return { dot: '#ffffff', glow: `${hex}47`, border: `${hex}A6` };
}