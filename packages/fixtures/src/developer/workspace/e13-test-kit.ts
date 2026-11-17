import { ApiError, type EffectiveAccess, type Permission, type Persona } from '@repo/contracts';
import { DEMO_STORE_KEY, DemoStore } from '../../demo-store';
import { MockTransport } from '../../mock-transport';
import { ALL_PERSONAS } from '../../people';
import { effectiveAccessFor } from '../../tenant-directory';
import { DOC_SECTION, type DocumentsState } from '../documents/state';
import { WS_SECTION } from './store';

/**
 * Test helpers for the Gate E.13 API tests: one demo session through the fail-closed mock transport,
 * as a chosen persona (and sign-in session, project context and app), with an optional access
 * override (a narrowed scope, a withdrawn module, an extra or missing permission). Test code only.
 */
const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

type AccessFor = (p: Persona) => EffectiveAccess | null;

export const plus = (...permissions: Permission[]) => (a: EffectiveAccess): EffectiveAccess => ({ ...a, permissions: [...a.permissions, ...permissions] });
export const minus = (...permissions: Permission[]) => (a: EffectiveAccess): EffectiveAccess => ({ ...a, permissions: a.permissions.filter((x) => !permissions.includes(x)) });
export const sitesOnly = (...ids: string[]) => (a: EffectiveAccess): EffectiveAccess => ({ ...a, scopes: [{ type: 'site', ids }] });
export const withoutModules = (...modules: string[]) => (a: EffectiveAccess): EffectiveAccess => ({ ...a, grants: a.grants.filter((g) => !modules.includes(g.module)) });

export function e13Session(start = 'manager') {
  const storage = memory();
  const demo = new DemoStore(storage);
  const ctx = { personaId: start as string | null, projectId: 'all', sessionId: null as string | null, app: 'backoffice' as 'backoffice' | 'customer' };
  /** Access changes by persona id, applied on every request (a revocation takes effect at once). */
  const changes = new Map<string, (a: EffectiveAccess) => EffectiveAccess>();
  const accessFor: AccessFor = (p) => {
    const a = effectiveAccessFor(p);
    const change = changes.get(p.id);
    return a && change ? change(a) : a;
  };
  const t = new MockTransport({ getContext: () => ({ personaId: ctx.personaId, projectId: ctx.projectId, ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}), app: ctx.app }), getMode: () => 'fast', demo, accessFor, personas: ALL_PERSONAS });
  const api = {
    t,
    as(id: string | null, session?: string) {
      ctx.personaId = id;
      ctx.sessionId = session ?? null;
      return api;
    },
    project(id: string) {
      ctx.projectId = id;
      return api;
    },
    app(app: 'backoffice' | 'customer') {
      ctx.app = app;
      return api;
    },
    change(personaId: string, f: ((a: EffectiveAccess) => EffectiveAccess) | null) {
      if (f) changes.set(personaId, f);
      else changes.delete(personaId);
      return api;
    },
    get: <T>(path: string, query?: Record<string, string>) => t.request<T>({ method: 'GET', path, ...(query ? { query } : {}) }),
    post: <T>(path: string, body: unknown = {}, key?: string) => t.request<T>({ method: 'POST', path, body, ...(key ? { idempotencyKey: key } : {}) }),
    del: <T>(path: string) => t.request<T>({ method: 'DELETE', path }),
    /** The organisation's documents state (created by the first documents request). */
    docs: (tenant = 'tnt_larkspur') => demo.partition(tenant).section<DocumentsState>(DOC_SECTION, () => {
      throw new Error('documents state not created yet');
    }),
    /**
     * Everything a refusal must leave untouched: the stored demo session (what a reload sees), the
     * documents and workspace sections in memory, and the partitions in use.
     */
    snapshot: (tenant = 'tnt_larkspur') => {
      const p = demo.partition(tenant);
      return JSON.stringify({
        stored: storage.getItem(DEMO_STORE_KEY),
        docs: p.section(DOC_SECTION, () => ({ none: true })),
        ws: p.section(WS_SECTION, () => ({ none: true })),
        partitions: demo.partitionKeys(),
      });
    },
  };
  return api;
}

export type E13Session = ReturnType<typeof e13Session>;

export const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return { status: e.problem.status, code: e.problem.code, messageKey: e.problem.messageKey, fields: Object.keys(e.problem.errors ?? {}), errors: e.problem.errors ?? {} };
    throw e;
  }
  throw new Error('expected a refusal');
};

/** A tiny demo file as the browser's FileReader would send it. */
export function demoFile(text = 'Fictional demo document', mimeType = 'text/plain', fileName = 'demo-note.txt') {
  const bytes = Buffer.from(text, 'utf8');
  return { fileName, mimeType, sizeBytes: bytes.length, content: `data:${mimeType};base64,${bytes.toString('base64')}` };
}

/** Strings that belong to Larkspur Gardens documents and templates only: a Heights-only reader never receives one. */
export const GARDENS_ONLY = [
  'doc_lsp_0004', 'DOC-LSP-0004', 'LG-master-plan', 'Revised plot sizes', 'Block C road widened',
  'doc_lsp_0005', 'DOC-LSP-0005', 'LG-cda-layout-approval', 'Capital Development Authority',
  'doc_lsp_0008', 'DOC-LSP-0008', 'LG-P1-002-possession', 'Boundary pillars to verify',
  'doc_lsp_0011', 'DOC-LSP-0011', 'hina-chaudhry-cnic', 'Gardens enquiry: identity copy',
  'doc_lsp_0012', 'DOC-LSP-0012', 'haris-sheikh-visit-feedback', 'corner plot in Phase 2',
  'doc_lsp_0014', 'DOC-LSP-0014', 'fatima-siddiqui-passport', 'Overseas buyer: Gardens only',
  'dtp_lsp_004', 'TPL-LSP-004', 'Plot handover checklist', 'CDA boundary marker', 'Road access confirmed',
  'prj_gardens', 'Larkspur Gardens',
] as const;
