import type { EffectiveAccess, Persona } from '@repo/contracts';
import { DemoStore } from '../../demo-store';
import { MockTransport } from '../../mock-transport';
import { ALL_PERSONAS } from '../../people';
import { LEADS } from '../../records';
import { effectiveAccessFor } from '../../tenant-directory';
import { PIPELINE_SECTION, type PipelineState } from './state';

/**
 * Test helpers for the Gate E.1 API tests: one demo session through the fail-closed mock transport as
 * a chosen persona, with an optional access override, extra test-only personas and the header project
 * filter. Test code only.
 */
const memory = () => {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

type AccessFor = (p: Persona) => EffectiveAccess | null;

export function crmSession(options: { accessFor?: AccessFor; personas?: readonly Persona[]; persona?: string } = {}) {
  const storage = memory();
  const demo = new DemoStore(storage);
  let personaId: string | null = options.persona ?? 'sales_manager';
  let projectId = 'all';
  let accessFor = options.accessFor;
  const t = new MockTransport({
    getContext: () => ({ personaId, projectId }),
    getMode: () => 'fast',
    demo,
    accessFor: (p) => (accessFor ? accessFor(p) : effectiveAccessFor(p)),
    ...(options.personas ? { personas: [...ALL_PERSONAS, ...options.personas] } : {}),
  });
  const api = {
    transport: t,
    as(id: string | null) {
      personaId = id;
      return api;
    },
    /** The header project filter ('all' or a project id). */
    project(id: string) {
      projectId = id;
      return api;
    },
    /** Changes the access of every later request (a narrowed or revoked grant takes effect at once). */
    access(next: AccessFor | undefined) {
      accessFor = next;
      return api;
    },
    get: <T>(path: string, query?: Record<string, string>) => t.request<T>({ method: 'GET', path, ...(query ? { query } : {}) }),
    post: <T>(path: string, body: unknown = {}, opts: { key?: string; training?: boolean } = {}) =>
      t.request<T>({ method: 'POST', path, body, ...(opts.key ? { idempotencyKey: opts.key } : {}), ...(opts.training ? { training: true } : {}) }),
    pipeline: () =>
      demo.partition('tnt_larkspur').section<PipelineState>(PIPELINE_SECTION, () => {
        throw new Error('pipeline state not created yet');
      }),
    /** Every Larkspur record the pipeline reads or writes, in memory and as saved: a refusal leaves both byte-identical. */
    snapshot: () => {
      const p = demo.partition('tnt_larkspur');
      return JSON.stringify({ pipeline: api.pipeline(), leads: p.leads(LEADS), stored: storage.data.get('demo:store:v2') ?? null, partitions: demo.partitionKeys() });
    },
  };
  return api;
}

export type CrmSession = ReturnType<typeof crmSession>;
