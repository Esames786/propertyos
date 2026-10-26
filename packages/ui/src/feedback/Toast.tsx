import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { useAnnounce } from '../a11y/LiveAnnouncer';
import { Reference } from '../data/Reference';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { usePreferences } from '../preferences/PreferencesProvider';
import { playTone } from '../preferences/sound';

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
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const announce = useAnnounce();
  const { preferences } = usePreferences();
  const { t } = useT();
  const counter = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const paused = useRef(false);

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
      setItems((prev) => [...prev.slice(-3), { id, tone, message, ...(reference ? { reference } : {}) }]);
      const spoken = reference ? `${message} ${t('errors:states.reference', { id: reference })}` : message;
      announce(spoken, tone === 'error' ? 'assertive' : 'polite');
      if (preferences.sound && tone !== 'info') playTone(tone);
      if (tone !== 'error') schedule(id);
    },
    [announce, preferences.sound, schedule, t],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, o) => push('success', m, o?.reference),
      error: (m, o) => push('error', m, o?.reference),
      info: (m) => push('info', m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section
        aria-label={t('a11y:landmarks.toasts')}
        className="pointer-events-none fixed bottom-4 end-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 max-md:bottom-[calc(var(--bottom-nav-height)+1rem)]"
        onMouseEnter={() => (paused.current = true)}
        onMouseLeave={() => (paused.current = false)}
        onFocus={() => (paused.current = true)}
        onBlur={() => (paused.current = false)}
      >
        {items.map((item) => {
          const Icon = ICONS[item.tone];
          return (
            <div
              key={item.id}
              data-testid={`toast-${item.tone}`}
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
