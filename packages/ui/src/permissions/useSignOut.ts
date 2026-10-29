import { useCallback } from 'react';
import { useTransport } from '../data/TransportProvider';
import { useSession } from './SessionProvider';

/**
 * Sign out of this browser (Gate D.1): the session is closed on the server first, so it shows as
 * signed out in the person's device list and their security activity, then the identity is cleared.
 * If the server cannot be reached the browser still signs out.
 */
export function useSignOut(): () => void {
  const { transport } = useTransport();
  const { signOut, persona } = useSession();
  return useCallback(() => {
    if (!persona) return;
    void transport
      .request({ method: 'POST', path: '/me/sessions/current/sign-out' })
      .catch(() => undefined)
      .finally(() => signOut());
  }, [transport, signOut, persona]);
}
