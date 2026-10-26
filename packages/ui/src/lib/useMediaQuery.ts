import { useSyncExternalStore } from 'react';

/** Subscribes to a CSS media query. Breakpoints match Tailwind: md = 48rem, lg = 64rem. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const BREAKPOINTS = {
  sm: '(min-width: 40rem)',
  md: '(min-width: 48rem)',
  lg: '(min-width: 64rem)',
} as const;

export const useIsDesktop = () => useMediaQuery(BREAKPOINTS.lg);
export const useIsTabletUp = () => useMediaQuery(BREAKPOINTS.md);
