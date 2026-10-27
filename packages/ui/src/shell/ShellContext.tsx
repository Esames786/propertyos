import { createContext, useContext, type ReactNode } from 'react';
import type { Destination, HelpKey, NavItem, ShellLinks } from './types';

/**
 * App-specific header pieces. The backoffice uses the defaults (project switcher, Quick create);
 * Platform HQ has no tenant project context and its own primary action.
 */
export interface ShellSlots {
  /** Header context control; undefined = the project switcher, null = none. */
  context?: ReactNode | null;
  /** Primary create action in its three placements; undefined = Quick create, null = none. */
  create?: { header: ReactNode; compact: ReactNode; fab: ReactNode } | null;
}

export interface ShellContextValue {
  appName: string;
  navItems: NavItem[];
  destinations: Destination[];
  links: ShellLinks;
  helpKey: HelpKey;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  slots: ShellSlots;
}

export const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be used inside an app shell');
  return ctx;
}
