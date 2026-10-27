import type { ApiRequest, Persona } from '@repo/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '../providers/AppProviders';
import { useSession } from '../permissions/SessionProvider';
import { queryOwner, useApiQuery, type TransportContextInput } from './TransportProvider';

/**
 * CP2 security correction 5: switching identity (and organisation) must never show the previous
 * identity's cached answers, and the cache must not keep them.
 */
const person = (id: Persona['id'], tenantId: string, displayName: string): Persona => ({
  id,
  tenantId,
  app: 'backoffice',
  principalId: `usr_${id}`,
  displayName,
  roleKey: 'common:persona.manager',
  email: `${id}@example.com`,
  permissions: ['lead.view', 'customer.view'],
  projectScope: 'all',
});
const PEOPLE = [person('manager', 'tnt_a', 'Alpha Manager'), person('cb_manager', 'tnt_b', 'Bravo Manager')];

/** Answers with the identity the transport saw, so a leaked answer is visible as the wrong name. */
const createTransport = (getContext: () => TransportContextInput) => ({
  request: async <T,>(req: ApiRequest) => ({ seenBy: getContext().personaId, path: req.path, q: req.query?.q }) as T,
});

function Probe({ seen }: { seen: Array<{ persona: string | undefined; answer: string | null | undefined }> }) {
  const { persona, signIn } = useSession();
  const search = useApiQuery<{ seenBy: string | null }>({ method: 'GET', path: '/search', query: { q: 'Usman' } });
  const queryClient = useQueryClient();
  seen.push({ persona: persona?.id, answer: search.data?.seenBy });
  const owners = queryClient
    .getQueryCache()
    .getAll()
    .map((q) => String(queryOwner(q.queryKey)));
  return (
    <div>
      <p data-testid="answer">{search.data?.seenBy ?? 'loading'}</p>
      <p data-testid="owners">{[...new Set(owners)].sort().join(',')}</p>
      <button type="button" onClick={() => signIn(persona?.id === 'manager' ? 'cb_manager' : 'manager')}>
        switch
      </button>
    </div>
  );
}

describe('switching identity or organisation', () => {
  it('never renders the previous identity’s answer and drops it from the cache', async () => {
    localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: 'manager', projectId: 'all' }));
    const seen: Array<{ persona: string | undefined; answer: string | null | undefined }> = [];
    render(
      <AppProviders app="backoffice" tenant={{ id: 'tnt_a', name: 'Alpha' }} tenants={[{ id: 'tnt_a', name: 'Alpha' }, { id: 'tnt_b', name: 'Bravo' }]} personas={PEOPLE} createTransport={createTransport}>
        <Probe seen={seen} />
      </AppProviders>,
    );
    await waitFor(() => expect(screen.getByTestId('answer').textContent).toBe('manager'));

    await act(async () => screen.getByRole('button', { name: 'switch' }).click());
    await waitFor(() => expect(screen.getByTestId('answer').textContent).toBe('cb_manager'));
    await waitFor(() => expect(screen.getByTestId('owners').textContent).toBe('cb_manager'));

    // Back again: the first identity's data is fetched afresh, never served from the other's cache.
    await act(async () => screen.getByRole('button', { name: 'switch' }).click());
    await waitFor(() => expect(screen.getByTestId('answer').textContent).toBe('manager'));
    await waitFor(() => expect(screen.getByTestId('owners').textContent).toBe('manager'));

    // At no render did a person see an answer fetched for someone else.
    expect(seen.filter((s) => s.answer && s.answer !== s.persona)).toEqual([]);
  });

  it('every query key names its owner', () => {
    expect(queryOwner(['api', 'manager', 'all', '/search'])).toBe('manager');
    expect(queryOwner(['async-select', 'party', 'usm', 'sales', 'all'])).toBe('sales');
  });
});
