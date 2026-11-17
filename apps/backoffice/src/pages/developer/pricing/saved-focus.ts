import { useCallback } from 'react';

/**
 * Gate E.3 local validation: after a successful save each editor briefly disables its form (or its Save
 * button) while it loads the saved draft. A disabled control loses keyboard focus to the page body, so a
 * keyboard user lost their place and, in the INV-007 drawer, Escape no longer reached the dialog. The
 * "saved" confirmation takes focus instead when it appears (unless the person is already typing in a
 * field). Attach the returned ref to the confirmation, with `tabIndex={-1}`.
 */
export function useSavedFocus() {
  return useCallback((el: HTMLElement | null) => {
    const active = document.activeElement;
    if (el && !(active instanceof HTMLElement && active.matches('input, textarea, select'))) el.focus();
  }, []);
}
