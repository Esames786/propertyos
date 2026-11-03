import type { AttendanceCorrectionView, AttendanceDay, AttendanceRow } from '@repo/contracts';
import { Button, ConfirmDialog, Drawer, EmptyState, ErrorState, IconButton, InlineAlert, Link, PageHeader, PlainTextArea, SegmentedControl, useApiMutation, useApiQuery, useQueryParam, useQueryParams, useT, useToast } from '@repo/ui';
import { ChevronLeft, ChevronRight, ClipboardPen, Hourglass, LogIn, LogOut, UserX } from 'lucide-react';
import { useState } from 'react';
import { HR } from '../../../nav.config';
import { Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { addDays, AttendanceBadge, DateInput, HrNav, ShiftTime, Time, useProblemToast, useRole, useShiftName } from './hkit';

/**
 * HR-005 attendance: the day's duties by shift (a night shift belongs to the day it starts) with
 * check-in, check-out and absence, recorded by supervisors for their own department. Lateness counts
 * from the society's grace period. A mistake is never edited: a correction is requested here and
 * approved by someone else with attendance.adjust (HR-006), and both values stay in the history.
 */
export default function AttendancePage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const shiftName = useShiftName();
  const role = useRole();
  const toast = useToast();
  const problem = useProblemToast();
  const [dateParam] = useQueryParam('date');
  const setParams = useQueryParams();
  const q = useApiQuery<AttendanceDay>({ method: 'GET', path: '/hr/attendance', query: dateParam ? { date: dateParam } : {} }, { placeholderData: (prev) => prev });
  const act = useApiMutation<AttendanceRow>();
  const [absent, setAbsent] = useState<AttendanceRow | null>(null);
  const [correct, setCorrect] = useState<AttendanceRow | null>(null);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const d = q.data;
  const go = (date: string) => setParams({ date: date === d.today ? null : date });
  const record = async (row: AttendanceRow, what: 'check-in' | 'check-out') => {
    try {
      const r = await act.mutateAsync({ method: 'POST', path: `/hr/attendance/${row.assignmentId}/${what}` });
      toast.success(what === 'check-out' ? t('hr:attendance.checkedOut', { name: row.employeeName }) : t(r.state === 'late' ? 'hr:attendance.checkedInLate' : 'hr:attendance.checkedIn', { name: row.employeeName, minutes: r.lateMinutes ?? 0 }));
    } catch (e) {
      problem(e);
    }
  };
  const groups = [...new Set(d.rows.map((r) => `${r.shiftKey}|${r.start}`))];
  return (
    <div className="@container space-y-5" data-testid="hr-attendance">
      <PageHeader title={t('hr:attendance.title')} description={t('hr:attendance.intro', { minutes: d.graceMinutes })} />
      <HrNav current="attendance" />
      <div className="flex flex-wrap items-end gap-3">
        <IconButton icon={ChevronLeft} label={t('hr:attendance.prevDay')} onPress={() => go(addDays(d.date, -1))} />
        <DateInput id="hr-attendance-date" label={t('hr:attendance.date')} value={d.date} onChange={(v) => v && go(v)} testId="hr-attendance-date" />
        <IconButton icon={ChevronRight} label={t('hr:attendance.nextDay')} onPress={() => go(addDays(d.date, 1))} />
        {d.date !== d.today && (
          <Button size="sm" variant="quiet" onPress={() => go(d.today)}>
            {t('hr:attendance.today')}
          </Button>
        )}
      </div>
      <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm" data-testid="hr-attendance-summary">
        {(['present', 'late', 'absent', 'on_leave', 'planned'] as const).map((s) => (
          <span key={s}>
            <span className="font-semibold text-text">{fmt.count(d.summary[s])}</span> <span className="text-muted">{t(`hr:attendance.state.${s}`)}</span>
          </span>
        ))}
      </p>
      {!d.canRecord && <InlineAlert tone="info">{t('hr:attendance.readOnly')}</InlineAlert>}
      {d.rows.length === 0 ? (
        <EmptyState title={t('hr:attendance.empty', { date: fmt.date(d.date) })} />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => {
            const rows = d.rows.filter((r) => `${r.shiftKey}|${r.start}` === g);
            const first = rows[0]!;
            return (
              <section key={g} aria-labelledby={`att-${g}`} className="space-y-2">
                <h2 id={`att-${g}`} className="flex flex-wrap items-baseline gap-x-3 text-base font-semibold text-text">
                  {shiftName(first.shiftKey, first.department)}
                  <ShiftTime start={first.start} end={first.end} className="text-sm font-normal text-muted" />
                </h2>
                <ul className="space-y-2" data-testid="hr-attendance-rows">
                  {rows.map((r) => {
                    // Not yet recorded: still to come, under way without a check-in, or over with nothing recorded.
                    const shown = r.state !== 'planned' ? r.state : r.ended ? 'not_recorded' : r.started ? 'not_checked_in' : 'planned';
                    return (
                      <li key={r.assignmentId} className="grid gap-2 rounded-tile border border-border/70 bg-panel p-3 shadow-card @3xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] @3xl:items-center" data-testid="hr-attendance-row" data-name={r.employeeName} data-state={r.state}>
                        <span className="min-w-0">
                          <Link href={HR.employee(r.employeeId, 'attendance')} className="font-medium">
                            <bdi>{r.employeeName}</bdi>
                          </Link>
                          <span className="block text-xs text-muted">
                            {role(r.role)}
                            {r.post ? ` · ${r.post}` : ''}
                          </span>
                        </span>
                        <span className="text-sm text-muted tabular-nums">
                          {t('hr:attendance.in')} {r.checkIn ? <Time value={r.checkIn} /> : '—'} · {t('hr:attendance.out')} {r.checkOut ? <Time value={r.checkOut} /> : '—'}
                          {r.lateMinutes ? <span className="block text-xs text-warning">{t('hr:attendance.lateBy', { minutes: r.lateMinutes })}</span> : null}
                          {r.corrected ? <span className="block text-xs">{t('hr:attendance.corrected')}</span> : null}
                          {r.recordedByName ? <span className="block text-xs">{t('hr:attendance.recordedBy', { name: r.recordedByName })}</span> : null}
                        </span>
                        <span className="flex flex-wrap items-center gap-2 @3xl:justify-end">
                          <AttendanceBadge state={shown} />
                          {r.correctionPending && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-info" data-testid="hr-correction-pending">
                              <Hourglass aria-hidden className="size-3.5" />
                              {t('hr:attendance.correctionPending')}
                            </span>
                          )}
                          {r.actions.checkIn && (
                            <Button size="sm" icon={LogIn} onPress={() => void record(r, 'check-in')} data-testid="hr-check-in">
                              {t('hr:attendance.checkIn')}
                            </Button>
                          )}
                          {r.actions.checkOut && (
                            <Button size="sm" icon={LogOut} onPress={() => void record(r, 'check-out')} data-testid="hr-check-out">
                              {t('hr:attendance.checkOut')}
                            </Button>
                          )}
                          {r.actions.markAbsent && (
                            <Button size="sm" variant="quiet" icon={UserX} onPress={() => setAbsent(r)} data-testid="hr-mark-absent">
                              {t('hr:attendance.markAbsent')}
                            </Button>
                          )}
                          {r.actions.correct && (
                            <Button size="sm" variant="quiet" icon={ClipboardPen} onPress={() => setCorrect(r)} data-testid="hr-correct">
                              {t('hr:attendance.requestCorrection')}
                            </Button>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        isOpen={!!absent}
        onOpenChange={(o) => !o && setAbsent(null)}
        title={t('hr:attendance.absentTitle', { name: absent?.employeeName ?? '' })}
        effect={t('hr:attendance.absentEffect')}
        confirmLabel={t('hr:attendance.markAbsent')}
        destructive
        onConfirm={async () => {
          if (!absent) return;
          try {
            await act.mutateAsync({ method: 'POST', path: `/hr/attendance/${absent.assignmentId}/absent` });
            toast.success(t('hr:attendance.markedAbsent', { name: absent.employeeName }));
          } catch (e) {
            problem(e);
          }
          setAbsent(null);
        }}
      />
      {correct && <CorrectionDrawer row={correct} onClose={() => setCorrect(null)} />}
    </div>
  );
}

/** "HH:mm" in Pakistan for an instant, and an instant from a date and "HH:mm" (+05:00). */
const hhmm = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Karachi' }) : '');
const dateOf = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });

function CorrectionDrawer({ row, onClose }: { row: AttendanceRow; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const save = useApiMutation<AttendanceCorrectionView>();
  const [mode, setMode] = useState<'times' | 'absent'>('times');
  const [checkIn, setCheckIn] = useState(hhmm(row.checkIn) || hhmm(row.start));
  const [checkOut, setCheckOut] = useState(hhmm(row.checkOut));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  // On a shift that crosses midnight, a time before its start hour is the next morning.
  const startDay = dateOf(row.start);
  const crosses = dateOf(row.end) !== startDay;
  const at = (time: string) => `${crosses && time < hhmm(row.start) ? addDays(startDay, 1) : startDay}T${time}:00+05:00`;
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('hr:correction.title', { name: row.employeeName })}
      subtitle={t('hr:correction.subtitle')}
      testId="hr-correction-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onPress={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="primary"
            isPending={save.isPending}
            onPress={async () => {
              setError(null);
              try {
                const c = await save.mutateAsync({ method: 'POST', path: `/hr/attendance/${row.assignmentId}/corrections`, body: { after: mode === 'absent' ? { state: 'absent' } : { checkIn: at(checkIn), ...(checkOut ? { checkOut: at(checkOut) } : {}) }, reason } });
                toast.success(t('hr:correction.requested', { ref: c.ref }));
                onClose();
              } catch (e) {
                setError(e);
              }
            }}
            data-testid="hr-correction-save"
          >
            {t('hr:correction.submit')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-muted">
          {t('hr:correction.now')} <AttendanceBadge state={row.state} /> · {t('hr:attendance.in')} {row.checkIn ? <Time value={row.checkIn} /> : '—'} · {t('hr:attendance.out')} {row.checkOut ? <Time value={row.checkOut} /> : '—'}
        </p>
        <SegmentedControl
          label={t('hr:correction.what')}
          value={mode}
          onChange={setMode}
          options={[
            { id: 'times', label: t('hr:correction.times') },
            { id: 'absent', label: t('hr:correction.absent') },
          ]}
          testId="hr-correction-mode"
          wrap
        />
        {mode === 'times' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="hr-cor-in" className="block text-sm font-medium text-text">
                {t('hr:correction.checkIn')}
              </label>
              <input id="hr-cor-in" type="time" value={checkIn} onChange={(e) => setCheckIn(e.currentTarget.value)} className="block min-h-11 w-full max-w-xs rounded-control border border-border-control bg-bg px-3 text-text" data-testid="hr-correction-in" />
            </div>
            <div className="space-y-1">
              <label htmlFor="hr-cor-out" className="block text-sm font-medium text-text">
                {t('hr:correction.checkOut')}
              </label>
              <input id="hr-cor-out" type="time" value={checkOut} onChange={(e) => setCheckOut(e.currentTarget.value)} className="block min-h-11 w-full max-w-xs rounded-control border border-border-control bg-bg px-3 text-text" data-testid="hr-correction-out" />
            </div>
            <p className="text-xs text-muted sm:col-span-2">{t('hr:correction.stateFromTimes')}</p>
          </div>
        )}
        <PlainTextArea label={t('hr:correction.reason')} value={reason} onChange={setReason} rows={3} description={t('hr:correction.reasonHint')} testId="hr-correction-reason" />
        <InlineAlert tone="info">{t('hr:correction.approvalNote')}</InlineAlert>
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}
