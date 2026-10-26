import type { AppId, Permission, Persona } from '@repo/contracts';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { readJson, writeJson } from '../lib/storage';

interface StoredSession {
  personaId: string | null;
  projectId: string;
}

export interface SessionContextValue {
  app: AppId;
  tenant: { id: string; name: string };
  personas: readonly Persona[];
  persona: Persona | null;
  signIn: (personaId: Persona['id']) => void;
  signOut: () => void;
  /** Header project context: 'all' or a project id inside the persona's scope. */
  projectId: string;
  setProjectId: (projectId: string) => void;
  can: (permission: Permission) => boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Simulated sign-in with fictional demo personas (prototype only). Permission checks here only
 * shape the UI; the mock transport enforces scope separately, as the real backend must.
 */
export function SessionProvider({
  app,
  tenant,
  personas,
  children,
}: {
  app: AppId;
  tenant: { id: string; name: string };
  personas: readonly Persona[];
  children: ReactNode;
}) {
  const key = `demo:session:${app}`;
  const [stored, setStored] = useState<StoredSession>(() => readJson(key, { personaId: null, projectId: 'all' }));

  const persist = useCallback(
    (next: StoredSession) => {
      writeJson(key, next);
      setStored(next);
    },
    [key],
  );

  const persona = personas.find((p) => p.id === stored.personaId && p.app === app) ?? null;

  const value = useMemo<SessionContextValue>(
    () => ({
      app,
      tenant,
      personas: personas.filter((p) => p.app === app),
      persona,
      signIn: (personaId) => persist({ personaId, projectId: 'all' }),
      signOut: () => persist({ personaId: null, projectId: 'all' }),
      projectId: stored.projectId,
      setProjectId: (projectId) => persist({ ...stored, projectId }),
      can: (permission) => persona?.permissions.includes(permission) ?? false,
    }),
    [app, tenant, personas, persona, stored, persist],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

export function useCan(): (permission: Permission) => boolean {
  return useSession().can;
}
