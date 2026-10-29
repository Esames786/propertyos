import type { MyProfile } from '@repo/contracts';
import { LOCALE_META, SUPPORTED_LOCALES, useLocale, type AppLocale } from '@repo/i18n';
import { Button, ChoiceCards, Link, LocaleToggle, TextSizeWelcome, ThemeChoice, useApiQuery, useDisplayPreferences, useNavigation, useSession, useT } from '@repo/ui';
import { BadgeCheck, Languages, PartyPopper, ReceiptText, Settings2, UserRound } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { DUES } from '../../nav.config';
import { useDocumentTitle } from './parts';

type Step = 'language' | 'size' | 'theme' | 'done';

/**
 * PORTAL-030 Welcome & setup (Gate D.1): where an accepted invitation lands. Language, text size and
 * light or dark, one choice per step, each applied to the page at once; then what the resident can
 * do now. The text-size step is the C.2 first-run step itself, and a resident who already chose a
 * size is never asked again (the step is skipped and the size kept).
 */
export default function WelcomePage() {
  const { t } = useT();
  const { tenant } = useSession();
  const display = useDisplayPreferences();
  // Decided once, when the page opens: saving the size on its step must not remove the step.
  const asksSize = useRef(!display.saved).current;
  const steps: Step[] = asksSize ? ['language', 'size', 'theme'] : ['language', 'theme'];
  const [step, setStep] = useState<Step>('language');
  const index = steps.indexOf(step);
  const next = () => setStep(steps[index + 1] ?? 'done');
  const back = () => setStep(steps[index - 1] ?? 'language');
  const eyebrow = t('identity:welcome.stepOf', { step: index + 1, total: steps.length });
  const appName = t('dues:shell.appName');
  useDocumentTitle(t('nav:pages.welcome'));

  if (step === 'size') return <TextSizeWelcome appName={appName} organisation={tenant.name} eyebrow={eyebrow} onDone={next} onBack={back} />;
  if (step === 'done') return <Done />;
  return (
    <Frame organisation={tenant.name} appName={appName} eyebrow={eyebrow} step={step} onBack={index > 0 ? back : undefined} onNext={next} testId={`welcome-${step}`}>
      {step === 'language' ? <LanguageStep /> : <ThemeStep keptSize={asksSize ? null : display.textScale} />}
    </Frame>
  );
}

function LanguageStep() {
  const { t } = useT();
  const { locale, setLocale } = useLocale();
  return (
    <ChoiceCards<AppLocale>
      label={t('identity:welcome.language.title')}
      hideLabel
      value={locale}
      onChange={setLocale}
      columns={2}
      testId="welcome-language-choice"
      options={SUPPORTED_LOCALES.map((l) => ({
        id: l,
        label: LOCALE_META[l].nativeName,
        visual: (
          <span lang={l} dir={l === 'ur-PK' ? 'rtl' : 'ltr'} className="flex h-16 items-center justify-center rounded-[8px] bg-sunken text-2xl font-semibold text-text">
            {l === 'ur-PK' ? 'خوش آمدید' : 'Welcome'}
          </span>
        ),
      }))}
    />
  );
}

function ThemeStep({ keptSize }: { keptSize: number | null }) {
  const { t } = useT();
  const { prefs, update } = useDisplayPreferences();
  return (
    <div className="space-y-4">
      <ThemeChoice value={prefs.theme} onChange={(theme) => update({ theme })} testId="welcome-theme-choice" />
      {keptSize !== null && (
        <p className="flex items-center gap-1.5 text-sm text-muted" data-testid="welcome-size-kept">
          <BadgeCheck aria-hidden className="size-4 text-success" />
          {t('identity:welcome.chosen', { value: Math.round(keptSize * 100) })}
        </p>
      )}
    </div>
  );
}

/** Same frame as the C.2 text-size step, so the three steps read as one wizard. */
function Frame({ organisation, appName, eyebrow, step, onBack, onNext, testId, children }: { organisation: string; appName: string; eyebrow: string; step: 'language' | 'theme'; onBack?: () => void; onNext: () => void; testId: string; children: ReactNode }) {
  const { t } = useT();
  const titleId = useId();
  return (
    <div className="min-h-dvh bg-bg">
      <main id="main-content" tabIndex={-1} aria-labelledby={titleId} className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pt-6 pb-8 outline-none sm:px-6 sm:pt-10" data-testid={testId}>
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-primary text-on-primary">
              {step === 'language' ? <Languages className="size-5" /> : <Settings2 className="size-5" />}
            </span>
            <span className="min-w-0 leading-tight">
              <bdi className="block text-sm font-semibold [overflow-wrap:anywhere] text-text">{organisation}</bdi>
              <span className="block text-xs text-muted">{appName}</span>
            </span>
          </span>
          <LocaleToggle />
        </div>
        <div className="mt-8 space-y-2 motion-safe:animate-rise-in sm:mt-12">
          <p className="text-xs font-semibold tracking-[0.12em] text-accent uppercase">{eyebrow}</p>
          <h1 id={titleId} className="text-figure-sm leading-tight font-bold tracking-tight text-text sm:text-4xl">
            {t(`identity:welcome.${step}.title`)}
          </h1>
          <p className="text-base text-muted">{t(`identity:welcome.${step}.body`)}</p>
        </div>
        <div className="mt-6">{children}</div>
        <div className="mt-auto flex flex-col-reverse gap-3 pt-8 sm:flex-row sm:items-center">
          {onBack && (
            <Button variant="quiet" className="w-full justify-center sm:w-auto" onPress={onBack} data-testid="welcome-back">
              {t('identity:welcome.back')}
            </Button>
          )}
          <Button variant="primary" className="w-full justify-center sm:w-auto" onPress={onNext} data-testid="welcome-continue">
            {t('identity:welcome.continue')}
          </Button>
        </div>
      </main>
    </div>
  );
}

function Done() {
  const { t } = useT();
  const { navigate } = useNavigation();
  const { persona, tenant } = useSession();
  const profile = useApiQuery<MyProfile>({ method: 'GET', path: '/me/profile' });
  const flats = profile.data?.flats ?? [];
  const firstName = (persona?.displayName ?? '').split(/\s+/)[0] ?? '';
  const items = [
    { icon: ReceiptText, label: t('identity:welcome.done.bills'), href: DUES.bills },
    { icon: BadgeCheck, label: t('identity:welcome.done.receipts'), href: DUES.history },
    { icon: UserRound, label: t('identity:welcome.done.profile'), href: '/customer/portal/profile' },
  ];
  return (
    <div className="min-h-dvh bg-bg">
      <main id="main-content" tabIndex={-1} aria-labelledby="welcome-done-title" className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pt-6 pb-8 outline-none sm:px-6 sm:pt-10" data-testid="welcome-done">
        <div className="flex justify-end">
          <LocaleToggle />
        </div>
        <div className="mt-6 space-y-3 motion-safe:animate-rise-in sm:mt-10">
          <span aria-hidden className="grid size-14 place-items-center rounded-[18px] bg-primary text-on-primary">
            <PartyPopper className="size-7" />
          </span>
          <h1 id="welcome-done-title" className="text-figure-sm leading-tight font-bold tracking-tight text-text sm:text-4xl">
            {t('identity:welcome.done.title', { name: firstName })}
          </h1>
          {flats.length > 0 && (
            <p className="text-base text-muted" data-testid="welcome-flats">
              {t('identity:welcome.done.body', { flats: '⁦' + flats.join(', ') + '⁩', organisation: tenant.name })}
            </p>
          )}
        </div>
        <section aria-labelledby="welcome-next" className="mt-8">
          <h2 id="welcome-next" className="text-base font-semibold text-text">
            {t('identity:welcome.done.next')}
          </h2>
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-3">
            {items.map(({ icon: Icon, label, href }) => (
              <li key={href}>
                <Link
                  href={href}
                  variant="plain"
                  className="flex h-full items-start gap-3 rounded-card border border-border/70 bg-panel p-4 text-sm font-medium text-text shadow-card outline-none hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-tile bg-primary-soft text-primary">
                    <Icon className="size-4.5" />
                  </span>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">{t('identity:welcome.done.settings')}</p>
        </section>
        <div className="mt-auto pt-8">
          <Button variant="primary" className="w-full justify-center sm:w-auto" onPress={() => navigate(DUES.home, { replace: true })} data-testid="welcome-home">
            {t('identity:welcome.done.home')}
          </Button>
        </div>
      </main>
    </div>
  );
}
