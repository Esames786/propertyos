import { createContext, useContext } from 'react';
import type { Destination, HelpKey, NavItem, ShellLinks } from './types';

export interface ShellContextValue {
  appName: string;
  navItems: NavItem[];
  destinations: Destination[];
  links: ShellLinks;
  helpKey: HelpKey;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
}

export const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be used inside an app shell');
  return ctx;
}
