import { ApiError, type ApiRequest, type ApiTransport, type Permission } from '@repo/contracts';
import type { MockContext, MockMode, MutationLogEntry } from '../mock-transport';
import { createRandom } from '../seed';
import { PLATFORM_HANDLERS, type PlatformHandler } from './handlers';
import { PlatformStore } from './store';
import { findPlatformPersona } from './tenants';

let correlation = 0;
const nextCorrelationId = () => `hq-${(++correlation).toString(36).padStart(5, '0')}`;

/**
 * In-process stand-in for the central platform API (Gate B). Same seam as the tenant MockTransport:
 * deterministic latency so loading states are real, network modes for error demos, and permission
 * checks here, before any handler runs, as the real API must. It never loads tenant fixtures: the
 * platform plane holds licensing and commercial data only.
 */
export class PlatformMockTransport implements ApiTransport {
  readonly mutationLog: MutationLogEntry[] = [];
  readonly store: PlatformStore;
  private readonly random = createRandom(7);

  constructor(private readonly options: { getContext: () => MockContext; getMode?: () => MockMode; store?: PlatformStore }) {
    this.store = options.store ?? new PlatformStore();
  }

  async request<T>(req: ApiRequest): Promise<T> {
    const mode = this.options.getMode?.() ?? 'normal';
    await this.delay(mode, req.signal);
    if (mode === 'offline') throw new ApiError({ status: 0, code: 'offline', messageKey: 'errors:network.offline', correlationId: nextCorrelationId(), changed: false });
    if (mode === 'error') throw new ApiError({ status: 503, code: 'service_unavailable', messageKey: 'errors:network.unavailable', correlationId: nextCorrelationId(), changed: false });

    const correlationId = nextCorrelationId();
    const persona = findPlatformPersona(this.options.getContext().personaId);
    if (req.method !== 'GET') {
      this.mutationLog.push({ at: new Date().toISOString(), method: req.method, path: req.path, training: false, ...(req.idempotencyKey ? { idempotencyKey: req.idempotencyKey } : {}) });
    }

    const match = this.find(req);
    if (!match) throw new ApiError({ status: 404, code: 'not_found', messageKey: 'errors:api.notFound', correlationId, changed: false });
    const [handler, params] = match;
    if (!persona) throw new ApiError({ status: 401, code: 'unauthenticated', messageKey: 'errors:api.forbidden', correlationId, changed: false });
    if (handler.permission) {
      const needed: readonly Permission[] = Array.isArray(handler.permission) ? handler.permission : [handler.permission];
      if (!needed.some((p) => persona.permissions.includes(p))) {
        throw new ApiError({ status: 403, code: 'permission_missing', messageKey: 'errors:api.forbidden', correlationId, changed: false });
      }
    }
    // Responses are copies: the UI can never mutate the store's objects.
    return structuredClone(handler.handle({ persona, req, params, store: this.store, correlationId })) as T;
  }

  /** Store writes so far: previews and simulations must leave this unchanged. */
  storeWrites(): number {
    return this.store.writes;
  }

  private find(req: ApiRequest): [PlatformHandler, Record<string, string>] | undefined {
    for (const handler of PLATFORM_HANDLERS) {
      if (handler.method !== req.method) continue;
      const m = handler.pattern.exec(req.path);
      if (m) return [handler, m.groups ?? {}];
    }
    return undefined;
  }

  private delay(mode: MockMode, signal?: AbortSignal): Promise<void> {
    const ms = mode === 'fast' ? 0 : mode === 'slow' ? 1500 + this.random.int(0, 1500) : 120 + this.random.int(0, 380);
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
