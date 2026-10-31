import type { BillingAccountRow, OwnershipTransferDetail, OwnershipTransferRow, PersonRow } from '@repo/contracts';
import {
  Badge,
  Breadcrumbs,
  Button,
  DirectionalIcon,
  Drawer,
  EmptyState,
  ErrorState,
  FilterPills,
  InlineAlert,
  Link,
  Money,
  PageHeader,
  PlainTextArea,
  PlainTextField,
  SegmentedControl,
  SelectControl,
  useApiMutation,
  useApiQuery,
  useNavigation,
  useQueryParam,
  useQueryParams,
  useSession,
  useT,
  useToast,
} from '@repo/ui';
import { ArrowRight, BadgeCheck, ChevronRight, FileCheck2, FilePlus2, Gavel, Plus, ReceiptText, ScrollText, SearchCheck, XCircle } from 'lucide-react';
import { useState } from 'react';
import { COLLECTIONS, FINANCE, SOCIETY } from '../../../nav.config';
import { Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { ApprovalPanel, Fact, FactGrid, HistoryList, WRAP } from './fkit';

const STATUSES = ['all', 'requested', 'dues_blocked', 'fee_invoiced', 'clearance_pending', 'approved', 'completed', 'rejected', 'withdrawn'] as const;

/**
 * OWN-003 society transfers and OWN-004 transfer review (Gate S.1, D-42). A flat changes hands only
 * once its dues are clear (or a waiver is approved by two officers who are not party to the sale),
 * the transfer fee (a versioned rate with its bylaw) is invoiced through the same billing engine and
 * paid, and someone other than the requester approves. The clearance certificate (OWN-006) takes
 * the association's numbering and raises an ordinary payer change in the BILL-017 queue: earlier
 * liabilities stay with whoever owed them.
 */
export function OwnershipTransfersPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const { can } = useSession();
  const [status] = useQueryParam('status');
  const [drawer] = useQueryParam('drawer');
  const setParams = useQueryParams();
  const filter = (STATUSES as readonly string[]).includes(status ?? '') ? status! : 'all';
  const q = useApiQuery<OwnershipTransferRow[]>({ method: 'GET', path: '/ownership-transfers', query: { status: filter } }, { placeholderData: (prev) => prev });
  return (
    <div className="@container space-y-6" data-testid="ownership-page">
      <PageHeader
        title={t('nav:pages.ownershipTransfers')}
        description={t('governance:ownership.intro')}
        actions={
          can('transfer.review') ? (
            <Button variant="primary" icon={Plus} onPress={() => setParams({ drawer: 'new' })} className={WRAP} data-testid="ownership-new">
              {t('governance:ownership.new')}
            </Button>
          ) : undefined
        }
      />
      <FilterPills label={t('governance:ownership.status')} showLabel value={filter} testId="ownership-status" onChange={(v) => setParams({ status: v === 'all' ? null : v })} options={STATUSES.map((s) => ({ id: s, label: s === 'all' ? t('finance:cashbook.allCategories') : t(`governance:ownership.state.${s}`) }))} />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Loading lines={4} />
      ) : q.data.length === 0 ? (
        <EmptyState title={t('governance:ownership.emptyTitle')} body={t('governance:ownership.emptyBody')} />
      ) : (
        <ul className="space-y-2" data-testid="ownership-list">
          {q.data.map((r) => (
            <li key={r.id}>
              <Link href={FINANCE.ownershipTransfer(r.id)} variant="plain" className="grid gap-2 rounded-tile border border-border/70 bg-panel p-4 shadow-card hover:bg-raised @3xl:grid-cols-[minmax(0,1.5fr)_auto_auto] @3xl:items-center" data-testid="ownership-row" data-status={r.status}>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 font-semibold text-text">
                    <bdi dir="ltr" className="ltr-ref">{r.flatCode}</bdi>: <bdi>{r.fromName}</bdi>
                    <DirectionalIcon icon={ArrowRight} className="size-4 text-muted" />
                    <bdi>{r.toName}</bdi>
                  </span>
                  <span className="block text-xs text-muted">
                    <bdi dir="ltr" className="ltr-ref">{r.ref}</bdi> · {t('governance:ownership.from', { date: fmt.date(r.effectiveOn) })} · {t(`governance:ownership.fee.${r.fee}`)} · {t(`governance:ownership.clearance.${r.clearance}`)}
                  </span>
                </span>
                <Badge tone={r.status === 'completed' ? 'success' : r.status === 'dues_blocked' ? 'error' : r.status === 'rejected' || r.status === 'withdrawn' ? 'neutral' : 'warning'}>{t(`governance:ownership.state.${r.status}`)}</Badge>
                <span className="flex items-center justify-end gap-3">
                  {r.outstanding ? <Money value={r.outstanding} className="font-semibold" /> : null}
                  <DirectionalIcon icon={ChevronRight} className="size-4 text-muted" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <NewOwnershipDrawer isOpen={drawer === 'new'} onClose={() => setParams({ drawer: null })} />
    </div>
  );
}

function NewOwnershipDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useT();
  const { navigate } = useNavigation();
  const toast = useToast();
  const accounts = useApiQuery<BillingAccountRow[]>({ method: 'GET', path: '/billing-accounts', query: { status: 'all' } }, { enabled: isOpen });
  const people = useApiQuery<PersonRow[]>({ method: 'GET', path: '/people', query: { role: 'owner' } }, { enabled: isOpen });
  const create = useApiMutation<OwnershipTransferDetail>();
  const [flat, setFlat] = useState<string | null>(null);
  const [who, setWho] = useState<'new' | 'existing'>('new');
  const [party, setParty] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+92 399 ');
  const [from, setFrom] = useState('2026-12-01');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [key] = useState(() => `owt-${Date.now().toString(36)}`);
  const flats = (accounts.data ?? []).flatMap((a) => a.flats.map((f) => ({ id: f.id, label: `${f.code} · ${a.holderName}` })));
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title={t('governance:ownership.new')}
      subtitle={t('governance:ownership.newSubtitle')}
      testId="ownership-new-drawer"
      footer={
        <>
          <Button variant="quiet" onPress={onClose}>{t('common:actions.cancel')}</Button>
          <Button
            variant="primary"
            icon={FilePlus2}
            isPending={create.isPending}
            isDisabled={!flat || reason.trim().length < 5 || (who === 'new' ? name.trim().length < 3 : !party)}
            onPress={async () => {
              setError(null);
              try {
                const r = await create.mutateAsync({ method: 'POST', path: '/ownership-transfers', body: { flatId: flat, ...(who === 'existing' ? { toPartyId: party } : { toName: name, toPhone: phone.trim() === '+92 399' ? '' : phone.trim() }), effectiveOn: from, reason, idempotencyKey: key } });
                toast.success(t('governance:ownership.created', { ref: r.transfer.ref }));
                navigate(FINANCE.ownershipTransfer(r.transfer.id));
              } catch (e) {
                setError(e);
              }
            }}
            data-testid="ownership-create"
          >
            {t('governance:ownership.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectControl label={t('governance:ownership.flat')} value={flat} onChange={setFlat} options={flats} testId="ownership-flat" />
        <SegmentedControl
          label={t('governance:ownership.incoming')}
          value={who}
          onChange={(v) => setWho(v as 'new' | 'existing')}
          options={[
            { id: 'new', label: t('governance:ownership.newPerson') },
            { id: 'existing', label: t('governance:ownership.existingPerson') },
          ]}
          testId="ownership-who"
        />
        {who === 'existing' ? (
          <SelectControl label={t('governance:ownership.person')} value={party} onChange={setParty} options={(people.data ?? []).slice(0, 120).map((p) => ({ id: p.person.id, label: `${p.person.displayName} · ${p.facts.map((f) => f.flatCode).join(', ')}` }))} testId="ownership-party" />
        ) : (
          <>
            <PlainTextField label={t('governance:ownership.name')} value={name} onChange={setName} testId="ownership-name" />
            <PlainTextField label={t('governance:ownership.phone')} description={t('governance:ownership.phoneHint')} value={phone} onChange={setPhone} dir="ltr" type="tel" testId="ownership-phone" />
          </>
        )}
        <PlainTextField label={t('governance:ownership.effective')} description={t('governance:ownership.effectiveHint')} value={from} onChange={setFrom} dir="ltr" testId="ownership-effective" />
        <PlainTextArea label={t('governance:ownership.reason')} value={reason} onChange={setReason} testId="ownership-reason" />
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}

export function OwnershipWorkspace({ transferId }: { transferId: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const [drawer] = useQueryParam('drawer');
  const setParams = useQueryParams();
  const q = useApiQuery<OwnershipTransferDetail>({ method: 'GET', path: `/ownership-transfers/${transferId}` });
  const act = useApiMutation<OwnershipTransferDetail>();
  const [error, setError] = useState<unknown>(null);
  const [waiver, setWaiver] = useState('');
  const [note, setNote] = useState('');
  const run = async (path: string, body: unknown, message: string) => {
    setError(null);
    try {
      await act.mutateAsync({ method: 'POST', path, body });
      toast.success(message);
      void q.refetch();
    } catch (e) {
      setError(e);
    }
  };
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  const x = d.transfer;
  const steps = [
    { id: 'request', done: true, label: t('governance:ownership.steps.request') },
    { id: 'dues', done: !!x.dues && Number(x.dues.outstanding.amount) === 0, label: t('governance:ownership.steps.dues') },
    { id: 'fee', done: !!d.feeInvoice && Number(d.feeInvoice.open.amount) === 0, label: t('governance:ownership.steps.fee') },
    { id: 'approval', done: ['approved', 'completed'].includes(x.status), label: t('governance:ownership.steps.approval') },
    { id: 'certificate', done: !!x.certificate, label: t('governance:ownership.steps.certificate') },
    { id: 'payer', done: x.payerChange?.state === 'approved', label: t('governance:ownership.steps.payer') },
  ];
  return (
    <div className="@container space-y-6" data-testid="ownership-workspace" data-status={x.status}>
      <Breadcrumbs items={[{ label: t('nav:pages.ownershipTransfers'), href: FINANCE.ownership() }, { label: x.ref }]} />
      <PageHeader title={t('governance:ownership.title', { flat: x.flatCode })} description={t('governance:ownership.subtitle', { ref: x.ref, from: x.from.name, to: x.to.name, date: fmt.date(x.effectiveOn) })} badge={<Badge tone={x.status === 'completed' ? 'success' : x.status === 'dues_blocked' ? 'error' : 'warning'} data-testid="ownership-state">{t(`governance:ownership.state.${x.status}`)}</Badge>} />
      <ol className="grid grid-cols-1 gap-2 @3xl:grid-cols-6" aria-label={t('governance:ownership.stepsLabel')} data-testid="ownership-steps">
        {steps.map((s) => (
          <li key={s.id} className={`flex items-center gap-2 rounded-tile border px-3 py-2 text-sm ${s.done ? 'border-success/40 bg-success-soft/40 text-text' : 'border-border/70 bg-panel text-muted'}`} data-step={s.id} data-done={s.done}>
            {s.done ? <BadgeCheck aria-hidden className="size-4 text-success" /> : <span aria-hidden className="size-4 rounded-pill border border-border-control" />}
            {s.label}
          </li>
        ))}
      </ol>
      {d.actions.reason === 'maker_checker_required' && (
        <InlineAlert tone="info" title={t('governance:ownership.notYoursTitle')}>
          <p>{t('governance:ownership.notYours')}</p>
        </InlineAlert>
      )}
      <div className="grid gap-5 @5xl:grid-cols-12">
        <section className="space-y-4 rounded-card bg-panel p-5 shadow-card @5xl:col-span-7" aria-labelledby="dues-title" data-testid="ownership-dues">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="dues-title" className="flex items-center gap-2 text-lg font-bold text-text">
              <SearchCheck aria-hidden className="size-5 text-muted" />
              {t('governance:ownership.duesTitle')}
            </h2>
            {d.actions.checkDues && (
              <Button variant="secondary" size="sm" onPress={() => void run(`/ownership-transfers/${transferId}/dues-check`, {}, t('governance:ownership.checked'))} data-testid="ownership-check">
                {t('governance:ownership.check')}
              </Button>
            )}
          </div>
          {!x.dues ? (
            <p className="text-sm text-muted">{t('governance:ownership.notChecked')}</p>
          ) : (
            <>
              <p className="text-sm text-text" data-testid="ownership-outstanding" data-amount={x.dues.outstanding.amount}>
                {Number(x.dues.outstanding.amount) === 0 ? t('governance:ownership.clear') : t('governance:ownership.owed', { amount: fmt.money(x.dues.outstanding) })}
              </p>
              {x.dues.lines.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {x.dues.lines.map((l) => (
                    <li key={l.invoiceId + l.label} className="flex justify-between gap-2">
                      <Link href={SOCIETY.invoice(l.invoiceId)}>
                        <bdi dir="ltr" className="ltr-ref">{l.invoiceRef}</bdi> · {fmt.period(l.period)}
                      </Link>
                      <Money value={l.open} />
                    </li>
                  ))}
                </ul>
              )}
              {Number(x.dues.pending.amount) > 0 && <p className="text-sm text-warning">{t('governance:ownership.pending', { amount: fmt.money(x.dues.pending) })}</p>}
              <p className="text-xs text-muted">{t('governance:ownership.historic')}</p>
            </>
          )}
          <Link href={COLLECTIONS.statement(x.billingAccountId)}>{t('governance:ownership.statement', { account: x.accountNo })}</Link>
        </section>
        <section className="space-y-4 rounded-card bg-panel p-5 shadow-card @5xl:col-span-5" aria-labelledby="fee-title" data-testid="ownership-fee">
          <h2 id="fee-title" className="flex items-center gap-2 text-lg font-bold text-text">
            <ReceiptText aria-hidden className="size-5 text-muted" />
            {t('governance:ownership.feeTitle')}
          </h2>
          {d.rate ? <p className="text-sm text-text">{t('governance:ownership.rate', { amount: fmt.money(d.rate.amount), version: d.rate.version, bylaw: d.rate.bylawRef })}</p> : <p className="text-sm text-muted">{t('governance:ownership.noRate')}</p>}
          {d.feeInvoice ? (
            <p className="text-sm text-text" data-testid="ownership-fee-invoice">
              <Link href={SOCIETY.invoice(d.feeInvoice.id)}>{d.feeInvoice.ref}</Link> · {fmt.money(d.feeInvoice.total)} · {Number(d.feeInvoice.open.amount) === 0 ? t('governance:ownership.feePaid') : t('governance:ownership.feeOpen', { amount: fmt.money(d.feeInvoice.open) })}
            </p>
          ) : (
            d.actions.invoiceFee && (
              <Button variant="secondary" icon={FilePlus2} onPress={() => void run(`/ownership-transfers/${transferId}/fee-invoice`, {}, t('governance:ownership.feeInvoiced'))} data-testid="ownership-invoice-fee">
                {t('governance:ownership.invoiceFee')}
              </Button>
            )
          )}
          {d.feeInvoice && Number(d.feeInvoice.open.amount) > 0 && <Link href={COLLECTIONS.officePayment(x.billingAccountId)}>{t('governance:ownership.takePayment')}</Link>}
        </section>
      </div>
      {(d.actions.requestWaiver || x.waiver) && (
        <section className="space-y-3 rounded-card bg-panel p-5 shadow-card" aria-labelledby="waiver-title" data-testid="ownership-waiver">
          <h2 id="waiver-title" className="text-lg font-bold text-text">
            {t('governance:ownership.waiverTitle')}
          </h2>
          <p className="text-sm text-muted">{t('governance:ownership.waiverBody')}</p>
          {d.waiverApproval && <ApprovalPanel approvalId={d.waiverApproval.id} testId="waiver-approval" />}
          {d.actions.requestWaiver && (
            <>
              <PlainTextArea label={t('governance:ownership.waiverReason')} value={waiver} onChange={setWaiver} testId="waiver-reason" />
              <Button variant="secondary" isDisabled={waiver.trim().length < 10} onPress={() => void run(`/ownership-transfers/${transferId}/waiver-request`, { reason: waiver }, t('governance:ownership.waiverRequested'))} data-testid="waiver-request">
                {t('governance:ownership.requestWaiver')}
              </Button>
            </>
          )}
        </section>
      )}
      <section className="space-y-3 rounded-card bg-panel p-5 shadow-card" aria-labelledby="decide-title" data-testid="ownership-decision">
        <h2 id="decide-title" className="flex items-center gap-2 text-lg font-bold text-text">
          <Gavel aria-hidden className="size-5 text-muted" />
          {t('governance:ownership.decisionTitle')}
        </h2>
        {x.approvedByName ? (
          <p className="text-sm text-text">{t('governance:ownership.approvedBy', { name: x.approvedByName })}</p>
        ) : d.actions.approve || d.actions.reject ? (
          <>
            <PlainTextField label={t('governance:ownership.note')} value={note} onChange={setNote} testId="ownership-note" />
            <div className="flex flex-wrap gap-2">
              {d.actions.approve && (
                <Button variant="primary" icon={BadgeCheck} onPress={() => void run(`/ownership-transfers/${transferId}/approve`, { note }, t('governance:ownership.approved'))} data-testid="ownership-approve">
                  {t('governance:ownership.approve')}
                </Button>
              )}
              {d.actions.reject && (
                <Button variant="secondary" icon={XCircle} isDisabled={note.trim().length < 10} onPress={() => void run(`/ownership-transfers/${transferId}/reject`, { note }, t('governance:ownership.rejected'))} data-testid="ownership-reject">
                  {t('governance:ownership.reject')}
                </Button>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">{d.actions.reason === 'balance_not_zero' ? t('governance:ownership.waitDues') : t('governance:ownership.waitApprover')}</p>
        )}
        {d.actions.issueCertificate && (
          <Button variant="primary" icon={FileCheck2} onPress={() => void run(`/ownership-transfers/${transferId}/certificate`, {}, t('governance:ownership.issued'))} data-testid="ownership-certificate">
            {t('governance:ownership.issue')}
          </Button>
        )}
        {x.certificate && (
          <InlineAlert tone="success" title={t('governance:ownership.certificateTitle', { ref: x.certificate.ref })} data-testid="ownership-certificate-issued">
            <p>{t('governance:ownership.certificateBody', { date: fmt.date(x.certificate.issuedOn), until: fmt.date(x.certificate.validUntil), name: x.certificate.issuedByName })}</p>
            <Button variant="secondary" size="sm" icon={ScrollText} onPress={() => setParams({ drawer: 'certificate' })} data-testid="ownership-certificate-open">
              {t('governance:ownership.viewCertificate')}
            </Button>
          </InlineAlert>
        )}
        {x.payerChange && (
          <p className="text-sm text-text" data-testid="ownership-payer-change" data-state={x.payerChange.state}>
            {t('governance:ownership.payerChange', { date: fmt.date(x.effectiveOn), name: x.to.name })} <Link href={COLLECTIONS.payerChanges('pending_approval')}>{t('governance:ownership.openPayerChanges')}</Link>
          </p>
        )}
        {error ? <ProblemAlert error={error} /> : null}
      </section>
      <section className="space-y-3 rounded-card bg-panel p-5 shadow-card" aria-labelledby="facts-title">
        <h2 id="facts-title" className="text-lg font-bold text-text">
          {t('governance:ownership.factsTitle')}
        </h2>
        <FactGrid>
          <Fact label={t('governance:ownership.flat')}>
            <bdi dir="ltr" className="ltr-ref">{x.flatCode}</bdi> · <bdi dir="ltr" className="ltr-ref">{x.accountNo}</bdi>
          </Fact>
          <Fact label={t('governance:ownership.outgoing')}>
            <bdi>{x.from.name}</bdi>
          </Fact>
          <Fact label={t('governance:ownership.incoming')}>
            <bdi>{x.to.name}</bdi>
            {x.to.phone ? (
              <>
                {' · '}
                <bdi dir="ltr" className="ltr-ref">{x.to.phone}</bdi>
              </>
            ) : null}
          </Fact>
          <Fact label={t('governance:ownership.effective')}>{fmt.date(x.effectiveOn)}</Fact>
          <Fact label={t('governance:ownership.reason')}>
            <bdi>{x.reason}</bdi>
          </Fact>
          <Fact label={t('governance:ownership.requestedBy')}>{x.requestedByName}</Fact>
        </FactGrid>
        <HistoryList label={t('governance:ownership.history')} items={x.history.map((h) => ({ at: h.at, byName: h.byName, label: t(`governance:ownership.events.${h.action}`), ...(h.note ? { note: h.note } : {}) }))} />
      </section>
      {x.certificate && (
        <Drawer isOpen={drawer === 'certificate'} onOpenChange={(o) => !o && setParams({ drawer: null })} title={t('governance:ownership.certificateTitle', { ref: x.certificate.ref })} testId="certificate-drawer">
          <article className="space-y-3 rounded-tile border border-border bg-panel p-5 text-sm" data-testid="certificate">
            <Badge tone="demo">{t('governance:print.demo')}</Badge>
            <h3 className="text-lg font-bold text-text">{t('governance:ownership.certificateHeading')}</h3>
            <p>{x.certificate.legalEntityName}</p>
            <p>{t('governance:ownership.certificateText', { flat: x.certificate.flatCode, account: x.certificate.accountNo, owner: x.certificate.ownerName, incoming: x.certificate.incomingName, date: fmt.date(x.certificate.balanceCheckedAt) })}</p>
            <p>{x.certificate.waived ? t('governance:ownership.certificateWaived', { amount: fmt.money(x.certificate.waived) }) : t('governance:ownership.certificateClear')}</p>
            <p className="text-muted">{t('governance:ownership.certificateValid', { from: fmt.date(x.certificate.issuedOn), until: fmt.date(x.certificate.validUntil), name: x.certificate.issuedByName })}</p>
          </article>
        </Drawer>
      )}
    </div>
  );
}
