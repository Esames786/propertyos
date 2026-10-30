import type { ApiRequest, Persona, SharedAccessibilityRecord } from '@repo/contracts';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '../providers/AppProviders';
import { useDisplayPreferences } from './DisplayPreferences';
import { ACCOUNT_WAIT_MS, useSharedPreferences } from './SharedPreferences';

/**
 * D.1 closure: the resident app waits for the person's shared essentials before its first paint, but
 * a slow account must never hold the app (seen once in Firefox under load: "Loading…" for 34 s).
 */
const RESIDENT: Persona = {
  id: 'alnoor_owner_a201',
  tenantId: 'tnt_alnoor',
  app: 'customer',
  principalId: 'usr_anr_0007',
  displayName: 'Rabia Hashmi',
  roleKey: 'common:persona.owner',
  email: 'rabia.hashmi@example.com',
  permissions: [],
  projectScope: 'all',
};

const CHOSEN_ELSEWHERE: SharedAccessibilityRecord = {
  essentials: { textScale: 1.5, contrast: 'standard', motion: 'system', reading: false, fontLatin: 'geist', fontUrdu: 'naskh' },
  changedAt: '2026-10-29T10:00:00Z',
  chosenAt: '2026-10-20T10:00:00Z',
};

function Probe() {
  const { ready } = useSharedPreferences();
  const display = useDisplayPreferences();
  return <p data-testid="state">{`${ready ? 'ready' : 'waiting'} ${display.textScale} ${display.saved ? 'chosen' : 'not chosen'}`}</p>;
}

/** The account answers only when the test says so. */
function slowAccount() {
  let answer: (value: { record: SharedAccessibilityRecord | null }) => void = () => {};
  const createTransport = () => ({
    request: <T,>(req: ApiRequest) =>
      (req.method === 'GET' && req.path === '/me/preferences'
        ? new Promise<{ record: SharedAccessibilityRecord | null }>((resolve) => {
            answer = resolve;
          })
        : Promise.resolve({ record: req.body })) as Promise<T>,
  });
  return {
    createTransport,
    /** Answers, then lets the query deliver it (it notifies on a timer). */
    answer: async (record: SharedAccessibilityRecord | null) => {
      answer({ record });
      await vi.advanceTimersByTimeAsync(50);
    },
  };
}

describe('waiting for the account (useSharedPreferences)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.setItem('demo:session:customer', JSON.stringify({ personaId: RESIDENT.id, projectId: 'all' }));
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('goes ahead with this app’s own record when the account is slow, and a late answer still applies', async () => {
    const account = slowAccount();
    render(
      <AppProviders app="customer" tenant={{ id: 'tnt_alnoor', name: 'Al-Noor Residency (Demo)' }} personas={[RESIDENT]} createTransport={account.createTransport}>
        <Probe />
      </AppProviders>,
    );
    expect(screen.getByTestId('state').textContent).toBe('waiting 1 not chosen');

    await act(() => vi.advanceTimersByTimeAsync(ACCOUNT_WAIT_MS - 100));
    expect(screen.getByTestId('state').textContent).toBe('waiting 1 not chosen');
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(screen.getByTestId('state').textContent).toBe('ready 1 not chosen');

    // The size chosen in the other app arrives late: it applies, and the first-run step is no longer due.
    await act(() => account.answer(CHOSEN_ELSEWHERE));
    expect(screen.getByTestId('state').textContent).toBe('ready 1.5 chosen');
  });

  it('a prompt answer makes the app ready at once', async () => {
    const account = slowAccount();
    render(
      <AppProviders app="customer" tenant={{ id: 'tnt_alnoor', name: 'Al-Noor Residency (Demo)' }} personas={[RESIDENT]} createTransport={account.createTransport}>
        <Probe />
      </AppProviders>,
    );
    await act(() => vi.advanceTimersByTimeAsync(50));
    await act(() => account.answer(CHOSEN_ELSEWHERE));
    expect(screen.getByTestId('state').textContent).toBe('ready 1.5 chosen');
  });
});
