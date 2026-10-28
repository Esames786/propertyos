import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { readJson, writeJson } from '../lib/storage';
import { useSession } from '../permissions/SessionProvider';

/**
 * Personal display preferences (Gate C.2: text size; Gate D: the personalization hub). Kept per
 * person AND organisation (one person may use two workspaces differently), applied to <html> as
 * CSS custom properties that the design tokens read (see tokens/theme.css): `--text-scale` now;
 * theme, palette, contrast, motion, density and fonts later, the same way. Device-level settings
 * (motion, contrast; PreferencesProvider) keep working underneath.
 *
 * The prototype stores the record in this browser; the API keeps it with the person's profile.
 */

/** 100 %, 112 %, 125 %, 150 %, 175 %, 200 % (WCAG 1.4.4 asks for 200 % without loss). */
export const TEXT_SCALES = [1, 1.12, 1.25, 1.5, 1.75, 2] as const;
export type TextScale = (typeof TEXT_SCALES)[number];
/** Offered at first run: Small, Comfortable, Large, Extra large (owner, C.2). */
export const FIRST_RUN_SCALES: readonly TextScale[] = [1, 1.12, 1.25, 1.5];
export const DEFAULT_TEXT_SCALE: TextScale = 1;

export interface DisplayPreferences {
  version: 1;
  textScale: TextScale;
  /** When the person chose (first run or settings); absent record = not chosen yet. */
  chosenAt: string;
  // Gate D adds: theme ('system' | 'light' | 'dark'), palette, contrast, motion, density, fontLatin, fontUrdu.
}

export const displayPreferencesKey = (app: string, tenantId: string, userId: string) => `pref:display:v1:${app}:${tenantId}:${userId}`;

export const isTextScale = (v: unknown): v is TextScale => (TEXT_SCALES as readonly unknown[]).includes(v);
export const percentOf = (s: TextScale) => Math.round(s * 100);

interface DisplayPreferencesValue {
  /** What is applied now (a preview, else the saved choice, else 100 %). */
  textScale: TextScale;
  /** The saved record; null when the signed-in person has not chosen yet (first run). */
  saved: DisplayPreferences | null;
  /** Show a size without saving it (null returns to the saved size). */
  preview: (s: TextScale | null) => void;
  save: (s: TextScale) => void;
  /** Back to 100 % (kept as a choice, so the first-run step does not return). */
  reset: () => void;
  signedIn: boolean;
}

const Ctx = createContext<DisplayPreferencesValue | null>(null);

function apply(scale: TextScale) {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (scale === DEFAULT_TEXT_SCALE) html.style.removeProperty('--text-scale');
  else html.style.setProperty('--text-scale', String(scale));
  html.dataset.textScale = String(percentOf(scale));
}

export function DisplayPreferencesProvider({ app, children }: { app: string; children: ReactNode }) {
  const { persona, tenant } = useSession();
  const key = persona ? displayPreferencesKey(app, tenant.id, persona.principalId) : null;
  const read = useCallback((k: string | null): DisplayPreferences | null => {
    if (!k) return null;
    const v = readJson<DisplayPreferences | null>(k, null);
    return v && v.version === 1 && isTextScale(v.textScale) ? v : null;
  }, []);
  const [saved, setSaved] = useState<DisplayPreferences | null>(() => read(key));
  const [previewing, setPreviewing] = useState<TextScale | null>(null);

  // Another person (or organisation) signs in: their own record applies.
  useEffect(() => {
    setSaved(read(key));
    setPreviewing(null);
  }, [key, read]);

  const textScale: TextScale = previewing ?? saved?.textScale ?? DEFAULT_TEXT_SCALE;
  useLayoutEffect(() => apply(key ? textScale : DEFAULT_TEXT_SCALE), [key, textScale]);

  const save = useCallback(
    (s: TextScale) => {
      if (!key) return;
      const record: DisplayPreferences = { version: 1, textScale: s, chosenAt: new Date().toISOString() };
      writeJson(key, record);
      setSaved(record);
      setPreviewing(null);
    },
    [key],
  );

  const value = useMemo<DisplayPreferencesValue>(
    () => ({ textScale, saved, preview: setPreviewing, save, reset: () => save(DEFAULT_TEXT_SCALE), signedIn: !!key }),
    [textScale, saved, save, key],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDisplayPreferences(): DisplayPreferencesValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDisplayPreferences must be used inside <DisplayPreferencesProvider>');
  return ctx;
}
