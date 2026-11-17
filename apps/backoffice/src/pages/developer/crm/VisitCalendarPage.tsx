import type { CalendarVisit, VisitCalendar, VisitStatus } from '@repo/contracts';
import {
  Badge,
  Button,
  ErrorState,
  FilterPills,
  HueChip,
  Link,
  PageHeader,
  PlainTextField,
  SegmentedControl,
  SelectControl,
  useAnnounce,
  useApiQuery,
  useIsTabletUp,
  useNavigation,
  useQueryParam,
  useQueryParams,
  useT,
  type StatusTone,
} from '@repo/ui';
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, KanbanSquare } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ACCESS_DATE } from '../../../nav.config';
import { LinkButton, unbroken } from '../../society/hr/hkit';
import { Loading } from '../../society/kit';
import { AgendaList, MonthGrid, monthRange, shiftMonth, useMonthTitle, type CalendarEntry } from './calendar/AgendaCalendar';
import { E1, Ref, ScopeNote, useSalesFormat, withDrawer, WRAP } from './kit';
import { DirectionalIcon } from '@repo/ui';

/**
 * CRM-009 Site visits calendar. A month grid (a table of days) and an agenda list with the same visits
 * and actions; phones and 200 % text get the agenda by default. Filters: status (each count equals the
 * list it opens), project, owner (a sales manager) and search. Each visit opens its Visit workspace
 * (CRM-011); "Schedule a visit" opens the existing drawer. A salesperson sees only the visits of leads
 * assigned to them (decision E-05 default); a sales manager sees every visit of their projects.
 */

const STATUSES: ReadonlyArray<VisitStatus | 'all'> = ['all', 'scheduled', 'confirmed', 'completed', 'no_show', 'cancelled'];
export const VISIT_TONE: Record<VisitStatus, StatusTone> = { scheduled: 'info', confirmed: 'success', completed: 'success', no_show: 'warning', cancelled: 'neutral' };

type Entry = CalendarEntry & { visit: CalendarVisit };

export default function VisitCalendarPage() {
  const { t } = useT();
  const f = useSalesFormat();
  const announce = useAnnounce();
  const monthTitle = useMonthTitle();
  const { navigate, location } = useNavigation();
  const setParams = useQueryParams();
  const isTablet = useIsTabletUp();
  const [monthParam] = useQueryParam('month');
  const [viewParam] = useQueryParam('view');
  const [status] = useQueryParam('status');
  const [project] = useQueryParam('project');
  const [owner] = useQueryParam('owner');
  const [qParam] = useQueryParam('q');
  const [dayParam] = useQueryParam('day');
  const [draft, setDraft] = useState(qParam ?? '');

  const today = ACCESS_DATE;
  const month = /^\d{4}-\d{2}$/.test(monthParam ?? '') ? monthParam! : today.slice(0, 7);
  const view: 'month' | 'agenda' = viewParam === 'agenda' || viewParam === 'month' ? viewParam : isTablet ? 'month' : 'agenda';
  const showGrid = view === 'month' && isTablet;
  const { from, to } = monthRange(month);
  const stat = (STATUSES as readonly string[]).includes(status ?? '') ? (status as VisitStatus | 'all') : 'all';

  useEffect(() => {
    const id = setTimeout(() => {
      if ((qParam ?? '') !== draft.trim()) setParams({ q: draft.trim() || null });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const query = { from, to, ...(stat !== 'all' ? { status: stat } : {}), ...(project ? { project } : {}), ...(owner ? { owner } : {}), ...(qParam ? { q: qParam } : {}) };
  const cal = useApiQuery<VisitCalendar>({ method: 'GET', path: '/visits/calendar', query }, { placeholderData: (prev) => prev });

  const count = cal.data?.items.length;
  const first = useRef(true);
  useEffect(() => {
    if (count === undefined) return;
    if (first.current) {
      first.current = false;
      return;
    }
    announce(t('sales:calendar.updated', { count, month: monthTitle(month) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, month, stat, project, owner, qParam]);

  // "More" in a day cell opens the agenda at that day.
  useEffect(() => {
    if (!dayParam || view !== 'agenda' || !cal.data) return;
    const h = document.querySelector<HTMLElement>(`#agenda-${dayParam} [data-testid="agenda-day"]`);
    h?.focus();
  }, [dayParam, view, cal.data]);

  const d = cal.data;
  const entries: Entry[] = (d?.items ?? []).map((v) => ({
    id: v.id,
    at: v.at,
    title: v.displayName,
    href: E1.visit(v.id),
    note: unbroken(t(`crm:visitStatus.${v.status}`)),
    testId: 'calendar-visit',
    data: { visit: v.id, status: v.status, project: v.projectId },
    visit: v,
  }));

  return (
    <div className="space-y-5" data-testid="visit-calendar-page">
      <PageHeader
        title={t('sales:calendar.title')}
        breadcrumbs={[{ label: t('nav:pages.salesHome'), href: '/backoffice/crm/sales-home' }]}
        description={t('sales:calendar.intro')}
        actions={
          <>
            {d?.canSchedule && (
              <Button className={WRAP} variant="primary" icon={CalendarPlus} onPress={() => navigate(withDrawer(location.pathname, location.search, 'schedule-visit'))} data-testid="calendar-schedule">
                {t('sales:calendar.schedule')}
              </Button>
            )}
            <LinkButton href={E1.pipeline()} variant="quiet" icon={KanbanSquare} testId="calendar-pipeline">
              {t('sales:pipeline.title')}
            </LinkButton>
          </>
        }
      />
      {d && <ScopeNote scope={d.scope} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('sales:calendar.monthNav')}>
          <Button className={WRAP} variant="secondary" size="sm" onPress={() => setParams({ month: shiftMonth(month, -1), day: null })} aria-label={t('sales:calendar.previousMonth')} data-testid="calendar-prev">
            <DirectionalIcon icon={ChevronLeft} className="size-4" />
          </Button>
          <h2 className="min-w-0 text-lg font-semibold text-text" aria-live="polite" data-testid="calendar-month-title">
            {monthTitle(month)}
          </h2>
          <Button className={WRAP} variant="secondary" size="sm" onPress={() => setParams({ month: shiftMonth(month, 1), day: null })} aria-label={t('sales:calendar.nextMonth')} data-testid="calendar-next">
            <DirectionalIcon icon={ChevronRight} className="size-4" />
          </Button>
          <Button className={WRAP} variant="quiet" size="sm" icon={CalendarDays} onPress={() => setParams({ month: null, day: null })} data-testid="calendar-today">
            {t('sales:calendar.thisMonth')}
          </Button>
        </div>
        <SegmentedControl
          label={t('sales:calendar.viewLabel')}
          value={view}
          onChange={(v) => setParams({ view: v, day: null })}
          options={[
            { id: 'month', label: t('sales:calendar.month') },
            { id: 'agenda', label: t('sales:calendar.agenda') },
          ]}
          testId="calendar-view"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-card border border-border/70 bg-panel p-4 shadow-card md:grid-cols-3">
        <PlainTextField label={t('sales:calendar.search')} value={draft} onChange={setDraft} optional placeholder={t('sales:calendar.searchPlaceholder')} testId="calendar-search" />
        {d && d.projects.length > 1 && (
          <SelectControl label={t('sales:common.project')} value={project ?? 'all'} onChange={(v) => setParams({ project: !v || v === 'all' ? null : v })} options={[{ id: 'all', label: t('sales:common.allProjects') }, ...d.projects.map((p) => ({ id: p.id, label: p.name }))]} testId="calendar-project" />
        )}
        {d && d.owners.length > 1 && (
          <SelectControl label={t('sales:calendar.host')} value={owner ?? 'all'} onChange={(v) => setParams({ owner: !v || v === 'all' ? null : v })} options={[{ id: 'all', label: t('sales:common.allOwners') }, ...d.owners.map((o) => ({ id: o.principalId, label: o.name }))]} testId="calendar-owner" />
        )}
        {d && (
          <FilterPills
            className="md:col-span-3"
            label={t('sales:calendar.statusFilter')}
            showLabel
            value={stat}
            onChange={(v) => setParams({ status: v === 'all' ? null : v })}
            options={STATUSES.map((s) => ({ id: s, label: s === 'all' ? t('sales:calendar.allStatuses') : unbroken(t(`crm:visitStatus.${s}`)), count: d.counts[s] }))}
            testId="calendar-status"
          />
        )}
      </div>

      {view === 'month' && !isTablet && <p className="text-sm text-muted">{t('sales:calendar.agendaOnPhones')}</p>}

      {cal.isError ? (
        <ErrorState error={cal.error} onRetry={() => void cal.refetch()} />
      ) : !d ? (
        <Loading lines={10} />
      ) : (
        <section aria-labelledby="calendar-results" className="space-y-3" data-testid="calendar-results" data-count={d.items.length} data-from={d.from} data-to={d.to}>
          <h2 id="calendar-results" className="text-base font-semibold text-text">
            {t('sales:calendar.results', { count: d.items.length, from: f.day(d.from), to: f.day(d.to) })}
          </h2>
          {showGrid ? (
            <div className="overflow-x-auto rounded-card border border-border/70 bg-panel p-2 shadow-card">
              <MonthGrid month={month} today={d.today} entries={entries} onMore={(day) => setParams({ view: 'agenda', day }, { replace: false })} />
            </div>
          ) : (
            <AgendaList
              entries={entries}
              today={d.today}
              focusDay={dayParam}
              emptyText={t('sales:calendar.empty')}
              renderEntry={(e) => <AgendaVisit v={e.visit} />}
            />
          )}
        </section>
      )}
    </div>
  );
}

function AgendaVisit({ v }: { v: CalendarVisit }) {
  const { t } = useT();
  const f = useSalesFormat();
  return (
    <article className="flex flex-wrap items-start justify-between gap-3 rounded-tile border border-border/70 bg-panel p-3 shadow-card" data-testid="agenda-visit" data-visit={v.id} data-status={v.status} data-project={v.projectId}>
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2">
          <bdi dir="ltr" className="font-semibold text-text">
            {f.time(v.at)}
          </bdi>
          <Link href={E1.visit(v.id)} className="font-semibold break-words" data-testid="agenda-visit-link">
            <bdi>{v.displayName}</bdi>
          </Link>
          <Badge tone={VISIT_TONE[v.status]} icon={CalendarDays}>
            {unbroken(t(`crm:visitStatus.${v.status}`))}
          </Badge>
        </p>
        <p className="text-sm break-words text-muted">
          <Ref value={v.leadRef} /> · <bdi>{v.projectName}</bdi> · {t('sales:visit.hostLine', { name: v.host.name })}
        </p>
        {v.unitRef && <HueChip hue="slate">{t('sales:visit.unitOfInterest', { unit: v.unitRef })}</HueChip>}
      </div>
      <div className="flex flex-wrap gap-2">
        <LinkButton href={E1.visit(v.id)} size="sm" variant="secondary">
          {t('sales:calendar.openVisit')}
        </LinkButton>
        {v.opportunityId && (
          <LinkButton href={E1.opportunity(v.opportunityId)} size="sm" variant="quiet">
            {t('sales:calendar.openOpportunity')}
          </LinkButton>
        )}
      </div>
    </article>
  );
}
