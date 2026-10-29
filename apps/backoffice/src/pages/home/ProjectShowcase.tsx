import type { ProjectMilestone, ProjectShowcase as Showcase } from '@repo/contracts';
import { directionOf } from '@repo/i18n';
import { IMAGE_SCRIM, imageScrimGradient } from '@repo/tokens';
import { cn, DirectionalIcon, IllustrativeChip, Link, Photo, ProgressRing, useAnnounce, useReducedMotion, useT } from '@repo/ui';
import { ArrowRight, Check, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import type { DashboardFormat } from './useDashboardFormat';

/**
 * Featured-project showcase: one project at a time over its photograph (always labelled
 * "Illustrative image"), with sales figures, construction progress and milestones. Manual only
 * (no auto-rotation, WCAG 2.2.2): arrows, dots, or a horizontal swipe on touch. The slide change
 * is announced; text sits on a scrim whose weakest point is contrast-tested.
 */
export function ProjectShowcase({ projects, fmt }: { projects: Showcase[]; fmt: DashboardFormat }) {
  const { t } = useT();
  const announce = useAnnounce();
  const reduced = useReducedMotion();
  const rtl = directionOf(fmt.locale) === 'rtl';
  const [state, setState] = useState({ index: 0, dir: 1 });
  const count = projects.length;
  const index = Math.min(state.index, count - 1);
  const project = projects[index];
  if (!project) return null;

  const go = (next: number, dir: number) => {
    const i = (next + count) % count;
    setState({ index: i, dir });
    announce(t('dashboard:showcase.slide', { index: i + 1, count, name: projects[i]!.name }));
  };
  const soldShare = project.units.total ? project.units.sold / project.units.total : 0;

  return (
    <section aria-label={t('dashboard:showcase.label')} className="flex min-w-0 flex-col overflow-hidden rounded-card bg-panel shadow-raised" data-testid="project-showcase">
      <div
        role="group"
        aria-label={t('dashboard:showcase.slide', { index: index + 1, count, name: project.name })}
        className="relative isolate min-h-[23rem] flex-1 overflow-hidden bg-text sm:min-h-[25rem]"
      >
        <AnimatePresence initial={false} custom={state.dir} mode="popLayout">
          <motion.div
            key={project.id}
            custom={state.dir}
            initial={reduced ? false : { opacity: 0, scale: 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.98 }}
            transition={{ duration: reduced ? 0 : 0.7, ease: [0.16, 1, 0.3, 1] }}
            drag={count > 1 ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={(_, info) => {
              if (Math.abs(info.offset.x) < 70) return;
              const forward = rtl ? info.offset.x > 0 : info.offset.x < 0;
              go(index + (forward ? 1 : -1), forward ? 1 : -1);
            }}
            className="absolute inset-0 touch-pan-y"
          >
            <Photo imageKey={project.imageKey} sizes="(min-width: 1280px) 760px, (min-width: 768px) 70vw, 100vw" priority className="size-full" labelled={false} />
          </motion.div>
        </AnimatePresence>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-linear-to-b from-[rgb(12_17_15/0.4)] to-transparent" />

        <div className="relative flex items-start justify-between gap-3 p-4 max-sm:justify-end sm:p-5">
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-[rgb(12_17_15/0.66)] px-3 py-1 text-xs font-medium whitespace-nowrap text-on-image backdrop-blur-md max-sm:hidden">
            <span aria-hidden className="size-1.5 rounded-pill bg-brass" />
            {t('dashboard:showcase.eyebrow')}
          </span>
          <div className="flex items-center gap-2">
            <IllustrativeChip />
            {count > 1 && (
              <span className="flex items-center gap-1">
                <CarouselButton label={t('dashboard:showcase.previous')} onPress={() => go(index - 1, -1)} icon={ChevronLeft} testId="showcase-prev" />
                <CarouselButton label={t('dashboard:showcase.next')} onPress={() => go(index + 1, 1)} icon={ChevronRight} testId="showcase-next" />
              </span>
            )}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-4 text-on-image sm:px-6 sm:pb-6" style={{ paddingTop: IMAGE_SCRIM.fade, background: imageScrimGradient() }}>
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm text-on-image">
                <MapPin aria-hidden className="size-4 shrink-0" />
                <span className="truncate">
                  {t(project.kind === 'towers' ? 'dashboard:showcase.metaTowers' : 'dashboard:showcase.metaPlots', {
                    city: project.city,
                    units: fmt.count(project.units.total),
                  })}
                </span>
              </p>
              <h2 className="mt-1.5 font-display text-figure leading-[1.05] sm:text-figure-lg" data-testid="showcase-title">
                <bdi>{project.name}</bdi>
              </h2>
              <p className="mt-1 text-sm text-on-image">{t('dashboard:showcase.completion', { date: fmt.monthYear(project.completion) })}</p>
            </div>
            <ProgressRing
              value={project.progress}
              size={84}
              stroke={7}
              color="#efe0bf"
              track="rgb(255 255 255 / 0.22)"
              label={t('dashboard:showcase.progressLabel', { percent: fmt.percent(project.progress) })}
            >
              <span className="leading-none">
                <bdi dir="ltr" className="ltr-ref block text-lg font-semibold">
                  {fmt.percent(project.progress)}
                </bdi>
                <span className="text-micro tracking-wide text-on-image uppercase">{t('dashboard:showcase.built')}</span>
              </span>
            </ProgressRing>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-on-image/20 pt-4 sm:grid-cols-4">
            <Stat label={t('dashboard:showcase.sold')} value={fmt.count(project.units.sold)} hint={fmt.percent(soldShare)} />
            <Stat label={t('dashboard:showcase.available')} value={fmt.count(project.units.available)} />
            <Stat label={t('dashboard:showcase.salesToDate')} value={fmt.money(project.salesValue.amount)} />
            <Stat label={t('dashboard:showcase.fromPrice')} value={fmt.money(project.fromPrice.amount, 1)} />
          </dl>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
        <MilestoneTrack milestones={project.milestones} fmt={fmt} />
        <div className="flex items-center gap-4">
          {count > 1 && (
            <span className="flex items-center gap-1.5">
              {projects.map((p, i) => (
                <AriaButton
                  key={p.id}
                  aria-label={t('dashboard:showcase.goTo', { name: p.name })}
                  aria-current={i === index ? 'true' : undefined}
                  onPress={() => go(i, i > index ? 1 : -1)}
                  className="group grid size-6 place-items-center rounded-pill outline-none data-focus-visible:outline-2 data-focus-visible:outline-focus pointer-coarse:size-8"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'h-1.5 rounded-pill transition-[width,background-color] duration-[var(--motion-regular)]',
                      i === index ? 'w-5 bg-primary' : 'w-1.5 bg-border-control group-data-hovered:bg-muted',
                    )}
                  />
                </AriaButton>
              ))}
            </span>
          )}
          <Link href={project.href} variant="plain" className="group inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary">
            {t('dashboard:showcase.open')}
            <DirectionalIcon icon={ArrowRight} className="size-4 transition-transform duration-[var(--motion-fast)] group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-on-image">{label}</dt>
      <dd className="mt-0.5 flex items-baseline gap-1.5">
        <bdi dir="ltr" className="ltr-ref truncate text-lg font-semibold">
          {value}
        </bdi>
        {hint && (
          <bdi dir="ltr" className="ltr-ref text-xs text-on-image">
            {hint}
          </bdi>
        )}
      </dd>
    </div>
  );
}

function CarouselButton({ label, onPress, icon, testId }: { label: string; onPress: () => void; icon: typeof ChevronLeft; testId: string }) {
  return (
    <AriaButton
      aria-label={label}
      onPress={onPress}
      data-testid={testId}
      className="grid size-9 place-items-center rounded-pill bg-[rgb(12_17_15/0.5)] text-on-image outline-none backdrop-blur-md transition-colors duration-[var(--motion-fast)] data-hovered:bg-[rgb(12_17_15/0.7)] data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-inverse data-focus-visible:ring-4 data-focus-visible:ring-[rgb(12_17_15/0.85)] pointer-coarse:size-11"
    >
      <DirectionalIcon icon={icon} className="size-5" />
    </AriaButton>
  );
}

/** Milestones as an ordered list: state in icon + text (never colour alone); compact on phones. */
function MilestoneTrack({ milestones, fmt }: { milestones: ProjectMilestone[]; fmt: DashboardFormat }) {
  const { t } = useT();
  const active = milestones.find((m) => m.progress > 0 && m.progress < 1) ?? milestones.find((m) => m.progress === 0);
  const state = (m: ProjectMilestone) =>
    m.progress >= 1
      ? t('dashboard:showcase.milestoneState.done')
      : m.progress > 0
        ? t('dashboard:showcase.milestoneState.active', { percent: fmt.percent(m.progress) })
        : t('dashboard:showcase.milestoneState.upcoming');
  return (
    <div className="min-w-0 flex-1">
      <ol aria-label={t('dashboard:showcase.milestonesLabel')} className="flex min-w-0 items-start" data-testid="milestones">
        {milestones.map((m, i) => {
          const done = m.progress >= 1;
          const current = m === active;
          return (
            <li key={m.key} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
              {i > 0 && (
                <span aria-hidden className="absolute top-2.5 end-1/2 h-0.5 w-full -translate-y-1/2 rounded-pill bg-sunken">
                  <span className="block h-full rounded-pill bg-primary" style={{ width: `${done || current ? 100 : 0}%` }} />
                </span>
              )}
              <span
                aria-hidden
                className={cn(
                  'relative z-[1] grid size-5 place-items-center rounded-pill border-2',
                  done ? 'border-primary bg-primary text-on-primary' : current ? 'border-primary bg-panel' : 'border-border-control bg-panel',
                )}
              >
                {done ? <Check className="size-3" strokeWidth={3} /> : current ? <span className="size-2 rounded-pill bg-primary" /> : null}
              </span>
              <span className={cn('mt-1.5 max-w-full truncate px-0.5 text-xs max-sm:sr-only', current ? 'font-semibold text-text' : 'text-muted')}>
                {t(`dashboard:showcase.milestone.${m.key}`)}
              </span>
              <span className={cn('text-mini text-muted', current ? 'max-sm:sr-only' : 'sr-only')}>{state(m)}</span>
            </li>
          );
        })}
      </ol>
      {active && (
        <p aria-hidden className="mt-2 text-xs text-muted sm:hidden">
          <span className="font-semibold text-text">{t(`dashboard:showcase.milestone.${active.key}`)}</span> · {state(active)}
        </p>
      )}
    </div>
  );
}
