import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

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

export function useAnnounce(): Announce {
  const ctx = useContext(AnnouncerContext);
  if (!ctx) throw new Error('useAnnounce must be used inside <LiveAnnouncerProvider>');
  return ctx;
}
