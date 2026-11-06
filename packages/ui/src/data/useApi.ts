import { ApiError, type ApiRequest } from '@repo/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useTraining } from '../onboarding/TrainingProvider';
import { useSession } from '../permissions/SessionProvider';
import { useTransport } from './TransportProvider';

/**
 * A write through the transport. Every mutation carries an idempotency key and, in practice mode,
 * the training flag (so it can only reach the isolated training store). On success every API query
 * is invalidated, so lists, counts and timelines on other screens show the change immediately.
 */
export function useApiMutation<TResult = unknown>() {
  const { transport } = useTransport();
  const training = useTraining();
  const queryClient = useQueryClient();
  return useMutation<TResult, unknown, ApiRequest>({
    mutationFn: (request) =>
      transport.request<TResult>({ idempotencyKey: crypto.randomUUID(), ...request, training: request.training ?? training.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api'] }),
  });
}

/**
 * GitHub Issue #18 (FIN-02): one idempotency key per logical create. The key stays the same for that
 * create's own retries (a second press while it is in flight, a network retry), and `renew` replaces
 * it after the create succeeded or when a new form opens, so a second record is never answered with
 * the first one. Send it as the request's key and in the body where the endpoint reads it there.
 */
export function useCreateKey(prefix: string): readonly [key: string, renew: () => void] {
  const [key, setKey] = useState(() => `${prefix}-${crypto.randomUUID()}`);
  const renew = useCallback(() => setKey(`${prefix}-${crypto.randomUUID()}`), [prefix]);
  return [key, renew] as const;
}

/**
 * The server refused the key because another request already used it (nothing was changed): the
 * next press must be a new request, so the caller renews its key (the form keeps what was typed).
 */
export const isKeyReused = (e: unknown): boolean => e instanceof ApiError && e.problem.code === 'idempotency_key_reused';

/**
 * Warms the cache for a screen the user is about to open (e.g. while a demo is being prepared).
 * Uses the same key shape as `useApiQuery`; call it after the session for `personaId` is active.
 */
export function useApiPrefetch() {
  const { transport } = useTransport();
  const { projectId } = useSession();
  const queryClient = useQueryClient();
  return useCallback(
    (request: ApiRequest, personaId: string) =>
      queryClient.prefetchQuery({
        queryKey: ['api', personaId, projectId, request.path, request.query, request.training === true],
        queryFn: ({ signal }) => transport.request({ ...request, signal }),
      }),
    [queryClient, transport, projectId],
  );
}
