import { useEffect, useId, useSyncExternalStore } from 'react';

/**
 * Busy locks (doc 09 §4 "Dynamics", acceptance 13): unsaved forms, payment and reconciliation
 * screens register a lock, and no tour or offer opens automatically while any lock is held.
 */
const locks = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function useTourBusyLock(active: boolean) {
  const id = useId();
  useEffect(() => {
    if (!active) return;
    locks.add(id);
    emit();
    return () => {
      locks.delete(id);
      emit();
    };
  }, [active, id]);
}

export function useIsTourBusy(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => locks.size > 0,
    () => false,
  );
}

/** Events that advance or suspend guided steps, emitted by app code (no coupling to the tour). */
export const TOUR_EVENT = 'app:tour-event';

export function emitTourEvent(name: string): void {
  window.dispatchEvent(new CustomEvent(TOUR_EVENT, { detail: name }));
}
