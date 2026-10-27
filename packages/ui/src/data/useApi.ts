import type { ApiRequest } from '@repo/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
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
