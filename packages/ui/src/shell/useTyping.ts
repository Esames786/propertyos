import { useEffect, useState } from 'react';

/**
 * True while a text field has focus (on a phone the keyboard is open): a floating bottom bar steps
 * aside so it never covers the field or the keyboard's view of the page, and returns on blur.
 * Shared by the resident app (C.2) and the office app (D.1 closure).
 */
export function useTyping() {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isText = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      el.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select, [contenteditable="true"]');
    const onIn = (e: FocusEvent) => setTyping(isText(e.target));
    const onOut = (e: FocusEvent) => {
      if (!isText(e.relatedTarget)) setTyping(false);
    };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, []);
  return typing;
}
