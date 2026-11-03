import type { HrDashboard } from '@repo/contracts';
import { DateTime, EmptyState, ErrorState, Link, PageHeader, Panel, StatTile, useApiQuery, useCan, useT } from '@repo/ui';
import { AlarmClock, CalendarClock, CalendarDays, ClipboardList, FileWarning, HandCoins, TriangleAlert, UserPlus, UsersRound, UserX } from 'lucide-react';
import { HR } from '../../../nav.config';
import { Loading, useSocietyFormat } from '../kit';
import { HrNav, LinkButton, ShiftTime, useRole, useShiftName } from './hkit';

/**
 * HR-001 HR dashboard: every figure opens the records behind it (owner rule: no decorative cards),
 * the shifts running now with who is in, late or absent, and what needs attention next.
 */
export default function HrDashboardPage() {
  const { t } = useT();
  const shiftName = useShiftName();
  const role = useRole();
  const fmt = useSocietyFormat();
  const canHire = useCan()('hr.manage');
  const q = useApiQuery<HrDashboard>({ method: 'GET', path: '/hr/dashboard' });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  const k = d.kpis;
  const tile = (key: keyof HrDashboard['kpis'], value: number, href: string, icon: typeof UsersRound, hue: 'emerald' | 'amber' | 'sky' | 'rose' | 'violet' | 'slate') => (
    <StatTile label={t(`hr:dashboard.kpi.${key}`)} value={value} accessibleValue={String(value)} href={href} icon={icon} hue={hue} testId={`hr-kpi-${key}`} />
  );
  return (
    <div className="@container space-y-6" data-testid="hr-dashboard">
      <PageHeader
        title={t('hr:dashboard.title')}
        description={t('hr:dashboard.intro', { site: d.siteName })}
        actions={
          <div className="flex flex-wrap gap-2">
            {d.canSee.roster && (
              <LinkButton icon={CalendarDays} href={HR.roster()} testId="hr-open-roster">
                {t('hr:dashboard.openRoster')}
              </LinkButton>
            )}
            {canHire && (
              <LinkButton variant="primary" icon={UserPlus} href={HR.newEmployee} testId="hr-new-employee">
                {t('hr:employees.new')}
              </LinkButton>
            )}
          </div>
        }
      />
      <HrNav current="dashboard" />
      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @3xl:grid-cols-4">
        {tile('activeStaff', k.activeStaff, HR.employees(), UsersRound, 'emerald')}
        {tile('onDutyNow', k.onDutyNow, HR.roster({ tab: 'now' }), CalendarClock, 'sky')}
        {tile('absentToday', k.absentToday, HR.attendance(d.today), UserX, 'rose')}
        {tile('shortShifts', k.shortShifts, HR.roster(), TriangleAlert, 'amber')}
        {tile('leavePending', k.leavePending, HR.leave(), CalendarDays, 'violet')}
        {tile('correctionsPending', k.correctionsPending, HR.leave('corrections'), ClipboardList, 'slate')}
        {tile('documentsAttention', k.documentsAttention, HR.documents('attention'), FileWarning, 'amber')}
        {k.advancesAwaiting !== undefined && tile('advancesAwaiting', k.advancesAwaiting, HR.advances('submitted'), HandCoins, 'emerald')}
      </div>
      <div className="grid gap-5 @4xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel title={t('hr:dashboard.nowTitle')} description={<bdi><DateTime value={d.at} style="dateTime" /></bdi>}>
          {d.shifts.length === 0 ? (
            <EmptyState title={t('hr:dashboard.noneNow')} />
          ) : (
            <ul className="space-y-3" data-testid="hr-now-shifts">
              {d.shifts.map((s) => (
                <li key={`${s.templateId}-${s.date}`} className="rounded-tile border border-border/70 p-3" data-short={s.short || undefined}>
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="font-semibold text-text">{shiftName(s.shiftKey, s.department)}</span>
                    <ShiftTime start={s.start} end={s.end} className="text-sm text-muted" />
                  </p>
                  <p className="mt-1 text-sm text-muted">{s.minStaff > 0 ? t(s.short ? 'hr:roster.shortBy' : 'hr:roster.covered', { available: s.available, required: s.minStaff }) : t('hr:roster.onDutyCount', { count: s.available })}</p>
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {s.staff.map((p) => (
                      <li key={p.assignmentId} className="min-w-0">
                        <Link href={HR.employee(p.employeeId)} className="font-medium">
                          <bdi>{p.name}</bdi>
                        </Link>
                        <span className="text-muted">
                          {' '}
                          · {role(p.role)} · {t(`hr:board.state.${p.state}`)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {s.short && (
                    <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-warning">
                      <AlarmClock aria-hidden className="size-4" />
                      {t('hr:dashboard.short')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3">
            <Link href={HR.roster({ tab: 'now' })}>{t('hr:dashboard.toBoard')}</Link>
          </p>
        </Panel>
        <Panel title={t('hr:dashboard.attentionTitle')}>
          {d.attention.length === 0 ? (
            <EmptyState title={t('hr:dashboard.allClear')} />
          ) : (
            <ul className="space-y-2" data-testid="hr-attention">
              {d.attention.map((a, i) => (
                <li key={`${a.kind}-${i}`}>
                  <Link href={a.href} variant="plain" className="flex items-start gap-2 rounded-control px-2 py-1.5 text-sm hover:bg-raised" data-testid="hr-attention-item" data-kind={a.kind}>
                    <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                    <span className="min-w-0 break-words">
                      {t(`hr:dashboard.attention.${a.kind}`, {
                        ...a.values,
                        ...(a.values.count ? { count: Number(a.values.count) } : {}),
                        ...(a.values.shift ? { shift: shiftName(a.values.shift as 'morning', a.values.department) } : {}),
                        ...(a.values.document ? { document: t(`hr:documents.kind.${a.values.document as 'cnic'}`) } : {}),
                        ...(a.values.status ? { status: t(`hr:documents.statusWord.${a.values.status as 'missing'}`) } : {}),
                        ...(a.values.date ? { date: fmt.date(a.values.date) } : {}),
                        ...(a.values.week ? { week: fmt.date(a.values.week) } : {}),
                      })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
