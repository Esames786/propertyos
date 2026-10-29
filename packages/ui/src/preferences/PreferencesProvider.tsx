import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { useMediaQuery } from '../lib/useMediaQuery';
import { readJson, writeJson } from '../lib/storage';
import type { Contrast, Motion, Volume } from './personal';

/**
 * Accessibility settings the components read (motion, contrast, sound, the text-only tour guide).
 * Since Gate D.1 they belong to the signed-in person and organisation (PersonalPreferencesProvider
 * provides this context); before anyone signs in they are the device's own, kept under `pref:a11y`.
 */
export interface Preferences {
  motion: Motion;
  contrast: Contrast;
  /** Opt-in, OFF by default (blueprint 01 §2). */
  sound: boolean;
  volume: Volume;
  haptics: boolean;
  /** Open tours as a text guide instead of the spotlight. */
  textOnlyGuide: boolean;
  reading: boolean;
}

export const PREFERENCES_KEY = 'pref:a11y';
const DEFAULTS: Preferences = { motion: 'system', contrast: 'system', sound: false, volume: 'normal', haptics: false, textOnlyGuide: false, reading: false };

export interface PreferencesContextValue {
  preferences: Preferences;
  update: (patch: Partial<Preferences>) => void;
  reducedMotion: boolean;
}

export const PreferencesContext = createContext<PreferencesContextValue | null>(null);

/**
 * Device-level preferences only (used where no person is signed in, e.g. isolated component tests).
 * The apps use PersonalPreferencesProvider, which provides the same context per person.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(() => readJson(PREFERENCES_KEY, DEFAULTS));
  const systemReduce = useMediaQuery('(prefers-reduced-motion: reduce)');

  useLayoutEffect(() => {
    const html = document.documentElement;
    if (preferences.motion === 'system') delete html.dataset.motion;
    else html.dataset.motion = preferences.motion;
    if (preferences.contrast === 'system') delete html.dataset.contrast;
    else html.dataset.contrast = preferences.contrast;
  }, [preferences.motion, preferences.contrast]);

  const update = useCallback((patch: Partial<Preferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...patch };
      writeJson(PREFERENCES_KEY, next);
      return next;
    });
  }, []);

  const reducedMotion = preferences.motion === 'reduce' || (preferences.motion === 'system' && systemReduce);
  const value = useMemo(() => ({ preferences, update, reducedMotion }), [preferences, update, reducedMotion]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside <PreferencesProvider> or <DisplayPreferencesProvider>');
  return ctx;
}

export function useReducedMotion(): boolean {
  return usePreferences().reducedMotion;
}
