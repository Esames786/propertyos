import { imageScrimGradient } from '@repo/tokens';
import { cn, DirectionalIcon, IconTile, Link, Photo, RevealItem, Stagger, TILE_INK, TILE_SOFT_BG, useReducedMotion, useSession, useT, type TileHue } from '@repo/ui';
import { ArrowRight, Building, Building2, Check, Clock3, Languages, PlayCircle, ReceiptText, Sparkles, UsersRound, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useId } from 'react';
import { LINKS } from '../../nav.config';
import { EntryFrame, MonogramTile } from './EntryFrame';
import { DISPLAY_UR, entryHref, useSafeNext } from './entry';

/**
 * Get started (Stage 1.5R, entry A): one clear decision for a first visit. Two equally weighted
 * paths: explore the fictional demo without signing up, or walk through the (simulated) developer
 * workspace setup. Language, accessibility and sign-in stay reachable; `?next=` is carried along.
 */
export default function GetStartedPage() {
  const { t } = useT();
  const next = useSafeNext();
  const chooseId = useId();

  const features: Array<{ icon: LucideIcon; hue: TileHue; label: string }> = [
    { icon: Building2, hue: 'emerald', label: t('start:welcome.features.inventory') },
    { icon: UsersRound, hue: 'sky', label: t('start:welcome.features.sales') },
    { icon: ReceiptText, hue: 'gold', label: t('start:welcome.features.collections') },
    { icon: Languages, hue: 'violet', label: t('start:welcome.features.bilingual') },
  ];

  return (
    <EntryFrame testId="get-started">
      <div className="grid items-start gap-10 pt-2 sm:pt-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12 lg:pt-10 xl:gap-16">
        <Stagger className="min-w-0 space-y-8 sm:space-y-10">
          <RevealItem>
            <p className="inline-flex items-center gap-2 rounded-pill border border-border bg-panel px-3 py-1 text-xs font-semibold tracking-[0.06em] text-accent uppercase shadow-card">
              <Sparkles aria-hidden className="size-3.5" />
              {t('start:welcome.eyebrow')}
            </p>
            <h1 id="page-title" tabIndex={-1} className={cn('mt-4 max-w-2xl font-display text-4xl leading-[1.12] text-text outline-none sm:text-5xl sm:leading-[1.08] xl:text-hero', DISPLAY_UR)}>
              {t('start:welcome.heading')}
            </h1>
            <p className="mt-4 max-w-xl text-base text-muted sm:text-lg">{t('start:welcome.intro')}</p>
            <ul aria-label={t('start:welcome.featuresLabel')} className="mt-6 flex flex-wrap gap-2">
              {features.map((f) => (
                <li key={f.label} className="inline-flex items-center gap-2 rounded-pill border border-border bg-panel py-1 ps-1 pe-3 text-sm font-medium text-text shadow-card">
                  <IconTile icon={f.icon} hue={f.hue} size="sm" className="rounded-pill" />
                  {f.label}
                </li>
              ))}
            </ul>
          </RevealItem>

          <RevealItem>
            <section aria-labelledby={chooseId}>
              <h2 id={chooseId} className="text-lg font-bold text-text">
                {t('start:welcome.chooseHeading')}
              </h2>
              <ul className="mt-4 grid gap-4 md:grid-cols-2">
                <li className="min-w-0">
                  <ChoiceCard
                    href={entryHref(LINKS.demoLaunch, { next })}
                    icon={PlayCircle}
                    hue="emerald"
                    title={t('start:welcome.demo.title')}
                    body={t('start:welcome.demo.body')}
                    points={[t('start:welcome.demo.points.roles'), t('start:welcome.demo.points.tour'), t('start:welcome.demo.points.safe')]}
                    meta={t('start:welcome.demo.meta')}
                    cta={t('start:welcome.demo.cta')}
                    testId="choice-demo"
                  />
                </li>
                <li className="min-w-0">
                  <ChoiceCard
                    href={entryHref(LINKS.workspaceSetup, { next })}
                    icon={Building2}
                    hue="gold"
                    title={t('start:welcome.setup.title')}
                    body={t('start:welcome.setup.body')}
                    points={[t('start:welcome.setup.points.account'), t('start:welcome.setup.points.company'), t('start:welcome.setup.points.team')]}
                    meta={t('start:welcome.setup.meta')}
                    cta={t('start:welcome.setup.cta')}
                    testId="choice-setup"
                  />
                </li>
                <li className="min-w-0 md:col-span-2">
                  <ChoiceCard
                    href={entryHref(LINKS.demoLaunch, { demo: 'society', next })}
                    icon={Building}
                    hue="teal"
                    title={t('start:welcome.society.title')}
                    body={t('start:welcome.society.body')}
                    points={[t('start:welcome.society.points.flats'), t('start:welcome.society.points.billing'), t('start:welcome.society.points.roles')]}
                    meta={t('start:welcome.society.meta')}
                    cta={t('start:welcome.society.cta')}
                    testId="choice-society"
                  />
                </li>
              </ul>
            </section>
          </RevealItem>

          <RevealItem>
            <p className="text-sm text-muted">
              {t('start:welcome.signInPrompt')}{' '}
              <Link href={entryHref(LINKS.signIn, { next })} className="font-semibold" data-testid="get-started-sign-in">
                {t('start:welcome.signInLink')}
              </Link>
            </p>
          </RevealItem>
        </Stagger>

        <HeroVisual />
      </div>
    </EntryFrame>
  );
}

/** One of the two paths. The whole card is a single link; its description is read after the name. */
function ChoiceCard({
  href,
  icon,
  hue,
  title,
  body,
  points,
  meta,
  cta,
  testId,
}: {
  href: string;
  icon: LucideIcon;
  hue: TileHue;
  title: string;
  body: string;
  points: string[];
  meta: string;
  cta: string;
  testId: string;
}) {
  const descId = useId();
  return (
    <Link
      href={href}
      variant="plain"
      aria-label={title}
      aria-describedby={descId}
      data-testid={testId}
      className={cn(
        'group relative flex h-full flex-col gap-5 rounded-card border border-border/80 bg-panel p-5 text-start shadow-card outline-none sm:p-6',
        'transition-[translate,box-shadow,border-color] duration-[var(--motion-regular)] ease-[var(--ease-emphasized)]',
        'data-hovered:-translate-y-1 data-hovered:border-primary/40 data-hovered:shadow-lift data-pressed:translate-y-0',
        'data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
      )}
    >
      <IconTile icon={icon} hue={hue} variant="solid" size="xl" className="shadow-card" />
      <span className="block">
        <span className="block text-xl leading-snug font-bold text-text sm:text-lead">{title}</span>
        <span aria-hidden className={cn('mt-2 inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold', TILE_SOFT_BG[hue], TILE_INK[hue])}>
          <Clock3 className="size-3.5 shrink-0" />
          <span>{meta}</span>
        </span>
        <span id={descId} className="mt-3 block text-md text-muted">
          {body} <span className="sr-only">{meta}</span>
        </span>
      </span>
      <span className="block space-y-2" aria-hidden>
        {points.map((p) => (
          <span key={p} className="flex items-start gap-2 text-sm text-text">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2.5} />
            <span>{p}</span>
          </span>
        ))}
      </span>
      <span aria-hidden className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4 text-sm font-semibold text-primary">
        {cta}
        <span className="grid size-10 place-items-center rounded-pill bg-primary-soft text-primary transition-colors duration-[var(--motion-fast)] group-data-hovered:bg-primary group-data-hovered:text-on-primary">
          <DirectionalIcon icon={ArrowRight} className="size-4 transition-transform duration-[var(--motion-regular)] group-data-hovered:translate-x-0.5 rtl:group-data-hovered:-translate-x-0.5" />
        </span>
      </span>
    </Link>
  );
}

/** Illustrative photograph of the fictional demo project, with the demo tenant on a floating card. */
function HeroVisual() {
  const { t } = useT();
  const { tenant } = useSession();
  const reduced = useReducedMotion();
  return (
    <motion.figure
      className="relative min-w-0 lg:sticky lg:top-6"
      initial={reduced ? false : { opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', bounce: 0.14, duration: 0.8, delay: 0.1 }}
    >
      <div className="relative overflow-hidden rounded-[1.75rem] bg-text shadow-raised">
        <Photo
          imageKey="heights-dusk"
          sizes="(min-width: 1280px) 520px, (min-width: 1024px) 42vw, 100vw"
          priority
          className="aspect-[4/3] w-full sm:aspect-[16/10] lg:aspect-[4/5]"
        />
        <figcaption className="absolute inset-x-0 bottom-0 px-5 pt-14 pb-5 text-inverse sm:px-6 sm:pb-6" style={{ background: imageScrimGradient() }}>
          <span className="block font-display text-2xl leading-tight sm:text-figure-sm">
            <bdi>{t('start:welcome.photo.name')}</bdi>
          </span>
          <span className="mt-1 block text-sm text-inverse/90">{t('start:welcome.photo.caption')}</span>
        </figcaption>
      </div>
      <div className="relative z-10 mx-4 -mt-6 flex items-center gap-3 rounded-card border border-border bg-panel/95 p-4 shadow-lift backdrop-blur-sm sm:mx-6 lg:absolute lg:-start-8 lg:top-10 lg:mx-0 lg:mt-0 lg:max-w-[18rem]">
        <MonogramTile letter={tenant.name.charAt(0)} />
        <span className="min-w-0 leading-snug">
          <span className="block text-sm font-bold text-text">
            <bdi>{tenant.name}</bdi>
          </span>
          <span className="block text-xs text-muted">{t('start:welcome.photo.tenantDetail')}</span>
        </span>
      </div>
    </motion.figure>
  );
}
