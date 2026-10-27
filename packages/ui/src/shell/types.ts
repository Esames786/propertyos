import type { ModuleKey, Permission, SuspensionClass } from '@repo/contracts';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  id: string;
  /** Translation key for the visible label. */
  labelKey: string;
  href: string;
  icon: LucideIcon;
  permission?: Permission;
  /** Module that must be licensed (defaults to the permission's module). */
  module?: ModuleKey;
  /** Offered while the organisation is suspended only when 'history_read' (operational by default). */
  suspension?: SuspensionClass;
  /** Path prefix that marks the item as current. */
  match?: string;
  /** Current only on exactly this path (a start page whose path prefixes every other page). */
  exact?: boolean;
  /** Rail section; items without a group render first, unlabelled. */
  group?: NavGroup;
  /** Offered in the phone bottom bar (first four the persona may use). */
  bottomBar?: boolean;
}

export type NavGroup = 'workspace' | 'operations' | 'insights' | 'support' | 'prototype';

/** A screen reachable from Ctrl+K. */
export interface Destination {
  id: string;
  label: string;
  href: string;
  /** 'history_read' when it stays open while the organisation is suspended. */
  suspension?: SuspensionClass;
  permission?: Permission;
  module?: ModuleKey;
  keywords?: string;
}

export type HelpKey = 'default' | 'lab' | 'forms' | 'tours' | 'preferences' | 'planned';

export interface ShellLinks {
  start: string;
  preferences: string;
  signIn: string;
  tourLibrary: string;
  /** Phone "More" page (all areas and settings); the bottom bar links here. */
  more?: string;
  /** "My access": what the signed-in person can use (tenant workspace only). */
  myAccess?: string;
}
