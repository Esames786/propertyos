import type { PortalConstruction, PortalHome } from '@repo/contracts';
import { imageScrimGradient, IMAGE_SCRIM } from '@repo/tokens';
import { dynamicT, ErrorState, HueChip, PageHeader, Photo, ProgressRing, RevealItem, Stagger, useApiQuery, useT } from '@repo/ui';
import { HardHat, KeyRound } from 'lucide-react';
import { MilestoneList, PortalSkeleton, Section, usePortalFormat } from './shared';

/** PORTAL-012 construction updates: overall progress, milestones and the site-update timeline. */
export default function ConstructionPage() {
  const { t } = useT();
  const query = useApiQuery<PortalConstruction>({ method: 'GET', path: '/portal/construction' });
  // The home read model carries the owner's tower and possession date for the "your tower" note.
  const home = useApiQuery<PortalHome>({ method: 'GET', path: '/portal/home' });
  if (query.isPending) return <PortalSkeleton title={t('portal:construction.title')} />;
  if (query.isError)
    return (
      <>
        <PageHeader title={t('portal:construction.title')} />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </>
    );
  return <ConstructionView data={query.data} home={home.data} />;
}

function ConstructionView({ data, home }: { data: PortalConstruction; home?: PortalHome }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const fmt = usePortalFormat(home?.asOf ?? data.updates[0]?.at ?? new Date().toISOString());
  const latest = data.updates[0];
  const property = home?.property;
  return (
    <div className="space-y-8" data-testid="portal-construction-page">
      <PageHeader title={t('portal:construction.title')} description={t('portal:construction.description', { project: data.projectName, date: fmt.monthYear(data.completion) })} />

      <section aria-labelledby="overall-title" className="relative isolate overflow-hidden rounded-card bg-text shadow-raised">
        {latest?.imageKey && <Photo imageKey={latest.imageKey} sizes="(min-width: 1024px) 1100px, 100vw" priority className="absolute inset-0 -z-10 size-full" labelPosition="top-end" />}
        <div className="flex min-h-[15rem] flex-col justify-end sm:min-h-[18rem]">
          <div className="flex flex-wrap items-end justify-between gap-5 px-5 pb-5 text-inverse sm:px-7 sm:pb-6" style={{ paddingTop: IMAGE_SCRIM.fade, background: imageScrimGradient() }}>
            <div className="min-w-0">
              <h2 id="overall-title" className="text-sm font-semibold tracking-wide text-inverse uppercase">
                {t('portal:construction.overall')}
              </h2>
              <p className="mt-1 font-display text-figure leading-tight sm:text-figure-lg">
                <bdi>{data.projectName}</bdi>
              </p>
              {property?.towerName && property.possessionOn && (
                <p className="mt-2 flex max-w-xl items-start gap-2 text-sm text-inverse">
                  <KeyRound aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {t('portal:construction.yourTower', { tower: property.towerName, date: fmt.date(property.possessionOn) })}
                </p>
              )}
            </div>
            <ProgressRing
              value={data.progress}
              size={104}
              stroke={9}
              color="#efe0bf"
              track="rgb(255 255 255 / 0.22)"
              label={t('portal:construction.progressLabel', { project: data.projectName, percent: fmt.percent(data.progress) })}
            >
              <span className="leading-none">
                <bdi dir="ltr" className="ltr-ref block text-2xl font-bold">
                  {fmt.percent(data.progress)}
                </bdi>
                <span className="text-mini text-inverse">{t('portal:home.construction.built')}</span>
              </span>
            </ProgressRing>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-6">
        <Section id="milestones-title" title={t('portal:construction.milestonesTitle')} className="lg:col-span-5">
          <div className="rounded-card border border-border/70 bg-panel p-4 shadow-card sm:p-5">
            <MilestoneList milestones={data.milestones} fmt={fmt} dense={false} />
          </div>
        </Section>
        <Section id="updates-title" title={t('portal:construction.updatesTitle')} className="lg:col-span-7" testId="construction-updates">
          <Stagger as="ol" className="relative space-y-4 before:absolute before:inset-y-2 before:start-[1.1875rem] before:w-px before:bg-border">
            {data.updates.map((u) => (
              <RevealItem as="li" key={u.id} className="relative flex gap-4">
                <span aria-hidden className="relative z-10 mt-1 grid size-10 shrink-0 place-items-center rounded-pill border-4 border-bg bg-tile-amber-soft text-tile-amber-ink">
                  <HardHat className="size-4" />
                </span>
                <article className="min-w-0 flex-1 overflow-hidden rounded-card border border-border/70 bg-panel shadow-card">
                  {u.imageKey && u !== latest && <Photo imageKey={u.imageKey} sizes="(min-width: 1024px) 560px, 90vw" className="aspect-[16/6]" decorative />}
                  <div className="p-4 sm:p-5">
                    <p className="text-xs text-muted">
                      <time dateTime={u.at}>{fmt.instant(u.at)}</time>
                    </p>
                    <h3 className="mt-0.5 text-base leading-snug font-bold text-text">{dt(u.titleKey, u.params)}</h3>
                    <p className="mt-1.5 text-sm text-text">{dt(u.bodyKey, u.params)}</p>
                    <HueChip hue="amber" className="mt-3">
                      {t('portal:construction.milestoneTag', { milestone: t(`portal:construction.milestone.${u.milestone}`) })}
                    </HueChip>
                  </div>
                </article>
              </RevealItem>
            ))}
          </Stagger>
        </Section>
      </div>
    </div>
  );
}
