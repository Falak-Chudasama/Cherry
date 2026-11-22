import {
  CalendarCheck2,
  LayoutGrid,
  BookOpen,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react';

export interface NavRoute {
  to: string;
  label: string;
  keyIndex: number;
  icon: LucideIcon;
  isSecondary?: boolean;
}

/**
 * Single Canonical Source of Truth for Cherry Navigation & Page Order.
 * Minimalist Fruit navigation: Today & Quarter as primary tabs,
 * Notes and Chat as utility views.
 */
export const NAV_ROUTES: NavRoute[] = [
  { to: '/', label: 'Today', keyIndex: 1, icon: CalendarCheck2 },
  { to: '/quarter', label: 'Quarter', keyIndex: 2, icon: LayoutGrid },
  { to: '/notes', label: 'Notes', keyIndex: 3, icon: BookOpen, isSecondary: true },
  { to: '/chat', label: 'Chat', keyIndex: 4, icon: MessageSquare, isSecondary: true },
];

/**
 * Visual sequence for Apple-grade directional sliding transitions.
 * Today (0) <-> Quarter (1) <-> Notes (2) <-> Chat (3)
 */
export const ROUTE_ORDER: Record<string, number> = {
  '/': 0,
  '/day': 0,
  '/quarter': 1,
  '/notes': 2,
  '/chat': 3,
};

export const PRIMARY_NAV_PAGES = NAV_ROUTES.filter((r) => !r.isSecondary).map((r) => r.to);

export function normalizeNavPath(pathname: string): string {
  if (pathname === '/day') return '/';
  return pathname;
}
