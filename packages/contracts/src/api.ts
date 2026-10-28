import { z } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface ApiRequest<TBody = unknown> {
  method: HttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: TBody;
  /** Required for every mutation once a real backend exists; mock records it. */
  idempotencyKey?: string;
  /** Training/practice requests are routed to an isolated store and can never become real. */
  training?: boolean;
  signal?: AbortSignal;
}

/** The single seam between UI and data. Prototype: MockTransport. Later: HTTP to the Laravel API. */
export interface ApiTransport {
  request<T>(request: ApiRequest): Promise<T>;
  /** Data changed elsewhere (another app or tab of the demo): callers refresh. Optional. */
  subscribe?(listener: () => void): () => void;
  /** Prototype: whether the society demo is shared with the other app of this browser. */
  linkStatus?(): 'linked' | 'local' | 'none';
}

/**
 * Error contract proposed for backend agreement in Stage 7.
 * Field errors carry codes (translation keys), not English sentences.
 */
export const ApiProblemSchema = z.object({
  status: z.number(),
  code: z.string(),
  messageKey: z.string(),
  errors: z.record(z.string(), z.array(z.object({ code: z.string(), params: z.record(z.string(), z.string()).optional() }))).optional(),
  correlationId: z.string(),
  /** Whether anything changed before the failure (blueprint: say whether anything changed). */
  changed: z.boolean().default(false),
});

export type ApiProblem = z.infer<typeof ApiProblemSchema>;

export class ApiError extends Error {
  readonly problem: ApiProblem;
  constructor(problem: ApiProblem) {
    super(problem.code);
    this.name = 'ApiError';
    this.problem = problem;
  }
}

/**
 * Maps Laravel's default 422 body ({ message, errors: { field: [message] } }) onto the contract.
 * Until the backend emits codes, messages are passed through as codes under `errors.server.*`.
 */
export function fromLaravelValidation(
  body: { message?: string; errors?: Record<string, string[]> },
  correlationId: string,
): ApiProblem {
  const errors: NonNullable<ApiProblem['errors']> = {};
  for (const [field, messages] of Object.entries(body.errors ?? {})) {
    errors[field] = messages.map((m) => ({
      code: m.startsWith('errors.') || m.startsWith('forms:') ? m : 'errors:server.fieldInvalid',
      params: { detail: m },
    }));
  }
  return {
    status: 422,
    code: 'validation_failed',
    messageKey: 'errors:validation.summary',
    errors,
    correlationId,
    changed: false,
  };
}
