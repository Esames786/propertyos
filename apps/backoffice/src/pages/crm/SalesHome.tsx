import { PIPELINE_STAGES, type FollowUp, type LeadListItem, type PipelineStage, type SalesSummary, type SiteVisit } from '@repo/contracts';
import {
  Badge,
  Button,
  ContactButtons,
  ErrorState,
  HueChip,
  MetricCard,
  PageHeader,
  QuickActions,
  RecordCard,
  RevealItem,
  SectionHeading,
  Skeleton,
  Stagger,
  StatusLabel,
  useAnnounce,
  useApiMutation,
  useApiQuery,
  useQueryParam,
  useReducedMotion,
  useSession,
  useT,
  useToast,
  type QuickAction,
  type TileHue,
} from '@repo/ui';
import { useGuidedTour, useTourModule } from '@repo/ui/onboarding';
import {
  AlarmClock,
  BadgeCheck,
  CalendarCheck2,
  CalendarDays,
  CalendarPlus,
  Check,
  Compass,
  GraduationCap,
  ListChecks,
  PhoneCall,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-aria-components';
import { LINKS } from '../../nav.config';
import { useContactSheet, type ContactTarget } from './ContactSheet';
import { useCrmFormat, type CrmFormat } from './format';
import { LeadCard } from './LeadCard';

const STAGE_HUE: Record<PipelineStage['id'], TileHue> = { new: 'sky', contacted: 'teal', qualified: 'violet', converted: 'emerald', closed: 'slate' };
const STAGE_BAR: Record<PipelineStage['id'], string> = {
  new: 'bg-tile-sky',
  contacted: 'bg-tile-teal',
  qualified: 'bg-tile-violet',
  converted: 'bg-tile-emerald',
  closed: 'bg-tile-slate',
};

/**
 * Sales home (CRM-001): the salesperson's day in one screen. Figures, today's calls, upcoming visits,
 * the pipeline and the newest leads, each linked to the list or record behind it. Every action works
 * against the demo session (log a call, finish a follow-up, confirm a visit, create a lead).
 */
export default function SalesHome() {
  const { t } = useT();
  const { can } = useSession();
  const tour = useGuidedTour();
  const [, setDrawer] = useQueryParam('drawer');
  useTourModule('crm');
  const summary = useApiQuery<SalesSummary>({ method: 'GET', path: '/crm/summary' });
  const f = useCrmFormat();
  const contact = useContactSheet();

  const actions: QuickAction[] = [
    { id: 'new-lead', label: t('crm:home.actionNewLead'), icon: UserPlus, hue: 'sky', onPress: () => setDrawer('new-lead', { replace: false }), permission: 'lead.create', testId: 'qa-new-lead' },
    { id: 'visit', label: t('crm:home.actionVisit'), icon: CalendarPlus, hue: 'violet', onPress: () => setDrawer('schedule-visit', { replace: false }), permission: 'visit.schedule', testId: 'qa-visit' },
    { id: 'calls', label: t('crm:home.actionFollowUps'), icon: PhoneCall, hue: 'amber', href: `${LINKS.leads}?sort=followUp`, testId: 'qa-calls' },
    { id: 'leads', label: t('crm:home.actionLeads'), icon: UsersRound, hue: 'teal', href: LINKS.leads, testId: 'qa-leads' },
    { id: 'practice', label: t('crm:home.actionPractice'), icon: GraduationCap, hue: 'gold', href: '/backoffice/help/practice', permission: 'lead.create' },
    { id: 'tour', label: t('crm:home.actionTour'), icon: Compass, hue: 'emerald', onPress: () => tour.start('CRM-TOUR-001'), testId: 'qa-tour' },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('crm:title')}
        description={summary.data ? t('crm:home.description', { date: f.date(summary.data.asOf) }) : undefined}
        actions={
          <>
            {can('visit.schedule') && (
              <Button variant="secondary" icon={CalendarPlus} onPress={() => setDrawer('schedule-visit', { replace: false })}>
                {t('crm:home.actionVisit')}
              </Button>
            )}
            {can('lead.create') && (
              <Button variant="primary" icon={UserPlus} onPress={() => setDrawer('new-lead', { replace: false })} data-tour-id="crm-new-lead" data-testid="crm-new-lead">
                {t('crm:home.actionNewLead')}
              </Button>
            )}
          </>
        }
      />

      {summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      ) : !summary.data ? (
        <SalesSkeleton />
      ) : (
        <>
          <section aria-labelledby="crm-kpis-title" data-tour-id="crm-kpis">
            <h2 id="crm-kpis-title" className="sr-only">
              {t('crm:home.kpis')}
            </h2>
            <Stagger className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <RevealItem>
                <MetricCard
                  label={t('crm:home.newLeads')}
                  value={f.count(summary.data.kpis.newLeads.value)}
                  caption={t('crm:home.newLeadsCaption', { previous: f.count(summary.data.kpis.newLeads.previous) })}
                  icon={UserPlus}
                  hue="sky"
                  href={`${LINKS.leads}?status=new`}
                  testId="crm-kpi-new"
                />
              </RevealItem>
              <RevealItem>
                <MetricCard
                  label={t('crm:home.followUps')}
                  value={f.count(summary.data.kpis.followUpsDue.value)}
                  valueTone={summary.data.kpis.followUpsDue.overdue > 0 ? 'warning' : 'default'}
                  caption={summary.data.kpis.followUpsDue.overdue > 0 ? t('crm:home.followUpsCaption', { count: summary.data.kpis.followUpsDue.overdue }) : t('crm:home.followUpsNone')}
                  icon={AlarmClock}
                  hue="amber"
                  href={`${LINKS.leads}?sort=followUp`}
                  testId="crm-kpi-follow-ups"
                />
              </RevealItem>
              <RevealItem>
                <MetricCard
                  label={t('crm:home.visits')}
                  value={f.count(summary.data.kpis.visitsThisWeek.value)}
                  caption={t('crm:home.visitsCaption', { count: summary.data.kpis.visitsThisWeek.confirmed })}
                  icon={CalendarDays}
                  hue="violet"
                  testId="crm-kpi-visits"
                />
              </RevealItem>
              <RevealItem>
                <MetricCard
                  label={t('crm:home.bookings')}
                  value={f.count(summary.data.kpis.bookingsThisMonth.value)}
                  valueTone="success"
                  caption={<bdi dir="ltr" className="ltr-ref">{f.money(summary.data.kpis.bookingsThisMonth.amount)}</bdi>}
                  icon={BadgeCheck}
                  hue="emerald"
                  href={`${LINKS.leads}?status=converted`}
                  testId="crm-kpi-bookings"
                />
              </RevealItem>
            </Stagger>
          </section>

          <QuickActions title={t('crm:home.quickActions')} actions={actions} tourId="crm-quick-actions" testId="crm-quick-actions" />

          <div className="grid gap-6 xl:grid-cols-12">
            <FollowUps items={summary.data.followUps} f={f} onContact={contact.open} />
            <Visits items={summary.data.visits} f={f} />
          </div>

          <Pipeline stages={summary.data.pipeline} f={f} />

          <RecentLeads items={summary.data.recentLeads} f={f} onContact={contact.open} />
        </>
      )}
      {contact.sheet}
    </div>
  );
}

function SalesSkeleton() {
  const { t } = useT();
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <span className="sr-only">{t('common:state.loading')}</span>
      <div className="grid gap-3 min-[30rem]:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-32 rounded-card" />
      <div className="grid gap-6 xl:grid-cols-12">
        <Skeleton className="h-80 rounded-card xl:col-span-7" />
        <Skeleton className="h-80 rounded-card xl:col-span-5" />
      </div>
    </div>
  );
}

function FollowUps({ items, f, onContact }: { items: FollowUp[]; f: CrmFormat; onContact: (kind: 'call' | 'whatsapp', target: ContactTarget) => void }) {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const done = useApiMutation();
  return (
    <section aria-labelledby="crm-follow-ups-title" data-tour-id="crm-follow-ups" id="follow-ups" className="min-w-0 xl:col-span-7">
      <SectionHeading id="crm-follow-ups-title" title={t('crm:home.followUpsTitle')} description={t('crm:home.followUpsDescription')} />
      {items.length === 0 ? (
        <p className="rounded-card border border-dashed border-border bg-panel p-6 text-center text-sm text-muted">{t('crm:home.followUpsEmpty')}</p>
      ) : (
        <Stagger as="ul" className="space-y-3">
          {items.map((fu) => (
            <RevealItem as="li" key={fu.leadId}>
              <RecordCard
                testId="follow-up-card"
                title={<bdi>{fu.displayName}</bdi>}
                titleHref={LINKS.leadWorkspace(fu.leadId)}
                accent={fu.overdue ? 'warning' : 'info'}
                chips={
                  <>
                    <Badge tone={fu.overdue ? 'warning' : 'info'} icon={AlarmClock}>
                      {fu.overdue ? t('crm:home.overdueBy', { when: f.when(fu.dueAt) }) : t('crm:home.dueToday', { when: f.time(fu.dueAt) })}
                    </Badge>
                    <StatusLabel kind="lead" status={fu.status} />
                    <HueChip hue="slate">{fu.projectName}</HueChip>
                  </>
                }
                actions={
                  <ContactButtons
                    name={fu.displayName}
                    onCall={() => onContact('call', { leadId: fu.leadId, name: fu.displayName, phone: fu.phone, projectName: fu.projectName })}
                    onWhatsApp={() => onContact('whatsapp', { leadId: fu.leadId, name: fu.displayName, phone: fu.phone, projectName: fu.projectName })}
                  />
                }
                footer={
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-muted">
                      <bdi dir="ltr" className="ltr-ref">{fu.leadRef}</bdi> · <bdi dir="ltr" className="ltr-ref">{f.phone(fu.phone)}</bdi>
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={Check}
                      isPending={done.isPending && done.variables?.path === `/leads/${fu.leadId}/follow-up`}
                      onPress={async () => {
                        await done.mutateAsync({ method: 'POST', path: `/leads/${fu.leadId}/follow-up`, body: { done: true } });
                        const msg = t('crm:home.markedDone', { name: fu.displayName });
                        toast.success(msg);
                        announce(msg);
                      }}
                      data-testid="follow-up-done"
                    >
                      {t('crm:home.markDone')}
                    </Button>
                  </div>
                }
              />
            </RevealItem>
          ))}
        </Stagger>
      )}
    </section>
  );
}

function Visits({ items, f }: { items: SiteVisit[]; f: CrmFormat }) {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const change = useApiMutation();
  const setStatus = async (v: SiteVisit, status: 'confirmed' | 'completed') => {
    await change.mutateAsync({ method: 'POST', path: `/visits/${v.id}/status`, body: { status } });
    const msg = status === 'confirmed' ? t('crm:home.visitConfirmed', { name: v.displayName }) : t('crm:home.visitCompleted', { name: v.displayName });
    toast.success(msg);
    announce(msg);
  };
  return (
    <section aria-labelledby="crm-visits-title" data-tour-id="crm-visits" className="min-w-0 xl:col-span-5">
      <SectionHeading id="crm-visits-title" title={t('crm:home.visitsTitle')} description={t('crm:home.visitsDescription')} />
      {items.length === 0 ? (
        <p className="rounded-card border border-dashed border-border bg-panel p-6 text-center text-sm text-muted">{t('crm:home.visitsEmpty')}</p>
      ) : (
        <Stagger as="ul" className="space-y-3">
          {items.map((v) => {
            const parts = f.dayParts(v.at);
            return (
              <RevealItem as="li" key={v.id}>
                <article className="flex items-start gap-3 rounded-card border border-border/70 bg-panel p-4 shadow-card" data-testid="visit-card">
                  <div aria-hidden className="grid w-14 shrink-0 place-items-center rounded-tile bg-tile-violet-soft py-2 text-tile-violet-ink">
                    <span className="text-mini font-semibold uppercase">{parts.weekday}</span>
                    <span className="text-xl leading-none font-bold">{parts.day}</span>
                    <span className="text-mini">{parts.month}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base leading-snug font-bold text-text">
                      <Link href={LINKS.leadWorkspace(v.leadId)} className="rounded-sm outline-none data-hovered:underline data-focus-visible:outline-2 data-focus-visible:outline-focus">
                        <bdi>{v.displayName}</bdi>
                      </Link>
                    </h3>
                    <p className="text-sm text-muted">
                      {f.when(v.at)} · {v.projectName}
                      {v.unitRef && (
                        <>
                          {' · '}
                          <bdi dir="ltr" className="ltr-ref">{v.unitRef}</bdi>
                        </>
                      )}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge tone={v.status === 'confirmed' ? 'success' : 'info'} icon={v.status === 'confirmed' ? CalendarCheck2 : CalendarDays}>
                        {t(`crm:visitStatus.${v.status}`)}
                      </Badge>
                      {v.status === 'scheduled' && (
                        <Button size="sm" variant="quiet" icon={Check} onPress={() => setStatus(v, 'confirmed')} data-testid="visit-confirm">
                          {t('crm:home.confirm')}
                        </Button>
                      )}
                      {v.status === 'confirmed' && (
                        <Button size="sm" variant="quiet" icon={ListChecks} onPress={() => setStatus(v, 'completed')} data-testid="visit-complete">
                          {t('crm:home.complete')}
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              </RevealItem>
            );
          })}
        </Stagger>
      )}
    </section>
  );
}

function Pipeline({ stages, f }: { stages: PipelineStage[]; f: CrmFormat }) {
  const { t } = useT();
  const reduced = useReducedMotion();
  const max = Math.max(1, ...stages.map((s) => s.count));
  const ordered = PIPELINE_STAGES.map((id) => stages.find((s) => s.id === id)!).filter(Boolean);
  return (
    <section aria-labelledby="crm-pipeline-title" data-tour-id="crm-pipeline">
      <SectionHeading id="crm-pipeline-title" title={t('crm:home.pipelineTitle')} description={t('crm:home.pipelineDescription')} />
      <Stagger as="ul" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {ordered.map((s) => (
          <RevealItem as="li" key={s.id}>
            <Link
              href={`${LINKS.leads}?status=${s.id}`}
              aria-label={t('crm:home.pipelineStage', { stage: t(`crm:stage.${s.id}`), count: s.count, value: f.money(s.value) })}
              data-testid={`pipeline-${s.id}`}
              className="group flex h-full flex-col gap-3 rounded-card border border-border/70 bg-panel p-4 shadow-card outline-none transition-[translate,box-shadow] duration-[var(--motion-regular)] data-hovered:-translate-y-0.5 data-hovered:shadow-lift data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-muted">{t(`crm:stage.${s.id}`)}</span>
                <HueChip hue={STAGE_HUE[s.id]}>{f.count(s.count)}</HueChip>
              </span>
              <span className="text-xl font-bold tracking-tight text-text">
                <bdi dir="ltr" className="ltr-ref">{f.money(s.value)}</bdi>
              </span>
              <span aria-hidden className="h-2 overflow-hidden rounded-pill bg-sunken">
                <motion.span
                  className={`block h-full rounded-pill ${STAGE_BAR[s.id]}`}
                  style={{ width: `${Math.max(4, (s.count / max) * 100)}%`, transformOrigin: f.dir === 'rtl' ? 'right' : 'left' }}
                  initial={reduced ? false : { scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ type: 'spring', bounce: 0.1, duration: 0.8 }}
                />
              </span>
            </Link>
          </RevealItem>
        ))}
      </Stagger>
    </section>
  );
}

function RecentLeads({ items, f, onContact }: { items: LeadListItem[]; f: CrmFormat; onContact: (kind: 'call' | 'whatsapp', target: ContactTarget) => void }) {
  const { t } = useT();
  return (
    <section aria-labelledby="crm-recent-title" data-tour-id="crm-recent-leads">
      <SectionHeading id="crm-recent-title" title={t('crm:home.recentTitle')} action={{ label: t('crm:home.viewAll'), href: LINKS.leads, testId: 'crm-view-all' }} />
      <Stagger as="ul" className="grid gap-3 lg:grid-cols-2">
        {items.map((l) => (
          <RevealItem as="li" key={l.id}>
            <LeadCard lead={l} f={f} onContact={onContact} />
          </RevealItem>
        ))}
      </Stagger>
    </section>
  );
}
