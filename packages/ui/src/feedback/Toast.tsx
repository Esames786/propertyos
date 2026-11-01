import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { useAnnounce } from '../a11y/LiveAnnouncer';
import { Reference } from '../data/Reference';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { usePreferences } from '../preferences/PreferencesProvider';
import { playTone, vibrate } from '../preferences/sound';

type Tone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
  reference?: string;
}

interface ToastApi {
  success: (message: string, options?: { reference?: string }) => void;
  error: (message: string, options?: { reference?: string }) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
/**
 * Registers an open drawer or dialog, with the action bar the toasts must stay clear of when it has
 * one; returns the unregister function.
 */
const ClearanceContext = createContext<((el?: HTMLElement) => () => void) | null>(null);

/** At most this many toasts at once (the oldest leave first); over an open drawer two, one on a phone. */
const MAX_TOASTS = 3;
const MAX_OVER_OVERLAY = 2;
const MAX_OVER_OVERLAY_PHONE = 1;
const GAP_PX = 8;

/**
 * A ref for an action bar that toasts must never cover (a drawer's or dialog's buttons): while it is
 * on screen and under the toasts' corner, the toasts stack just above it instead.
 */
export function useToastClearance(): (el: HTMLElement | null) => void {
  const register = useContext(ClearanceContext);
  const release = useRef<(() => void) | null>(null);
  return useCallback(
    (el: HTMLElement | null) => {
      release.current?.();
      release.current = el && register ? register(el) : null;
    },
    [register],
  );
}

/** For a drawer or dialog without an action bar: while it is open, toasts follow the overlay rules. */
export function useToastOverlay(active: boolean) {
  const register = useContext(ClearanceContext);
  useEffect(() => (active && register ? register() : undefined), [active, register]);
}

const ICONS = { success: CheckCircle2, error: CircleAlert, info: Info } as const;
const TONE_CLASS: Record<Tone, string> = {
  success: 'border-success/40 [&_svg.tone]:text-success',
  error: 'border-error/50 [&_svg.tone]:text-error',
  info: 'border-info/40 [&_svg.tone]:text-info',
};

/**
 * Routine results as toasts (blueprint 01 §6). Each toast is announced through the live
 * announcer: politely for success/info, assertively for errors. Success toasts auto-dismiss after
 * 8 s but pause while hovered or focused; errors stay until dismissed.
 *
 * The toasts never cover an open drawer's or dialog's buttons (`useToastClearance`): they rise above
 * them. Toasts from before the drawer opened (about the page behind it, already announced) wait
 * until it closes, if they are still current; toasts from inside it show, one on a phone and two
 * elsewhere. They sit in React Aria's top layer, so while a drawer is open they stay readable by
 * screen readers, their close button can be reached, and dismissing one does not close the drawer.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const announce = useAnnounce();
  const { preferences } = usePreferences();
  const { t } = useT();
  const counter = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const paused = useRef(false);
  const region = useRef<HTMLElement>(null);
  const clearOf = useRef(new Set<HTMLElement>());
  /** Open drawers and dialogs (with or without an action bar). */
  const overlays = useRef(0);
  /** Pixels from the bottom of the viewport the toasts must stay above (0: their usual place). */
  const [lift, setLift] = useState(0);
  /** While a drawer or dialog is open: the last toast from before it opened (those wait until it closes). */
  const [heldUpTo, setHeldUpTo] = useState<number | null>(null);

  const measure = useCallback(() => {
    const own = region.current?.getBoundingClientRect();
    let top = Infinity;
    for (const el of clearOf.current) {
      const r = el.getBoundingClientRect();
      const visible = r.height > 0 && r.top < window.innerHeight && r.bottom > 0;
      // Only an action bar under the toasts' column matters (a centred dialog's buttons may not be).
      const underToasts = !own || own.width === 0 || (r.left < own.right && r.right > own.left);
      if (visible && underToasts) top = Math.min(top, r.top);
    }
    setLift(top === Infinity ? 0 : Math.max(0, Math.ceil(window.innerHeight - top)));
  }, []);

  const register = useCallback(
    (el?: HTMLElement) => {
      if (overlays.current++ === 0) setHeldUpTo(counter.current);
      if (!el) {
        return () => {
          if (--overlays.current === 0) setHeldUpTo(null);
        };
      }
      clearOf.current.add(el);
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure());
      observer?.observe(el);
      // Drawers slide in: measure now, when an entry animation or transition ends, and once more later.
      const frames = [requestAnimationFrame(measure)];
      const later = [setTimeout(measure, 250), setTimeout(measure, 600)];
      const settled = () => measure();
      window.addEventListener('resize', measure);
      document.addEventListener('animationend', settled, true);
      document.addEventListener('transitionend', settled, true);
      return () => {
        clearOf.current.delete(el);
        observer?.disconnect();
        frames.forEach(cancelAnimationFrame);
        later.forEach(clearTimeout);
        window.removeEventListener('resize', measure);
        document.removeEventListener('animationend', settled, true);
        document.removeEventListener('transitionend', settled, true);
        if (--overlays.current === 0) setHeldUpTo(null);
        measure();
      };
    },
    [measure],
  );

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const schedule = useCallback(
    (id: number) => {
      timers.current.set(
        id,
        setTimeout(() => (paused.current ? schedule(id) : dismiss(id)), 8000),
      );
    },
    [dismiss],
  );

  const push = useCallback(
    (tone: Tone, message: string, reference?: string) => {
      const id = ++counter.current;
      setItems((prev) => {
        // The oldest leaves first; an error stays until dismissed but never grows the stack past the cap.
        const next = [...prev, { id, tone, message, ...(reference ? { reference } : {}) }];
        for (const gone of next.slice(0, Math.max(0, next.length - MAX_TOASTS))) {
          clearTimeout(timers.current.get(gone.id));
          timers.current.delete(gone.id);
        }
        return next.slice(-MAX_TOASTS);
      });
      const spoken = reference ? `${message} ${t('errors:states.reference', { id: reference })}` : message;
      announce(spoken, tone === 'error' ? 'assertive' : 'polite');
      if (preferences.sound && tone !== 'info') playTone(tone, preferences.volume);
      if (preferences.haptics && tone !== 'info') vibrate(tone);
      if (tone !== 'error') schedule(id);
    },
    [announce, preferences.sound, preferences.volume, preferences.haptics, schedule, t],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, o) => push('success', m, o?.reference),
      error: (m, o) => push('error', m, o?.reference),
      info: (m) => push('info', m),
    }),
    [push],
  );

  // A new toast may land while a drawer is open: re-check the clearance whenever the stack changes.
  useEffect(() => {
    if (clearOf.current.size) measure();
  }, [items, measure]);

  const phone = typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 47.99rem)')?.matches;
  const shown = heldUpTo === null ? items : items.filter((i) => i.id > heldUpTo).slice(-(phone ? MAX_OVER_OVERLAY_PHONE : MAX_OVER_OVERLAY));

  return (
    <ToastContext.Provider value={api}>
      <ClearanceContext.Provider value={register}>{children}</ClearanceContext.Provider>
      <section
        ref={region}
        aria-label={t('a11y:landmarks.toasts')}
        data-react-aria-top-layer
        data-testid="toast-region"
        data-lifted={lift ? 'true' : undefined}
        style={lift ? { bottom: `${lift + GAP_PX}px` } : undefined}
        className="pointer-events-none fixed bottom-4 end-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 max-md:bottom-[calc(var(--bottom-nav-height)+1rem)]"
        onMouseEnter={() => (paused.current = true)}
        onMouseLeave={() => (paused.current = false)}
        onFocus={() => (paused.current = true)}
        onBlur={() => (paused.current = false)}
      >
        {shown.map((item) => {
          const Icon = ICONS[item.tone];
          return (
            <div
              key={item.id}
              data-testid={`toast-${item.tone}`}
              data-toast-id={item.id}
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-card border bg-panel p-3 shadow-overlay',
                TONE_CLASS[item.tone],
              )}
            >
              <Icon aria-hidden className="tone mt-0.5 size-5 shrink-0" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-text">{item.message}</p>
                {item.reference && (
                  <p className="mt-1 text-xs text-muted">
                    {t('errors:states.reference', { id: '' })}
                    <Reference value={item.reference} />
                  </p>
                )}
              </div>
              <AriaButton
                aria-label={t('common:actions.dismiss')}
                onPress={() => dismiss(item.id)}
                className="-m-1 grid size-8 place-items-center rounded-sm text-muted data-hovered:bg-sunken data-hovered:text-text"
              >
                <X aria-hidden className="size-4" />
              </AriaButton>
            </div>
          );
        })}
      </section>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
