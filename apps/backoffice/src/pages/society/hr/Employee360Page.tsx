import type { Employee360, HrEvent, RosterWeek } from '@repo/contracts';
import { Button, DateTime, EmptyState, ErrorState, InlineAlert, KeyValueList, Link, Money, PageHeader, Panel, UrlTabs, useApiQuery, useT } from '@repo/ui';
import { CalendarPlus, CalendarRange, FilePlus2, Lock, Pencil, UserCog, UserRoundCheck } from 'lucide-react';
import { useState } from 'react';
import { HR } from '../../../nav.config';
import { Loading, useSocietyFormat } from '../kit';
import { AdvanceBadge, AttendanceBadge, DecisionBadge, DocumentBadge, DutyBadge, EmploymentBadge, HrNav, Initials, ShiftTime, Time, useRole, useShiftName } from './hkit';
import { AssignShiftDrawer, DocumentDrawer, LeaveDrawer, ProfileDrawer, StatusDrawer } from './HrDrawers';

/**
 * HR-003 Employee 360: one person's employment, sites, duty, attendance, leave, documents, advances
 * (with an advances permission only) and history, each one tab away, with the actions in place
 * (assign a shift, request leave, add a document, change status, the resident-facing profile).
 * Personal details appear only for `hr.manage`; files only for `hr.documents.manage`.
 */
export default function Employee360Page({ employeeId }: { employeeId: string }) {
  const { t } = useT();
  const role = useRole();
  const shiftName = useShiftName();
  const fmt = useSocietyFormat();
  const q = useApiQuery<Employee360>({ method: 'GET', path: `/hr/employees/${employeeId}` });
  const roster = useApiQuery<RosterWeek>(q.data?.actions.assign ? { method: 'GET', path: '/hr/roster' } : null);
  const [drawer, setDrawer] = useState<'assign' | 'leave' | 'document' | 'status' | 'profile' | null>(null);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const e = q.data;
  const a = e.actions;
  const today = e.today;
  const attention = e.documents.status.filter((d) => d.status !== 'valid');
  const tabs = [
    { id: 'overview', label: t('hr:e360.tab.overview') },
    { id: 'employment', label: t('hr:e360.tab.employment') },
    { id: 'duty', label: t('hr:e360.tab.duty') },
    { id: 'attendance', label: t('hr:e360.tab.attendance') },
    { id: 'leave', label: t('hr:e360.tab.leave') },
    { id: 'documents', label: t('hr:e360.tab.documents') },
    ...(a.viewAdvances ? [{ id: 'advances', label: t('hr:e360.tab.advances') }] : []),
    { id: 'activity', label: t('hr:e360.tab.activity') },
  ];
  const history = (h: HrEvent, i: number) => (
    <li key={`${h.at}-${i}`} className="border-s-2 border-border ps-3">
      <p className="text-sm text-text">{t(`hr:history.${h.action as 'hired'}`, { defaultValue: h.action, ...(h.values ?? {}), ...(h.values?.role ? { role: role(h.values.role as 'cleaner') } : {}) })}</p>
      <p className="text-xs text-muted">
        <bdi>{h.byName}</bdi> · <bdi><DateTime value={h.at} style="dateTime" /></bdi>
      </p>
      {h.note && <p className="mt-0.5 text-sm break-words text-muted">“{h.note}”</p>}
    </li>
  );
  return (
    <div className="@container space-y-5" data-testid="hr-employee-360" data-id={e.id}>
      <PageHeader
        title={e.name}
        breadcrumbs={[{ label: t('hr:employees.title'), href: HR.employees() }]}
        badge={<EmploymentBadge status={e.status} />}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <bdi dir="ltr">{e.code}</bdi> · {role(e.role)} · {t(`hr:department.${e.department}`)}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {a.assign && (
              <Button variant="primary" icon={CalendarPlus} onPress={() => setDrawer('assign')} data-testid="hr-360-assign">
                {t('hr:e360.assign')}
              </Button>
            )}
            {a.requestLeave && (
              <Button icon={CalendarRange} onPress={() => setDrawer('leave')} data-testid="hr-360-request-leave">
                {t('hr:e360.requestLeave')}
              </Button>
            )}
            {a.manageDocuments && (
              <Button icon={FilePlus2} onPress={() => setDrawer('document')} data-testid="hr-360-document">
                {t('hr:e360.addDocument')}
              </Button>
            )}
            {a.changeStatus && (
              <Button variant="quiet" icon={UserCog} onPress={() => setDrawer('status')} data-testid="hr-360-status">
                {t('hr:e360.changeStatus')}
              </Button>
            )}
          </div>
        }
      />
      <HrNav current="employees" />
      <div className="flex flex-wrap items-center gap-4 rounded-card border border-border/70 bg-panel p-4 shadow-card" data-testid="hr-360-today">
        <Initials text={e.initials} className="size-12 text-base" />
        <div className="min-w-0 flex-1 basis-[min(100%,14rem)]">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{t('hr:e360.now')}</p>
          <p className="flex flex-wrap items-center gap-2">
            <DutyBadge state={today.state} />
            {today.shiftKey && today.start && today.end && (
              <span className="text-sm text-text">
                {shiftName(today.shiftKey, e.department)} · <ShiftTime start={today.start} end={today.end} />
                {today.post ? ` · ${today.post}` : ''}
              </span>
            )}
          </p>
        </div>
        {a.recordAttendance && (
          <Link href={HR.attendance()} className="text-sm">
            {t('hr:e360.recordAttendance')}
          </Link>
        )}
        <Link href={HR.roster()} className="text-sm">
          {t('hr:e360.openRoster')}
        </Link>
      </div>
      <UrlTabs label={t('hr:e360.tabsLabel')} items={tabs} phoneLimit={3}>
        {(tab) => (
          <div className="pt-4" data-testid={`hr-360-tab-${tab}`}>
            {tab === 'overview' && (
              <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-2">
                <Panel title={t('hr:e360.facts')}>
                  <KeyValueList
                    items={[
                      { label: t('hr:fields.role'), value: role(e.role) },
                      { label: t('hr:fields.employmentType'), value: t(`hr:type.${e.employmentType}`) },
                      { label: t('hr:fields.startDate'), value: fmt.date(e.startDate) },
                      ...(e.endDate ? [{ label: t('hr:e360.lastDay'), value: fmt.date(e.endDate) }] : []),
                      { label: t('hr:fields.legalEntity'), value: <bdi>{e.legalEntity.name}</bdi> },
                      { label: t('hr:fields.site'), value: e.sites.filter((s) => !s.to).map((s) => s.siteName).join(', ') || t('hr:e360.noSite') },
                      { label: t('hr:fields.cnic'), value: <bdi dir="ltr">{e.personal?.cnic ?? e.cnicMasked}</bdi> },
                      { label: t('hr:e360.signIn'), value: e.hasSignIn ? t('hr:e360.hasSignIn') : t('hr:e360.noSignIn') },
                      ...(e.supervises.length ? [{ label: t('hr:e360.supervises'), value: e.supervises.map((d) => t(`hr:department.${d}`)).join(', ') }] : []),
                    ]}
                  />
                </Panel>
                <div className="space-y-5">
                  <Panel title={t('hr:e360.attendance30')}>
                    <p className="flex flex-wrap gap-x-5 gap-y-2 text-sm" data-testid="hr-360-attendance-summary">
                      {(['present', 'late', 'absent', 'on_leave'] as const).map((s) => (
                        <span key={s}>
                          <span className="font-semibold text-text">{fmt.count(e.attendance.summary[s])}</span> <span className="text-muted">{t(`hr:attendance.state.${s}`)}</span>
                        </span>
                      ))}
                    </p>
                  </Panel>
                  <Panel title={t('hr:e360.documentsTitle')}>
                    {attention.length === 0 ? (
                      <p className="text-sm text-success">{t('hr:e360.documentsOk')}</p>
                    ) : (
                      <ul className="space-y-2">
                        {attention.map((d) => (
                          <li key={d.kind} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span>{t(`hr:documents.kind.${d.kind}`)}</span>
                            <DocumentBadge status={d.status} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </Panel>
                  <Panel
                    title={t('hr:e360.profileTitle')}
                    actions={
                      a.edit ? (
                        <Button size="sm" variant="quiet" icon={UserRoundCheck} onPress={() => setDrawer('profile')} data-testid="hr-360-profile">
                          {t('hr:e360.profileChange')}
                        </Button>
                      ) : undefined
                    }
                  >
                    <p className="text-sm text-text" data-testid="hr-360-profile-summary">
                      {e.publicProfile.consent ? t(e.publicProfile.showName ? 'hr:e360.profileName' : 'hr:e360.profileRole', { role: role(e.role) }) : t('hr:e360.profileNone', { role: role(e.role) })}
                    </p>
                    {e.publicProfile.consentAt && (
                      <p className="mt-1 text-xs text-muted">
                        {t('hr:e360.consentRecorded', { name: e.publicProfile.recordedByName ?? '' })} <DateTime value={e.publicProfile.consentAt} style="date" />
                      </p>
                    )}
                  </Panel>
                </div>
              </div>
            )}
            {tab === 'employment' && (
              <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-2">
                <Panel title={t('hr:e360.periods')}>
                  <ol className="space-y-2">
                    {e.periods.map((p, i) => (
                      <li key={i} className="rounded-tile border border-border px-3 py-2 text-sm">
                        <p className="font-medium text-text">
                          {fmt.date(p.from)} – {p.to ? fmt.date(p.to) : t('hr:e360.present')}
                        </p>
                        <p className="text-xs text-muted">
                          {t(`hr:type.${p.type}`)}
                          {p.endReason ? ` · ${p.endReason}` : ''}
                        </p>
                      </li>
                    ))}
                  </ol>
                </Panel>
                <Panel title={t('hr:e360.sites')}>
                  <ol className="space-y-2">
                    {e.sites.map((s, i) => (
                      <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border px-3 py-2 text-sm">
                        <bdi className="font-medium text-text">{s.siteName}</bdi>
                        <span className="text-xs text-muted">
                          {fmt.date(s.from)} – {s.to ? fmt.date(s.to) : t('hr:e360.present')}
                        </span>
                      </li>
                    ))}
                  </ol>
                </Panel>
                <Panel title={t('hr:e360.personal')} className="@4xl:col-span-2">
                  {e.personal ? (
                    <KeyValueList
                      items={[
                        { label: t('hr:fields.cnic'), value: <bdi dir="ltr">{e.personal.cnic}</bdi> },
                        { label: t('hr:fields.phone'), value: <bdi dir="ltr">{e.personal.phone}</bdi> },
                        { label: t('hr:fields.emergencyContact'), value: e.personal.emergencyContact ? <bdi dir="ltr">{e.personal.emergencyContact}</bdi> : '—' },
                        { label: t('hr:fields.address'), value: <bdi>{e.personal.address}</bdi> },
                        ...(e.personal.dateOfBirth ? [{ label: t('hr:fields.dateOfBirth'), value: fmt.date(e.personal.dateOfBirth) }] : []),
                      ]}
                    />
                  ) : (
                    <p className="flex items-center gap-2 text-sm text-muted" data-testid="hr-360-personal-restricted">
                      <Lock aria-hidden className="size-4" />
                      {t('hr:e360.personalRestricted')}
                    </p>
                  )}
                </Panel>
              </div>
            )}
            {tab === 'duty' && (
              <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-2">
                <Panel title={t('hr:e360.upcoming')}>
                  {e.upcoming.length === 0 ? (
                    <EmptyState title={t('hr:e360.noUpcoming')} body={a.assign ? t('hr:e360.noUpcomingHint') : undefined} />
                  ) : (
                    <ul className="space-y-2" data-testid="hr-360-upcoming">
                      {e.upcoming.map((s) => (
                        <li key={s.id} className="rounded-tile border border-border px-3 py-2 text-sm">
                          <p className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="font-medium text-text">
                              {fmt.date(s.date)} · {shiftName(s.shiftKey, e.department)}
                            </span>
                            <ShiftTime start={s.start} end={s.end} className="text-muted" />
                          </p>
                          <p className="text-xs text-muted">
                            {s.post ?? t('hr:assign.noPost')}
                            {s.coverFor ? ` · ${t('hr:roster.coverFor', { name: s.coverFor.employeeName })}` : ''}
                            {s.leave ? ` · ${t(`hr:roster.leave.${s.leave}`)}` : ''}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
                <Panel title={t('hr:e360.history')}>
                  {e.shiftHistory.length === 0 ? (
                    <EmptyState title={t('hr:e360.noHistory')} />
                  ) : (
                    <ul className="space-y-2">
                      {e.shiftHistory.map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span>
                            {fmt.date(s.date)} · {shiftName(s.shiftKey, e.department)}
                          </span>
                          <AttendanceBadge state={s.attendance} />
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>
            )}
            {tab === 'attendance' && (
              <Panel title={t('hr:e360.attendanceTitle')} description={t('hr:e360.attendanceNote')}>
                {e.attendance.recent.length === 0 ? (
                  <EmptyState title={t('hr:e360.noAttendance')} />
                ) : (
                  <ul className="space-y-2" data-testid="hr-360-attendance">
                    {e.attendance.recent.map((r) => (
                      <li key={r.assignmentId} className="grid gap-1 rounded-tile border border-border px-3 py-2 text-sm @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] @2xl:items-center">
                        <Link href={HR.attendance(r.date)} className="font-medium">
                          {fmt.date(r.date)} · {shiftName(r.shiftKey, e.department)}
                        </Link>
                        <span className="text-muted tabular-nums">
                          {r.checkIn ? <Time value={r.checkIn} /> : '—'} – {r.checkOut ? <Time value={r.checkOut} /> : '—'}
                          {r.lateMinutes ? ` · ${t('hr:attendance.lateBy', { minutes: r.lateMinutes })}` : ''}
                          {r.corrected ? ` · ${t('hr:attendance.corrected')}` : ''}
                        </span>
                        <AttendanceBadge state={r.state} />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
            {tab === 'leave' && (
              <div className="space-y-5">
                <InlineAlert tone="info" data-testid="hr-360-leave-policy">
                  {t('hr:leave.balanceNote', {
                    taken: Object.entries(e.leave.takenThisYear)
                      .filter(([, n]) => n > 0)
                      .map(([k, n]) => `${t(`hr:leave.types.${k as 'annual'}`)} ${fmt.count(n)}`)
                      .join(', ') || t('hr:leave.none'),
                  })}
                </InlineAlert>
                {e.leave.requests.length === 0 ? (
                  <EmptyState title={t('hr:leave.emptyFor')} />
                ) : (
                  <ul className="space-y-2" data-testid="hr-360-leave">
                    {e.leave.requests.map((l) => (
                      <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 basis-[min(100%,16rem)]">
                          <span className="block font-medium text-text">
                            {t(`hr:leave.types.${l.type}`)} · {fmt.date(l.from)}
                            {l.to !== l.from ? ` – ${fmt.date(l.to)}` : ''} · {t('hr:leave.days', { count: l.days })}
                          </span>
                          <span className="block text-xs break-words text-muted">{l.reason}</span>
                        </span>
                        <DecisionBadge state={l.state} />
                      </li>
                    ))}
                  </ul>
                )}
                <p>
                  <Link href={HR.leave()}>{t('hr:e360.allLeave')}</Link>
                </p>
              </div>
            )}
            {tab === 'documents' && (
              <Panel title={t('hr:e360.documentsTitle')} description={t('hr:e360.requiredNote', { list: e.documents.required.map((k) => t(`hr:documents.kind.${k}`)).join(', ') })}>
                <ul className="space-y-2" data-testid="hr-360-documents">
                  {e.documents.status.map((d) => {
                    const file = e.documents.items?.find((x) => x.kind === d.kind);
                    return (
                      <li key={d.kind} className="grid gap-1 rounded-tile border border-border px-3 py-2 text-sm @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] @2xl:items-center" data-kind={d.kind}>
                        <span className="font-medium text-text">{t(`hr:documents.kind.${d.kind}`)}</span>
                        <span className="min-w-0 text-xs break-words text-muted">
                          {file ? (
                            <>
                              <bdi dir="ltr">{file.fileName}</bdi> · {t('hr:documents.version', { n: file.version })}
                              {file.numberMasked ? (
                                <>
                                  {' '}
                                  · <bdi dir="ltr">{file.numberMasked}</bdi>
                                </>
                              ) : null}
                            </>
                          ) : d.status === 'missing' ? (
                            t('hr:documents.notOnFile')
                          ) : (
                            t('hr:documents.restricted')
                          )}
                          {d.expiresOn ? ` · ${t('hr:documents.expires', { date: fmt.date(d.expiresOn) })}` : ''}
                        </span>
                        <DocumentBadge status={d.status} />
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3">
                  <Link href={HR.documents()}>{t('hr:e360.allDocuments')}</Link>
                </p>
              </Panel>
            )}
            {tab === 'advances' && e.advances && (
              <Panel title={t('hr:e360.advancesTitle')} description={t('hr:advances.neverPaid')}>
                {e.advances.length === 0 ? (
                  <EmptyState title={t('hr:advances.emptyFor')} />
                ) : (
                  <ul className="space-y-2" data-testid="hr-360-advances">
                    {e.advances.map((x) => (
                      <li key={x.id}>
                        <Link href={HR.advances()} variant="plain" className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border px-3 py-2 text-sm hover:bg-raised">
                          <span>
                            <bdi dir="ltr" className="text-muted">
                              {x.ref}
                            </bdi>{' '}
                            · {t(`hr:advances.kind.${x.kind}`)} · <Money value={x.amount} />
                          </span>
                          <span className="flex items-center gap-2">
                            {x.state === 'disbursed' && (
                              <span className="text-xs text-muted">
                                {t('hr:advances.owes')} <Money value={x.outstanding} />
                              </span>
                            )}
                            <AdvanceBadge state={x.state} />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
            {tab === 'activity' && (
              <Panel title={t('hr:e360.activity')}>
                <ol className="space-y-3" data-testid="hr-360-activity">
                  {e.history.map(history)}
                </ol>
              </Panel>
            )}
          </div>
        )}
      </UrlTabs>
      {a.edit && (
        <p className="text-xs text-muted">
          <Pencil aria-hidden className="me-1 inline size-3" />
          {t('hr:e360.editNote')}
        </p>
      )}
      {roster.data && (
        <AssignShiftDrawer key={`assign-${drawer === 'assign'}`} open={drawer === 'assign'} onClose={() => setDrawer(null)} templates={roster.data.templates} employee={{ id: e.id, name: e.name, department: e.department }} today={e.businessDate} />
      )}
      <LeaveDrawer key={`leave-${drawer === 'leave'}`} open={drawer === 'leave'} onClose={() => setDrawer(null)} employee={{ id: e.id, name: e.name }} today={e.businessDate} />
      <DocumentDrawer key={`doc-${drawer === 'document'}`} open={drawer === 'document'} onClose={() => setDrawer(null)} employee={{ id: e.id, name: e.name }} {...(attention[0] ? { kind: attention[0].kind } : {})} />
      <StatusDrawer key={`status-${drawer === 'status'}`} open={drawer === 'status'} onClose={() => setDrawer(null)} employee={{ id: e.id, name: e.name, status: e.status, ...(e.endDate ? { endDate: e.endDate } : {}) }} today={e.businessDate} />
      <ProfileDrawer key={`profile-${drawer === 'profile'}`} open={drawer === 'profile'} onClose={() => setDrawer(null)} employee={{ id: e.id, name: e.name }} profile={e.publicProfile} roleLabel={role(e.role)} />
    </div>
  );
}
