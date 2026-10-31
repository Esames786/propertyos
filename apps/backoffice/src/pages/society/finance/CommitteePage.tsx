import type { Committee360, CommitteeOffice } from '@repo/contracts';
import { Badge, Button, buttonClass, dynamicT, ErrorState, InlineAlert, Link, PageHeader, PlainCheckbox, PlainTextArea, PlainTextField, SelectControl, UrlTabs, useApiMutation, useApiQuery, useT, useToast } from '@repo/ui';
import { CalendarCheck, ClipboardCheck, FileSignature, Gavel, KeyRound, LogOut, Megaphone, Plus, ShieldCheck, UserRoundPlus, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { FINANCE } from '../../../nav.config';
import { Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { HistoryList, WRAP } from './fkit';

/**
 * RES-008 Committee 360 (reference experience 3, Gate S.1). The managing committee as data: offices
 * and effective-dated terms, meetings and minutes, decisions (residents see only published ones),
 * and the approval policy that gives offices their authority. A title grants nothing by itself: the
 * holder acts only through a linked staff role, and only as the policy in force allows.
 */
export default function CommitteePage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const tr = dynamicT(t);
  const q = useApiQuery<Committee360>({ method: 'GET', path: '/committee' });
  const act = useApiMutation<Committee360>();
  const [error, setError] = useState<unknown>(null);
  const run = async (method: 'POST' | 'PATCH', path: string, body: unknown, message: string) => {
    setError(null);
    try {
      await act.mutateAsync({ method, path, body });
      toast.success(message);
      void q.refetch();
      return true;
    } catch (e) {
      setError(e);
      return false;
    }
  };
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} label={t('governance:committee.loading')} />;
  const d = q.data;
  const manage = d.actions.manage;
  const holders = (office: CommitteeOffice) => d.terms.filter((x) => x.office === office && x.state === 'active');
  return (
    <div className="@container space-y-6" data-testid="committee-page">
      <PageHeader
        title={d.committee.name}
        description={t('governance:committee.intro', { entity: d.committee.legalEntityName, ends: fmt.date(d.committee.termEnds) })}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={FINANCE.approvals()} variant="plain" className={buttonClass('secondary', 'md', `gap-2 ${WRAP}`)} data-testid="committee-approvals">
              <ClipboardCheck aria-hidden className="size-4" />
              {t('governance:committee.approvals', { count: d.approvals.pending })}
            </Link>
            <Link href={FINANCE.policies()} variant="plain" className={buttonClass('secondary', 'md', `gap-2 ${WRAP}`)}>
              <ShieldCheck aria-hidden className="size-4" />
              {t('governance:committee.policy', { version: d.policy.version })}
            </Link>
          </div>
        }
      />
      <InlineAlert tone="info" title={t('governance:committee.powersTitle')}>
        <p>{t('governance:committee.powersBody')}</p>
      </InlineAlert>
      <UrlTabs
        label={t('nav:pages.committee')}
        items={[
          { id: 'roster', label: t('governance:committee.tabs.roster') },
          { id: 'offices', label: t('governance:committee.tabs.offices') },
          { id: 'meetings', label: t('governance:committee.tabs.meetings') },
          { id: 'decisions', label: t('governance:committee.tabs.decisions') },
          { id: 'policies', label: t('governance:committee.tabs.policies') },
          { id: 'audit', label: t('governance:committee.tabs.audit') },
        ]}
      >
        {(tab) => (
          <div className="space-y-4 pt-4">
            {tab === 'roster' && (
              <>
                <ul className="grid grid-cols-1 gap-3 @3xl:grid-cols-2" data-testid="committee-roster">
                  {d.terms.map((term) => (
                    <li key={term.id} className="space-y-2 rounded-card border border-border/70 bg-panel p-4 shadow-card" data-testid="committee-term" data-office={term.office} data-state={term.state}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-text">{t(`governance:office.${term.office}`)}</p>
                        <Badge tone={term.state === 'active' ? 'success' : term.state === 'scheduled' ? 'info' : 'neutral'}>{t(`governance:committee.termState.${term.state}`)}</Badge>
                      </div>
                      <p className="text-base font-medium text-text">
                        <bdi>{term.member.name}</bdi>
                        {term.member.flats?.length ? (
                          <span className="text-sm text-muted">
                            {' · '}
                            <bdi dir="ltr" className="ltr-ref">{term.member.flats.join(', ')}</bdi>
                          </span>
                        ) : null}
                      </p>
                      <p className="text-sm text-muted">
                        {t('governance:committee.termLine', { from: fmt.date(term.from), to: term.to ? fmt.date(term.to) : t('governance:committee.open'), how: t(`governance:committee.appointed.${term.appointedBy}`), ref: term.decisionRef ?? '—' })}
                      </p>
                      <p className="flex items-center gap-1.5 text-sm">
                        <KeyRound aria-hidden className="size-4 text-muted" />
                        {term.member.principalId ? t('governance:committee.signIn') : t('governance:committee.noSignIn')}
                      </p>
                      {term.endedReason && (
                        <p className="text-sm text-muted">
                          <bdi>{term.endedReason}</bdi>
                        </p>
                      )}
                      {manage && term.state === 'active' && <EndTerm termId={term.id} onRun={run} />}
                    </li>
                  ))}
                </ul>
                {manage && <AddTerm data={d} onRun={run} />}
              </>
            )}
            {tab === 'offices' && (
              <ul className="space-y-3" data-testid="committee-offices">
                {d.offices.map((o) => (
                  <li key={o.office} className="space-y-2 rounded-card border border-border/70 bg-panel p-4 shadow-card" data-testid="committee-office" data-office={o.office}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-text">{t(`governance:office.${o.office}`)}</p>
                      <Badge tone="neutral">{t(o.singleHolder ? 'governance:committee.single' : 'governance:committee.multiple')}</Badge>
                    </div>
                    <p className="text-sm text-muted">{t(`governance:committee.duty.${o.office}`)}</p>
                    <p className="text-sm text-text">
                      {t('governance:committee.heldBy')}: {holders(o.office).map((h) => h.member.name).join(', ') || t('governance:committee.vacant')}
                    </p>
                    <p className="text-sm text-text">{o.roleId ? t('governance:committee.linkedRole', { role: tr(d.roles.find((r) => r.id === o.roleId)?.labelKey ?? o.roleId) }) : t('governance:committee.noRole')}</p>
                    {o.authority.length ? (
                      <ul className="list-disc space-y-0.5 ps-5 text-sm text-text" data-testid="office-authority">
                        {o.authority.map((a, i) => (
                          <li key={i}>{t('governance:committee.authority', { subject: t(`governance:subject.${a.subject}`), limit: a.upTo ? t('finance:approval.below', { amount: fmt.money(a.upTo) }) : t('governance:policy.anyAmount'), count: a.withOthers })}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted">{t('governance:committee.noAuthority')}</p>
                    )}
                    {manage && (
                      <SelectControl
                        label={t('governance:committee.linkRole')}
                        value={o.roleId ?? 'none'}
                        onChange={(k) => void run('PATCH', `/committee/offices/${o.office}`, { roleId: k && k !== 'none' ? k : '' }, t('governance:committee.linked'))}
                        options={[{ id: 'none', label: t('governance:committee.noRoleOption') }, ...d.roles.map((r) => ({ id: r.id, label: tr(r.labelKey) }))]}
                        testId={`office-role-${o.office}`}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
            {tab === 'meetings' && (
              <>
                <ul className="space-y-3" data-testid="committee-meetings">
                  {d.meetings.map((m) => (
                    <li key={m.id} className="space-y-1 rounded-card border border-border/70 bg-panel p-4 shadow-card" data-testid="committee-meeting">
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-text">
                        <CalendarCheck aria-hidden className="size-4 text-muted" />
                        <bdi>{m.title}</bdi> · <bdi dir="ltr" className="ltr-ref">{m.ref}</bdi>
                      </p>
                      <p className="text-sm text-muted">{t('governance:committee.meetingLine', { date: fmt.date(m.on), count: m.attendees.length, quorum: t(m.quorum ? 'governance:committee.quorum' : 'governance:committee.noQuorum'), name: m.recordedByName })}</p>
                      <p className="text-sm text-text">
                        <bdi>{m.minutes}</bdi>
                      </p>
                    </li>
                  ))}
                </ul>
                {manage && <RecordMeeting onRun={run} />}
              </>
            )}
            {tab === 'decisions' && (
              <>
                <ul className="space-y-3" data-testid="committee-decisions">
                  {d.decisions.map((x) => (
                    <li key={x.id} className="space-y-1 rounded-card border border-border/70 bg-panel p-4 shadow-card" data-testid="committee-decision" data-outcome={x.outcome}>
                      <p className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex min-w-0 items-start gap-2 font-semibold text-text">
                          <Gavel aria-hidden className="mt-1 size-4 shrink-0 text-muted" />
                          <span className="min-w-0">
                            <bdi dir="ltr" className="ltr-ref">{x.ref}</bdi> · <bdi>{x.subject}</bdi>
                          </span>
                        </span>
                        <span className="flex gap-1.5">
                          <Badge tone={x.outcome === 'approved' ? 'success' : x.outcome === 'rejected' ? 'error' : 'neutral'}>{t(`governance:committee.outcome.${x.outcome}`)}</Badge>
                          <Badge tone={x.published ? 'info' : 'neutral'} icon={Megaphone}>{t(x.published ? 'governance:committee.published' : 'governance:committee.internal')}</Badge>
                        </span>
                      </p>
                      <p className="text-sm text-muted">{t('governance:committee.decisionLine', { date: fmt.date(x.on), for: x.votes.for, against: x.votes.against, abstain: x.votes.abstain, meeting: x.meetingRef ?? '—' })}</p>
                      {x.linked && <Link href={x.linked.href}>{t('governance:committee.linkedRecord', { ref: x.linked.ref })}</Link>}
                    </li>
                  ))}
                </ul>
                {manage && <RecordDecision data={d} onRun={run} />}
              </>
            )}
            {tab === 'policies' && (
              <section className="space-y-3 rounded-card bg-panel p-5 shadow-card" data-testid="committee-policies">
                <p className="text-sm text-text">{t('governance:committee.policyLine', { version: d.policy.version, from: fmt.date(d.policy.effectiveFrom) })}</p>
                <Link href={FINANCE.policies()}>{t('governance:committee.openPolicy')}</Link>
                <h3 className="pt-2 text-sm font-semibold text-text">{t('governance:committee.delegations')}</h3>
                {d.delegations.length === 0 ? (
                  <p className="text-sm text-muted">{t('governance:delegation.empty')}</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {d.delegations.map((x) => (
                      <li key={x.id}>
                        {t('governance:delegation.line', { from: x.fromName, to: x.toName })} · {t(`governance:delegation.state.${x.state}`)}
                      </li>
                    ))}
                  </ul>
                )}
                <Link href={FINANCE.delegation}>{t('governance:committee.openDelegation')}</Link>
              </section>
            )}
            {tab === 'audit' && (
              <section className="rounded-card bg-panel p-5 shadow-card">
                {d.audit.length === 0 ? <p className="text-sm text-muted">{t('finance:close.noHistory')}</p> : <HistoryList label={t('governance:committee.tabs.audit')} testId="committee-audit" items={d.audit.map((a) => ({ at: a.at, byName: a.byName, label: tr(`governance:committee.events.${a.action}`), note: a.label }))} />}
              </section>
            )}
            {error ? <ProblemAlert error={error} /> : null}
          </div>
        )}
      </UrlTabs>
      {!manage && (
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <UsersRound aria-hidden className="size-4" />
          {t('governance:committee.readOnly')}
        </p>
      )}
    </div>
  );
}

type Run = (method: 'POST' | 'PATCH', path: string, body: unknown, message: string) => Promise<boolean>;

function EndTerm({ termId, onRun }: { termId: string; onRun: Run }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState('2026-10-26');
  const [reason, setReason] = useState('');
  return open ? (
    <div className="space-y-2 rounded-tile bg-sunken/50 p-3">
      <PlainTextField label={t('governance:committee.endOn')} value={on} onChange={setOn} dir="ltr" />
      <PlainTextField label={t('governance:committee.endReason')} value={reason} onChange={setReason} testId="end-term-reason" />
      <Button variant="secondary" size="sm" isDisabled={reason.trim().length < 5} onPress={async () => (await onRun('POST', `/committee/terms/${termId}/end`, { on, reason }, t('governance:committee.ended'))) && setOpen(false)} data-testid="end-term-confirm">
        {t('governance:committee.endTerm')}
      </Button>
    </div>
  ) : (
    <Button variant="quiet" size="sm" icon={LogOut} onPress={() => setOpen(true)} data-testid="end-term">
      {t('governance:committee.endTerm')}
    </Button>
  );
}

function AddTerm({ data, onRun }: { data: Committee360; onRun: Run }) {
  const { t } = useT();
  const [office, setOffice] = useState<string | null>(null);
  const [party, setParty] = useState<string | null>(null);
  const [from, setFrom] = useState('2026-11-01');
  const [ref, setRef] = useState('');
  return (
    <section className="space-y-3 rounded-card border border-border/70 bg-panel p-5" aria-labelledby="add-term-title" data-testid="add-term">
      <h3 id="add-term-title" className="flex items-center gap-2 text-base font-bold text-text">
        <UserRoundPlus aria-hidden className="size-5 text-muted" />
        {t('governance:committee.addTerm')}
      </h3>
      <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
        <SelectControl label={t('governance:committee.office')} value={office} onChange={setOffice} options={data.offices.map((o) => ({ id: o.office, label: t(`governance:office.${o.office}`) }))} testId="term-office" />
        <SelectControl label={t('governance:committee.member')} value={party} onChange={setParty} options={data.candidates.slice(0, 80).map((c) => ({ id: c.partyId, label: `${c.name} · ${c.flats.join(', ')}` }))} testId="term-member" />
        <PlainTextField label={t('governance:committee.from')} value={from} onChange={setFrom} dir="ltr" testId="term-from" />
        <PlainTextField label={t('governance:committee.decisionRef')} value={ref} onChange={setRef} dir="ltr" optional testId="term-ref" />
      </div>
      <Button variant="primary" icon={Plus} isDisabled={!office || !party} onPress={() => void onRun('POST', '/committee/terms', { office, partyId: party, from, appointedBy: 'co_option', decisionRef: ref }, t('governance:committee.added'))} data-testid="term-add">
        {t('governance:committee.addTerm')}
      </Button>
    </section>
  );
}

function RecordMeeting({ onRun }: { onRun: Run }) {
  const { t } = useT();
  const [on, setOn] = useState('2026-10-26');
  const [title, setTitle] = useState('');
  const [attendees, setAttendees] = useState('');
  const [quorum, setQuorum] = useState(true);
  const [minutes, setMinutes] = useState('');
  return (
    <section className="space-y-3 rounded-card border border-border/70 bg-panel p-5" aria-labelledby="meeting-title" data-testid="record-meeting">
      <h3 id="meeting-title" className="flex items-center gap-2 text-base font-bold text-text">
        <CalendarCheck aria-hidden className="size-5 text-muted" />
        {t('governance:committee.recordMeeting')}
      </h3>
      <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
        <PlainTextField label={t('governance:committee.date')} value={on} onChange={setOn} dir="ltr" />
        <PlainTextField label={t('governance:committee.title')} value={title} onChange={setTitle} testId="meeting-title-input" />
      </div>
      <PlainTextField label={t('governance:committee.attendees')} description={t('governance:committee.attendeesHint')} value={attendees} onChange={setAttendees} />
      <PlainCheckbox isSelected={quorum} onChange={setQuorum}>
        {t('governance:committee.quorum')}
      </PlainCheckbox>
      <PlainTextArea label={t('governance:committee.minutes')} value={minutes} onChange={setMinutes} testId="meeting-minutes" />
      <Button variant="primary" icon={FileSignature} isDisabled={title.trim().length < 5 || minutes.trim().length < 10} onPress={() => void onRun('POST', '/committee/meetings', { on, title, attendees: attendees.split(/[,،]/).map((a) => a.trim()).filter(Boolean), quorum, minutes }, t('governance:committee.meetingRecorded')).then((saved) => {
            // A recorded meeting clears the form (and so cannot be recorded twice by a second press).
            if (!saved) return;
            setTitle('');
            setAttendees('');
            setMinutes('');
          })
        } className={WRAP} data-testid="meeting-record">
        {t('governance:committee.recordMeeting')}
      </Button>
    </section>
  );
}

function RecordDecision({ data, onRun }: { data: Committee360; onRun: Run }) {
  const { t } = useT();
  const [meeting, setMeeting] = useState<string | null>(data.meetings[0]?.id ?? null);
  const [subject, setSubject] = useState('');
  const [outcome, setOutcome] = useState<string | null>('approved');
  const [votes, setVotes] = useState({ for: '5', against: '0', abstain: '0' });
  const [published, setPublished] = useState(false);
  return (
    <section className="space-y-3 rounded-card border border-border/70 bg-panel p-5" aria-labelledby="decision-title" data-testid="record-decision">
      <h3 id="decision-title" className="flex items-center gap-2 text-base font-bold text-text">
        <Gavel aria-hidden className="size-5 text-muted" />
        {t('governance:committee.recordDecision')}
      </h3>
      <SelectControl label={t('governance:committee.meeting')} value={meeting} onChange={setMeeting} options={data.meetings.map((m) => ({ id: m.id, label: `${m.ref} · ${m.title}` }))} />
      <PlainTextField label={t('governance:committee.decisionSubject')} value={subject} onChange={setSubject} testId="decision-subject" />
      <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-4">
        <SelectControl label={t('governance:committee.outcomeLabel')} value={outcome} onChange={setOutcome} options={(['approved', 'rejected', 'noted'] as const).map((o) => ({ id: o, label: t(`governance:committee.outcome.${o}`) }))} />
        <PlainTextField label={t('governance:committee.votesFor')} value={votes.for} onChange={(v) => setVotes({ ...votes, for: v })} inputMode="numeric" dir="ltr" />
        <PlainTextField label={t('governance:committee.votesAgainst')} value={votes.against} onChange={(v) => setVotes({ ...votes, against: v })} inputMode="numeric" dir="ltr" />
        <PlainTextField label={t('governance:committee.votesAbstain')} value={votes.abstain} onChange={(v) => setVotes({ ...votes, abstain: v })} inputMode="numeric" dir="ltr" />
      </div>
      <PlainCheckbox isSelected={published} onChange={setPublished}>
        {t('governance:committee.publish')}
      </PlainCheckbox>
      <Button variant="primary" icon={Gavel} isDisabled={subject.trim().length < 5} onPress={() => void onRun('POST', '/committee/decisions', { meetingId: meeting, subject, outcome, votes: { for: Number(votes.for), against: Number(votes.against), abstain: Number(votes.abstain) }, published }, t('governance:committee.decisionRecorded')).then((saved) => saved && setSubject(''))} className={WRAP} data-testid="decision-record">
        {t('governance:committee.recordDecision')}
      </Button>
    </section>
  );
}
