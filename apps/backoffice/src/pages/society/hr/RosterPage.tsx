import type { AssignmentView, AttendanceRow, OnDutyBoard, OnDutyShift, RosterShift, RosterWeek } from '@repo/contracts';
import { Badge, Button, ConfirmDialog, DateTime, Drawer, EmptyState, ErrorState, IconButton, InlineAlert, Link, PageHeader, Panel, SelectControl, SegmentedControl, UrlTabs, useApiMutation, useApiQuery, useIsDesktop, useQueryParam, useQueryParams, useT, useToast } from '@repo/ui';
import { ArrowLeftRight, BadgeCheck, CalendarDays, ChevronLeft, ChevronRight, CircleDashed, LogIn, Plus, Send, TriangleAlert, UserMinus, UserX } from 'lucide-react';
import { useState } from 'react';
import { HR } from '../../../nav.config';
import { Loading, ScrollRegion, useSocietyFormat } from '../kit';
import { addDays, AttendanceBadge, HrNav, ShiftTime, Time, useProblemToast, useRole, useShiftName, weekStartOf } from './hkit';
import { AssignShiftDrawer } from './HrDrawers';

/**
 * HR-010 shifts and duty roster, with HR-011 "On duty now" as its live tab. The week shows every
 * shift's people and whether it meets the society's minimum; a pending leave request is a warning on
 * the duty, approved leave a gap to fill. Draft weeks are seen only here; publishing makes the week
 * the staff's and residents' roster. "On duty now" answers who is in, who is late or absent, which
 * shift is short, who can replace whom, and what starts next.
 */
export default function RosterPage() {
  const { t } = useT();
  const tabs = [
    { id: 'week', label: t('hr:roster.tab.week') },
    { id: 'now', label: t('hr:roster.tab.now') },
    { id: 'shifts', label: t('hr:roster.tab.shifts') },
  ];
  return (
    <div className="@container space-y-5" data-testid="hr-roster">
      <PageHeader title={t('hr:roster.title')} description={t('hr:roster.intro')} />
      <HrNav current="roster" />
      <UrlTabs label={t('hr:roster.tabsLabel')} items={tabs} phoneLimit={3}>
        {(tab) => <div className="pt-4">{tab === 'now' ? <OnDutyNow /> : tab === 'shifts' ? <ShiftTemplates /> : <Week />}</div>}
      </UrlTabs>
    </div>
  );
}

function useWeek() {
  const [week] = useQueryParam('week');
  return useApiQuery<RosterWeek>({ method: 'GET', path: '/hr/roster', query: week ? { week } : {} }, { placeholderData: (prev) => prev });
}

function Week() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const shiftName = useShiftName();
  const setParams = useQueryParams();
  const desktop = useIsDesktop();
  const toast = useToast();
  const problem = useProblemToast();
  const q = useWeek();
  const publish = useApiMutation<RosterWeek>();
  const [assign, setAssign] = useState<{ templateId: string; date: string } | null>(null);
  const [duty, setDuty] = useState<AssignmentView | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const w = q.data;
  const thisWeek = weekStartOf(w.today);
  const selectedDay = day && w.days.some((d) => d.date === day) ? day : (w.days.find((d) => d.date === w.today)?.date ?? w.days[0]!.date);
  const go = (n: number) => setParams({ week: addDays(w.weekStart, n * 7) === thisWeek ? null : addDays(w.weekStart, n * 7) });
  const short = w.warnings.filter((x) => x.kind === 'short_staffed');
  const conflicts = w.warnings.filter((x) => x.kind !== 'short_staffed');
  const dayLabel = (date: string) => new Intl.DateTimeFormat(fmt.locale, { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  const cell = (s: RosterShift, date: string) => (
    <div className="space-y-1.5" data-testid="hr-roster-cell" data-date={date} data-shift={s.shiftKey} data-department={s.department} data-short={s.coverage.short || undefined}>
      <ul className="space-y-1">
        {s.assignments.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => setDuty(a)}
              className="flex w-full min-w-0 flex-col items-start rounded-control border border-border bg-panel px-2 py-1 text-start text-xs outline-none hover:bg-raised focus-visible:outline-2 focus-visible:outline-focus data-[leave]:border-warning"
              data-leave={a.leave}
              data-testid="hr-roster-duty"
              data-name={a.employeeName}
            >
              <bdi className="font-medium break-words text-text">{a.employeeName}</bdi>
              <span className="text-muted">
                {a.post ?? ''}
                {a.coverFor ? ` · ${t('hr:roster.cover')}` : ''}
              </span>
              {a.leave && <span className="font-medium text-warning">{t(`hr:roster.leave.${a.leave}`)}</span>}
              {(a.attendance === 'absent' || a.attendance === 'late') && <span className="font-medium text-warning">{t(`hr:attendance.state.${a.attendance}`)}</span>}
            </button>
          </li>
        ))}
      </ul>
      {!s.runs && s.assignments.length === 0 && <p className="text-xs text-subtle">{t('hr:roster.notScheduled')}</p>}
      {s.runs && s.minStaff > 0 && (
        <p className={s.coverage.short ? 'flex items-center gap-1 text-xs font-medium text-warning' : 'text-xs text-muted'} data-testid="hr-roster-coverage">
          {s.coverage.short && <TriangleAlert aria-hidden className="size-3.5" />}
          {t(s.coverage.short ? 'hr:roster.shortBy' : 'hr:roster.covered', { available: s.coverage.available, required: s.coverage.required })}
        </p>
      )}
      {w.actions.edit && s.runs && addDays(date, s.shiftKey === 'night' ? 1 : 0) >= w.today && (
        <IconButton icon={Plus} label={t('hr:roster.addTo', { shift: shiftName(s.shiftKey, s.department), date: fmt.date(date) })} onPress={() => setAssign({ templateId: s.templateId, date })} />
      )}
    </div>
  );
  return (
    <div className="space-y-4" data-testid="hr-roster-week" data-state={w.state}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <IconButton icon={ChevronLeft} label={t('hr:roster.prevWeek')} onPress={() => go(-1)} />
          <h2 className="text-lg font-semibold text-text" data-testid="hr-roster-range">
            {fmt.date(w.weekStart)} – {fmt.date(addDays(w.weekStart, 6))}
          </h2>
          <IconButton icon={ChevronRight} label={t('hr:roster.nextWeek')} onPress={() => go(1)} />
          {w.weekStart !== thisWeek && (
            <Button size="sm" variant="quiet" icon={CalendarDays} onPress={() => setParams({ week: null })}>
              {t('hr:roster.thisWeek')}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={w.state === 'published' ? 'success' : 'neutral'} icon={w.state === 'published' ? BadgeCheck : CircleDashed} data-testid="hr-roster-state" data-state={w.state}>
            {t(`hr:roster.state.${w.state}`)}
          </Badge>
          {w.actions.publish && (
            <Button variant="primary" icon={Send} onPress={() => setPublishing(true)} data-testid="hr-roster-publish">
              {w.state === 'published' ? t('hr:roster.republish') : t('hr:roster.publish')}
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm text-muted" data-testid="hr-roster-published-note">
        {w.state === 'published' ? t('hr:roster.publishedBy', { name: w.publishedByName ?? '' }) : t('hr:roster.draftNote')}
        {w.publishedAt ? (
          <>
            {' '}
            <bdi><DateTime value={w.publishedAt} style="dateTime" /></bdi>
          </>
        ) : null}
        {w.changesSincePublish > 0 ? ` · ${t('hr:roster.changes', { count: w.changesSincePublish })}` : ''}
      </p>
      {(short.length > 0 || conflicts.length > 0) && (
        <InlineAlert tone="warning" title={t('hr:roster.warningsTitle', { count: short.length + conflicts.length })} data-testid="hr-roster-warnings">
          <ul className="mt-1 list-disc space-y-0.5 ps-5">
            {[...short, ...conflicts].slice(0, 8).map((x, i) => (
              <li key={i}>{t(`hr:roster.warning.${x.kind}`, { date: fmt.date(x.date), shift: shiftName(x.shiftKey, x.department), name: x.employeeName ?? '', available: x.available ?? 0, required: x.required ?? 0 })}</li>
            ))}
          </ul>
          {short.length + conflicts.length > 8 && <p className="mt-1 text-xs">{t('hr:roster.moreWarnings', { count: short.length + conflicts.length - 8 })}</p>}
        </InlineAlert>
      )}
      {desktop ? (
        <ScrollRegion label={t('hr:roster.gridLabel')}>
          <table className="w-full min-w-[56rem] table-fixed border-separate border-spacing-1 text-sm" data-testid="hr-roster-grid">
            <caption className="sr-only">{t('hr:roster.gridCaption', { from: fmt.date(w.weekStart) })}</caption>
            <thead>
              <tr>
                <th scope="col" className="w-36 text-start text-xs font-semibold text-muted">
                  {t('hr:roster.shiftColumn')}
                </th>
                {w.days.map((d) => (
                  <th key={d.date} scope="col" className={d.date === w.today ? 'rounded-control bg-primary-soft py-1 text-xs font-semibold text-primary' : 'py-1 text-xs font-semibold text-muted'}>
                    {dayLabel(d.date)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {w.templates.map((tpl, i) => (
                <tr key={tpl.id}>
                  <th scope="row" className="align-top text-start">
                    {(i === 0 || w.templates[i - 1]!.department !== tpl.department) && <span className="block text-xs font-semibold tracking-wide text-muted uppercase">{t(`hr:department.${tpl.department}`)}</span>}
                    <span className="block font-medium text-text">{shiftName(tpl.key, tpl.department)}</span>
                    <span className="block text-xs text-muted tabular-nums">
                      <bdi>{tpl.start}</bdi>–<bdi>{tpl.end}</bdi>
                      {tpl.crossesMidnight ? ` ${t('hr:shift.nextDay')}` : ''}
                    </span>
                  </th>
                  {w.days.map((d) => (
                    <td key={d.date} className="rounded-control bg-sunken/40 p-1.5 align-top">
                      {cell(d.shifts.find((s) => s.templateId === tpl.id)!, d.date)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      ) : (
        <div className="space-y-3" data-testid="hr-roster-days">
          <SegmentedControl label={t('hr:roster.dayPicker')} value={selectedDay} onChange={setDay} options={w.days.map((d) => ({ id: d.date, label: dayLabel(d.date) }))} wrap testId="hr-roster-day" />
          {w.days
            .filter((d) => d.date === selectedDay)
            .map((d) => (
              <ul key={d.date} className="space-y-3">
                {d.shifts.map((s) => (
                  <li key={s.templateId} className="rounded-tile border border-border/70 bg-panel p-3">
                    <p className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="font-semibold text-text">{shiftName(s.shiftKey, s.department)}</span>
                      <ShiftTime start={s.start} end={s.end} className="text-sm text-muted" />
                    </p>
                    {cell(s, d.date)}
                  </li>
                ))}
              </ul>
            ))}
        </div>
      )}
      {assign && <AssignShiftDrawer key={`${assign.templateId}-${assign.date}`} open onClose={() => setAssign(null)} templates={w.templates} templateId={assign.templateId} date={assign.date} today={w.today} />}
      {duty && <DutyDrawer duty={duty} week={w} onClose={() => setDuty(null)} />}
      <ConfirmDialog
        isOpen={publishing}
        onOpenChange={setPublishing}
        title={t('hr:roster.publishTitle', { from: fmt.date(w.weekStart) })}
        effect={t('hr:roster.publishEffect', { count: short.length })}
        confirmLabel={w.state === 'published' ? t('hr:roster.republish') : t('hr:roster.publish')}
        onConfirm={async () => {
          try {
            await publish.mutateAsync({ method: 'POST', path: '/hr/roster/publish', body: { weekStart: w.weekStart } });
            toast.success(t('hr:roster.published'));
          } catch (e) {
            problem(e);
          }
        }}
      />
    </div>
  );
}

/** One duty: who, when and how it stands; swap it with another duty, remove it, or open the person. */
function DutyDrawer({ duty, week, onClose }: { duty: AssignmentView; week: RosterWeek; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const problem = useProblemToast();
  const fmt = useSocietyFormat();
  const shiftName = useShiftName();
  const role = useRole();
  const act = useApiMutation<unknown>();
  const [swapWith, setSwapWith] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const department = week.templates.find((x) => x.id === duty.templateId)?.department;
  const started = duty.started;
  const others = week.days.flatMap((d) => d.shifts.filter((s) => s.department === department).flatMap((s) => s.assignments.filter((a) => a.id !== duty.id && a.employeeId !== duty.employeeId && !a.started && !a.coverFor)));
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={duty.employeeName}
      subtitle={`${fmt.date(duty.date)} · ${shiftName(duty.shiftKey, department)}`}
      testId="hr-duty-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onPress={onClose}>
            {t('common:actions.close')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">{t('hr:fields.role')}</dt>
          <dd>{role(duty.role)}</dd>
          <dt className="text-muted">{t('hr:assign.window')}</dt>
          <dd>
            <ShiftTime start={duty.start} end={duty.end} />
          </dd>
          <dt className="text-muted">{t('hr:assign.post')}</dt>
          <dd>{duty.post ?? t('hr:assign.noPost')}</dd>
          <dt className="text-muted">{t('hr:attendance.title')}</dt>
          <dd>
            <AttendanceBadge state={duty.attendance} />
          </dd>
        </dl>
        {duty.leave && (
          <InlineAlert tone="warning" data-testid="hr-duty-leave">
            {t(`hr:roster.leaveExplain.${duty.leave}`, { name: duty.employeeName })}
          </InlineAlert>
        )}
        {duty.coverFor && <p className="text-sm text-muted">{t('hr:roster.coverFor', { name: duty.coverFor.employeeName })}</p>}
        <p>
          <Link href={HR.employee(duty.employeeId, 'duty')}>{t('hr:roster.openPerson', { name: duty.employeeName })}</Link>
        </p>
        {week.actions.edit && !started && (
          <>
            <section className="space-y-2" aria-labelledby="hr-swap-title">
              <h3 id="hr-swap-title" className="text-sm font-semibold text-text">
                {t('hr:roster.swapTitle')}
              </h3>
              {others.length === 0 ? (
                <p className="text-sm text-muted">{t('hr:roster.swapNone')}</p>
              ) : (
                <>
                  <SelectControl
                    label={t('hr:roster.swapWith')}
                    value={swapWith}
                    onChange={setSwapWith}
                    placeholder={t('hr:roster.swapChoose')}
                    options={others.map((a) => ({ id: a.id, label: `${a.employeeName} · ${fmt.date(a.date)} · ${shiftName(a.shiftKey, department)}` }))}
                    testId="hr-swap-with"
                  />
                  <Button
                    icon={ArrowLeftRight}
                    isDisabled={!swapWith}
                    isPending={act.isPending}
                    onPress={async () => {
                      try {
                        await act.mutateAsync({ method: 'POST', path: `/hr/roster/assignments/${duty.id}/swap`, body: { withAssignmentId: swapWith } });
                        toast.success(t('hr:roster.swapped'));
                        onClose();
                      } catch (e) {
                        problem(e);
                      }
                    }}
                    data-testid="hr-swap-save"
                  >
                    {t('hr:roster.swap')}
                  </Button>
                </>
              )}
            </section>
            <Button variant="danger" icon={UserMinus} onPress={() => setRemoving(true)} data-testid="hr-unassign">
              {t('hr:roster.unassign')}
            </Button>
          </>
        )}
        {started && <p className="text-sm text-muted">{t('hr:roster.startedNote')}</p>}
      </div>
      <ConfirmDialog
        isOpen={removing}
        onOpenChange={setRemoving}
        title={t('hr:roster.unassignTitle', { name: duty.employeeName })}
        effect={t('hr:roster.unassignEffect')}
        confirmLabel={t('hr:roster.unassign')}
        destructive
        reasonLabel={t('hr:roster.unassignReason')}
        onConfirm={async (reason) => {
          try {
            await act.mutateAsync({ method: 'POST', path: `/hr/roster/assignments/${duty.id}/unassign`, body: { reason } });
            toast.success(t('hr:roster.unassigned'));
            onClose();
          } catch (e) {
            problem(e);
          }
        }}
      />
    </Drawer>
  );
}

/** HR-011: who is on duty, late, absent or replaced right now, and what starts next. */
function OnDutyNow() {
  const { t } = useT();
  const toast = useToast();
  const problem = useProblemToast();
  const shiftName = useShiftName();
  const role = useRole();
  const board = useApiQuery<OnDutyBoard>({ method: 'GET', path: '/hr/roster/now' }, { refetchInterval: 60_000 });
  const week = useWeek();
  const act = useApiMutation<AttendanceRow>();
  const [cover, setCover] = useState<{ shift: OnDutyShift; assignmentId: string; name: string } | null>(null);
  const [absent, setAbsent] = useState<{ assignmentId: string; name: string } | null>(null);
  if (board.isError) return <ErrorState error={board.error} onRetry={() => void board.refetch()} />;
  if (!board.data) return <Loading lines={8} />;
  const b = board.data;
  const graceOver = (s: OnDutyShift) => s.graceOver;
  const checkIn = async (assignmentId: string, name: string) => {
    try {
      const r = await act.mutateAsync({ method: 'POST', path: `/hr/attendance/${assignmentId}/check-in` });
      toast.success(t(r.state === 'late' ? 'hr:attendance.checkedInLate' : 'hr:attendance.checkedIn', { name, minutes: r.lateMinutes ?? 0 }));
    } catch (e) {
      problem(e);
    }
  };
  const shortShifts = b.current.filter((s) => s.short);
  return (
    <div className="space-y-5" data-testid="hr-on-duty">
      <p className="text-sm text-muted">
        {t('hr:board.asOf')}{' '}
        <bdi>
          <DateTime value={b.at} style="dateTime" />
        </bdi>{' '}
        · {t('hr:board.grace', { minutes: b.graceMinutes })}
      </p>
      {!b.published && (
        <InlineAlert tone="warning" data-testid="hr-board-draft">
          {t('hr:board.notPublished')}
        </InlineAlert>
      )}
      {shortShifts.length > 0 && (
        <InlineAlert tone="warning" role="status" title={t('hr:board.shortTitle')} data-testid="hr-board-short">
          {shortShifts.map((s) => t('hr:board.short', { shift: shiftName(s.shiftKey, s.department), available: s.available, required: s.minStaff })).join(' · ')}
        </InlineAlert>
      )}
      {b.current.length === 0 ? (
        <EmptyState title={t('hr:board.nobody')} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 @4xl:grid-cols-2" data-testid="hr-board-current">
          {b.current.map((s) => (
            <li key={`${s.templateId}-${s.date}`}>
              <Panel
                title={shiftName(s.shiftKey, s.department)}
                description={<ShiftTime start={s.start} end={s.end} />}
                actions={
                  s.minStaff > 0 ? (
                    <Badge tone={s.short ? 'warning' : 'success'} icon={s.short ? TriangleAlert : BadgeCheck} data-testid="hr-board-coverage" data-short={s.short || undefined}>
                      {t(s.short ? 'hr:roster.shortBy' : 'hr:roster.covered', { available: s.available, required: s.minStaff })}
                    </Badge>
                  ) : undefined
                }
              >
                <ul className="space-y-2" data-testid="hr-board-shift" data-shift={s.shiftKey} data-department={s.department}>
                  {s.staff.map((p) => {
                    const notIn = p.state === 'not_checked_in';
                    return (
                      <li key={p.assignmentId} className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border px-3 py-2" data-testid="hr-board-person" data-name={p.name} data-state={p.state}>
                        <span className="min-w-0 flex-1 basis-[min(100%,12rem)] text-sm">
                          <Link href={HR.employee(p.employeeId)} className="font-medium">
                            <bdi>{p.name}</bdi>
                          </Link>
                          <span className="block text-xs text-muted">
                            {role(p.role)}
                            {p.post ? ` · ${p.post}` : ''}
                            {p.checkInAt ? (
                              <>
                                {' · '}
                                {t('hr:board.inAt')} <Time value={p.checkInAt} />
                              </>
                            ) : null}
                            {p.coverFor ? ` · ${t('hr:roster.coverFor', { name: p.coverFor })}` : ''}
                          </span>
                          {p.coveredBy && <span className="block text-xs font-medium text-success">{t('hr:board.coveredBy', { name: p.coveredBy })}</span>}
                        </span>
                        <span className="flex flex-wrap items-center gap-2">
                          <AttendanceBadge state={notIn ? 'not_checked_in' : p.state} />
                          {b.actions.record && notIn && (
                            <Button size="sm" icon={LogIn} isPending={act.isPending} onPress={() => void checkIn(p.assignmentId, p.name)} data-testid="hr-board-check-in">
                              {t('hr:attendance.checkIn')}
                            </Button>
                          )}
                          {b.actions.record && notIn && graceOver(s) && (
                            <Button size="sm" variant="quiet" icon={UserX} onPress={() => setAbsent({ assignmentId: p.assignmentId, name: p.name })} data-testid="hr-board-absent">
                              {t('hr:attendance.markAbsent')}
                            </Button>
                          )}
                          {b.actions.cover && (p.state === 'absent' || p.state === 'on_leave') && !p.coveredBy && (
                            <Button size="sm" variant="primary" onPress={() => setCover({ shift: s, assignmentId: p.assignmentId, name: p.name })} data-testid="hr-board-replace">
                              {t('hr:board.findReplacement')}
                            </Button>
                          )}
                        </span>
                      </li>
                    );
                  })}
                  {s.staff.length === 0 && <li className="text-sm text-muted">{t('hr:board.noneAssigned')}</li>}
                </ul>
              </Panel>
            </li>
          ))}
        </ul>
      )}
      <Panel title={t('hr:board.nextTitle')}>
        {b.next.length === 0 ? (
          <p className="text-sm text-muted">{t('hr:board.noNext')}</p>
        ) : (
          <ul className="space-y-2" data-testid="hr-board-next">
            {b.next.map((s) => (
              <li key={`${s.templateId}-${s.date}`} className="text-sm">
                <span className="font-medium text-text">
                  {shiftName(s.shiftKey, s.department)} · {t('hr:board.startsAt')} <Time value={s.start} />
                </span>
                <span className="block text-muted">{s.staff.map((p) => `${p.name}${p.post ? ` (${p.post})` : ''}`).join(', ') || t('hr:board.noneAssigned')}</span>
                {s.short && <span className="block text-xs font-medium text-warning">{t('hr:board.nextShort', { available: s.available, required: s.minStaff })}</span>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {cover && week.data && <AssignShiftDrawer key={cover.assignmentId} open onClose={() => setCover(null)} templates={week.data.templates} templateId={cover.shift.templateId} date={cover.shift.date} coverFor={{ assignmentId: cover.assignmentId, employeeName: cover.name }} today={week.data.today} />}
      <ConfirmDialog
        isOpen={!!absent}
        onOpenChange={(o) => !o && setAbsent(null)}
        title={t('hr:attendance.absentTitle', { name: absent?.name ?? '' })}
        effect={t('hr:attendance.absentEffect')}
        confirmLabel={t('hr:attendance.markAbsent')}
        destructive
        onConfirm={async () => {
          if (!absent) return;
          try {
            await act.mutateAsync({ method: 'POST', path: `/hr/attendance/${absent.assignmentId}/absent` });
            toast.success(t('hr:attendance.markedAbsent', { name: absent.name }));
          } catch (e) {
            problem(e);
          }
          setAbsent(null);
        }}
      />
    </div>
  );
}

function ShiftTemplates() {
  const { t } = useT();
  const shiftName = useShiftName();
  const q = useWeek();
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={6} />;
  return (
    <Panel title={t('hr:roster.templatesTitle')} description={t('hr:roster.templatesNote')}>
      <ul className="space-y-2" data-testid="hr-shift-templates">
        {q.data.templates.map((x) => (
          <li key={x.id} className="grid gap-1 rounded-tile border border-border px-3 py-2 text-sm @2xl:grid-cols-[minmax(0,1fr)_auto_auto] @2xl:items-center">
            <span>
              <span className="font-medium text-text">{shiftName(x.key, x.department)}</span>
              <span className="block text-xs text-muted">
                {t(`hr:department.${x.department}`)} · {x.posts.join(', ')}
              </span>
            </span>
            <span className="tabular-nums">
              <bdi>{x.start}</bdi>–<bdi>{x.end}</bdi>
              {x.crossesMidnight ? ` ${t('hr:shift.nextDay')}` : ''}
            </span>
            <span className="text-muted">{x.minStaff > 0 ? t('hr:roster.minimum', { count: x.minStaff }) : t('hr:roster.noMinimum')}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
