import { ApiError, decide, PERMISSION_MODULE, type AccessDecision, type ApiRequest, type ApiTransport, type EffectiveAccess, type Permission, type Persona } from '@repo/contracts';
import type { TenantDataset } from './dataset-types';
import { datasetFor } from './datasets';
import { DemoStore, VISITOR_PARTITION } from './demo-store';
import { HANDLERS, type Handler, type HandlerAccess, type HandlerContext } from './handlers';
import { refused } from './handler-types';
import { PERSONAS } from './people';
import { ACCESS_TODAY, effectiveAccessFor } from './tenant-directory';
import { createRandom } from './seed';
import { TrainingStore } from './training-store';

export type MockMode = 'normal' | 'fast' | 'slow' | 'error' | 'offline';
export const MOCK_MODES: readonly MockMode[] = ['normal', 'fast', 'slow', 'error', 'offline'];

export interface MockContext {
  personaId: string | null;
  /** Selected project context in the header, or 'all'. */
  projectId: string;
}

export interface MutationLogEntry {
  at: string;
  method: string;
  path: string;
  training: boolean;
  idempotencyKey?: string;
}

interface MockTransportOptions {
  getContext: () => MockContext;
  getMode?: () => MockMode;
  seed?: number;
  /** Session overlay; defaults to one persisted in sessionStorage (tests may inject a fresh one). */
  demo?: DemoStore;
  /** Tests only: other identities, effective access or endpoints than the fixtures'. */
  personas?: readonly Persona[];
  accessFor?: (persona: Persona) => EffectiveAccess | null;
  handlers?: readonly Handler[];
}

let correlation = 0;
const nextCorrelationId = () => `demo-${(++correlation).toString(36).padStart(5, '0')}`;

/** Records a visitor (no identity) may touch: none. */
const NO_RECORDS: TenantDataset = { tenantId: '', projects: [], towers: [], floors: [], blocks: [], units: [], parties: [], leads: [], invoices: [], visits: [], notifications: [], partyLinks: [], refs: { party: '', lead: '', city: '' } };

/**
 * Whether the caller may use an endpoint at all: the declared module (and the module of each
 * permission) licensed and in force, the tenant's lifecycle allowing the suspension class, and the
 * permission held. Same layers as `decide`; the first refusal is returned.
 */
export function decideEndpoint(access: EffectiveAccess, declared: Extract<HandlerAccess, { kind: 'tenant' }>, at: string): AccessDecision {
  const base = { at, suspension: declared.suspension } as const;
  if (declared.permission === 'signed_in') return decide(access, { module: declared.module, ...base });
  const options: readonly Permission[] = typeof declared.permission === 'string' ? [declared.permission] : declared.permission;
  let first: AccessDecision | undefined;
  for (const permission of options) {
    const own = PERMISSION_MODULE[permission];
    const decision = [decide(access, { module: declared.module, permission, ...base }), ...(own && own !== declared.module ? [decide(access, { module: own, permission, ...base })] : [])].find((d) => !d.allowed) ?? { allowed: true as const };
    if (decision.allowed) return decision;
    first ??= decision;
  }
  return first ?? { allowed: false, reason: 'permission_missing' };
}

/**
 * In-process stand-in for the future Laravel API (ADR-0001 §2.6). Deterministic latency so
 * skeletons and spinners are real. Fail closed (CP2 security correction 1): every endpoint declares
 * its access, a request without an identity is refused with 401, an identity without effective
 * access with 403, and the declared module, permission and suspension class are checked before the
 * handler runs, so a refused request reads and changes nothing. Handlers then see only the caller's
 * own tenant records and demo partition. Every mutation is logged; training writes go to an
 * isolated store and can never reach normal data.
 */
export class MockTransport implements ApiTransport {
  readonly mutationLog: MutationLogEntry[] = [];
  readonly demo: DemoStore;
  private readonly trainings = new Map<string, TrainingStore>();
  private readonly random;
  private readonly options: MockTransportOptions;

  constructor(options: MockTransportOptions) {
    this.options = options;
    this.random = createRandom(options.seed ?? 1);
    this.demo = options.demo ?? new DemoStore();
  }

  /** Practice records of the current identity's organisation (each tenant has its own). */
  get training(): TrainingStore {
    return this.trainingFor(this.persona()?.tenantId ?? VISITOR_PARTITION);
  }

  private trainingFor(key: string): TrainingStore {
    let store = this.trainings.get(key);
    if (!store) this.trainings.set(key, (store = new TrainingStore()));
    return store;
  }

  async request<T>(req: ApiRequest): Promise<T> {
    const mode = this.options.getMode?.() ?? 'normal';
    await this.delay(mode, req.signal);
    if (mode === 'offline') {
      throw new ApiError({ status: 0, code: 'offline', messageKey: 'errors:network.offline', correlationId: nextCorrelationId(), changed: false });
    }
    if (mode === 'error') {
      throw new ApiError({ status: 503, code: 'service_unavailable', messageKey: 'errors:network.unavailable', correlationId: nextCorrelationId(), changed: false });
    }

    const correlationId = nextCorrelationId();
    if (req.method !== 'GET') {
      this.mutationLog.push({
        at: new Date().toISOString(),
        method: req.method,
        path: req.path,
        training: req.training === true,
        ...(req.idempotencyKey ? { idempotencyKey: req.idempotencyKey } : {}),
      });
    }

    for (const handler of this.options.handlers ?? HANDLERS) {
      if (handler.method !== req.method) continue;
      const match = handler.pattern.exec(req.path);
      if (!match) continue;
      const ctx = this.authorize(handler, correlationId);
      return handler.handle({ ...ctx, req, params: match.groups ?? {} }) as T;
    }
    throw new ApiError({ status: 404, code: 'not_found', messageKey: 'errors:api.notFound', correlationId, changed: false });
  }

  private readonly resetDemo = () => {
    this.demo.reset();
    this.trainings.clear();
  };

  /** Mutations that were not training writes; practice tasks must leave this unchanged. */
  liveMutations(): MutationLogEntry[] {
    return this.mutationLog.filter((m) => !m.training);
  }

  private persona(): Persona | undefined {
    const { personaId } = this.options.getContext();
    return (this.options.personas ?? PERSONAS).find((p) => p.id === personaId);
  }

  /** The gate in front of every handler; returns the context it may use, or throws the refusal. */
  private authorize(handler: Handler, correlationId: string): Omit<HandlerContext, 'req' | 'params'> {
    const { projectId } = this.options.getContext();
    const persona = this.persona();
    const declared = handler.access;

    if (declared.kind === 'visitor') {
      return {
        persona: undefined, tenantId: undefined, access: null, data: NO_RECORDS, allowsProject: () => false,
        at: ACCESS_TODAY, suspension: 'operational', correlationId,
        training: this.trainingFor(VISITOR_PARTITION), demo: this.demo.partition(VISITOR_PARTITION), resetDemo: this.resetDemo,
      };
    }
    if (!persona) {
      throw new ApiError({ status: 401, code: 'unauthenticated', messageKey: 'errors:api.unauthenticated', correlationId, changed: false });
    }
    const access = (this.options.accessFor ?? effectiveAccessFor)(persona);
    const data = datasetFor(persona.tenantId);
    if (!access || !data || access.tenant.id !== persona.tenantId) {
      throw new ApiError({ status: 403, code: 'no_effective_access', messageKey: 'errors:access.no_effective_access', correlationId, changed: false });
    }
    const decision = decideEndpoint(access, declared, ACCESS_TODAY);
    if (!decision.allowed) refused(decision, correlationId);

    const scope = persona.projectScope;
    return {
      persona,
      tenantId: persona.tenantId,
      access,
      data,
      allowsProject: (id) => (scope === 'all' || scope.includes(id)) && (projectId === 'all' || projectId === id),
      at: ACCESS_TODAY,
      suspension: declared.suspension,
      correlationId,
      training: this.trainingFor(persona.tenantId),
      demo: this.demo.partition(persona.tenantId),
      resetDemo: this.resetDemo,
    };
  }

  private delay(mode: MockMode, signal?: AbortSignal): Promise<void> {
    const ms =
      mode === 'fast' ? 0 : mode === 'slow' ? 1500 + this.random.int(0, 1500) : 150 + this.random.int(0, 450);
    if (ms === 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      });
    });
  }
}
