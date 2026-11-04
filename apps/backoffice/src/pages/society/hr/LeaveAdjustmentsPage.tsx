import type { AttendanceCorrectionView, CorrectionValues, EmployeesList, LeaveAndCorrections, LeaveRequestView } from '@repo/contracts';
import { Button, ConfirmDialog, DateTime, EmptyState, ErrorState, FilterPills, InlineAlert, Link, PageHeader, UrlTabs, useApiMutation, useApiQuery, useCan, useQueryParam, useQueryParams, useT, useToast } from '@repo/ui';
import { ArrowRight, CalendarPlus, Check, Info, X } from 'lucide-react';
import { useState } from 'react';
import { HR } from '../../../nav.config';
import { Loading, useSocietyFormat } from '../kit';
import { AttendanceBadge, DecisionBadge, HrNav, PersonName, Time, useProblemToast, useShiftName, weekStartOf } from './hkit';
import { LeaveDrawer } from './HrDrawers';

/**
 * HR-006 leave and attendance adjustments. Leave: requests with the duties they clash with, decided
 * by someone with leave.manage who is neither the employee nor the requester. Corrections: a change
 * to recorded attendance, approved by someone with attendance.adjust under the same rule; before and
 * after are both kept. Balances depend on a leave policy the society has not adopted, so none are
 * computed: days taken are shown as facts.
 */
export default function LeaveAdjustmentsPage() {
  const { t } = useT();
  const can = useCan();
  const q = useApiQuery<LeaveAndCorrections>({ method: 'GET', path: '/hr/leave-adjustments' });
  const staff = useApiQuery<EmployeesList>(can('hr.view') ? { method: 'GET', path: '/hr/employees' } : null);
  const [requesting, setRequesting] = useState(false);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const d = q.data;
  const tabs = [
    { id: 'leave', label: `${t('hr:leave.tab')}${d.counts.leavePending ? ` (${d.counts.leavePending})` : ''}` },
    { id: 'corrections', label: `${t('hr:correction.tab')}${d.counts.correctionsPending ? ` (${d.counts.correctionsPending})` : ''}` },
  ];
  return (
    <div className="@container space-y-5" data-testid="hr-leave-page">
      <PageHeader
        title={t('hr:leave.title')}
        description={t('hr:leave.intro')}
        actions={
          d.canRequestLeave ? (
            <Button variant="primary" icon={CalendarPlus} onPress={() => setRequesting(true)} data-testid="hr-leave-new">
              {t('hr:leave.new')}
            </Button>
          ) : undefined
        }
      />
      <HrNav current="leave" />
      <UrlTabs label={t('hr:leave.tabsLabel')} items={tabs} phoneLimit={2}>
        {(tab) => <div className="pt-4">{tab === 'corrections' ? <Corrections list={d.corrections} /> : <Leave list={d.leave} />}</div>}
      </UrlTabs>
      {staff.data && <LeaveDrawer key={String(requesting)} open={requesting} onClose={() => setRequesting(false)} staff={staff.data.items.filter((e) => e.status === 'active' && e.allSitesInScope).map((e) => ({ id: e.id, name: e.name, role: e.role }))} today={d.today} />}
    </div>
  );
}

const SHOW = ['pending', 'decided', 'all'] as const;

function Leave({ list }: { list: LeaveRequestView[] }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const shiftName = useShiftName();
  const toast = useToast();
  const problem = useProblemToast();
  const [show] = useQueryParam('show');
  const setParams = useQueryParams();
  const act = useApiMutation<LeaveRequestView>();
  const [deciding, setDeciding] = useState<{ l: LeaveRequestView; approve: boolean } | null>(null);
  const view = (SHOW as readonly string[]).includes(show ?? '') ? (show as (typeof SHOW)[number]) : 'pending';
  const shown = list.filter((l) => (view === 'pending' ? l.state === 'pending' : view === 'decided' ? l.state !== 'pending' : true));
  return (
    <div className="space-y-4">
      <InlineAlert tone="info" data-testid="hr-leave-policy">
        {t('hr:leave.policyNote')}
      </InlineAlert>
      <FilterPills label={t('hr:leave.show')} value={view} onChange={(v) => setParams({ show: v === 'pending' ? null : v })} options={SHOW.map((v) => ({ id: v, label: t(`hr:leave.view.${v}`), count: list.filter((l) => (v === 'pending' ? l.state === 'pending' : v === 'decided' ? l.state !== 'pending' : true)).length }))} testId="hr-leave-show" />
      {shown.length === 0 ? (
        <EmptyState title={t(`hr:leave.empty.${view}`)} />
      ) : (
        <ul className="space-y-3" data-testid="hr-leave-rows">
          {shown.map((l) => (
            <li key={l.id} className="space-y-2 rounded-tile border border-border/70 bg-panel p-4 shadow-card" data-testid="hr-leave-row" data-name={l.employeeName} data-state={l.state}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 basis-[min(100%,18rem)]">
                  <PersonName id={l.employeeId} name={l.employeeName} tab="leave" className="inline-flex min-h-6 items-center font-semibold" />
                  <p className="text-sm text-text">
                    {t(`hr:leave.types.${l.type}`)} · {fmt.date(l.from)}
                    {l.to !== l.from ? ` – ${fmt.date(l.to)}` : ''} · {t('hr:leave.days', { count: l.days })}
                  </p>
                  <p className="text-sm break-words text-muted">“{l.reason}”</p>
                  <p className="text-xs text-muted">
                    <bdi dir="ltr">{l.ref}</bdi> · {t('hr:leave.requestedBy', { name: l.requestedByName })} <DateTime value={l.requestedAt} style="date" />
                    {l.decidedByName ? ` · ${t('hr:leave.decidedBy', { name: l.decidedByName })}` : ''}
                  </p>
                  {l.decisionNote && <p className="text-xs break-words text-muted">“{l.decisionNote}”</p>}
                </div>
                <DecisionBadge state={l.state} />
              </div>
              {l.conflicts.length > 0 && l.state !== 'rejected' && l.state !== 'cancelled' && (
                <InlineAlert tone="warning" data-testid="hr-leave-conflicts">
                  {t(l.state === 'approved' ? 'hr:leave.conflictsApproved' : 'hr:leave.conflicts', { count: l.conflicts.length })}{' '}
                  {l.conflicts.map((c) => `${fmt.date(c.date)} ${shiftName(c.shiftKey)}`).join(', ')}.{' '}
                  <Link href={HR.roster({ week: weekStartOf(l.conflicts[0]!.date) })}>{t('hr:leave.openRoster')}</Link>
                </InlineAlert>
              )}
              {l.blocked && (
                <p className="flex items-center gap-1.5 text-sm text-muted" data-testid="hr-leave-blocked">
                  <Info aria-hidden className="size-4 shrink-0" />
                  {t(`hr:decision.blocked.${l.blocked}`)}
                </p>
              )}
              {(l.actions.approve || l.actions.reject) && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" icon={Check} onPress={() => setDeciding({ l, approve: true })} data-testid="hr-leave-approve">
                    {t('hr:decision.approve')}
                  </Button>
                  <Button size="sm" variant="quiet" icon={X} onPress={() => setDeciding({ l, approve: false })} data-testid="hr-leave-reject">
                    {t('hr:decision.reject')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        isOpen={!!deciding}
        onOpenChange={(o) => !o && setDeciding(null)}
        title={deciding ? t(deciding.approve ? 'hr:leave.approveTitle' : 'hr:leave.rejectTitle', { name: deciding.l.employeeName }) : ''}
        effect={deciding ? t(deciding.approve ? (deciding.l.conflicts.length ? 'hr:leave.approveEffectConflicts' : 'hr:leave.approveEffect') : 'hr:leave.rejectEffect', { count: deciding.l.conflicts.length }) : ''}
        confirmLabel={deciding?.approve ? t('hr:decision.approve') : t('hr:decision.reject')}
        destructive={!deciding?.approve}
        {...(deciding && !deciding.approve ? { reasonLabel: t('hr:decision.reason') } : {})}
        onConfirm={async (note) => {
          if (!deciding) return;
          try {
            await act.mutateAsync({ method: 'POST', path: `/hr/leave/${deciding.l.id}/${deciding.approve ? 'approve' : 'reject'}`, body: note ? { note } : {} });
            toast.success(t(deciding.approve ? 'hr:leave.approved' : 'hr:leave.rejected', { name: deciding.l.employeeName }));
          } catch (e) {
            problem(e);
          }
          setDeciding(null);
        }}
      />
    </div>
  );
}

function Values({ v }: { v: CorrectionValues }) {
  const { t } = useT();
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <AttendanceBadge state={v.state} />
      {v.state !== 'absent' && (
        <span className="text-xs text-muted tabular-nums">
          {v.checkIn ? <Time value={v.checkIn} /> : '—'} – {v.checkOut ? <Time value={v.checkOut} /> : t('hr:correction.noOut')}
        </span>
      )}
    </span>
  );
}

function Corrections({ list }: { list: AttendanceCorrectionView[] }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const shiftName = useShiftName();
  const toast = useToast();
  const problem = useProblemToast();
  const act = useApiMutation<AttendanceCorrectionView>();
  const [deciding, setDeciding] = useState<{ c: AttendanceCorrectionView; approve: boolean } | null>(null);
  if (list.length === 0) return <EmptyState title={t('hr:correction.empty')} />;
  return (
    <div className="space-y-4">
      <InlineAlert tone="info">{t('hr:correction.rule')}</InlineAlert>
      <ul className="space-y-3" data-testid="hr-correction-rows">
        {list.map((c) => (
          <li key={c.id} className="space-y-2 rounded-tile border border-border/70 bg-panel p-4 shadow-card" data-testid="hr-correction-row" data-name={c.employeeName} data-state={c.state}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1 basis-[min(100%,18rem)]">
                <PersonName id={c.employeeId} name={c.employeeName} tab="attendance" className="inline-flex min-h-6 items-center font-semibold" />
                <p className="text-sm text-text">
                  {/* Stacked under the name link: 24 px tall so the two never crowd each other (target size). */}
                  <Link href={HR.attendance(c.date)} className="inline-flex min-h-6 items-center">
                    {fmt.date(c.date)} · {shiftName(c.shiftKey)}
                  </Link>
                </p>
              </div>
              <DecisionBadge state={c.state} testId="correction-state" />
            </div>
            <p className="flex flex-wrap items-center gap-2 text-sm" data-testid="hr-correction-change">
              <Values v={c.before} />
              <ArrowRight aria-label={t('hr:correction.becomes')} className="size-4 text-muted rtl:-scale-x-100" />
              <Values v={c.after} />
            </p>
            <p className="text-sm break-words text-muted">“{c.reason}”</p>
            <p className="text-xs text-muted">
              <bdi dir="ltr">{c.ref}</bdi> · {t('hr:leave.requestedBy', { name: c.requestedByName })} <bdi><DateTime value={c.requestedAt} style="dateTime" /></bdi>
              {c.decidedByName ? ` · ${t('hr:leave.decidedBy', { name: c.decidedByName })}` : ''}
            </p>
            {c.blocked && (
              <p className="flex items-center gap-1.5 text-sm text-muted" data-testid="hr-correction-blocked">
                <Info aria-hidden className="size-4 shrink-0" />
                {t(`hr:decision.blocked.${c.blocked}`)}
              </p>
            )}
            {(c.actions.approve || c.actions.reject) && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="primary" icon={Check} onPress={() => setDeciding({ c, approve: true })} data-testid="hr-correction-approve">
                  {t('hr:decision.approve')}
                </Button>
                <Button size="sm" variant="quiet" icon={X} onPress={() => setDeciding({ c, approve: false })} data-testid="hr-correction-reject">
                  {t('hr:decision.reject')}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        isOpen={!!deciding}
        onOpenChange={(o) => !o && setDeciding(null)}
        title={deciding ? t(deciding.approve ? 'hr:correction.approveTitle' : 'hr:correction.rejectTitle', { name: deciding.c.employeeName }) : ''}
        effect={deciding ? t(deciding.approve ? 'hr:correction.approveEffect' : 'hr:correction.rejectEffect') : ''}
        confirmLabel={deciding?.approve ? t('hr:decision.approve') : t('hr:decision.reject')}
        destructive={!deciding?.approve}
        {...(deciding && !deciding.approve ? { reasonLabel: t('hr:decision.reason') } : {})}
        onConfirm={async (note) => {
          if (!deciding) return;
          try {
            await act.mutateAsync({ method: 'POST', path: `/hr/corrections/${deciding.c.id}/${deciding.approve ? 'approve' : 'reject'}`, body: note ? { note } : {} });
            toast.success(t(deciding.approve ? 'hr:correction.approved' : 'hr:correction.rejected', { name: deciding.c.employeeName }));
          } catch (e) {
            problem(e);
          }
          setDeciding(null);
        }}
      />
    </div>
  );
}
