import type { ApiRequest, ApiTransport } from '@repo/contracts';
import { QueryClient, QueryClientProvider, useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession } from '../permissions/SessionProvider';
import { readJson, writeJson } from '../lib/storage';

export type MockMode = 'normal' | 'fast' | 'slow' | 'error' | 'offline';
export const MOCK_MODE_KEY = 'demo:mock';

export interface TransportContextInput {
  personaId: string | null;
  projectId: string;
}

export type TransportFactory = (
  getContext: () => TransportContextInput,
  getMode: () => MockMode,
) => ApiTransport;

interface TransportContextValue {
  transport: ApiTransport;
  mockMode: MockMode;
  setMockMode: (mode: MockMode) => void;
}

const TransportContext = createContext<TransportContextValue | null>(null);

/**
 * Provides the data seam (ADR-0001 §2.3/§2.6). The app supplies the factory: MockTransport now,
 * an HTTP transport to the Laravel API later. Query caches are keyed by persona and project so
 * switching identity never shows another identity's data.
 */
export function TransportProvider({ createTransport, children }: { createTransport: TransportFactory; children: ReactNode }) {
  const session = useSession();
  const ctxRef = useRef<TransportContextInput>({ personaId: null, projectId: 'all' });
  ctxRef.current = { personaId: session.persona?.id ?? null, projectId: session.projectId };

  const [mockMode, setMode] = useState<MockMode>(() => readJson<{ mode: MockMode }>(MOCK_MODE_KEY, { mode: 'normal' }).mode);
  const modeRef = useRef(mockMode);
  modeRef.current = mockMode;

  const [transport] = useState(() => createTransport(() => ctxRef.current, () => modeRef.current));
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false } },
      }),
  );

  // Query keys include the persona, so another identity never reads this cache. On a real identity
  // change, drop inactive entries. (Clearing everything on mount would orphan queries that child
  // components have just subscribed to, leaving them pending forever.)
  const personaId = session.persona?.id;
  const previousPersona = useRef(personaId);
  useEffect(() => {
    if (previousPersona.current === personaId) return;
    previousPersona.current = personaId;
    queryClient.removeQueries({ type: 'inactive' });
  }, [personaId, queryClient]);

  const value: TransportContextValue = {
    transport,
    mockMode,
    setMockMode: (mode) => {
      writeJson(MOCK_MODE_KEY, { mode });
      modeRef.current = mode;
      setMode(mode);
      void queryClient.resetQueries();
    },
  };

  return (
    <TransportContext.Provider value={value}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TransportContext.Provider>
  );
}

export function useTransport(): TransportContextValue {
  const ctx = useContext(TransportContext);
  if (!ctx) throw new Error('useTransport must be used inside <TransportProvider>');
  return ctx;
}

/** GET through the transport with a cache key scoped to persona + project. */
export function useApiQuery<T>(
  request: ApiRequest | null,
  options: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'> = {},
) {
  const { transport } = useTransport();
  const { persona, projectId } = useSession();
  return useQuery<T>({
    queryKey: ['api', persona?.id, projectId, request?.path, request?.query],
    queryFn: ({ signal }) => transport.request<T>({ ...request!, signal }),
    enabled: request !== null && (options.enabled ?? true),
    ...options,
  });
}
