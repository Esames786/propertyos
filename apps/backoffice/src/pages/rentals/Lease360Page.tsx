import { ApiError, type LeaseView } from '@repo/contracts';
import { Button, ConfirmDialog, Drawer, EmptyState, ErrorState, InlineAlert, KeyValueList, Link, Money, PageHeader, Panel, PlainCheckbox, PlainTextArea, PlainTextField, UrlTabs, useApiMutation, useApiQuery, useQueryParam, useQueryParams, useSession, useT, useToast } from '@repo/ui';
import { Ban, BadgeCheck, CalendarPlus, CircleDashed, FileSignature, Info, Send, TriangleAlert, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { ACCESS_DATE, RENTALS } from '../../nav.config';
import { Loading, useSocietyFormat } from '../society/kit';
import { DateInput, fieldErrorKey, unbroken, useFieldError, useProblemToast } from '../society/hr/hkit';
import { AccountText, Activity, D33Note, LeaseBadge, ModelBadge, NotSettled, RentNav, RollBadge, ROLL_TARGET, share, STATEMENTS_TARGET, SETTINGS_TARGET, WRAP } from './rkit';

/**
 * RNT-002 Lease 360: parties and terms, the issuing model from the management agreements, the rent
 * schedule by version, invoices and payments (none can exist: posting is not connected), the deposit
 * (a liability awaiting evidence), documents on file, renewal and termination (RNT-008), the owner
 * sub-ledger and the activity. The deposit refund (RNT-009) is a read-only drawer: nothing is
 * refundable on an evidenced basis.
 */
const TABS = ['terms', 'issuing', 'schedule', 'invoices', 'deposit', 'documents', 'renewal', 'ledger', 'history'] as const;

export default function Lease360Page({ id }: { id: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const problem = useProblemToast();
  const { allows } = useSession();
  const [drawer] = useQueryParam('drawer');
  const set = useQueryParams();
  const [confirming, setConfirming] = useState<'submit' | 'activate' | 'cancel' | null>(null);
  const act = useApiMutation<LeaseView>();
  const q = useApiQuery<LeaseView>({ method: 'GET', path: `/rentals/leases/${id}` });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const l = q.data;
  const a = l.actions;
  // The demo's business month (fixtures are frozen in time).
  const period = ACCESS_DATE.slice(0, 7);
  return (
    <div className="@container space-y-5" data-testid="rent-lease-360" data-ref={l.ref} data-state={l.state}>
      <PageHeader
        title={t('rentals:lease.titlePlain')}
        breadcrumbs={[{ label: t('rentals:leases.title'), href: RENTALS.leases() }]}
        badge={<LeaseBadge state={l.state} ending={l.ending} />}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <bdi dir="ltr" className="font-medium text-text" data-testid="rent-lease-ref">
              {unbroken(l.ref)}
            </bdi>
            <span>
              · <bdi>{unbroken(l.unit.code)}</bdi> · <bdi>{l.unit.siteName}</bdi>
            </span>
            <span>
              · {t('rentals:leases.tenant')}: <bdi>{l.tenant.name}</bdi>
            </span>
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {a.submit && (
              <Button className={WRAP} variant="primary" icon={Send} onPress={() => setConfirming('submit')} data-testid="lease-submit">
                {t('rentals:lease.submit')}
              </Button>
            )}
            {a.activate && (
              <Button className={WRAP} variant="primary" icon={BadgeCheck} onPress={() => setConfirming('activate')} data-testid="lease-activate">
                {t('rentals:lease.activate')}
              </Button>
            )}
            {a.authority && (
              <Button className={WRAP} icon={FileSignature} onPress={() => set({ drawer: 'authority' })} data-testid="lease-authority-open">
                {t('rentals:lease.recordAuthority')}
              </Button>
            )}
            {a.renew && (
              <Button className={WRAP} icon={CalendarPlus} onPress={() => set({ drawer: 'renew' })} data-testid="lease-renew-open">
                {t('rentals:lease.renew')}
              </Button>
            )}
            {a.terminate && (
              <Button className={WRAP} variant="quiet" icon={Undo2} onPress={() => set({ drawer: 'terminate' })} data-testid="lease-terminate-open">
                {t('rentals:lease.terminate')}
              </Button>
            )}
            {a.cancel && (
              <Button className={WRAP} variant="quiet" icon={Ban} onPress={() => setConfirming('cancel')} data-testid="lease-cancel">
                {t('rentals:lease.cancel')}
              </Button>
            )}
          </div>
        }
      />
      <RentNav current="leases" />
      {l.blocked === 'own_draft' && (
        <InlineAlert tone="info" data-testid="lease-own-draft">
          {t('rentals:lease.ownDraft')}
        </InlineAlert>
      )}
      {l.blockers.length > 0 && (
        <InlineAlert tone="warning" title={t('rentals:lease.blockersTitle')} data-testid="lease-blockers">
          <ul className="list-disc space-y-0.5 ps-5">
            {l.blockers.map((b) => (
              <li key={b} data-blocker={b}>
                {t(`rentals:blocker.${b}`)}
              </li>
            ))}
          </ul>
          {l.blockers.includes('agreement_unsigned') && allows(SETTINGS_TARGET) && (
            <p className="mt-1.5">
              <Link href={RENTALS.settings('agreements')}>{t('rentals:lease.toAgreements')}</Link>
            </p>
          )}
        </InlineAlert>
      )}
      {l.terms.terminationDate && (
        <InlineAlert tone="warning" data-testid="lease-terminating">
          {t('rentals:lease.terminating', { date: fmt.date(l.terms.terminationDate), reason: l.terms.terminationReason ?? '' })}
        </InlineAlert>
      )}
      <div className="grid grid-cols-1 gap-5 @5xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <UrlTabs label={t('rentals:lease.tabsLabel')} items={TABS.map((x) => ({ id: x, label: t(`rentals:lease.tab.${x}`) }))} defaultId="terms">
          {(tab) => (
            <div className="space-y-4 pt-3" data-testid={`lease-tab-${tab}`}>
              {tab === 'terms' && <Terms l={l} />}
              {tab === 'issuing' && <Issuing l={l} />}
              {tab === 'schedule' && <Schedule l={l} />}
              {tab === 'invoices' && (
                <InlineAlert tone="warning" title={t('rentals:lease.invoicesTitle')} data-testid="lease-invoices-partial">
                  {t('rentals:lease.invoicesBody')}
                </InlineAlert>
              )}
              {tab === 'deposit' && <Deposit l={l} />}
              {tab === 'documents' && <Documents l={l} />}
              {tab === 'renewal' && <Versions l={l} />}
              {tab === 'ledger' && <Ledger l={l} />}
              {tab === 'history' && <Activity events={l.history} testId="lease-history" />}
            </div>
          )}
        </UrlTabs>
        <aside className="space-y-4">
          <Panel title={t('rentals:lease.relatedTitle')}>
            <ul className="space-y-2 text-sm" data-testid="lease-related">
              {allows(STATEMENTS_TARGET) &&
                l.landlords.filter((x) => x.signed).map((x) => (
                  <li key={x.ownerId}>
                    <Link href={RENTALS.statements(x.ownerId, period)} data-testid="lease-to-statement">
                      {t('rentals:lease.statementOf', { name: x.ownerName })}
                    </Link>
                  </li>
                ))}
              {allows(ROLL_TARGET) && period && (
                <li>
                  <Link href={RENTALS.rentRoll(period)} data-testid="lease-to-roll">
                    {t('rentals:lease.rollOf', { month: fmt.period(period) })}
                  </Link>
                </li>
              )}
              <li>
                <Link href={RENTALS.leases({ q: l.unit.code })}>{t('rentals:lease.unitLeases', { unit: unbroken(l.unit.code) })}</Link>
              </li>
            </ul>
          </Panel>
          <Panel title={t('rentals:lease.unitTitle', { unit: unbroken(l.unit.code) })}>
            {l.unitLeases.length === 0 ? (
              <p className="text-sm text-muted">{t('rentals:lease.unitNone')}</p>
            ) : (
              <ul className="space-y-2 text-sm" data-testid="lease-unit-history">
                {l.unitLeases.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center gap-2">
                    <Link href={RENTALS.lease(u.id)}>
                      <bdi dir="ltr">{unbroken(u.ref)}</bdi>
                    </Link>
                    <LeaseBadge state={u.state} />
                    <span className="text-muted">
                      <bdi>{u.tenantName}</bdi> · {t('rentals:leases.term', { from: fmt.date(u.from), to: fmt.date(u.to) })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
      <ConfirmDialog
        isOpen={!!confirming}
        onOpenChange={(o) => !o && setConfirming(null)}
        title={confirming ? t(`rentals:lease.confirm.${confirming}`, { ref: l.ref }) : ''}
        effect={confirming ? t(`rentals:lease.effect.${confirming}`) : ''}
        confirmLabel={confirming ? t(`rentals:lease.${confirming}`) : ''}
        destructive={confirming === 'cancel'}
        {...(confirming === 'cancel' ? { reasonLabel: t('rentals:lease.cancelReason') } : {})}
        onConfirm={async (reason) => {
          if (!confirming) return;
          try {
            await act.mutateAsync({ method: 'POST', path: `/rentals/leases/${l.id}/${confirming}`, body: confirming === 'cancel' ? { reason } : {} });
            toast.success(t(`rentals:lease.done.${confirming}`, { ref: l.ref }));
          } catch (e) {
            problem(e);
          }
          setConfirming(null);
        }}
      />
      {drawer === 'renew' && a.renew && <RenewDrawer l={l} onClose={() => set({ drawer: null })} />}
      {drawer === 'terminate' && a.terminate && <TerminateDrawer l={l} onClose={() => set({ drawer: null })} />}
      {drawer === 'authority' && a.authority && <AuthorityDrawer l={l} onClose={() => set({ drawer: null })} />}
      {drawer === 'refund' && <RefundDrawer l={l} onClose={() => set({ drawer: null })} />}
    </div>
  );
}

function Terms({ l }: { l: LeaseView }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  return (
    <>
      <Panel title={t('rentals:lease.partiesTitle')}>
        <ul className="space-y-2 text-sm" data-testid="lease-landlords">
          {l.landlords.map((x) => (
            <li key={x.ownerId} className="flex flex-wrap items-center gap-2" data-owner={x.ownerId} data-signed={x.signed}>
              <bdi className="font-medium">{x.ownerName}</bdi>
              <bdi dir="ltr" className="text-muted">
                {share(x.share)}
              </bdi>
              {x.agreementRef && (
                <span className="text-muted">
                  · <bdi dir="ltr">{unbroken(x.agreementRef)}</bdi> {x.version ? t('rentals:lease.agreementVersion', { n: x.version }) : ''}
                </span>
              )}
              {!x.signed && (
                <span className="inline-flex items-center gap-1 text-warning">
                  <TriangleAlert aria-hidden className="size-4" />
                  {t('rentals:lease.notSigned')}
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm">
          {t('rentals:lease.tenantLine')}: <bdi className="font-medium">{l.tenant.name}</bdi>
        </p>
      </Panel>
      <Panel title={t('rentals:lease.termsTitle')}>
        <KeyValueList
          items={[
            { label: t('rentals:lease.from'), value: fmt.date(l.terms.from) },
            { label: t('rentals:lease.to'), value: fmt.date(l.terms.to) },
            { label: t('rentals:lease.rent'), value: <Money value={l.terms.rent} /> },
            { label: t('rentals:lease.dueDay'), value: t('rentals:lease.dueDayValue', { day: l.terms.dueDay }) },
            { label: t('rentals:lease.deposit'), value: <Money value={l.terms.deposit} /> },
            { label: t('rentals:lease.payerAccount'), value: l.billingAccount ? t('rentals:lease.payerAccountValue', { ref: unbroken(l.billingAccount.ref) }) : t('rentals:lease.payerAccountNone') },
          ]}
        />
        <p className="mt-2 text-xs text-muted">{t('rentals:lease.duesSeparate')}</p>
      </Panel>
    </>
  );
}

function Issuing({ l }: { l: LeaseView }) {
  const { t } = useT();
  if (!l.issuing) return <EmptyState title={t('rentals:lease.issuingNone')} />;
  const i = l.issuing;
  return (
    <Panel title={t('rentals:lease.issuingTitle')}>
      <div className="space-y-2 text-sm" data-testid="lease-issuing" data-model={i.model}>
        <p className="flex flex-wrap items-center gap-2">
          <ModelBadge model={i.model} />
        </p>
        <p>{t(`rentals:model.${i.model}Hint`)}</p>
        <p>
          {t('rentals:lease.issuedBy')}: <bdi className="font-medium">{i.entityName}</bdi>
        </p>
        <p>
          {t(`rentals:lease.account.${i.account.kind}`)}: <AccountText label={i.account.label} last4={i.account.last4} verified={i.account.verified} />
        </p>
        {i.subLedgers.length > 0 && (
          <p>
            {t('rentals:lease.subLedgers')}: <bdi dir="ltr">{unbroken(i.subLedgers.join(', '))}</bdi>
          </p>
        )}
        <D33Note />
      </div>
    </Panel>
  );
}

function Schedule({ l }: { l: LeaseView }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  if (!l.schedule.length) return <EmptyState title={t('rentals:lease.scheduleNone')} body={t('rentals:lease.scheduleNoneHint')} />;
  return (
    <Panel title={t('rentals:lease.scheduleTitle')} description={t('rentals:lease.scheduleHint')}>
      <ul className="divide-y divide-border rounded-tile border border-border/70" data-testid="lease-schedule">
        {l.schedule.map((s) => (
          <li key={s.period} className="grid grid-cols-1 gap-1 p-2.5 text-sm @2xl:grid-cols-[minmax(0,1fr)_auto_auto_auto] @2xl:items-center @2xl:gap-3" data-period={s.period} data-roll={s.roll}>
            <span>
              <span className="font-medium">{fmt.period(s.period)}</span> · <span className="text-muted">{t('rentals:lease.dueOn', { date: fmt.date(s.dueDate) })}</span> · <span className="text-muted">{t('rentals:lease.versionShort', { n: s.version })}</span>
            </span>
            <Money value={s.amount} />
            <RollBadge state={s.roll} />
            <NotSettled />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Deposit({ l }: { l: LeaseView }) {
  const { t } = useT();
  const set = useQueryParams();
  const d = l.deposit;
  return (
    <Panel title={t('rentals:lease.depositTitle')}>
      <div className="space-y-2 text-sm" data-testid="lease-deposit" data-state={d.state}>
        <KeyValueList
          items={[
            { label: t('rentals:lease.depositAgreed'), value: <Money value={d.agreed} /> },
            { label: t('rentals:lease.depositHeld'), value: <Money value={d.heldEvidenced} /> },
            { label: t('rentals:lease.depositWhere'), value: d.holding ? t(`rentals:holding.${d.holding}`) : '—' },
          ]}
        />
        <p className="flex items-start gap-1.5 text-muted">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 break-words">{t(d.state === 'awaiting_evidence' ? 'rentals:lease.depositAwaiting' : 'rentals:lease.depositNone')}</span>
        </p>
        <p className="text-muted">{t('rentals:lease.depositLiability')}</p>
        {d.refund.due && (
          <Button className={WRAP} icon={CircleDashed} onPress={() => set({ drawer: 'refund' })} data-testid="lease-refund-open">
            {t('rentals:lease.refundOpen')}
          </Button>
        )}
      </div>
    </Panel>
  );
}

function Documents({ l }: { l: LeaseView }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  return (
    <Panel title={t('rentals:lease.documentsTitle')} description={t('rentals:lease.documentsHint')}>
      <ul className="space-y-2 text-sm" data-testid="lease-documents">
        <li>
          {t('rentals:lease.authorityDoc')}:{' '}
          {l.authority ? (
            <>
              <bdi dir="ltr" className="font-medium">
                {unbroken(l.authority.reference)}
              </bdi>{' '}
              · {t('rentals:lease.authorityDated', { date: fmt.date(l.authority.date), name: l.authority.recordedByName })}
            </>
          ) : (
            <span className="text-warning">{t('rentals:lease.authorityMissing')}</span>
          )}
        </li>
        {l.landlords.map((x) => (
          <li key={x.ownerId}>
            {t('rentals:lease.agreementDoc', { name: x.ownerName })}:{' '}
            {x.agreementRef ? (
              <bdi dir="ltr" className="font-medium">
                {unbroken(x.agreementRef)}
              </bdi>
            ) : (
              '—'
            )}{' '}
            · {x.signed ? t('rentals:lease.signedOnFile') : t('rentals:lease.notSigned')}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Versions({ l }: { l: LeaseView }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  return (
    <Panel title={t('rentals:lease.versionsTitle')} description={t('rentals:lease.versionsHint')}>
      <ol className="space-y-3" data-testid="lease-versions">
        {[...l.versions].reverse().map((v) => (
          <li key={v.n} className="rounded-tile border border-border/70 p-3 text-sm" data-version={v.n}>
            <p className="font-semibold">
              {t('rentals:lease.versionShort', { n: v.n })} · {t(`rentals:version.${v.reason}`)}
            </p>
            <p className="text-muted">
              {t('rentals:leases.term', { from: fmt.date(v.from), to: fmt.date(v.to) })} · <Money value={v.rent} /> {t('rentals:leases.perMonth')}
            </p>
            <p className="text-xs text-muted">
              {v.agreements.map((x) => t('rentals:lease.boundTo', { ref: unbroken(x.ref), n: x.version, name: x.ownerName })).join(' · ')}
            </p>
            <p className="text-xs text-muted">
              <bdi>{v.byName}</bdi> · {fmt.date(v.at)}
            </p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function Ledger({ l }: { l: LeaseView }) {
  const { t } = useT();
  if (!l.subLedger.applicable)
    return (
      <InlineAlert tone="info" data-testid="lease-ledger-principal">
        {t('rentals:lease.ledgerPrincipal')}
      </InlineAlert>
    );
  return (
    <Panel title={t('rentals:lease.ledgerTitle')}>
      <div className="space-y-2 text-sm" data-testid="lease-ledger">
        <p>
          {t('rentals:lease.subLedgers')}: <bdi dir="ltr">{unbroken(l.subLedger.refs.join(', '))}</bdi>
        </p>
        <p>
          {t('rentals:lease.ledgerSettled')}: <Money value={l.subLedger.settled} />
        </p>
        <p className="text-muted">{t('rentals:lease.ledgerEmpty')}</p>
      </div>
    </Panel>
  );
}

/** Field problems of a drawer form, in words, next to the fields (and as a toast for the rest). */
function useForm<T>(path: string, onDone: (v: T) => void) {
  const problem = useProblemToast();
  const m = useApiMutation<T>();
  const [error, setError] = useState<unknown>(null);
  return {
    pending: m.isPending,
    error,
    submit: async (body: unknown) => {
      setError(null);
      try {
        onDone(await m.mutateAsync({ method: 'POST', path, body }));
      } catch (e) {
        setError(e);
        if (!(e instanceof ApiError) || e.problem.status !== 422) problem(e);
      }
    },
  };
}

function RenewDrawer({ l, onClose }: { l: LeaseView; onClose: () => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const [to, setTo] = useState('');
  const [rent, setRent] = useState(l.terms.rent.amount);
  const [reason, setReason] = useState('');
  const f = useForm<LeaseView>(`/rentals/leases/${l.id}/renew`, (v) => {
    toast.success(t('rentals:lease.done.renew', { ref: v.ref }));
    onClose();
  });
  const fe = useFieldError(f.error);
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('rentals:renew.title')}
      subtitle={<bdi dir="ltr">{l.ref}</bdi>}
      testId="lease-renew"
      footer={
        <Button className={WRAP} variant="primary" isPending={f.pending} onPress={() => void f.submit({ to, rent, reason })} data-testid="lease-renew-save">
          {t('rentals:renew.save')}
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">{t('rentals:renew.intro', { date: fmt.date(l.terms.to) })}</p>
        <DateInput id="renew-to" label={t('rentals:renew.to')} value={to} onChange={setTo} min={l.terms.to} testId="lease-renew-to" description={fe('to')} />
        <PlainTextField label={t('rentals:renew.rent')} value={rent} onChange={setRent} inputMode="decimal" dir="ltr" errorKey={fieldErrorKey(f.error, 'rent')} testId="lease-renew-rent" />
        <PlainTextArea label={t('rentals:renew.reason')} value={reason} onChange={setReason} errorKey={fieldErrorKey(f.error, 'reason')} testId="lease-renew-reason" />
        <p className="text-xs text-muted">{t('rentals:renew.binding')}</p>
      </div>
    </Drawer>
  );
}

function TerminateDrawer({ l, onClose }: { l: LeaseView; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const f = useForm<LeaseView>(`/rentals/leases/${l.id}/terminate`, (v) => {
    toast.success(t('rentals:lease.done.terminate', { ref: v.ref }));
    onClose();
  });
  const fe = useFieldError(f.error);
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('rentals:terminate.title')}
      subtitle={<bdi dir="ltr">{l.ref}</bdi>}
      testId="lease-terminate"
      footer={
        <Button className={WRAP} variant="primary" isPending={f.pending} onPress={() => void f.submit({ date, reason })} data-testid="lease-terminate-save">
          {t('rentals:terminate.save')}
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">{t('rentals:terminate.intro')}</p>
        <DateInput id="terminate-date" label={t('rentals:terminate.date')} value={date} onChange={setDate} max={l.terms.to} testId="lease-terminate-date" description={fe('date')} />
        <PlainTextArea label={t('rentals:terminate.reason')} value={reason} onChange={setReason} errorKey={fieldErrorKey(f.error, 'reason')} testId="lease-terminate-reason" />
        <p className="text-xs text-muted">{t('rentals:terminate.deposit')}</p>
      </div>
    </Drawer>
  );
}

function AuthorityDrawer({ l, onClose }: { l: LeaseView; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const [reference, setReference] = useState('');
  const [date, setDate] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const f = useForm<LeaseView>(`/rentals/leases/${l.id}/authority`, (v) => {
    toast.success(t('rentals:lease.done.authority', { ref: v.ref }));
    onClose();
  });
  const fe = useFieldError(f.error);
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('rentals:authority.title')}
      subtitle={<bdi dir="ltr">{l.ref}</bdi>}
      testId="lease-authority"
      footer={
        <Button className={WRAP} variant="primary" isPending={f.pending} onPress={() => void f.submit({ reference, date, confirmed })} data-testid="lease-authority-save">
          {t('rentals:authority.save')}
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">{t('rentals:authority.intro')}</p>
        <PlainTextField label={t('rentals:authority.reference')} value={reference} onChange={setReference} dir="ltr" errorKey={fieldErrorKey(f.error, 'authority.reference')} testId="lease-authority-reference" />
        <DateInput id="authority-date" label={t('rentals:authority.date')} value={date} onChange={setDate} testId="lease-authority-date" description={fe('authority.date')} />
        <PlainCheckbox isSelected={confirmed} onChange={setConfirmed} testId="lease-authority-confirm">
          {t('rentals:authority.confirm')}
        </PlainCheckbox>
        {fe('authority.confirmed') && <p className="text-xs font-medium text-error">{fe('authority.confirmed')}</p>}
      </div>
    </Drawer>
  );
}

/** RNT-009: the deposit refund, read only. Nothing is refundable on an evidenced basis in this gate. */
function RefundDrawer({ l, onClose }: { l: LeaseView; onClose: () => void }) {
  const { t } = useT();
  const d = l.deposit;
  return (
    <Drawer isOpen onOpenChange={(o) => !o && onClose()} title={t('rentals:refund.title')} subtitle={<bdi dir="ltr">{l.ref}</bdi>} testId="lease-refund">
      <div className="space-y-4 text-sm">
        <InlineAlert tone="warning" title={t('rentals:refund.partialTitle')} data-testid="lease-refund-partial">
          {t('rentals:refund.partial')}
        </InlineAlert>
        <KeyValueList
          items={[
            { label: t('rentals:lease.depositAgreed'), value: <Money value={d.agreed} /> },
            { label: t('rentals:lease.depositHeld'), value: <Money value={d.heldEvidenced} /> },
            { label: t('rentals:refund.refundable'), value: <Money value={d.refund.refundable} /> },
          ]}
        />
        <NotSettled />
        <p className="text-muted">{t('rentals:refund.next')}</p>
      </div>
    </Drawer>
  );
}
