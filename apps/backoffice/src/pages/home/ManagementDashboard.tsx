import { DASHBOARD_RANGES, type DashboardRange, type DashboardSummary } from '@repo/contracts';
import { cn, ErrorState, QuickActions, SegmentedControl, Skeleton, useAnnounce, useApiQuery, useQueryParam, useReducedMotion, useSession, useShell, useT, type QuickAction } from '@repo/ui';
import { useGuidedTour } from '@repo/ui/onboarding';
import { BarChart3, BriefcaseBusiness, CalendarPlus, Compass, GraduationCap, Search, UserPlus, UsersRound } from 'lucide-react';
import { keepPreviousData } from '@tanstack/react-query';
import { useEffect, useId, useRef } from 'react';
import { LINKS } from '../../nav.config';
import { ActionCentre } from './ActionCentre';
import { KpiRow } from './KpiRow';
import { CollectionsCard, FunnelCard } from './PerformanceCharts';
import { ConstructionCard, InventoryCard, ResidencesRail } from './PortfolioCards';
import { ProjectShowcase } from './ProjectShowcase';
import { useDashboardFormat } from './useDashboardFormat';

const isRange = (v: string | null): v is DashboardRange => DASHBOARD_RANGES.includes(v as DashboardRange);

/**
 * HOME-001 role-aware dashboard (Stage 1.5 reference screen 1). One read model composes the page
 * by role: the manager sees everything; Sales sees pipeline and inventory; Finance sees
 * collections and verification. The reporting period lives in the URL (?range=) so a view can be
 * shared, scopes every figure below it, and keeps the previous frame visible while it refreshes.
 */
export default function ManagementDashboard() {
  const { t } = useT();
  const { persona, tenant, projectId } = useSession();
  const announce = useAnnounce();
  const [rangeParam, setRangeParam] = useQueryParam('range');
  const range: DashboardRange = isRange(rangeParam) ? rangeParam : '6m';
  const query = useApiQuery<DashboardSummary>({ method: 'GET', path: '/dashboard/summary', query: { range } }, { placeholderData: keepPreviousData });
  const perfId = useId();
  const portfolioId = useId();

  // Announce once the figures for a newly chosen period have arrived (not on first load).
  const announced = useRef<string>(`${range}:${projectId}`);
  useEffect(() => {
    const key = `${range}:${projectId}`;
    if (!query.data || query.isPlaceholderData || announced.current === key) return;
    announced.current = key;
    announce(t('dashboard:state.updated', { period: t(`dashboard:range.period.${range}`) }));
  }, [query.data, query.isPlaceholderData, range, projectId, announce, t]);

  if (query.isPending) return <DashboardSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const data = query.data;
  return <DashboardView data={data} range={range} refreshing={query.isPlaceholderData} onRange={(r) => setRangeParam(r === '6m' ? null : r)} personaId={persona?.id ?? 'manager'} personaName={persona?.displayName ?? ''} tenantName={tenant.name} perfId={perfId} portfolioId={portfolioId} />;
}

function DashboardView({
  data,
  range,
  refreshing,
  onRange,
  personaId,
  personaName,
  tenantName,
  perfId,
  portfolioId,
}: {
  data: DashboardSummary;
  range: DashboardRange;
  refreshing: boolean;
  onRange: (r: DashboardRange) => void;
  personaId: string;
  personaName: string;
  tenantName: string;
  perfId: string;
  portfolioId: string;
}) {
  const { t } = useT();
  const fmt = useDashboardFormat(data.asOf);
  const greeting = fmt.hour < 12 ? 'morning' : fmt.hour < 17 ? 'afternoon' : 'evening';
  const firstName = personaName.split(/\s+/)[0] ?? personaName;
  const eyebrow = personaId === 'sales' || personaId === 'finance' ? personaId : 'manager';
  const hasAttention = Object.keys(data.attention).length > 0;
  const actions = useDashboardActions(!!data.collections);

  return (
    <div className="space-y-10 sm:space-y-12" data-testid="management-dashboard">
      {/* Greeting */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pt-2 motion-safe:animate-rise-in">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">{t(`dashboard:eyebrow.${eyebrow}`)}</p>
          <h1 id="page-title" className="mt-1.5 text-[1.75rem] leading-tight font-bold tracking-tight text-text outline-none sm:text-[2.25rem]">
            {t(`dashboard:greeting.${greeting}`, { name: firstName })}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <bdi className="max-sm:w-full">{tenantName}</bdi>
            <span aria-hidden className="max-sm:hidden">
              ·
            </span>
            <span className="max-sm:w-full">{t('dashboard:asOf', { date: fmt.date(data.asOf.slice(0, 10)) })}</span>
          </p>
        </div>
      </header>

      {/* Featured project + today's work */}
      <div className={cn('grid gap-5 lg:gap-6', hasAttention && 'xl:grid-cols-12')}>
        {data.projects.length > 0 && (
          <div className={cn('min-w-0 [&>section]:h-full', hasAttention && 'xl:col-span-7')}>
            <ProjectShowcase key={data.projects.map((p) => p.id).join()} projects={data.projects} fmt={fmt} />
          </div>
        )}
        {hasAttention && (
          <div className="min-w-0 xl:col-span-5 [&>section]:h-full" data-tour-id="dashboard-action-centre">
            <ActionCentre attention={data.attention} fmt={fmt} />
          </div>
        )}
      </div>

      <QuickActions title={t('dashboard:quick.title')} actions={actions} tourId="dashboard-quick-actions" testId="dashboard-quick-actions" />

      {/* Performance: everything below the period control is scoped by it */}
      <section aria-labelledby={perfId} aria-busy={refreshing || undefined} className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h2 id={perfId} className="text-xl font-bold tracking-tight text-text sm:text-2xl">
              {t('dashboard:sections.performance')}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {t('dashboard:sections.performanceDescription', { period: t(`dashboard:range.period.${range}`), previous: t(`dashboard:range.previous.${range}`) })}
            </p>
          </div>
          <SegmentedControl
            label={t('dashboard:range.label')}
            value={range}
            onChange={onRange}
            testId="range-control"
            options={DASHBOARD_RANGES.map((r) => ({ id: r, label: t(`dashboard:range.${r}`), shortLabel: t(`dashboard:range.short.${r}`) }))}
          />
        </div>
        <div className={cn('space-y-5 transition-opacity duration-[var(--motion-regular)]', refreshing && 'opacity-60')}>
          <KpiRow kpis={data.kpis} range={range} fmt={fmt} />
          <PerformanceCharts data={data} range={range} fmt={fmt} />
        </div>
      </section>

      {/* Portfolio snapshot */}
      {(data.inventory || data.construction || data.residences) && (
        <section aria-labelledby={portfolioId} className="space-y-5">
          <div>
            <h2 id={portfolioId} className="text-xl font-bold tracking-tight text-text sm:text-2xl">
              {t('dashboard:sections.portfolio')}
            </h2>
            <p className="mt-1 text-sm text-muted">{t('dashboard:sections.portfolioDescription')}</p>
          </div>
          {(data.inventory || data.construction) && (
            <div className={cn('grid gap-5 lg:gap-6', data.inventory && data.construction && 'xl:grid-cols-12')}>
              {data.inventory && <InventoryCard rows={data.inventory} fmt={fmt} className={cn(data.construction && 'xl:col-span-5')} />}
              {data.construction && <ConstructionCard update={data.construction} fmt={fmt} className={cn(data.inventory && 'xl:col-span-7')} />}
            </div>
          )}
          {data.residences && data.residences.length > 0 && <ResidencesRail residences={data.residences} fmt={fmt} />}
        </section>
      )}
    </div>
  );
}

function PerformanceCharts({ data, range, fmt }: { data: DashboardSummary; range: DashboardRange; fmt: ReturnType<typeof useDashboardFormat> }) {
  const both = data.collections && data.funnel;
  if (!data.collections && !data.funnel) return null;
  return (
    <div className={cn('grid gap-5 lg:gap-6', both && 'xl:grid-cols-12')}>
      {data.collections && (
        <div id="collections" data-tour-id="dashboard-collections" className={cn('min-w-0 scroll-mt-24 [&>section]:h-full', both && 'xl:col-span-8')}>
          <CollectionsCard points={data.collections} range={range} fmt={fmt} />
        </div>
      )}
      {data.funnel && <FunnelCard funnel={data.funnel} range={range} fmt={fmt} className={cn(both && 'xl:col-span-4')} />}
    </div>
  );
}

/** Brings a dashboard section into view and moves focus to its heading (keyboard and screen readers follow). */
function scrollToSection(id: string, reduced: boolean) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  const heading = el.querySelector<HTMLElement>('h2, h3');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
}

/**
 * Quick actions on the start page, filtered by role. Every tile reaches something that works today:
 * a working drawer, a built screen, search, a tour or practice mode (no planned-screen dead ends).
 */
function useDashboardActions(hasCollections: boolean): QuickAction[] {
  const { t } = useT();
  const [, setDrawer] = useQueryParam('drawer');
  const { setPaletteOpen } = useShell();
  const tour = useGuidedTour();
  const reduced = useReducedMotion();
  return [
    { id: 'new-lead', label: t('dashboard:quick.newLead'), icon: UserPlus, hue: 'sky', onPress: () => setDrawer('new-lead', { replace: false }), permission: 'lead.create', testId: 'dqa-new-lead' },
    { id: 'visit', label: t('dashboard:quick.visit'), icon: CalendarPlus, hue: 'violet', onPress: () => setDrawer('schedule-visit', { replace: false }), permission: 'visit.schedule', testId: 'dqa-visit' },
    { id: 'sales', label: t('dashboard:quick.sales'), icon: BriefcaseBusiness, hue: 'teal', href: LINKS.salesHome, permission: 'lead.view', testId: 'dqa-sales' },
    { id: 'leads', label: t('dashboard:quick.leads'), icon: UsersRound, hue: 'emerald', href: LINKS.leads, permission: 'lead.view', testId: 'dqa-leads' },
    ...(hasCollections ? [{ id: 'collections', label: t('dashboard:quick.collections'), icon: BarChart3, hue: 'gold' as const, onPress: () => scrollToSection('collections', reduced), testId: 'dqa-collections' }] : []),
    { id: 'search', label: t('dashboard:quick.search'), icon: Search, hue: 'slate', onPress: () => setPaletteOpen(true), testId: 'dqa-search' },
    { id: 'tour', label: t('dashboard:quick.tour'), icon: Compass, hue: 'amber', onPress: () => tour.start('GLOBAL-TOUR-001'), testId: 'dqa-tour' },
    { id: 'practice', label: t('dashboard:quick.practice'), icon: GraduationCap, hue: 'rose', href: '/backoffice/help/practice', permission: 'lead.create', testId: 'dqa-practice' },
  ];
}

function DashboardSkeleton() {
  const { t } = useT();
  return (
    <div role="status" aria-busy="true" className="space-y-8" data-testid="skeleton">
      <span className="sr-only">{t('common:state.loading')}</span>
      <h1 className="sr-only">{t('nav:pages.dashboard')}</h1>
      <div className="space-y-3 pt-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-10 w-80 max-w-full" />
      </div>
      <div className="grid gap-6 xl:grid-cols-12">
        <Skeleton className="h-[30rem] rounded-card xl:col-span-8" />
        <Skeleton className="h-[30rem] rounded-card xl:col-span-4" />
      </div>
      <div className="grid gap-4 min-[30rem]:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-card" />
        ))}
      </div>
    </div>
  );
}
