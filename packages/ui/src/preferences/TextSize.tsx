import { Check, RotateCcw, Type } from 'lucide-react';
import { motion } from 'motion/react';
import { useId, type ReactNode } from 'react';
import { Label, Radio, RadioGroup } from 'react-aria-components';
import { useAnnounce } from '../a11y/LiveAnnouncer';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { Button } from '../primitives/Button';
import { LocaleToggle } from '../shell/LocaleSwitcher';
import { DEFAULT_TEXT_SCALE, FIRST_RUN_SCALES, isTextScale, percentOf, TEXT_SCALES, useDisplayPreferences, type TextScale } from './DisplayPreferences';
import { useReducedMotion } from './PreferencesProvider';

const NAME: Record<TextScale, string> = { 1: 'small', 1.12: 'comfortable', 1.25: 'large', 1.5: 'extraLarge', 1.75: 'veryLarge', 2: 'largest' };

/**
 * Choose a text size. Each option shows "Aa" at its own size (independent of the size applied now)
 * with its name and percentage, so the difference is visible before choosing. A radio group: arrow
 * keys move, the choice is announced.
 */
export function TextSizeChooser({
  scales,
  value,
  onChange,
  label,
  layout = 'cards',
  testId = 'text-size-chooser',
}: {
  scales: readonly TextScale[];
  value: TextScale;
  onChange: (s: TextScale) => void;
  label: string;
  layout?: 'cards' | 'stops';
  testId?: string;
}) {
  const { t } = useT();
  const reduced = useReducedMotion();
  return (
    <RadioGroup value={String(value)} onChange={(v) => isTextScale(Number(v)) && onChange(Number(v) as TextScale)} className="@container min-w-0" data-testid={testId}>
      <Label className="sr-only">{label}</Label>
      {/* Columns follow the space the chooser has (a settings card or a full page), not the window. */}
      <div className={cn('grid gap-2.5', layout === 'cards' ? 'grid-cols-2 @[30rem]:grid-cols-4' : 'grid-cols-3 @[38rem]:grid-cols-6')}>
        {scales.map((s) => (
          <Radio
            key={s}
            value={String(s)}
            className={cn(
              'group relative flex cursor-pointer flex-col items-center justify-end gap-1 rounded-tile border-2 border-border bg-panel px-2 text-center outline-none',
              'transition-[border-color,background-color,transform] duration-[var(--motion-fast)] data-hovered:border-border-control data-pressed:scale-[0.98]',
              'data-selected:border-primary data-selected:bg-primary-soft/60 data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
              layout === 'cards' ? 'min-h-32 py-3' : 'min-h-24 py-2.5',
            )}
            data-testid={`text-size-${percentOf(s)}`}
          >
            {({ isSelected }) => (
              <>
                {isSelected && (
                  <motion.span layoutId={`${testId}-check`} transition={reduced ? { duration: 0 } : { type: 'spring', bounce: 0.25, duration: 0.4 }} aria-hidden className="absolute end-2 top-2 grid size-5 place-items-center rounded-pill bg-primary text-on-primary">
                    <Check className="size-3.5" strokeWidth={3} />
                  </motion.span>
                )}
                {/* The sample is sized from 1rem, not from the applied size, so every option shows its own size. */}
                <span aria-hidden className="font-display leading-none font-semibold text-text" style={{ fontSize: `calc(${layout === 'cards' ? 1.375 : 1.125}rem * ${s})` }}>
                  {t('a11y:textSize.sample')}
                </span>
                <span className="mt-1 block text-sm font-semibold text-text">{t(`a11y:textSize.names.${NAME[s]}` as 'a11y:textSize.names.small')}</span>
                <span className="block text-xs text-muted">
                  <bdi dir="ltr" className="ltr-ref">{t('a11y:textSize.percent', { value: percentOf(s) })}</bdi>
                </span>
              </>
            )}
          </Radio>
        ))}
      </div>
    </RadioGroup>
  );
}

/** A sample of what the person reads every day, shown at the size being chosen. */
function DefaultPreview() {
  const { t } = useT();
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold tracking-[0.08em] text-accent uppercase">{t('a11y:textSize.preview.eyebrow')}</p>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-lg font-bold text-text">{t('a11y:textSize.preview.title')}</p>
          <p className="text-sm text-muted">{t('a11y:textSize.preview.body')}</p>
        </div>
        <p className="text-2xl font-bold tracking-tight text-text">
          <bdi dir="ltr" className="ltr-ref">{t('a11y:textSize.preview.amount')}</bdi>
        </p>
      </div>
      <span className="inline-flex min-h-11 items-center rounded-pill bg-primary px-5 text-sm font-semibold text-on-primary">{t('a11y:textSize.preview.action')}</span>
    </div>
  );
}

/**
 * Settings: all six sizes, applied and saved as soon as one is chosen (the change is announced),
 * with a live sample and "Reset to default".
 */
export function TextSizeSettings({ preview, testId = 'text-size-settings' }: { preview?: ReactNode; testId?: string }) {
  const { t } = useT();
  const announce = useAnnounce();
  const { textScale, save, reset, saved } = useDisplayPreferences();
  const choose = (s: TextScale) => {
    save(s);
    announce(t('a11y:textSize.applied', { value: percentOf(s) }));
  };
  return (
    <div className="space-y-5" data-testid={testId} data-scale={percentOf(textScale)}>
      <TextSizeChooser scales={TEXT_SCALES} value={textScale} onChange={choose} label={t('a11y:textSize.settingsLabel')} layout="stops" testId="text-size-stops" />
      <div className="rounded-card border border-border bg-raised p-4 sm:p-5" aria-label={t('a11y:textSize.previewLabel')} role="group" data-testid="text-size-preview">
        {preview ?? <DefaultPreview />}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted" role="status" data-testid="text-size-current">
          {t('a11y:textSize.current', { value: percentOf(textScale) })}
        </p>
        <Button
          variant="secondary"
          icon={RotateCcw}
          isDisabled={textScale === DEFAULT_TEXT_SCALE && !!saved}
          onPress={() => {
            reset();
            announce(t('a11y:textSize.applied', { value: 100 }));
          }}
          data-testid="text-size-reset"
        >
          {t('a11y:textSize.reset')}
        </Button>
      </div>
    </div>
  );
}

/**
 * First run (owner, C.2): one short, welcoming step before anything else. The whole page resizes as
 * a size is chosen; Continue keeps it; it can be changed later in settings. The welcome wizard
 * (PORTAL-030, Gate D.1) shows it as one of its steps, with its own step label and a way back.
 */
export function TextSizeWelcome({ appName, organisation, preview, onDone, eyebrow, onBack }: { appName: string; organisation: string; preview?: ReactNode; onDone?: () => void; eyebrow?: string; onBack?: () => void }) {
  const { t } = useT();
  const titleId = useId();
  const { textScale, preview: show, save } = useDisplayPreferences();
  const value = (FIRST_RUN_SCALES as readonly number[]).includes(textScale) ? textScale : DEFAULT_TEXT_SCALE;
  return (
    <div className="min-h-dvh bg-bg">
      <main id="main-content" tabIndex={-1} aria-labelledby={titleId} className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pt-6 pb-8 outline-none sm:px-6 sm:pt-10" data-testid="text-size-welcome">
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-primary text-on-primary">
              <Type className="size-5" />
            </span>
            <span className="min-w-0 leading-tight">
              <bdi className="block text-sm font-semibold [overflow-wrap:anywhere] text-text">{organisation}</bdi>
              <span className="block text-xs text-muted">{appName}</span>
            </span>
          </span>
          <LocaleToggle />
        </div>
        <div className="mt-8 space-y-2 motion-safe:animate-rise-in sm:mt-12">
          <p className="text-xs font-semibold tracking-[0.12em] text-accent uppercase">{eyebrow ?? t('a11y:textSize.welcomeEyebrow')}</p>
          <h1 id={titleId} className="text-figure-sm leading-tight font-bold tracking-tight text-text sm:text-4xl">
            {t('a11y:textSize.welcomeTitle')}
          </h1>
          <p className="text-base text-muted">{t('a11y:textSize.welcomeBody')}</p>
        </div>
        <div className="mt-6 space-y-5">
          <TextSizeChooser scales={FIRST_RUN_SCALES} value={value as TextScale} onChange={show} label={t('a11y:textSize.welcomeTitle')} />
          <div className="rounded-card border border-border bg-panel p-4 shadow-card sm:p-5" role="group" aria-label={t('a11y:textSize.previewLabel')} data-testid="text-size-preview">
            {preview ?? <DefaultPreview />}
          </div>
        </div>
        <div className="mt-auto space-y-3 pt-8">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
          {onBack && (
            <Button variant="quiet" className="w-full justify-center sm:w-auto" onPress={onBack} data-testid="text-size-back">
              {t('identity:welcome.back')}
            </Button>
          )}
          <Button
            variant="primary"
            className="w-full justify-center sm:w-auto"
            onPress={() => {
              save(value as TextScale);
              onDone?.();
            }}
            data-testid="text-size-continue"
          >
            {t('a11y:textSize.continue', { value: percentOf(value as TextScale) })}
          </Button>
          </div>
          <p className="text-sm text-muted">{t('a11y:textSize.changeLater')}</p>
        </div>
      </main>
    </div>
  );
}
