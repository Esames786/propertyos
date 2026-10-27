import type { ContractDraft, EditionKey, QuotePreview, UsageDimension } from '@repo/contracts';
import { useSession, useTransport } from '@repo/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

/**
 * Prices a contract on the mock platform server (the engine never runs in a component). The whole
 * request body is part of the cache key, so every edit re-prices; the previous quote stays on screen
 * while the next one loads, so figures never flash to empty.
 */
export function useQuote(
  contract: ContractDraft | null,
  quantities: Partial<Record<UsageDimension, number>>,
  edition: EditionKey | null,
  mode: 'preview' | 'simulation' = 'preview',
) {
  const { transport } = useTransport();
  const { persona } = useSession();
  const body = contract && edition ? { contract, quantities, edition } : null;
  return useQuery<QuotePreview>({
    queryKey: ['hq-quote', persona?.id, mode, JSON.stringify(body)],
    queryFn: ({ signal }) =>
      transport.request<QuotePreview>({ method: 'POST', path: mode === 'simulation' ? '/platform/simulations/price' : '/platform/quotes/preview', body, signal }),
    enabled: body !== null,
    placeholderData: keepPreviousData,
  });
}
