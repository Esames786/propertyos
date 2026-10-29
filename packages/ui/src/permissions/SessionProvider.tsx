import { decideTarget, type AccessDecision, type AccessTarget, type AppId, type EffectiveAccess, type Permission, type Persona } from '@repo/contracts';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { readJson, removeKey, writeJson } from '../lib/storage';

/** A random, unguessable session id for this sign-in (prototype; the server issues it in production). */
const newSessionId = () => `ses_${globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 20) ?? Math.random().toString(36).slice(2)}`;

interface StoredSession {
  personaId: string | null;
  projectId: string;
  /** Gate D.1: this sign-in's session (a new one each time someone signs in). */
  sessionId?: string;
  /** Site of the header project, when one is chosen (site-level licensing applies to it). */
  siteId?: string;
}

/** Why this browser was signed out without asking (shown once on the sign-in page). */
export interface SignOutNotice {
  reason: 'session_ended' | 'portal_access_revoked' | 'switched_app';
  at: string;
}

export interface SessionTenant {
  id: string;
  name: string;
}

export interface SessionContextValue {
  app: AppId;
  /** The signed-in person's tenant (or the app's default tenant before sign-in). */
  tenant: SessionTenant;
  /** Every tenant whose people can sign in to this app. */
  tenants: readonly SessionTenant[];
  personas: readonly Persona[];
  persona: Persona | null;
  signIn: (personaId: Persona['id']) => void;
  /** Sign out of this browser; a notice explains a sign-out the person did not ask for. */
  signOut: (notice?: SignOutNotice) => void;
  /** This browser's session (null before sign-in; absent for a sign-in made before Gate D.1). */
  sessionId: string | null;
  /** The last sign-out the person did not ask for, until it has been shown. */
  notice: SignOutNotice | null;
  clearNotice: () => void;
  /** Someone has signed in to this app in this browser before (returning visitors skip Get started). */
  returning: boolean;
  /** Header project context: 'all' or a project id inside the persona's scope. */
  projectId: string;
  /** The site of the header project (undefined for 'all'); menus and addresses are checked against it. */
  siteId: string | undefined;
  setProjectId: (projectId: string, siteId?: string) => void;
  /** Effective access (tenant lifecycle, licensed modules, permissions); null when the app has no tenant plane. */
  access: EffectiveAccess | null;
  /** Holds the permission AND its module is licensed for the tenant. */
  can: (permission: Permission) => boolean;
  /** A menu item, action, link or tour step is available (same layers as the API). */
  allows: (target: AccessTarget) => boolean;
  /** Why a target is or is not available (for access-outcome pages). */
  decide: (target: AccessTarget) => AccessDecision;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Simulated sign-in with fictional demo personas (prototype only). What this offers only shapes the
 * UI; the mock transport enforces the same rules separately, as the real backend must.
 *
 * With `accessFor`, every check also asks whether the person's organisation has licensed the module
 * (V3.1 effective access): a role can never open a module its tenant has not licensed.
 */
export function SessionProvider({
  app,
  tenant: defaultTenant,
  tenants: tenantList,
  personas,
  accessFor,
  accessDate,
  children,
}: {
  app: AppId;
  tenant: SessionTenant;
  /** Tenants whose people can sign in here; the session's tenant follows the signed-in persona. */
  tenants?: readonly SessionTenant[];
  personas: readonly Persona[];
  accessFor?: (persona: Persona) => EffectiveAccess | null;
  /** Evaluation date (ISO) for effective-dated grants; defaults to today. */
  accessDate?: string;
  children: ReactNode;
}) {
  const key = `demo:session:${app}`;
  const returningKey = `demo:returning:${app}`;
  const noticeKey = `demo:signout-notice:${app}`;
  const [notice, setNotice] = useState<SignOutNotice | null>(() => readJson<SignOutNotice | null>(noticeKey, null));
  const [stored, setStored] = useState<StoredSession>(() => readJson(key, { personaId: null, projectId: 'all' }));
  const [returning, setReturning] = useState(() => readJson<{ returning: boolean }>(returningKey, { returning: false }).returning || stored.personaId !== null);

  const persist = useCallback(
    (next: StoredSession) => {
      writeJson(key, next);
      setStored(next);
    },
    [key],
  );

  const persona = personas.find((p) => p.id === stored.personaId && p.app === app) ?? null;
  const tenants = useMemo(() => tenantList ?? [defaultTenant], [tenantList, defaultTenant]);
  const tenant = (persona && tenants.find((t) => t.id === persona.tenantId)) || defaultTenant;
  const access = useMemo(() => (persona && accessFor ? accessFor(persona) : null), [persona, accessFor]);

  const value = useMemo<SessionContextValue>(() => {
    const at = accessDate ?? new Date().toISOString().slice(0, 10);
    const decide = (target: AccessTarget): AccessDecision => {
      if (!persona) return { allowed: false, reason: 'permission_missing' };
      // With a project chosen in the header, its site must be licensed for what is offered.
      if (access) return decideTarget(access, { ...(stored.siteId ? { siteId: stored.siteId } : {}), ...target }, at);
      // No tenant plane (e.g. Platform HQ): permissions alone.
      const required: readonly Permission[] = target.permission === undefined ? [] : Array.isArray(target.permission) ? target.permission : [target.permission as Permission];
      const anyOf = target.anyOf ?? [];
      return required.every((p) => persona.permissions.includes(p)) && (!anyOf.length || anyOf.some((p) => persona.permissions.includes(p))) ? { allowed: true } : { allowed: false, reason: 'permission_missing' };
    };
    const allows = (target: AccessTarget) => decide(target).allowed;
    return {
      app,
      tenant,
      tenants,
      personas: personas.filter((p) => p.app === app),
      persona,
      signIn: (personaId) => {
        writeJson(returningKey, { returning: true });
        setReturning(true);
        persist({ personaId, projectId: 'all', sessionId: newSessionId() });
      },
      returning,
      signOut: (why) => {
        if (why) {
          writeJson(noticeKey, why);
          setNotice(why);
        }
        persist({ personaId: null, projectId: 'all' });
      },
      sessionId: stored.personaId ? (stored.sessionId ?? null) : null,
      notice,
      clearNotice: () => {
        removeKey(noticeKey);
        setNotice(null);
      },
      projectId: stored.projectId,
      siteId: stored.siteId,
      setProjectId: (projectId, siteId) => persist({ personaId: stored.personaId, projectId, ...(stored.sessionId ? { sessionId: stored.sessionId } : {}), ...(siteId ? { siteId } : {}) }),
      access,
      can: (permission) => allows({ permission }),
      allows,
      decide,
    };
  }, [app, tenant, tenants, personas, persona, stored, persist, returning, returningKey, access, accessDate, notice, noticeKey]);

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
