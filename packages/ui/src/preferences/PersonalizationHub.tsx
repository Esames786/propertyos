import { LOCALE_META, useLocale } from '@repo/i18n';
import { Accessibility, AppWindow, AudioLines, Contrast as ContrastIcon, Eye, Languages, LayoutPanelTop, Link2, ListTree, MonitorCog, Moon, Palette as PaletteIcon, RotateCcw, Sparkles, Type, Volume2 } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { MenuButton } from '../overlays/Menu';
import { useAnnounce } from '../a11y/LiveAnnouncer';
import { InlineAlert } from '../feedback/InlineAlert';
import { useToast } from '../feedback/Toast';
import { Switch } from '../forms/ChoiceFields';
import { SegmentedControl } from '../layout/SegmentedControl';
import { cn } from '../lib/cn';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useT } from '../lib/useT';
import { ConfirmDialog } from '../overlays/ConfirmDialog';
import { useSession } from '../permissions/SessionProvider';
import { Button } from '../primitives/Button';
import { AppearancePreview } from './AppearancePreview';
import { ChoiceCards } from './ChoiceCards';
import { useDisplayPreferences } from './DisplayPreferences';
import { percentOf, type Contrast, type Density, type LatinFont, type Motion, type Palette, type Theme, type UrduFont, type Volume } from './personal';
import { LanguagePreferences, TourPreferences } from './PreferencesForm';
import { canVibrate, playTone } from './sound';
import { TextSizeSettings } from './TextSize';

/** Action colours shown on the palette cards (the real tokens live in tokens/theme.css). */
export const PALETTE_SWATCHES: Record<'evergreen' | 'ocean' | 'indigo' | 'warm', { light: string; dark: string }> = {
  evergreen: { light: '#1e4d42', dark: '#63b7aa' },
  ocean: { light: '#0e5a78', dark: '#6bbfe0' },
  indigo: { light: '#3b3f98', dark: '#a4a8f2' },
  warm: { light: '#7b4527', dark: '#e2a77f' },
};

export type HubSection = 'text-size' | 'fonts' | 'spacing' | 'reading' | 'theme' | 'contrast' | 'palette' | 'motion' | 'sound' | 'language' | 'tours';

const SECTION_ICON: Record<HubSection, typeof Type> = {
  'text-size': Type,
  fonts: Sparkles,
  spacing: LayoutPanelTop,
  reading: Eye,
  theme: Moon,
  contrast: ContrastIcon,
  palette: PaletteIcon,
  motion: MonitorCog,
  sound: Volume2,
  language: Languages,
  tours: Accessibility,
};

/** D.1 closure: the essentials follow the person in every app of the organisation; the rest stay per app. */
const SHARED_SECTIONS: ReadonlySet<HubSection> = new Set<HubSection>(['text-size', 'fonts', 'reading', 'contrast', 'motion', 'language']);
const ScopeContext = createContext(false);

function ScopeLabel({ id }: { id: HubSection }) {
  const { t } = useT();
  const shared = SHARED_SECTIONS.has(id);
  const Icon = shared ? Link2 : AppWindow;
  return (
    <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted" data-testid={`hub-scope-${id}`} data-scope={shared ? 'shared' : 'app'}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {shared ? t('a11y:hub.scope.shared') : t('a11y:hub.scope.app')}
    </p>
  );
}

function Section({ id, title, intro, children }: { id: HubSection; title: string; intro?: string; children: ReactNode }) {
  const Icon = SECTION_ICON[id];
  const showScope = useContext(ScopeContext);
  return (
    <section id={id} tabIndex={-1} aria-labelledby={`${id}-title`} className="scroll-mt-24 rounded-card border border-border/70 bg-panel p-4 shadow-card outline-none sm:p-5" data-testid={`hub-section-${id}`}>
      <div className="mb-4 flex items-start gap-3">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-primary-soft text-primary">
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-base font-semibold text-text">
            {title}
          </h2>
          {intro && <p className="text-sm text-muted">{intro}</p>}
          {showScope && <ScopeLabel id={id} />}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Samples of each script, shown as they are in every language (they show the typeface, not words). */
const LATIN_SAMPLE = 'Aa Bb 123';
const URDU_SAMPLE = 'اردو تحریر ۱۲۳';

function ThemeVisual({ dark, split }: { dark?: boolean; split?: boolean }) {
  const pane = (d: boolean) => (
    <span className="flex h-full flex-1 flex-col gap-1 p-1.5" style={{ background: d ? '#0c0e11' : '#f6f6f3' }}>
      <span className="h-1.5 w-2/3 rounded-sm" style={{ background: d ? '#f1ece2' : '#17211e', opacity: 0.85 }} />
      <span className="flex-1 rounded-[4px]" style={{ background: d ? '#15181c' : '#ffffff', border: `1px solid ${d ? '#262b31' : '#e6e7e1'}` }} />
      <span className="h-2 w-1/2 rounded-sm" style={{ background: d ? '#63b7aa' : '#1e4d42' }} />
    </span>
  );
  return <span className="flex h-16 overflow-hidden rounded-[8px] border border-border">{split ? (<>{pane(false)}{pane(true)}</>) : pane(!!dark)}</span>;
}

/** Light, dark or follow the device, each with a small sample (the hub and the PORTAL-030 welcome). */
export function ThemeChoice({ value, onChange, testId = 'hub-theme' }: { value: Theme; onChange: (theme: Theme) => void; testId?: string }) {
  const { t } = useT();
  return (
    <ChoiceCards<Theme>
      label={t('a11y:hub.theme.title')}
      hideLabel
      value={value}
      onChange={onChange}
      testId={testId}
      columns={3}
      options={(['light', 'dark', 'system'] as const).map((id) => ({
        id,
        label: t(`a11y:hub.theme.${id}.label` as 'a11y:hub.theme.dark.label'),
        description: t(`a11y:hub.theme.${id}.description` as 'a11y:hub.theme.dark.description'),
        visual: <ThemeVisual dark={id === 'dark'} split={id === 'system'} />,
      }))}
    />
  );
}

function Swatch({ colour, soft }: { colour: string; soft?: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="size-7 rounded-pill border border-border" style={{ background: colour }} />
      <span className="h-3 flex-1 rounded-pill" style={{ background: soft ?? colour, opacity: soft ? 1 : 0.25 }} />
    </span>
  );
}

/**
 * The personalization hub (Gate D.1: GLOBAL-010 in the office app, HQ-024 in Platform HQ, PORTAL-027
 * in the resident app). One page, every setting visible and reachable by keyboard, each change
 * applied and saved at once, a live preview beside it, and one "Reset to default".
 */
export function PersonalizationHub({
  initialSection,
  tourExtras,
  organisationLabel,
  organisationColours = true,
  sharedAcrossApps = true,
}: {
  initialSection?: HubSection;
  tourExtras?: ReactNode;
  organisationLabel?: string;
  /** Platform HQ has no organisation colours: the option is not offered. */
  organisationColours?: boolean;
  /** The office and resident apps share the essentials (D.1 closure); Platform HQ has no second app. */
  sharedAcrossApps?: boolean;
}) {
  const { t } = useT();
  const { locale } = useLocale();
  const announce = useAnnounce();
  const toast = useToast();
  const { persona, tenant } = useSession();
  const { prefs, resolved, update, resetAll, signedIn, organisation } = useDisplayPreferences();
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [confirmReset, setConfirmReset] = useState(false);
  const vibrates = canVibrate();
  const mode = resolved.theme;
  const orgName = organisationLabel ?? tenant.name;

  // A register address for one setting opens the page at that section.
  useEffect(() => {
    const target = initialSection ?? (typeof window !== 'undefined' ? (window.location.hash.slice(1) as HubSection) : undefined);
    if (!target) return;
    const el = document.getElementById(target);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  }, [initialSection]);

  const set = <K extends keyof typeof prefs>(key: K, value: (typeof prefs)[K], spoken: string) => {
    update({ [key]: value } as Partial<typeof prefs>);
    announce(t('a11y:hub.appliedOne', { setting: spoken }));
  };

  // Section index: a jump moves focus to the section; on phones the row of sections scrolls sideways
  // and shows a soft edge on whichever side has more (logical start and end, so RTL mirrors).
  const jump = (id: HubSection) => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ block: 'start', behavior: resolved.reducedMotion ? 'auto' : 'smooth' });
    el?.focus({ preventScroll: true });
    // Keep the router's own history state; only the fragment changes.
    history.replaceState(history.state, '', `#${id}`);
  };
  const rowRef = useRef<HTMLUListElement>(null);
  const [more, setMore] = useState({ start: false, end: false });
  const measureRow = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft);
    setMore((m) => {
      const next = { start: max > 1 && pos > 1, end: max > 1 && pos < max - 1 };
      return m.start === next.start && m.end === next.end ? m : next;
    });
  }, []);
  useEffect(() => {
    measureRow();
    const el = rowRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measureRow);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measureRow, locale]);

  const orgSwatch = organisation?.palette === 'brand' && organisation.brand ? (mode === 'dark' ? organisation.brand.darkPrimary : organisation.brand.primary) : PALETTE_SWATCHES[organisation?.palette && organisation.palette !== 'brand' ? organisation.palette : 'evergreen'][mode];

  const index: Array<[HubSection, string]> = [
    ['text-size', t('a11y:textSize.settingsTitle')],
    ['fonts', t('a11y:hub.fonts.title')],
    ['spacing', t('a11y:hub.density.title')],
    ['reading', t('a11y:hub.reading.title')],
    ['theme', t('a11y:hub.theme.title')],
    ['contrast', t('a11y:hub.contrast.title')],
    ['palette', t('a11y:hub.palette.title')],
    ['motion', t('a11y:hub.motion.title')],
    ['sound', t('a11y:hub.sound.title')],
    ['language', t('a11y:language.title')],
    ['tours', t('onboarding:preferences.title')],
  ];

  const applied = [
    t('a11y:hub.chips.text', { value: percentOf(prefs.textScale) }),
    t(`a11y:hub.chips.${mode}` as 'a11y:hub.chips.dark'),
    ...(resolved.contrast === 'high' ? [t('a11y:hub.chips.high')] : resolved.contrast === 'more' ? [t('a11y:hub.chips.more')] : []),
    ...(!resolved.paletteOverridden ? [t('a11y:hub.chips.palette', { name: resolved.palette === 'brand' ? orgName : t(`a11y:hub.palette.${resolved.palette}.label` as 'a11y:hub.palette.ocean.label') })] : []),
    ...(prefs.density === 'compact' ? [t('a11y:hub.chips.compact')] : []),
    ...(prefs.reading ? [t('a11y:hub.chips.reading')] : []),
    ...(resolved.reducedMotion ? [t('a11y:hub.chips.reduced')] : []),
  ];

  return (
    <div className="@container" data-testid="personalization-hub" data-theme-resolved={mode} data-palette-resolved={resolved.palette} data-palette-source={resolved.paletteSource}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border/70 bg-raised px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">{t('a11y:hub.appliedTitle')}</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={t('a11y:hub.appliedTitle')} data-testid="hub-applied">
            {applied.map((a) => (
              <li key={a} className="rounded-pill border border-border bg-panel px-2.5 py-0.5 text-xs font-medium text-text">
                <bdi>{a}</bdi>
              </li>
            ))}
          </ul>
        </div>
        {signedIn && (
          <Button variant="secondary" icon={RotateCcw} className="max-w-full whitespace-normal text-start" onPress={() => setConfirmReset(true)} data-testid="hub-reset-all">
            {t('a11y:hub.resetAll')}
          </Button>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[11.5rem_minmax(0,1fr)] xl:grid-cols-[11.5rem_minmax(0,1fr)_20rem]">
        <nav aria-label={t('a11y:hub.index')} className="min-w-0 lg:sticky lg:top-24 lg:self-start" data-testid="hub-index">
          <div className="flex items-start gap-2 lg:block">
          {/* Phones and tablets: every section in one menu, so none is hidden past the edge of the row. */}
          <span className="shrink-0 lg:hidden">
            <MenuButton
              label={t('a11y:hub.sectionsHint')}
              placement="bottom start"
              trigger={
                <AriaButton
                  aria-label={t('a11y:hub.sectionsHint')}
                  data-testid="hub-sections-menu"
                  className="flex min-h-10 items-center gap-2 rounded-pill bg-primary px-3.5 text-sm font-semibold text-on-primary outline-none data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus pointer-coarse:min-h-11"
                >
                  <ListTree aria-hidden className="size-4 shrink-0" />
                  <span className="whitespace-nowrap">{t('a11y:hub.sections')}</span>
                </AriaButton>
              }
              groups={[{ id: 'hub-sections', items: index.map(([id, label]) => ({ id, label, icon: SECTION_ICON[id], testId: `hub-sections-${id}` })) }]}
              onAction={(id) => jump(id as HubSection)}
            />
          </span>
          <div className="relative min-w-0 flex-1">
          <ul ref={rowRef} onScroll={measureRow} className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0">
            {index.map(([id, label]) => {
              const Icon = SECTION_ICON[id];
              return (
                <li key={id} className="shrink-0">
                  <a
                    href={`#${id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      jump(id);
                    }}
                    className="flex min-h-10 items-center gap-2 rounded-pill border border-border bg-panel px-3 text-sm text-text outline-none hover:bg-raised focus-visible:outline-2 focus-visible:outline-focus lg:rounded-control lg:border-transparent lg:bg-transparent"
                    data-variant="plain"
                  >
                    <Icon aria-hidden className="size-4 shrink-0 text-muted" />
                    <span className="whitespace-nowrap">{label}</span>
                  </a>
                </li>
              );
            })}
          </ul>
          {/* Soft edges show that the row continues (decorative; the menu lists every section). */}
          {more.start && <span aria-hidden data-testid="hub-index-more-start" className="pointer-events-none absolute inset-y-0 start-0 w-8 bg-linear-to-r from-bg to-transparent rtl:bg-linear-to-l lg:hidden" />}
          {more.end && <span aria-hidden data-testid="hub-index-more-end" className="pointer-events-none absolute inset-y-0 end-0 w-10 bg-linear-to-l from-bg to-transparent rtl:bg-linear-to-r lg:hidden" />}
          </div>
          </div>
        </nav>

        <div className="min-w-0 space-y-5">
          <ScopeContext.Provider value={sharedAcrossApps && signedIn}>
          <div className="xl:hidden">
            <AppearancePreview />
          </div>

          <Section id="text-size" title={t('a11y:textSize.settingsTitle')} intro={t('a11y:textSize.settingsHint')}>
            <TextSizeSettings />
          </Section>

          <Section id="fonts" title={t('a11y:hub.fonts.title')} intro={t('a11y:hub.fonts.intro')}>
            <div className="space-y-5">
              <ChoiceCards<LatinFont>
                label={t('a11y:hub.fonts.latin')}
                value={prefs.fontLatin}
                onChange={(v) => set('fontLatin', v, t(`a11y:hub.fonts.${v}.label` as 'a11y:hub.fonts.geist.label'))}
                testId="hub-font-latin"
                options={(['geist', 'system', 'readable'] as const).map((id) => ({
                  id,
                  label: t(`a11y:hub.fonts.${id}.label` as 'a11y:hub.fonts.geist.label'),
                  description: t(`a11y:hub.fonts.${id}.description` as 'a11y:hub.fonts.geist.description'),
                  visual: (
                    <span className="block text-2xl leading-none text-text">
                      <bdi lang="en" dir="ltr" style={{ fontFamily: id === 'geist' ? "'Geist Variable'" : id === 'system' ? 'system-ui' : "'Atkinson Hyperlegible'" }}>{LATIN_SAMPLE}</bdi>
                    </span>
                  ),
                }))}
              />
              <ChoiceCards<UrduFont>
                label={t('a11y:hub.fonts.urdu')}
                value={prefs.fontUrdu}
                onChange={(v) => set('fontUrdu', v, t(`a11y:hub.fonts.${v}.label` as 'a11y:hub.fonts.naskh.label'))}
                testId="hub-font-urdu"
                columns={2}
                options={(['naskh', 'nastaliq'] as const).map((id) => ({
                  id,
                  label: t(`a11y:hub.fonts.${id}.label` as 'a11y:hub.fonts.naskh.label'),
                  description: t(`a11y:hub.fonts.${id}.description` as 'a11y:hub.fonts.naskh.description'),
                  visual: (
                    <span className="block text-2xl leading-loose text-text">
                      <bdi lang="ur" dir="rtl" style={{ fontFamily: id === 'naskh' ? "'Noto Naskh Arabic Variable'" : "'Gulzar'" }}>{URDU_SAMPLE}</bdi>
                    </span>
                  ),
                }))}
              />
            </div>
          </Section>

          <Section id="spacing" title={t('a11y:hub.density.title')} intro={t('a11y:hub.density.intro')}>
            <ChoiceCards<Density>
              label={t('a11y:hub.density.title')}
              hideLabel
              value={prefs.density}
              onChange={(v) => set('density', v, t(`a11y:hub.density.${v}.label` as 'a11y:hub.density.compact.label'))}
              testId="hub-density"
              columns={2}
              options={(['comfortable', 'compact'] as const).map((id) => ({
                id,
                label: t(`a11y:hub.density.${id}.label` as 'a11y:hub.density.compact.label'),
                description: t(`a11y:hub.density.${id}.description` as 'a11y:hub.density.compact.description'),
                visual: (
                  <span className={cn('flex flex-col rounded-[8px] border border-border bg-raised p-1.5', id === 'compact' ? 'gap-0.5' : 'gap-1.5')}>
                    {[0, 1, 2].map((i) => (
                      <span key={i} className={cn('rounded-[3px] bg-sunken', id === 'compact' ? 'h-2' : 'h-3')} />
                    ))}
                  </span>
                ),
              }))}
            />
            <p className="mt-3 text-xs text-muted">{t('a11y:hub.density.touchNote')}</p>
          </Section>

          <Section id="reading" title={t('a11y:hub.reading.title')}>
            <Switch isSelected={prefs.reading} onChange={(v) => set('reading', v, t('a11y:hub.reading.label'))} label={t('a11y:hub.reading.label')} description={t('a11y:hub.reading.description')} testId="hub-reading" />
          </Section>

          <Section id="theme" title={t('a11y:hub.theme.title')} intro={t('a11y:hub.theme.intro')}>
            <ThemeChoice value={prefs.theme} onChange={(v) => set('theme', v, t(`a11y:hub.theme.${v}.label` as 'a11y:hub.theme.dark.label'))} />
            {prefs.theme === 'system' && <p className="mt-3 text-xs text-muted" data-testid="hub-theme-system-note">{t('a11y:hub.theme.deviceNow', { mode: t(`a11y:hub.theme.${systemDark ? 'dark' : 'light'}.label` as 'a11y:hub.theme.dark.label') })}</p>}
          </Section>

          <Section id="contrast" title={t('a11y:hub.contrast.title')} intro={t('a11y:hub.contrast.intro')}>
            <ChoiceCards<Contrast>
              label={t('a11y:hub.contrast.title')}
              hideLabel
              value={prefs.contrast}
              onChange={(v) => set('contrast', v, t(`a11y:hub.contrast.${v}.label` as 'a11y:hub.contrast.high.label'))}
              testId="hub-contrast"
              columns="list"
              options={(['system', 'standard', 'more', 'high'] as const).map((id) => ({
                id,
                label: t(`a11y:hub.contrast.${id}.label` as 'a11y:hub.contrast.high.label'),
                description: t(`a11y:hub.contrast.${id}.description` as 'a11y:hub.contrast.high.description'),
              }))}
            />
          </Section>

          <Section id="palette" title={t('a11y:hub.palette.title')} intro={t('a11y:hub.palette.intro')}>
            {resolved.paletteOverridden && (
              <InlineAlert tone="info" className="mb-4" data-testid="hub-palette-paused">
                {t('a11y:hub.palette.paused')}
              </InlineAlert>
            )}
            <ChoiceCards<Palette>
              label={t('a11y:hub.palette.title')}
              hideLabel
              value={!organisationColours && prefs.palette === 'organisation' ? 'evergreen' : prefs.palette}
              onChange={(v) => set('palette', v, v === 'organisation' ? t('a11y:hub.palette.organisation.label', { org: orgName }) : t(`a11y:hub.palette.${v}.label` as 'a11y:hub.palette.ocean.label'))}
              testId="hub-palette"
              options={[
                ...(organisationColours ? [{
                  id: 'organisation' as const,
                  label: t('a11y:hub.palette.organisation.label', { org: orgName }),
                  description: organisation ? t('a11y:hub.palette.organisation.chosen') : t('a11y:hub.palette.organisation.none'),
                  visual: <Swatch colour={orgSwatch} />,
                }] : []),
                ...(['evergreen', 'ocean', 'indigo', 'warm'] as const).map((id) => ({
                  id,
                  label: t(`a11y:hub.palette.${id}.label` as 'a11y:hub.palette.ocean.label'),
                  description: t(`a11y:hub.palette.${id}.description` as 'a11y:hub.palette.ocean.description'),
                  visual: <Swatch colour={PALETTE_SWATCHES[id][mode]} />,
                })),
              ]}
            />
          </Section>

          <Section id="motion" title={t('a11y:hub.motion.title')} intro={t('a11y:preferences.motionHint')}>
            <ChoiceCards<Motion>
              label={t('a11y:hub.motion.title')}
              hideLabel
              value={prefs.motion}
              onChange={(v) => set('motion', v, t(`a11y:hub.motion.${v}.label` as 'a11y:hub.motion.reduce.label'))}
              testId="hub-motion"
              columns="list"
              options={(['system', 'reduce', 'full'] as const).map((id) => ({
                id,
                label: t(`a11y:hub.motion.${id}.label` as 'a11y:hub.motion.reduce.label'),
                description: t(`a11y:hub.motion.${id}.description` as 'a11y:hub.motion.reduce.description'),
              }))}
            />
          </Section>

          <Section id="sound" title={t('a11y:hub.sound.title')}>
            <div className="space-y-5">
              <Switch isSelected={prefs.sound} onChange={(v) => set('sound', v, t('a11y:preferences.sound'))} label={t('a11y:preferences.sound')} description={t('a11y:preferences.soundHint')} testId="sound-switch" />
              <div className="flex flex-wrap items-end gap-3 ps-14">
                <SegmentedControl<Volume>
                  label={t('a11y:hub.sound.volume')}
                  value={prefs.volume}
                  onChange={(v) => set('volume', v, t(`a11y:hub.sound.${v}` as 'a11y:hub.sound.quiet'))}
                  options={(['quiet', 'normal'] as const).map((id) => ({ id, label: t(`a11y:hub.sound.${id}` as 'a11y:hub.sound.quiet') }))}
                  testId="hub-volume"
                />
                <Button size="sm" variant="secondary" icon={AudioLines} className="max-w-full whitespace-normal text-start" isDisabled={!prefs.sound} onPress={() => playTone('success', prefs.volume)} data-testid="hub-sound-test">
                  {t('a11y:preferences.soundTest')}
                </Button>
              </div>
              <Switch isSelected={prefs.haptics} onChange={(v) => set('haptics', v, t('a11y:hub.sound.haptics'))} label={t('a11y:hub.sound.haptics')} description={vibrates ? t('a11y:hub.sound.hapticsHint') : `${t('a11y:hub.sound.hapticsHint')} ${t('a11y:hub.sound.hapticsUnavailable')}`} testId="hub-haptics" />
            </div>
          </Section>

          <Section id="language" title={t('a11y:language.title')}>
            <LanguagePreferences />
            <p className="mt-3 text-xs text-muted">{t('a11y:hub.languageKept', { language: LOCALE_META[locale].nativeName })}</p>
          </Section>

          <Section id="tours" title={t('onboarding:preferences.title')}>
            <div className="space-y-8">
              <TourPreferences />
              {tourExtras}
            </div>
          </Section>

          <p className="text-sm text-muted" data-testid="hub-persistence">
            {signedIn && persona ? t(sharedAcrossApps ? 'a11y:hub.savedShared' : 'a11y:hub.saved', { name: persona.displayName, org: orgName }) : t('a11y:hub.savedDevice')}
          </p>
          </ScopeContext.Provider>
        </div>

        <aside className="hidden min-w-0 xl:sticky xl:top-24 xl:block xl:self-start" aria-label={t('a11y:hub.preview.title')}>
          <AppearancePreview />
        </aside>
      </div>

      <ConfirmDialog
        isOpen={confirmReset}
        onOpenChange={setConfirmReset}
        title={t('a11y:hub.resetAllTitle')}
        effect={t('a11y:hub.resetAllEffect')}
        confirmLabel={t('a11y:hub.resetAll')}
        onConfirm={() => {
          resetAll();
          toast.success(t('a11y:hub.resetDone'));
        }}
      />
    </div>
  );
}
