import { ApiError, type EffectiveAccess, type EmployeesList, type ModuleKey, type Persona } from '@repo/contracts';
import { vi } from 'vitest';
import { DemoStore } from '../demo-store';
import { MockTransport } from '../mock-transport';
import { effectiveAccessFor } from '../tenant-directory';
import { HR_SECTION, type HrState } from './state';

/**
 * Test helpers for the Gate S.2a HR API tests (`hr.api.test.ts`, `hr.closure.api.test.ts`): one
 * demo session through the fail-closed mock transport, as a chosen persona, with an optional access
 * override (a narrower scope, a withdrawn module or permission, a suspended organisation). Test
 * code only: nothing in the apps imports it.
 */
const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

export const without = (...modules: ModuleKey[]) => (p: Persona): EffectiveAccess | null => {
  const a = effectiveAccessFor(p);
  return a ? { ...a, grants: a.grants.filter((g) => !modules.includes(g.module)) } : null;
};

export function session(options: { accessFor?: (p: Persona) => EffectiveAccess | null } = {}) {
  const demo = new DemoStore(memory());
  let personaId: string | null = 'alnoor_manager';
  const t = new MockTransport({ getContext: () => ({ personaId, projectId: 'all' }), getMode: () => 'fast', demo, ...(options.accessFor ? { accessFor: options.accessFor } : {}) });
  const ready = new MockTransport({ getContext: () => ({ personaId: 'alnoor_manager', projectId: 'all' }), getMode: () => 'fast', demo }).request({ method: 'POST', path: '/society/demo', body: { mode: 'collecting' } });
  const api = {
    as(id: string | null) {
      personaId = id;
      return api;
    },
    get: async <T>(path: string, query?: Record<string, string>) => (await ready, t.request<T>({ method: 'GET', path, ...(query ? { query } : {}) })),
    post: async <T>(path: string, body: unknown = {}) => (await ready, t.request<T>({ method: 'POST', path, body })),
    patch: async <T>(path: string, body: unknown = {}) => (await ready, t.request<T>({ method: 'PATCH', path, body })),
    /** The HR state of Al-Noor in this demo session (to check what is stored, or set up an edge case). */
    hr: () => demo.partition('tnt_alnoor').section<HrState>(HR_SECTION, () => {
      throw new Error('HR state not created yet');
    }),
    /** Another stored section of Al-Noor (the society's finance, to set up an S.1 edge case). */
    section: <T extends object>(name: string) => demo.partition('tnt_alnoor').section<T>(name, () => {
      throw new Error(`${name} not created yet`);
    }),
  };
  return api;
}

export type Session = ReturnType<typeof session>;

export const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return { status: e.problem.status, code: e.problem.code, fields: Object.keys(e.problem.errors ?? {}), errors: e.problem.errors ?? {} };
    throw e;
  }
  throw new Error('expected a refusal');
};

/** The wall clock in Pakistan on the demo's business date (the mock server reads it for "now"). */
export const at = (time: string, date = '2026-10-26') => vi.setSystemTime(new Date(`${date}T${time}:00+05:00`));

export const emp = async (api: Session, name: string) => (await api.as('alnoor_manager').get<EmployeesList>('/hr/employees', { status: 'all' })).items.find((e) => e.name === name)!;
