import { useTransport } from '@repo/ui';
import { useTraining } from '@repo/ui/onboarding';
import { useEffect, useRef } from 'react';

/**
 * Records the opened record as a recent record of the signed-in person (once per record and page
 * visit). Practice mode leaves no trace; a refusal (a record the person may not open) is ignored, as
 * the page itself shows the outcome. Used by the shell for every `?record=` address.
 */
export function useRecordVisit(recordId: string | null) {
  const { transport } = useTransport();
  const training = useTraining();
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!recordId || training.active || sent.current === recordId) return;
    sent.current = recordId;
    void transport.request({ method: 'POST', path: '/workspace/recents', body: { recordId } }).catch(() => undefined);
  }, [recordId, training.active, transport]);
}

/** The record an address opens: `?record=<id>`, or a record in the path (a lease, a society flat). */
export function recordFromAddress(pathname: string, recordParam: string | null): string | null {
  if (recordParam) return recordParam;
  const lease = /^\/backoffice\/rentals\/leases\/(lse_[\w-]+)$/.exec(pathname);
  if (lease) return lease[1]!;
  const flat = /^\/backoffice\/sites\/[\w-]+\/units\/(unt_[\w-]+)$/.exec(pathname);
  return flat ? flat[1]! : null;
}
