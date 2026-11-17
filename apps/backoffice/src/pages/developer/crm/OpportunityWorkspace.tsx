import type { OpportunityDetail, OpportunityEvent } from '@repo/contracts';
import { ApiError } from '@repo/contracts';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  HueChip,
  KeyValueList,
  Link,
  MetricCard,
  NotFoundState,
  PageHeader,
  Panel,
  RecordCard,
  UrlTabs,
  useApiQuery,
  useNavigation,
  useT,
} from '@repo/ui';
import { AlarmClock, CalendarClock, CalendarDays, CalendarPlus, Eye, Lock, RotateCcw, UserCog, Wallet, XCircle } from 'lucide-react';
import { useState } from 'react';
import { LinkButton, unbroken } from '../../society/hr/hkit';
import { Loading } from '../../society/kit';
import { LostDialog, MoveMenu, ReopenDialog, useStageMove } from './dialogs';
import { E1, ProjectLink, Ref, StageBadge, TruthNote, useSalesFormat, withDrawer, type SalesFormat, WRAP } from './kit';
import { LeadAssignmentDrawer } from './LeadAssignmentDrawer';

/**
 * CRM-008 Opportunity 360 (`?record=opp_…`). Who the customer is, where the sale stands and what is
 * next: stage, expected value, owner, expected close, next visit and follow-up; the projected timeline
 * (conversion, stage moves, lost and reopened, reassignments, visit outcomes, follow-ups); the lead's
 * visits (each opens its Visit workspace) and the units of interest or shown at a visit (each opens the
 * unit quick view on Lead 360). Actions: move stage (menu), mark lost with a reason, reopen with a note,
 * reassign (the lead assignment drawer), schedule a visit (the existing drawer). "Won" needs a booking
 * (Gate E.5) and is shown as planned.
 */
export default function OpportunityWorkspace() {
  const { t } = useT();
  const { location } = useNavigation();
  const id = new URLSearchParams(location.search).get('record');
  const detail = useApiQuery<OpportunityDetail>(id ? { method: 'GET', path: `/opportunities/${id}` } : null);
  const back = (
    <LinkButton href={E1.pipeline()} variant="quiet" size="sm" testId="opp-back">
      {t('sales:common.backToPipeline')}
    </LinkButton>
  );

  if (!id) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('sales:opportunity.chooseTitle')} />
        <EmptyState
          title={t('sales:opportunity.chooseHeading')}
          body={t('sales:opportunity.chooseBody')}
          actions={
            <LinkButton href={E1.pipeline()} variant="primary">
              {t('sales:common.openPipeline')}
            </LinkButton>
          }
        />
      </div>
    );
  }
  if (detail.isError && detail.error instanceof ApiError && [403, 404].includes(detail.error.problem.status)) {
    return (
      <div className="space-y-4">
        {back}
        <h1 id="page-title" className="sr-only">
          {t('sales:opportunity.notFound')}
        </h1>
        <NotFoundState />
      </div>
    );
  }
  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  if (!detail.data) {
    return (
      <div className="space-y-4">
        {back}
        <Loading lines={10} />
      </div>
    );
  }
  return <Workspace data={detail.data} back={back} refetch={() => void detail.refetch()} />;
}

function Workspace({ data, back, refetch }: { data: OpportunityDetail; back: React.ReactNode; refetch: () => void }) {
  const { t } = useT();
  const f = useSalesFormat();
  const { navigate, location } = useNavigation();
  const o = data.opportunity;
  const [losing, setLosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const { move } = useStageMove(refetch);
  const params = new URLSearchParams(location.search);
  const drawer = params.get('drawer');
  const open = (name: string, extra: Record<string, string> = {}) => navigate(withDrawer(location.pathname, location.search, name, extra));
  const closeDrawer = () => {
    params.delete('drawer');
    params.delete('lead');
    navigate(`${location.pathname}?${params}`, { replace: true });
  };

  return (
    <div className="space-y-6" data-testid="opportunity-360" data-stage={o.stage}>
      {back}
      <PageHeader
        title={o.displayName}
        breadcrumbs={[
          { label: t('nav:pages.salesHome'), href: '/backoffice/crm/sales-home' },
          { label: t('sales:pipeline.title'), href: E1.pipeline() },
        ]}
        badge={<StageBadge stage={o.stage} />}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="rounded-pill bg-sunken px-2.5 py-0.5 text-xs font-medium text-text">
              <Ref value={o.ref} />
            </span>
            <Link href={E1.lead(o.leadId)} data-testid="opp-lead-link">
              {t('sales:common.lead')} <Ref value={o.leadRef} />
            </Link>
            <ProjectLink id={o.projectId} name={o.projectName} testId="opp-project-link" />
          </span>
        }
      />
      <section aria-label={t('sales:opportunity.actions')} className="flex flex-wrap gap-2 rounded-card border border-border/70 bg-panel p-3 shadow-card" data-testid="opp-actions">
        {data.allowed.move.length > 0 && <MoveMenu opportunity={o} onMove={(s) => void move(o, s)} onLose={() => setLosing(true)} testId="opp-move" />}
        {data.allowed.lose && (
          <Button className={WRAP} variant="secondary" icon={XCircle} onPress={() => setLosing(true)} data-testid="opp-lose">
            {t('sales:opportunity.markLost')}
          </Button>
        )}
        {data.allowed.reopen && (
          <Button className={WRAP} variant="secondary" icon={RotateCcw} onPress={() => setReopening(true)} data-testid="opp-reopen">
            {t('sales:opportunity.reopen')}
          </Button>
        )}
        {data.allowed.scheduleVisit && (
          <Button className={WRAP} variant="secondary" icon={CalendarPlus} onPress={() => open('schedule-visit', { lead: o.leadId })} data-testid="opp-schedule">
            {t('sales:opportunity.scheduleVisit')}
          </Button>
        )}
        {data.allowed.reassign && (
          <Button className={WRAP} variant="secondary" icon={UserCog} onPress={() => open('lead-assignment', { lead: o.leadId })} data-testid="opp-reassign">
            {t('sales:opportunity.reassign')}
          </Button>
        )}
        <Badge tone="neutral" icon={Lock} data-testid="opp-won-planned">
          {t('sales:opportunity.wonPlanned')}
        </Badge>
      </section>
      <TruthNote />

      <div className="grid grid-cols-1 gap-3 min-[24rem]:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={t('sales:common.value')} value={<bdi dir="ltr">{f.money(o.value)}</bdi>} accessibleValue={f.moneyExact(o.value)} icon={Wallet} hue="gold" testId="opp-value" />
        <MetricCard label={t('sales:common.expectedClose')} value={<span className="text-lg whitespace-normal">{o.expectedCloseOn ? f.day(o.expectedCloseOn) : t('sales:common.notSet')}</span>} icon={CalendarClock} hue="violet" testId="opp-close" />
        <MetricCard label={t('sales:common.nextVisitLabel')} value={<span className="text-lg whitespace-normal">{o.nextVisitAt ? f.when(o.nextVisitAt) : t('sales:common.none')}</span>} icon={CalendarDays} hue="sky" testId="opp-next-visit" />
        <MetricCard label={t('sales:common.nextFollowUpLabel')} value={<span className="text-lg whitespace-normal">{o.nextFollowUp ? f.when(o.nextFollowUp) : t('sales:common.none')}</span>} icon={AlarmClock} hue="amber" testId="opp-follow-up" />
      </div>

      <UrlTabs
        label={t('sales:opportunity.tabs')}
        items={[
          { id: 'overview', label: t('sales:opportunity.tabOverview') },
          { id: 'timeline', label: t('sales:opportunity.tabTimeline') },
          { id: 'visits', label: t('sales:opportunity.tabVisits') },
          { id: 'units', label: t('sales:opportunity.tabUnits') },
        ]}
      >
        {(tab) =>
          tab === 'timeline' ? (
            <Panel title={t('sales:opportunity.tabTimeline')}>
              <Timeline events={data.timeline} f={f} />
            </Panel>
          ) : tab === 'visits' ? (
            <VisitsTab data={data} f={f} onSchedule={data.allowed.scheduleVisit ? () => open('schedule-visit', { lead: o.leadId }) : undefined} />
          ) : tab === 'units' ? (
            <UnitsTab data={data} />
          ) : (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
              <Panel title={t('sales:opportunity.facts')} className="xl:col-span-5">
                <KeyValueList
                  items={[
                    { label: t('sales:common.customer'), value: <bdi>{data.party.displayName}</bdi> },
                    { label: t('sales:common.phone'), value: <bdi dir="ltr">{f.phone(data.party.phone)}</bdi> },
                    { label: t('sales:common.owner'), value: <bdi>{o.owner.name}</bdi> },
                    { label: t('sales:common.stage'), value: <StageBadge stage={o.stage} /> },
                    { label: t('sales:common.leadStatus'), value: t(`status:lead.${data.lead.status}`) },
                    { label: t('sales:common.source'), value: t(`crm:source.${data.lead.source}`) },
                    { label: t('sales:common.opened'), value: f.when(o.createdAt) },
                    ...(o.stage === 'lost' && o.lostReason ? [{ label: t('sales:opportunity.lostReason'), value: `${t(`sales:lostReason.${o.lostReason}`)}${data.lostNote ? ` — ${data.lostNote}` : ''}` }] : []),
                  ]}
                />
              </Panel>
              <Panel title={t('sales:opportunity.latest')} className="xl:col-span-7">
                <Timeline events={data.timeline.slice(0, 5)} f={f} />
              </Panel>
            </div>
          )
        }
      </UrlTabs>

      <LostDialog opportunity={losing ? o : null} onClose={() => setLosing(false)} />
      <ReopenDialog opportunity={reopening ? o : null} onClose={() => setReopening(false)} />
      <LeadAssignmentDrawer isOpen={drawer === 'lead-assignment' && data.allowed.reassign} onClose={closeDrawer} presetLeadId={o.leadId} />
    </div>
  );
}

function eventText(t: ReturnType<typeof useT>['t'], e: OpportunityEvent, f: SalesFormat): string {
  const stage = (s?: string) => (s ? t(`sales:stage.${s}` as 'sales:stage.qualified') : '');
  switch (e.kind) {
    case 'converted':
      return t('sales:event.converted');
    case 'stage':
      return t('sales:event.stage', { from: stage(e.from), to: stage(e.to) });
    case 'lost':
      return t('sales:event.lost', { reason: e.reason ? t(`sales:lostReason.${e.reason}` as 'sales:lostReason.price') : '' });
    case 'reopened':
      return t('sales:event.reopened', { to: stage(e.to) });
    case 'assigned':
      return e.sanitised ? t('sales:event.assignedHidden') : e.from ? t('sales:event.assigned', { from: e.from, to: e.to ?? '' }) : t('sales:event.assignedFirst', { to: e.to ?? '' });
    case 'visit_outcome':
      return t('sales:event.visitOutcome', { outcome: t(`crm:visitStatus.${e.to ?? 'completed'}` as 'crm:visitStatus.completed') });
    case 'visit_rescheduled':
      return t('sales:event.visitRescheduled', { from: e.from ? f.when(e.from) : '', to: e.to ? f.when(e.to) : '' });
    case 'follow_up':
      return t('sales:event.followUp', { when: e.to ? f.when(e.to) : '' });
  }
}

export function Timeline({ events, f }: { events: OpportunityEvent[]; f: SalesFormat }) {
  const { t } = useT();
  if (events.length === 0) return <p className="text-sm text-muted">{t('sales:opportunity.timelineEmpty')}</p>;
  return (
    <ol aria-label={t('sales:opportunity.tabTimeline')} className="relative space-y-4 border-s border-border ps-5" data-testid="opp-timeline">
      {events.map((e) => (
        <li key={e.id} className="relative" data-testid="opp-event" data-kind={e.kind} data-sanitised={!!e.sanitised}>
          <span aria-hidden className="absolute -start-[1.65rem] top-1.5 size-2.5 rounded-pill bg-primary" />
          <p className="text-sm text-text">{eventText(t, e, f)}</p>
          {e.note && <p className="text-sm break-words text-muted">{t('sales:event.note', { note: e.note })}</p>}
          {e.kind === 'visit_rescheduled' && e.reason && <p className="text-sm break-words text-muted">{t('sales:event.note', { note: e.reason })}</p>}
          {e.units && e.units.length > 0 && <p className="text-sm text-muted">{t('sales:event.units', { units: e.units.join(', ') })}</p>}
          {e.visitId && (
            <Link href={E1.visit(e.visitId)} className="text-sm">
              {t('sales:event.openVisit')}
            </Link>
          )}
          <p className="text-xs text-muted">{e.actorName ? t('sales:event.byAt', { name: e.actorName, when: f.when(e.at) }) : f.when(e.at)}</p>
        </li>
      ))}
    </ol>
  );
}

function VisitsTab({ data, f, onSchedule }: { data: OpportunityDetail; f: SalesFormat; onSchedule?: () => void }) {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {onSchedule && (
          <Button className={WRAP} variant="primary" icon={CalendarPlus} onPress={onSchedule}>
            {t('sales:opportunity.scheduleVisit')}
          </Button>
        )}
        <LinkButton href={E1.calendar()} variant="quiet" icon={CalendarDays}>
          {t('sales:pipeline.visits')}
        </LinkButton>
      </div>
      {data.visits.length === 0 ? (
        <p className="rounded-card border border-dashed border-border bg-panel p-6 text-center text-sm text-muted">{t('sales:opportunity.visitsEmpty')}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2" data-testid="opp-visits">
          {data.visits.map((v) => (
            <li key={v.id}>
              <RecordCard
                testId="opp-visit"
                title={f.when(v.at)}
                titleHref={E1.visit(v.id)}
                chips={
                  <>
                    <Badge tone={v.status === 'completed' || v.status === 'confirmed' ? 'success' : v.status === 'scheduled' ? 'info' : 'neutral'} icon={CalendarDays}>
                      {unbroken(t(`crm:visitStatus.${v.status}`))}
                    </Badge>
                    {v.unitRef && <HueChip hue="slate">{v.unitRef}</HueChip>}
                  </>
                }
              >
                <p className="text-sm text-muted">{t('sales:visit.hostLine', { name: v.host.name })}</p>
              </RecordCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UnitsTab({ data }: { data: OpportunityDetail }) {
  const { t } = useT();
  const shown = [...new Set(data.timeline.flatMap((e) => e.units ?? []))];
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Panel title={t('sales:opportunity.interestUnit')}>
        {data.interestUnit ? (
          <LinkButton href={E1.unit(data.lead.id, data.interestUnit.id)} variant="secondary" icon={Eye} testId="opp-interest-unit">
            {t('sales:opportunity.unitQuickView', { unit: data.interestUnit.ref })}
          </LinkButton>
        ) : (
          <p className="text-sm text-muted">{t('sales:opportunity.noInterestUnit')}</p>
        )}
        <p className="mt-3 text-sm">
          <Link href={E1.lead(data.lead.id, 'units')}>{t('sales:opportunity.matchedUnits')}</Link>
        </p>
      </Panel>
      <Panel title={t('sales:opportunity.unitsShown')}>
        {shown.length === 0 ? (
          <p className="text-sm text-muted">{t('sales:opportunity.unitsShownEmpty')}</p>
        ) : (
          <ul className="flex flex-wrap gap-2" data-testid="opp-units-shown">
            {shown.map((ref) => (
              <li key={ref}>
                <HueChip hue="slate">{ref}</HueChip>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
