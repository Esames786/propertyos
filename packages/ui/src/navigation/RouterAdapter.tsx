import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { RouterProvider as AriaRouterProvider } from 'react-aria-components';

export interface AppLocation {
  pathname: string;
  search: string;
  hash: string;
}

export interface NavigateOptions {
  replace?: boolean;
}

interface NavigationContextValue {
  navigate: (href: string, options?: NavigateOptions) => void;
  location: AppLocation;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

/**
 * Navigation seam (ADR-0001 §2.3). Components and pages never import a router: they use React
 * Aria links (which route through this provider) and the hooks below. Each app supplies the
 * implementation: React Router today; Inertia's router for the backoffice later.
 */
export function NavigationProvider({
  navigate,
  location,
  useHref,
  children,
}: NavigationContextValue & { useHref?: (href: string) => string; children: ReactNode }) {
  const value = useMemo(() => ({ navigate, location }), [navigate, location]);
  return (
    <NavigationContext.Provider value={value}>
      <AriaRouterProvider navigate={(href, options) => navigate(href, options as NavigateOptions | undefined)} useHref={useHref}>
        {children}
      </AriaRouterProvider>
    </NavigationContext.Provider>
  );
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used inside <NavigationProvider>');
  return ctx;
}

/** Reads and writes one search parameter (deep-linkable overlay, tab or filter state). */
export function useQueryParam(name: string): [string | null, (value: string | null, options?: NavigateOptions) => void] {
  const { location, navigate } = useNavigation();
  const value = new URLSearchParams(location.search).get(name);
  const setValue = useCallback(
    (next: string | null, options: NavigateOptions = { replace: true }) => {
      const params = new URLSearchParams(location.search);
      if (next === null) params.delete(name);
      else params.set(name, next);
      const search = params.toString();
      navigate(`${location.pathname}${search ? `?${search}` : ''}${location.hash}`, options);
    },
    [location, name, navigate],
  );
  return [value, setValue];
}

/**
 * Updates several search parameters in one navigation (e.g. a filter change that also resets the
 * page). Calling several `useQueryParam` setters in a row would each start from the same URL and
 * overwrite one another.
 */
export function useQueryParams(): (updates: Record<string, string | null>, options?: NavigateOptions) => void {
  const { location, navigate } = useNavigation();
  return useCallback(
    (updates, options = { replace: true }) => {
      const params = new URLSearchParams(location.search);
      for (const [name, value] of Object.entries(updates)) {
        if (value === null) params.delete(name);
        else params.set(name, value);
      }
      const search = params.toString();
      navigate(`${location.pathname}${search ? `?${search}` : ''}${location.hash}`, options);
    },
    [location, navigate],
  );
}
