import type { Permission } from '@repo/contracts';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  id: string;
  /** Translation key for the visible label. */
  labelKey: string;
  href: string;
  icon: LucideIcon;
  permission?: Permission;
  /** Path prefix that marks the item as current. */
  match?: string;
}

/** A screen reachable from Ctrl+K. */
export interface Destination {
  id: string;
  label: string;
  href: string;
  permission?: Permission;
  keywords?: string;
}

export type HelpKey = 'default' | 'lab' | 'forms' | 'tours' | 'preferences' | 'planned';

export interface ShellLinks {
  start: string;
  preferences: string;
  signIn: string;
  tourLibrary: string;
}
