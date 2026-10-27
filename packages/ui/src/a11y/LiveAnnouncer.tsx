import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type Politeness = 'polite' | 'assertive';
type Announce = (message: string, politeness?: Politeness) => void;

const AnnouncerContext = createContext<Announce | null>(null);

const hidden = 'absolute top-0 start-0 w-px h-px overflow-hidden whitespace-nowrap border-0 p-0 [clip:rect(0_0_0_0)]';

/** Messages arriving within this window are read together instead of replacing each other. */
const MERGE_WINDOW_MS = 700;

/**
 * Two persistent live regions (polite + assertive). Messages are cleared and re-set so the same
 * text is announced again when repeated, and messages that arrive close together (e.g. "page
 * loaded" and "entries restored") are combined so neither is lost. Only results are announced.
 */
export function LiveAnnouncerProvider({ children }: { children: ReactNode }) {
  const [polite, setPolite] = useState('');
  const [assertive, setAssertive] = useState('');
  const recent = useRef<Record<Politeness, { text: string; at: number }>>({
    polite: { text: '', at: 0 },
    assertive: { text: '', at: 0 },
  });
  const timers = useRef<Record<Politeness, ReturnType<typeof setTimeout> | undefined>>({
    polite: undefined,
    assertive: undefined,
  });

  const announce = useCallback<Announce>((message, politeness = 'polite') => {
    const set = politeness === 'assertive' ? setAssertive : setPolite;
    const now = Date.now();
    const prev = recent.current[politeness];
    const merge = now - prev.at < MERGE_WINDOW_MS && prev.text !== '' && !prev.text.includes(message);
    const text = merge ? `${prev.text} ${message}` : message;
    recent.current[politeness] = { text, at: now };
    set('');
    clearTimeout(timers.current[politeness]);
    timers.current[politeness] = setTimeout(() => set(text), 60);
  }, []);

  const value = useMemo(() => announce, [announce]);

  useEffect(() => resolveReferenceAnnouncements(), []);

  return (
    <AnnouncerContext.Provider value={value}>
      {children}
      <div className={hidden} aria-live="polite" aria-atomic="true" data-testid="live-polite">
        {polite}
      </div>
      <div className={hidden} aria-live="assertive" aria-atomic="true" data-testid="live-assertive">
        {assertive}
      </div>
    </AnnouncerContext.Provider>
  );
}

/**
 * React Aria announces some messages by reference: a `role="img"` node in its own live region
 * (`[data-live-announcer]`) labelled by the source element, e.g. a button entering its pending
 * state. When that source then disappears (a dialog closing, a wizard step moving on), the node is
 * left pointing at nothing for seven seconds: an empty announcement and an axe `role-img-alt`
 * failure. Each such node is turned into the referenced text the moment it is added, so it reads
 * the same and never dangles. Returns the cleanup.
 */
export function resolveReferenceAnnouncements(): () => void {
  const resolve = (node: Node) => {
    if (!(node instanceof HTMLElement) || node.getAttribute('role') !== 'img') return;
    const ids = node.getAttribute('aria-labelledby');
    if (!ids) return;
    const text = ids
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean)
      .join(' ');
    node.removeAttribute('role');
    node.removeAttribute('aria-labelledby');
    node.textContent = text;
  };
  const logs = new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach(resolve)));
  const watch = (el: Element | null) => {
    if (el) logs.observe(el, { childList: true, subtree: true });
  };
  // React Aria creates its region on first use and prepends it to <body>.
  watch(document.querySelector('[data-live-announcer]'));
  const body = new MutationObserver((records) =>
    records.forEach((r) => r.addedNodes.forEach((n) => n instanceof HTMLElement && n.dataset.liveAnnouncer && watch(n))),
  );
  body.observe(document.body, { childList: true });
  return () => {
    logs.disconnect();
    body.disconnect();
  };
}

export function useAnnounce(): Announce {
  const ctx = useContext(AnnouncerContext);
  if (!ctx) throw new Error('useAnnounce must be used inside <LiveAnnouncerProvider>');
  return ctx;
}
