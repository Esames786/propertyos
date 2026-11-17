import { ApiError, BILL_FILTERS, UTILITY_SERVICES, type BillFilter, type BillsList, type BillSummary, type BillView, type PayablesEvidence, type SuppliersList, type UtilityRegister, type UtilityService } from '@repo/contracts';
import { Button, ConfirmDialog, dynamicT, EmptyState, ErrorState, FilterPills, InlineAlert, Link, NotFoundState, PageHeader, Panel, PlainTextField, StatTile, useApiQuery, useQueryParam, useQueryParams, useT, WorkspaceHeader } from '@repo/ui';
import { Ban, CheckCircle2, Droplets, FilePlus2, Flame, Paperclip, Phone, ReceiptText, Send, Wallet, XCircle, Zap, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import {
  Amount,
  BillBadge,
  BlockedNote,
  Boundary,
  CostCentreName,
  DemoTag,
  EntityBar,
  EvidenceLine,
  EvidencePicker,
  Fact,
  FactGrid,
  History,
  KEEP,
  LinkButton,
  Loading,
  MetricAmount,
  PAY,
  PayNav,
  PaymentBadge,
  ProblemAlert,
  ProvisionalNotice,
  Ref,
  SearchSelect,
  SettlementBadge,
  ThreeStates,
  useAction,
  useEntityParam,
  useSocietyFormat,
  WRAP,
} from './apkit';
import { NewPaymentDrawer } from './PaymentPages';

/**
 * Gate E.8 SUP-003 supplier bills, SUP-004 the bill workspace and SUP-008 the utilities register
 * (provisional, PARTIAL). Approval, posting and settlement are shown apart on every bill. An approved bill
 * is an obligation; posting waits on E.7 (E-17) and a payment instruction is never a settlement (E-18).
 */

const SERVICE_ICON: Record<UtilityService, LucideIcon> = { electricity: Zap, water: Droplets, gas: Flame, telecom: Phone };

function BillRow({ b, showSupplier = true }: { b: BillSummary; showSupplier?: boolean }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const fmt = useSocietyFormat();
  const Icon = b.utility ? SERVICE_ICON[b.utility.service] : ReceiptText;
  return (
    <li className="min-w-0 rounded-tile border border-border/70 bg-panel p-3 shadow-card" data-testid="pay-bill" data-id={b.id} data-state={b.state}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2">
            <Icon aria-hidden className="size-4 shrink-0 text-muted" />
            <Link href={PAY.bill(b.id)} className="min-w-0 max-w-full font-semibold" data-testid="pay-bill-link">
              <Ref value={b.ref} />
            </Link>
            {b.demo && <DemoTag />}
          </p>
          {showSupplier && (
            <p className="text-sm break-words">
              <Link href={PAY.supplier(b.supplierId)} variant="plain" className="hover:underline">
                <bdi>{b.supplierName}</bdi>
              </Link>
            </p>
          )}
          <p className="text-xs text-muted">
            {t('payables:bills.invoiceNo')}: <Ref value={b.supplierInvoiceNo} /> · {t('payables:bills.dated', { date: fmt.date(b.invoiceDate) })} · {t('payables:bills.due', { date: fmt.date(b.dueDate) })}
          </p>
          {b.utility && (
            <p className="text-xs text-muted">
              {dt(`payables:service.${b.utility.service}`)} · {t('payables:utilities.consumer')}: <Ref value={b.utility.consumerNo} /> · {t('payables:utilities.period', { from: fmt.date(b.utility.periodFrom), to: fmt.date(b.utility.periodTo) })}
            </p>
          )}
        </div>
        <Amount value={b.total} className="text-base font-semibold" />
      </div>
      <div className="mt-2">
        <ThreeStates approval={<BillBadge state={b.state} />} />
      </div>
    </li>
  );
}

export function BillsPage() {
  const { t } = useT();
  const dt = dynamicT(t);
  const set = useQueryParams();
  const [entity, setEntity] = useEntityParam();
  const [stateParam] = useQueryParam('state');
  const [supplier] = useQueryParam('supplier');
  const [search] = useQueryParam('q');
  const state: BillFilter = (BILL_FILTERS as readonly string[]).includes(stateParam ?? '') ? (stateParam as BillFilter) : 'all';
  const q = useApiQuery<BillsList>({ method: 'GET', path: '/supplier-bills', query: { ...(entity ? { entity } : {}), ...(state !== 'all' ? { state } : {}), ...(supplier ? { supplier } : {}), ...(search ? { q: search } : {}) } }, KEEP);
  const suppliers = useApiQuery<SuppliersList>({ method: 'GET', path: '/suppliers', query: entity ? { entity } : {} }, KEEP);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  const supplierOptions = [{ id: 'all', label: t('payables:bills.allSuppliers') }, ...(suppliers.data?.items ?? []).map((s) => ({ id: s.id, label: s.name, hint: s.ref }))];
  return (
    <div className="@container space-y-5" data-testid="pay-bills">
      <PageHeader
        title={t('payables:bills.title')}
        description={t('payables:bills.intro')}
        actions={
          d.canCreate ? (
            <LinkButton variant="primary" icon={FilePlus2} href={PAY.newBill(supplier ? { supplier } : {})} testId="pay-new-bill">
              {t('payables:bills.new')}
            </LinkButton>
          ) : undefined
        }
      />
      <PayNav current="bills" />
      <ProvisionalNotice screen="bills" />
      <EntityBar scope={d.scope} onChange={setEntity} />
      <Boundary compact />
      <div className="flex flex-wrap items-end gap-3">
        <FilterPills label={t('payables:bills.filterLabel')} options={BILL_FILTERS.map((f) => ({ id: f, label: dt(`payables:bills.filter.${f}`), count: d.counts[f] }))} value={state} onChange={(v) => set({ state: v === 'all' ? null : v })} testId="pay-bill-filter" />
      </div>
      <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
        <SearchSelect label={t('payables:bills.supplier')} value={supplier ?? 'all'} onChange={(v) => set({ supplier: v === 'all' ? null : v })} options={supplierOptions} testId="pay-bill-supplier" />
        <PlainTextField label={t('payables:bills.search')} description={t('payables:bills.searchHint')} value={search ?? ''} onChange={(v) => set({ q: v.trim() ? v : null })} optional testId="pay-bill-search" />
      </div>
      {d.items.length === 0 ? (
        <EmptyState title={t(state !== 'all' || supplier || search ? 'payables:bills.noneFiltered' : 'payables:bills.none')} body={t('payables:bills.noneHint')} />
      ) : (
        <ul className="space-y-2" data-testid="pay-bill-list">
          {d.items.map((b) => (
            <BillRow key={b.id} b={b} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function BillWorkspacePage({ id }: { id: string }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const fmt = useSocietyFormat();
  const q = useApiQuery<BillView>({ method: 'GET', path: `/supplier-bills/${id}` });
  const act = useAction<BillView>();
  const [dialog, setDialog] = useState<'reject' | 'cancel' | null>(null);
  const [paying, setPaying] = useState(false);
  const [evidence, setEvidence] = useState<PayablesEvidence | undefined>(undefined);
  if (q.isError) return q.error instanceof ApiError && q.error.problem.status === 404 ? <NotFoundState headingLevel={1} actions={<LinkButton href={PAY.bills()}>{t('payables:bills.back')}</LinkButton>} /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const b = q.data;
  const run = (path: string, success: string, body: Record<string, unknown> = {}) => act.run(`/supplier-bills/${b.id}/${path}`, body, success);
  return (
    <div className="@container space-y-5" data-testid="pay-bill-workspace" data-id={b.id} data-state={b.state}>
      <WorkspaceHeader
        breadcrumbs={[{ label: t('payables:bills.title'), href: PAY.bills() }, { label: b.supplierName, href: PAY.supplier(b.supplierId) }, { label: b.ref }]}
        entityLabel={t(b.kind === 'utility' ? 'payables:bill.utilityEntity' : 'payables:bill.entity')}
        title={b.supplierName}
        reference={b.ref}
        status={<ThreeStates approval={<BillBadge state={b.state} />} />}
        metrics={[
          { label: t('payables:bill.total'), value: <MetricAmount value={b.total} /> },
          { label: t('payables:bills.invoiceDate'), value: fmt.date(b.invoiceDate) },
          { label: t('payables:bills.dueDate'), value: fmt.date(b.dueDate) },
          { label: t('payables:bill.instructed'), value: <MetricAmount value={b.instructed} /> },
        ]}
        actions={
          <div className="flex flex-wrap gap-2" data-testid="pay-bill-actions">
            {b.actions.submit && (
              <Button className={WRAP} variant="primary" icon={Send} isPending={act.pending} onPress={() => void run('submit', t('payables:bill.submitted', { ref: b.ref }))} data-testid="pay-bill-submit">
                {t('payables:bill.submit')}
              </Button>
            )}
            {b.actions.approve && (
              <Button className={WRAP} variant="primary" icon={CheckCircle2} isPending={act.pending} onPress={() => void run('approve', t('payables:bill.approvedToast', { ref: b.ref }))} data-testid="pay-bill-approve">
                {t('payables:bill.approve')}
              </Button>
            )}
            {b.actions.reject && (
              <Button className={WRAP} variant="secondary" icon={XCircle} onPress={() => setDialog('reject')} data-testid="pay-bill-reject">
                {t('payables:bill.reject')}
              </Button>
            )}
            {b.actions.instruct && (
              <Button className={WRAP} variant="primary" icon={Wallet} onPress={() => setPaying(true)} data-testid="pay-bill-instruct">
                {t('payables:bill.instruct')}
              </Button>
            )}
            {b.actions.cancel && (
              <Button className={WRAP} variant="quiet" icon={Ban} onPress={() => setDialog('cancel')} data-testid="pay-bill-cancel">
                {t('payables:bill.cancel')}
              </Button>
            )}
            <Button className={WRAP} variant="quiet" icon={ReceiptText} isDisabled disabledReason={t('payables:bill.postDisabled')} data-testid="pay-bill-post">
              {t('payables:bill.post')}
            </Button>
          </div>
        }
      />
      <PayNav current="bills" />
      <ProvisionalNotice screen="bill" />
      <BlockedNote reason={b.blocked} />
      {act.error ? <ProblemAlert error={act.error} /> : null}
      {b.state === 'approved' && (
        <InlineAlert tone="warning" title={t('payables:bill.obligationTitle')} data-testid="pay-bill-obligation">
          {t('payables:bill.obligationBody')}
        </InlineAlert>
      )}
      <div className="grid grid-cols-1 gap-4 @5xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Panel title={t('payables:bill.details')}>
            <FactGrid testId="pay-bill-facts">
              <Fact label={t('payables:bills.supplier')}>
                <Link href={PAY.supplier(b.supplierId)}>
                  <bdi>{b.supplierName}</bdi>
                </Link>
              </Fact>
              <Fact label={t('payables:entity.label')}>
                <bdi>{b.legalEntity.name}</bdi>
              </Fact>
              <Fact label={t('payables:bills.invoiceNo')}>
                <Ref value={b.supplierInvoiceNo} />
              </Fact>
              <Fact label={t('payables:bill.evidence')}>
                <EvidenceLine evidence={b.evidence} />
              </Fact>
              {b.utility && (
                <>
                  <Fact label={t('payables:utilities.service')}>{dt(`payables:service.${b.utility.service}`)}</Fact>
                  <Fact label={t('payables:utilities.consumer')}>
                    <Ref value={b.utility.consumerNo} />
                  </Fact>
                  <Fact label={t('payables:utilities.periodLabel')}>{t('payables:utilities.period', { from: fmt.date(b.utility.periodFrom), to: fmt.date(b.utility.periodTo) })}</Fact>
                </>
              )}
              <Fact label={t('payables:bill.preparedBy')}>
                <bdi>{b.createdByName}</bdi> · {fmt.date(b.createdAt)}
              </Fact>
              {b.submittedByName && (
                <Fact label={t('payables:bill.submittedBy')}>
                  <bdi>{b.submittedByName}</bdi> · {fmt.date(b.submittedAt!)}
                </Fact>
              )}
              {b.decidedByName && (
                <Fact label={t(b.state === 'rejected' ? 'payables:bill.rejectedBy' : 'payables:bill.approvedBy')}>
                  <bdi>{b.decidedByName}</bdi> · {fmt.date(b.decidedAt!)}
                  {b.decisionNote ? <span className="block text-xs text-muted">“<bdi>{b.decisionNote}</bdi>”</span> : null}
                </Fact>
              )}
            </FactGrid>
          </Panel>
          {b.actions.attach && (
            <Panel title={t('payables:bill.attachTitle')}>
              <EvidencePicker value={evidence} onChange={setEvidence} kind="invoice" sampleName={t('payables:evidence.sampleInvoice', { ref: b.supplierInvoiceNo })} testId="pay-bill-evidence" />
              <div className="mt-3">
                <Button className={WRAP} icon={Paperclip} isDisabled={!evidence} isPending={act.pending} onPress={() => void act.run(`/supplier-bills/${b.id}/evidence`, { evidence }, t('payables:bill.attached')).then((r) => r && setEvidence(undefined))} data-testid="pay-bill-attach">
                  {t('payables:bill.attach')}
                </Button>
              </div>
            </Panel>
          )}
          <Panel title={t('payables:bill.lines')}>
            <ul className="space-y-2" data-testid="pay-bill-lines">
              {b.lines.map((l) => (
                <li key={l.id} className="grid grid-cols-1 gap-1 border-b border-border/60 pb-2 text-sm last:border-0 @2xl:grid-cols-[minmax(0,1fr)_auto]" data-testid="pay-bill-line" data-cc={l.costCentre.id}>
                  <span className="min-w-0 space-y-0.5">
                    <bdi className="block font-medium break-words">{l.description}</bdi>
                    <span className="block text-xs text-muted">
                      {dt(`payables:category.${l.category}`)} · <CostCentreName cc={l.costCentre} />
                    </span>
                  </span>
                  <Amount value={l.amount} className="font-semibold @2xl:text-end" />
                </li>
              ))}
            </ul>
            <p className="mt-3 flex flex-wrap justify-between gap-2 border-t border-border pt-2 font-semibold">
              <span>{t('payables:bill.total')}</span>
              <Amount value={b.total} />
            </p>
          </Panel>
          <Panel title={t('payables:bill.payments')} description={t('payables:payments.intro')}>
            {b.payments.length === 0 ? (
              <p className="text-sm text-muted">{t(b.state === 'approved' ? 'payables:bill.noPayments' : 'payables:bill.paymentsAfterApproval')}</p>
            ) : (
              <ul className="space-y-2 text-sm" data-testid="pay-bill-payments">
                {b.payments.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="space-y-1">
                      <Link href={PAY.payments({ record: x.id })} data-testid="pay-bill-payment-link">
                        <Ref value={x.ref} />
                      </Link>
                      <span className="flex flex-wrap gap-1.5">
                        <PaymentBadge state={x.state} />
                        <SettlementBadge />
                      </span>
                    </span>
                    <Amount value={x.amount} />
                  </li>
                ))}
              </ul>
            )}
            {b.state === 'approved' && (
              <p className="mt-2 text-xs text-muted" data-testid="pay-bill-instructable">
                {t('payables:bill.instructable', { amount: fmt.money(b.instructable) })}
              </p>
            )}
          </Panel>
        </div>
        <div className="min-w-0 space-y-4">
          <Boundary />
          <Panel title={t('payables:history.title')}>
            <History events={b.history} />
          </Panel>
        </div>
      </div>
      <ConfirmDialog
        isOpen={dialog === 'reject'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('payables:bill.rejectTitle', { ref: b.ref })}
        effect={t('payables:bill.rejectEffect')}
        confirmLabel={t('payables:bill.reject')}
        destructive
        reasonLabel={t('payables:common.reason')}
        onConfirm={async (reason) => !!(await run('reject', t('payables:bill.rejectedToast', { ref: b.ref }), { reason }))}
      />
      <ConfirmDialog
        isOpen={dialog === 'cancel'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('payables:bill.cancelTitle', { ref: b.ref })}
        effect={t('payables:bill.cancelEffect')}
        confirmLabel={t('payables:bill.cancel')}
        destructive
        {...(b.state !== 'draft' ? { reasonLabel: t('payables:common.reason') } : {})}
        onConfirm={async (reason) => !!(await run('cancel', t('payables:bill.cancelledToast', { ref: b.ref }), reason ? { reason } : {}))}
      />
      {paying && <NewPaymentDrawer bill={b} onClose={() => setPaying(false)} />}
    </div>
  );
}

export function UtilitiesPage() {
  const { t } = useT();
  const dt = dynamicT(t);
  const fmt = useSocietyFormat();
  const set = useQueryParams();
  const [entity, setEntity] = useEntityParam();
  const [serviceParam] = useQueryParam('service');
  const service = (UTILITY_SERVICES as readonly string[]).includes(serviceParam ?? '') ? (serviceParam as UtilityService) : 'all';
  const q = useApiQuery<UtilityRegister>({ method: 'GET', path: '/utility-bills', query: { ...(entity ? { entity } : {}), ...(service !== 'all' ? { service } : {}) } }, KEEP);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  return (
    <div className="@container space-y-5" data-testid="pay-utilities">
      <PageHeader
        title={t('payables:utilities.title')}
        description={t('payables:utilities.intro')}
        actions={
          d.canCreate ? (
            <LinkButton variant="primary" icon={FilePlus2} href={PAY.newBill({ kind: 'utility' })} testId="pay-new-utility">
              {t('payables:utilities.new')}
            </LinkButton>
          ) : undefined
        }
      />
      <PayNav current="utilities" />
      <ProvisionalNotice screen="utilities" />
      <EntityBar scope={d.scope} onChange={setEntity} />
      <InlineAlert tone="info" title={t('payables:utilities.noAutoPay')} data-testid="pay-utilities-noautopay">
        {t('payables:utilities.noAutoPayBody')}
      </InlineAlert>
      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-4">
        {UTILITY_SERVICES.map((s) => (
          <StatTile
            key={s}
            label={dt(`payables:service.${s}`)}
            value={fmt.count(d.byService[s].count)}
            accessibleValue={String(d.byService[s].count)}
            context={t('payables:utilities.awaiting', { count: d.byService[s].awaitingApproval })}
            href={PAY.utilities({ service: s })}
            icon={SERVICE_ICON[s]}
            hue={s === 'electricity' ? 'amber' : s === 'water' ? 'sky' : s === 'gas' ? 'violet' : 'slate'}
            testId={`pay-utility-kpi-${s}`}
          />
        ))}
      </div>
      <FilterPills label={t('payables:utilities.filterLabel')} options={[{ id: 'all' as const, label: t('payables:utilities.all') }, ...UTILITY_SERVICES.map((s) => ({ id: s, label: dt(`payables:service.${s}`) }))]} value={service} onChange={(v) => set({ service: v === 'all' ? null : v })} testId="pay-utility-filter" />
      {d.items.length === 0 ? (
        <EmptyState title={t('payables:utilities.none')} body={t('payables:utilities.noneHint')} />
      ) : (
        <ul className="space-y-2" data-testid="pay-utility-list">
          {d.items.map((b) => (
            <BillRow key={b.id} b={b} />
          ))}
        </ul>
      )}
    </div>
  );
}
