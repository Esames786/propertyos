import { ApiError, type ApiRequest, type ApiTransport, type DeviceInfo } from '@repo/contracts';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider, useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { describeDevice } from '../lib/device';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession } from '../permissions/SessionProvider';
import { readJson, writeJson } from '../lib/storage';

export type MockMode = 'normal' | 'fast' | 'slow' | 'error' | 'offline';
export const MOCK_MODE_KEY = 'demo:mock';

export interface TransportContextInput {
  personaId: string | null;
  projectId: string;
  /** Gate D.1: this browser's session, the calling app and a coarse description of the device. */
  sessionId?: string | null;
  app?: 'backoffice' | 'customer' | 'platform';
  device?: DeviceInfo;
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
  const [device] = useState(() => describeDevice());
  const app = session.app === 'public' ? undefined : session.app;
  ctxRef.current = { personaId: session.persona?.id ?? null, projectId: session.projectId, sessionId: session.sessionId, ...(app ? { app } : {}), device };
  // A session another device or an administrator ended, or portal access the office withdrew: the
  // server refuses with 401 and this browser signs out, saying why (never silently).
  const signOutRef = useRef(session.signOut);
  signOutRef.current = session.signOut;
  const onAuthError = (error: unknown) => {
    const code = error instanceof ApiError ? error.problem.code : undefined;
    if (error instanceof ApiError && error.problem.status === 401 && (code === 'session_ended' || code === 'portal_access_revoked')) {
      signOutRef.current({ reason: code, at: new Date().toISOString() });
    }
  };
  const onAuthErrorRef = useRef(onAuthError);
  onAuthErrorRef.current = onAuthError;

  const [mockMode, setMode] = useState<MockMode>(() => readJson<{ mode: MockMode }>(MOCK_MODE_KEY, { mode: 'normal' }).mode);
  const modeRef = useRef(mockMode);
  modeRef.current = mockMode;

  const [transport] = useState(() => createTransport(() => ctxRef.current, () => modeRef.current));
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false } },
        queryCache: new QueryCache({ onError: (e) => onAuthErrorRef.current(e) }),
        mutationCache: new MutationCache({ onError: (e) => onAuthErrorRef.current(e) }),
      }),
  );

  // Query keys include the persona, so another identity never reads this cache (partitioned). On a
  // real identity change (another person, possibly another organisation) every cached answer that
  // belongs to someone else is dropped as well, with pending mutations: search results, lists and
  // records of the previous identity cannot reappear (CP2 security correction 5). Runs after the
  // new identity's queries have subscribed, so it never orphans them. Not on first mount.
  const personaId = session.persona?.id;
  const previousPersona = useRef(personaId);
  useEffect(() => {
    if (previousPersona.current === personaId) return;
    previousPersona.current = personaId;
    queryClient.removeQueries({ predicate: (q) => queryOwner(q.queryKey) !== personaId });
    queryClient.getMutationCache().clear();
  }, [personaId, queryClient]);

  // Another app or tab of this browser changed the shared demo (a resident sent a proof, finance
  // verified it): what is on screen is refetched, so both apps tell the same story.
  useEffect(() => transport.subscribe?.(() => void queryClient.invalidateQueries()), [transport, queryClient]);

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

/** The identity a cached query belongs to (every query key names it; see useApiQuery). */
export function queryOwner(key: readonly unknown[]): unknown {
  if (key[0] === 'api') return key[1];
  if (key[0] === 'async-select') return key[3];
  return undefined;
}

export function useTransport(): TransportContextValue {
  const ctx = useContext(TransportContext);
  if (!ctx) throw new Error('useTransport must be used inside <TransportProvider>');
  return ctx;
}

/** GET through the transport with a cache key scoped to persona + project (and practice mode). */
export function useApiQuery<T>(
  request: ApiRequest | null,
  options: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'> = {},
) {
  const { transport } = useTransport();
  const { persona, projectId } = useSession();
  return useQuery<T>({
    queryKey: ['api', persona?.id, projectId, request?.path, request?.query, request?.training === true],
    queryFn: ({ signal }) => transport.request<T>({ ...request!, signal }),
    enabled: request !== null && (options.enabled ?? true),
    ...options,
  });
}
