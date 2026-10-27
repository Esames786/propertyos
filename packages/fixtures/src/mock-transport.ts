import { ApiError, decide, denyStatus, type ApiRequest, type ApiTransport, type Persona } from '@repo/contracts';
import { DemoStore } from './demo-store';
import { HANDLERS, type HandlerContext } from './handlers';
import { findPersona, TENANT } from './people';
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
}

let correlation = 0;
const nextCorrelationId = () => `demo-${(++correlation).toString(36).padStart(5, '0')}`;

/**
 * In-process stand-in for the future Laravel API (ADR-0001 §2.6). Deterministic latency so
 * skeletons and spinners are real; persona scope is enforced here, before the UI sees data,
 * mirroring how the backend must enforce it. Every mutation is logged; training writes go to
 * an isolated store and can never reach normal data.
 */
export class MockTransport implements ApiTransport {
  readonly mutationLog: MutationLogEntry[] = [];
  readonly training = new TrainingStore();
  readonly demo: DemoStore;
  private readonly random;
  private readonly options: MockTransportOptions;

  constructor(options: MockTransportOptions) {
    this.options = options;
    this.random = createRandom(options.seed ?? 1);
    this.demo = options.demo ?? new DemoStore();
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

    const ctx = this.context();
    if (req.method !== 'GET') {
      this.mutationLog.push({
        at: new Date().toISOString(),
        method: req.method,
        path: req.path,
        training: req.training === true,
        ...(req.idempotencyKey ? { idempotencyKey: req.idempotencyKey } : {}),
      });
    }

    for (const handler of HANDLERS) {
      if (handler.method !== req.method) continue;
      const match = handler.pattern.exec(req.path);
      if (!match) continue;
      // V3.1 effective access, before any data is read: tenant lifecycle, then the licensed module.
      if (handler.module && ctx.access) {
        const decision = decide(ctx.access, { module: handler.module, at: ACCESS_TODAY, suspension: handler.suspension ?? 'operational' });
        if (!decision.allowed) {
          throw new ApiError({ status: denyStatus(decision.reason), code: decision.reason, messageKey: `errors:access.${decision.reason}`, correlationId: ctx.correlationId, changed: false });
        }
      }
      return handler.handle({ ...ctx, req, params: match.groups ?? {}, training: this.training, demo: this.demo }) as T;
    }
    throw new ApiError({ status: 404, code: 'not_found', messageKey: 'errors:api.notFound', correlationId: nextCorrelationId(), changed: false });
  }

  /** Mutations that were not training writes; practice tasks must leave this unchanged. */
  liveMutations(): MutationLogEntry[] {
    return this.mutationLog.filter((m) => !m.training);
  }

  private context(): Omit<HandlerContext, 'req' | 'params' | 'training' | 'demo'> {
    const { personaId, projectId } = this.options.getContext();
    const persona: Persona | undefined = findPersona(personaId);
    const scope = persona?.projectScope ?? [];
    const allowed = (id: string) =>
      (scope === 'all' || scope.includes(id)) && (projectId === 'all' || projectId === id);
    return {
      persona,
      tenantId: persona?.tenantId,
      access: persona ? effectiveAccessFor(persona) : null,
      ownsSeedData: persona?.tenantId === TENANT.id,
      allowsProject: allowed,
      correlationId: nextCorrelationId(),
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
