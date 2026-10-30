import type { SharedAccessibilityRecord } from '@repo/contracts';
import { useEffect, useRef, useState } from 'react';
import { useApiQuery, useTransport } from '../data/TransportProvider';
import { useSession } from '../permissions/SessionProvider';
import { useDisplayPreferences } from './DisplayPreferences';
import { defaultsFrom, essentialsOf, reconcileShared } from './personal';

/**
 * D.1 closure: a person's accessibility essentials (text size, contrast, motion, reading mode,
 * fonts, language) follow them between the office app and the resident app of one organisation.
 * They are kept with the person's account (`/me/preferences`); each app reconciles its own record
 * with them when the person signs in or comes back to the window, and sends its own changes. Theme,
 * colours, spacing and sounds stay with each app.
 *
 * `ready` turns true once this app has heard from the account (or could not), so a first-run step
 * is never shown to someone who already chose a text size in the other app. A slow account never
 * holds the app: after `ACCOUNT_WAIT_MS` it goes ahead with this app's own record, and a late answer
 * still applies (a text size chosen elsewhere then closes the first-run step).
 */
export const ACCOUNT_WAIT_MS = 3000;

/** Saves still on their way to the account; the app switch waits for them, so nothing is left behind. */
const inflight = new Set<Promise<unknown>>();
export const flushSharedPreferences = () => Promise.allSettled([...inflight]);

export function useSharedPreferences(): { ready: boolean } {
  const { persona } = useSession();
  const { transport } = useTransport();
  const display = useDisplayPreferences();
  const query = useApiQuery<{ record: SharedAccessibilityRecord | null }>(persona ? { method: 'GET', path: '/me/preferences' } : null, {
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const [readyFor, setReadyFor] = useState<string | null>(null);
  // A slow account never holds the app: after the wait, this app goes ahead with its own record.
  const [waitedFor, setWaitedFor] = useState<string | null>(null);
  const personaId = persona?.id;
  useEffect(() => {
    if (!personaId) return;
    const timer = setTimeout(() => setWaitedFor(personaId), ACCOUNT_WAIT_MS);
    return () => clearTimeout(timer);
  }, [personaId]);
  // The essentials last exchanged with the account, so a change is sent once and never echoed back.
  const exchanged = useRef<{ persona: string; changedAt: string | null } | null>(null);
  const latest = useRef(display);
  latest.current = display;

  const push = (personaId: string, rec: SharedAccessibilityRecord) => {
    exchanged.current = { persona: personaId, changedAt: rec.changedAt };
    const sent = transport.request<{ record: SharedAccessibilityRecord }>({ method: 'PATCH', path: '/me/preferences', body: rec }).catch(() => undefined);
    inflight.add(sent);
    void sent.finally(() => inflight.delete(sent));
  };

  // Every answer from the account (sign-in, coming back to the window) is reconciled once.
  useEffect(() => {
    if (!persona || !query.data) return;
    const d = latest.current;
    const decision = reconcileShared({
      local: d.shared,
      server: query.data.record,
      firstSync: !d.sharedSince,
      defaults: essentialsOf(defaultsFrom()),
      now: new Date().toISOString(),
    });
    if (decision.result && decision.adopt) d.applyShared(decision.result);
    // Pushed or already equal: this record is shared from now on (later answers: newest wins).
    else if (!d.sharedSince && d.hasRecord) d.applyShared(null);
    if (decision.result && decision.push) push(persona.id, decision.result);
    else exchanged.current = { persona: persona.id, changedAt: decision.result?.changedAt ?? null };
    setReadyFor(persona.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per answer from the account
  }, [query.data, persona?.id]);

  // A change made here is sent to the account (once).
  const changedAt = display.shared?.changedAt ?? null;
  useEffect(() => {
    if (!persona || readyFor !== persona.id || !changedAt) return;
    const last = exchanged.current;
    if (last?.persona === persona.id && last.changedAt === changedAt) return;
    const rec = latest.current.shared;
    if (rec) push(persona.id, rec);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the essentials change here
  }, [changedAt, readyFor, persona?.id]);

  return { ready: !persona || readyFor === persona.id || waitedFor === persona.id || query.isError };
}
