import { useLocale, type AppLocale } from '@repo/i18n';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMediaQuery } from '../lib/useMediaQuery';
import { readJson, writeJson } from '../lib/storage';
import { useSession } from '../permissions/SessionProvider';
import type { SharedAccessibilityRecord } from '@repo/contracts';
import {
  adoptShared,
  changesEssentials,
  DEFAULT_TEXT_SCALE,
  defaultsFrom,
  sharedRecordOf,
  htmlState,
  migrate,
  readDevice,
  resetAll as resetAllOf,
  resolve,
  type OrgAppearance,
  type PersonalPreferences,
  type ResolvedAppearance,
  type TextScale,
} from './personal';
import { PREFERENCES_KEY, PreferencesContext, type Preferences, type PreferencesContextValue } from './PreferencesProvider';

export { TEXT_SCALES, FIRST_RUN_SCALES, DEFAULT_TEXT_SCALE, isTextScale, percentOf, type TextScale } from './personal';
/** A person's saved settings (Gate C.2 text size; Gate D.1 the whole personalization hub). */
export type DisplayPreferences = PersonalPreferences;

/**
 * Personal display and accessibility preferences (Gate C.2 text size; Gate D.1 the personalization
 * hub). Kept per person AND organisation (one person may use two workspaces differently) and applied
 * to <html> as attributes and custom properties the design tokens read (tokens/theme.css). Before
 * anyone signs in, the device's own settings apply.
 *
 * The prototype stores the record in this browser under the same key as Gate C.2 (older records are
 * upgraded, never re-asked); the API keeps it with the person's profile, for every signed-in device.
 *
 * D.1 closure: the accessibility essentials (text size, contrast, motion, reading mode, fonts,
 * language) also follow the person between the office app and the resident app through their
 * account (`useSharedPreferences`); theme, colours, spacing and sounds stay with each app.
 */
export const displayPreferencesKey = (app: string, tenantId: string, userId: string) => `pref:display:v1:${app}:${tenantId}:${userId}`;
/** The organisation's colours seen last, so they apply on the first paint after a reload. */
const orgCacheKey = (app: string, tenantId: string) => `pref:org-appearance:${app}:${tenantId}`;

interface DisplayPreferencesValue {
  /** The settings in force (a text-size preview applied on top of what is saved). */
  prefs: PersonalPreferences;
  /** What the page shows after the device and the organisation are taken into account. */
  resolved: ResolvedAppearance;
  /** What is applied now (a preview, else the saved choice, else 100 %). */
  textScale: TextScale;
  /** The saved record once the person has chosen a text size; null before that (first run). */
  saved: PersonalPreferences | null;
  /** Whether anything at all has been saved for this person and organisation. */
  hasRecord: boolean;
  /** Show a size without saving it (null returns to the saved size). */
  preview: (s: TextScale | null) => void;
  save: (s: TextScale) => void;
  /** Text size back to 100 % (kept as a choice, so the first-run step does not return). */
  reset: () => void;
  /** Change any setting; applied and saved at once. */
  update: (patch: Partial<PersonalPreferences>) => void;
  /** Every setting back to its default (language and the first-run choice are kept). */
  resetAll: () => void;
  signedIn: boolean;
  organisation: OrgAppearance | null;
  /** The app supplies the organisation's colours once it knows them (ADM-022). */
  setOrganisation: (org: OrgAppearance | null) => void;
  /** The essentials as this app last saved them (null while none was ever chosen here). */
  shared: SharedAccessibilityRecord | null;
  /** Whether this app's record was already reconciled with the person's shared essentials. */
  sharedSince: string | null;
  /** Take the person's shared essentials (or, with null, only note that the record is now shared). */
  applyShared: (rec: SharedAccessibilityRecord | null) => void;
}

const Ctx = createContext<DisplayPreferencesValue | null>(null);

function applyToHtml(state: ReturnType<typeof htmlState>) {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  for (const [name, value] of Object.entries(state.attributes)) {
    if (value === undefined) html.removeAttribute(name);
    else html.setAttribute(name, value);
  }
  for (const [name, value] of Object.entries(state.properties)) {
    if (value === undefined) html.style.removeProperty(name);
    else html.style.setProperty(name, value);
  }
}

export function DisplayPreferencesProvider({ app, children }: { app: string; children: ReactNode }) {
  const { persona, tenant } = useSession();
  const { locale, setLocale } = useLocale();
  const key = persona ? displayPreferencesKey(app, tenant.id, persona.principalId) : null;
  const orgKey = persona ? orgCacheKey(app, tenant.id) : null;
  const [device, setDevice] = useState(() => readDevice(readJson<unknown>(PREFERENCES_KEY, null)));
  const read = useCallback((k: string | null) => (k ? migrate(readJson<unknown>(k, null), device) : null), [device]);
  const [record, setRecord] = useState<PersonalPreferences | null>(() => read(key));
  const [org, setOrg] = useState<OrgAppearance | null>(() => (orgKey ? readJson<OrgAppearance | null>(orgKey, null) : null));
  const [previewing, setPreviewing] = useState<TextScale | null>(null);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const systemReduce = useMediaQuery('(prefers-reduced-motion: reduce)');

  // Another person (or organisation) signs in: their own record and organisation colours apply.
  useEffect(() => {
    setRecord(read(key));
    setOrg(orgKey ? readJson<OrgAppearance | null>(orgKey, null) : null);
    setPreviewing(null);
  }, [key, orgKey, read]);

  const base = useMemo(() => record ?? defaultsFrom(device), [record, device]);
  const prefs = useMemo<PersonalPreferences>(() => (previewing ? { ...base, textScale: previewing } : base), [base, previewing]);
  const resolved = useMemo(() => resolve(prefs, { systemDark, systemReduce, org }), [prefs, systemDark, systemReduce, org]);
  useLayoutEffect(() => applyToHtml(htmlState(resolved, org)), [resolved, org]);

  const update = useCallback(
    (patch: Partial<PersonalPreferences>) => {
      if (!key) {
        // Signed out: only the device's accessibility settings exist.
        setDevice((prev) => {
          const next = { ...prev, ...(patch.motion ? { motion: patch.motion } : {}), ...(patch.contrast && patch.contrast !== 'high' ? { contrast: patch.contrast } : {}), ...(patch.sound !== undefined ? { sound: patch.sound } : {}), ...(patch.textOnlyGuide !== undefined ? { textOnlyGuide: patch.textOnlyGuide } : {}) };
          writeJson(PREFERENCES_KEY, next);
          return next;
        });
        return;
      }
      setRecord((prev) => {
        const before = prev ?? defaultsFrom(device);
        const now = new Date().toISOString();
        const next: PersonalPreferences = { ...before, ...patch, version: 2, updatedAt: now };
        // An essential changed here: it becomes the newest choice for every app of this person.
        if (changesEssentials(before, next)) next.essentialsAt = now;
        writeJson(key, next);
        return next;
      });
      setPreviewing(null);
    },
    [key, device],
  );

  // Language: a person's choice made while signed in follows them; the device keeps its own.
  const appliedLocale = useRef<{ key: string; locale: AppLocale } | null>(null);
  useEffect(() => {
    if (!key) {
      appliedLocale.current = null;
      return;
    }
    const mine = read(key)?.locale;
    appliedLocale.current = { key, locale: mine ?? locale };
    if (mine && mine !== locale) setLocale(mine);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the person changes
  }, [key]);
  useEffect(() => {
    const last = appliedLocale.current;
    if (!key || !last || last.key !== key || last.locale === locale) return;
    appliedLocale.current = { key, locale };
    update({ locale });
  }, [key, locale, update]);

  // The person's shared essentials arrive (or this record is now shared): theme, colours, spacing
  // and sounds of this app are untouched; the language follows too.
  const applyShared = useCallback(
    (rec: SharedAccessibilityRecord | null) => {
      if (!key) return;
      const now = new Date().toISOString();
      setRecord((prev) => {
        const base = prev ?? defaultsFrom(device);
        const next = rec ? adoptShared(base, rec, now) : { ...base, sharedSince: base.sharedSince ?? now };
        writeJson(key, next);
        return next;
      });
      setPreviewing(null);
      const wanted = rec?.essentials.locale;
      if (wanted && wanted !== locale) {
        appliedLocale.current = { key, locale: wanted };
        setLocale(wanted);
      }
    },
    [key, device, locale, setLocale],
  );

  const setOrganisation = useCallback(
    (next: OrgAppearance | null) => {
      setOrg(next);
      if (orgKey) writeJson(orgKey, next);
    },
    [orgKey],
  );

  const value = useMemo<DisplayPreferencesValue>(() => {
    const now = () => new Date().toISOString();
    return {
      prefs,
      resolved,
      textScale: prefs.textScale,
      saved: record?.chosenAt ? record : null,
      hasRecord: !!record,
      preview: setPreviewing,
      save: (s) => update({ textScale: s, chosenAt: now() }),
      reset: () => update({ textScale: DEFAULT_TEXT_SCALE, chosenAt: record?.chosenAt ?? now() }),
      update,
      resetAll: () => {
        if (!key) return;
        const at = now();
        const next: PersonalPreferences = { ...resetAllOf(prefs, at), ...(record?.sharedSince ? { sharedSince: record.sharedSince } : {}) };
        if (changesEssentials(prefs, next) || record?.essentialsAt) next.essentialsAt = at;
        writeJson(key, next);
        setRecord(next);
        setPreviewing(null);
      },
      signedIn: !!key,
      organisation: org,
      setOrganisation,
      shared: sharedRecordOf(record),
      sharedSince: record?.sharedSince ?? null,
      applyShared,
    };
  }, [prefs, resolved, record, update, key, org, setOrganisation, applyShared]);

  const legacy = useMemo<PreferencesContextValue>(
    () => ({
      preferences: { motion: prefs.motion, contrast: prefs.contrast, sound: prefs.sound, volume: prefs.volume, haptics: prefs.haptics, textOnlyGuide: prefs.textOnlyGuide, reading: prefs.reading },
      update: (patch: Partial<Preferences>) => update(patch),
      reducedMotion: resolved.reducedMotion,
    }),
    [prefs, resolved.reducedMotion, update],
  );

  return (
    <Ctx.Provider value={value}>
      <PreferencesContext.Provider value={legacy}>{children}</PreferencesContext.Provider>
    </Ctx.Provider>
  );
}

export function useDisplayPreferences(): DisplayPreferencesValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDisplayPreferences must be used inside <DisplayPreferencesProvider>');
  return ctx;
}
