import { useCallback, useEffect, useRef } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { useAnnounce } from '../a11y/LiveAnnouncer';
import { useT } from '../lib/useT';

/**
 * In-memory drafts (assumption A10): entries survive client-side back/forward navigation and
 * validation errors, but are never written to localStorage/sessionStorage, so personal data
 * typed into forms does not persist on the device. Cleared on successful submit or tab close.
 */
const drafts = new Map<string, FieldValues>();

export function useDraft(key: string | undefined, methods: UseFormReturn<FieldValues>) {
  const announce = useAnnounce();
  const { t } = useT();
  const restored = useRef(false);

  useEffect(() => {
    if (!key || restored.current) return;
    restored.current = true;
    const saved = drafts.get(key);
    if (saved) {
      methods.reset(saved, { keepDefaultValues: true });
      announce(t('forms:draft.restored'));
    }
  }, [key, methods, announce, t]);

  useEffect(() => {
    if (!key) return;
    const sub = methods.watch((values) => {
      if (methods.formState.isDirty || Object.values(values).some((v) => v !== undefined && v !== '' && v !== null)) {
        drafts.set(key, values as FieldValues);
      }
    });
    return () => sub.unsubscribe();
  }, [key, methods]);

  const clearDraft = useCallback(() => {
    if (key) drafts.delete(key);
  }, [key]);

  return { clearDraft };
}

/** Test/support helper. */
export function hasDraft(key: string): boolean {
  return drafts.has(key);
}
