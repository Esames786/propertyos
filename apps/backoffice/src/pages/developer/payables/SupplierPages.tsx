import { ApiError, SUPPLIER_CATEGORIES, type Supplier360, type SupplierCategory, type SupplierLedgerView, type SuppliersList } from '@repo/contracts';
import {
  Badge,
  Button,
  Drawer,
  dynamicT,
  EmptyState,
  ErrorState,
  FilterPills,
  InlineAlert,
  Link,
  NotFoundState,
  PageHeader,
  Panel,
  PlainCheckbox,
  PlainTextField,
  SelectControl,
  StatTile,
  UrlTabs,
  useApiQuery,
  useKeyedCreate,
  useNavigation,
  useQueryParam,
  useQueryParams,
  useT,
  useToast,
  WorkspaceHeader,
} from '@repo/ui';
import { BookOpenText, Building2, FilePlus2, Hourglass, Plus, ReceiptText, Send, Truck } from 'lucide-react';
import { useState } from 'react';
import {
  Amount,
  BankLine,
  BillBadge,
  Boundary,
  DemoTag,
  EntityBar,
  EvidenceLine,
  fieldErrorKey,
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
  useEntityParam,
  useFieldError,
  useProblemToast,
  useSocietyFormat,
  WRAP,
} from './apkit';

/**
 * Gate E.8 SUP-001 suppliers, SUP-002 Supplier 360 and SUP-007 supplier ledger (provisional, PARTIAL).
 * Suppliers belong to one legal entity. Totals and the ledger balance are for whole-entity readers only
 * (withheld, never recalculated, for a partial reader); the payee account is masked and shown only to
 * `bank.view` holders. Nothing here is paid, settled or posted.
 */

function useCategory() {
  const { t } = useT();
  const dt = dynamicT(t);
  return (c: string) => dt(`payables:supplierCategory.${c}`);
}

export function SuppliersPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const category = useCategory();
  const set = useQueryParams();
  const [entity, setEntity] = useEntityParam();
  const [catParam] = useQueryParam('category');
  const [search] = useQueryParam('q');
  const cat = (SUPPLIER_CATEGORIES as readonly string[]).includes(catParam ?? '') ? (catParam as SupplierCategory) : 'all';
  const [adding, setAdding] = useState(false);
  const q = useApiQuery<SuppliersList>({ method: 'GET', path: '/suppliers', query: { ...(entity ? { entity } : {}), ...(cat !== 'all' ? { category: cat } : {}), ...(search ? { q: search } : {}) } }, KEEP);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  return (
    <div className="@container space-y-5" data-testid="pay-suppliers">
      <PageHeader
        title={t('payables:suppliers.title')}
        description={t('payables:suppliers.intro')}
        actions={
          d.canCreate ? (
            <Button className={WRAP} variant="primary" icon={Plus} onPress={() => setAdding(true)} data-testid="pay-new-supplier">
              {t('payables:suppliers.new')}
            </Button>
          ) : undefined
        }
      />
      <PayNav current="suppliers" />
      <ProvisionalNotice screen="suppliers" />
      <EntityBar scope={d.scope} onChange={setEntity} />
      <div className="flex flex-wrap items-end gap-3">
        <FilterPills
          label={t('payables:suppliers.filterLabel')}
          options={[{ id: 'all' as const, label: t('payables:suppliers.all'), count: d.counts.all }, ...SUPPLIER_CATEGORIES.map((c) => ({ id: c, label: category(c), count: d.counts[c] }))]}
          value={cat}
          onChange={(v) => set({ category: v === 'all' ? null : v })}
          testId="pay-supplier-filter"
        />
        <div className="w-full max-w-sm">
          <PlainTextField label={t('payables:suppliers.search')} description={t('payables:suppliers.searchHint')} value={search ?? ''} onChange={(v) => set({ q: v.trim() ? v : null })} optional testId="pay-supplier-search" />
        </div>
      </div>
      {d.items.length === 0 ? (
        <EmptyState title={t(search || cat !== 'all' ? 'payables:suppliers.noneFiltered' : 'payables:suppliers.none')} body={t('payables:suppliers.noneHint')} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 @3xl:grid-cols-2" data-testid="pay-supplier-list">
          {d.items.map((s) => (
            <li key={s.id} className="min-w-0 rounded-tile border border-border/70 bg-panel p-4 shadow-card" data-testid="pay-supplier" data-id={s.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <Link href={PAY.supplier(s.id)} className="font-semibold break-words" data-testid="pay-supplier-link">
                    <bdi>{s.name}</bdi>
                  </Link>
                  <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
                    <Ref value={s.ref} /> · <Badge tone="neutral">{category(s.category)}</Badge>
                    {s.demo && <DemoTag />}
                  </p>
                </div>
              </div>
              {s.projectNames.length > 0 && (
                <p className="mt-2 text-sm text-text">
                  {t('payables:suppliers.projects')}: <bdi>{s.projectNames.join(' · ')}</bdi>
                </p>
              )}
              <dl className="mt-3 grid grid-cols-1 gap-2 text-sm @xs:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted">{t('payables:suppliers.openBills')}</dt>
                  <dd>
                    <Link href={PAY.bills({ supplier: s.id })} data-testid="pay-supplier-bills">
                      {t('payables:suppliers.openBillsValue', { count: s.openBills, waiting: fmt.count(s.awaitingApproval) })}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('payables:suppliers.obligation')}</dt>
                  <dd data-testid="pay-supplier-obligation">{s.approvedObligation ? <Amount value={s.approvedObligation} /> : <span className="text-muted">{t('payables:totals.withheld')}</span>}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
      {adding && <NewSupplierDrawer list={d} onClose={() => setAdding(false)} />}
    </div>
  );
}

function NewSupplierDrawer({ list, onClose }: { list: SuppliersList; onClose: () => void }) {
  const { t } = useT();
  const category = useCategory();
  const toast = useToast();
  const problem = useProblemToast();
  const { navigate } = useNavigation();
  const create = useKeyedCreate<Supplier360>('sup');
  const [error, setError] = useState<unknown>(null);
  const fe = useFieldError(error);
  const [f, setF] = useState({ name: '', category: '' as SupplierCategory | '', taxRef: '', contactName: '', phone: '', email: '', projectIds: [] as string[] });
  const save = async () => {
    setError(null);
    try {
      const r = await create.send({ method: 'POST', path: '/suppliers', body: { legalEntityId: list.scope.entity.id, ...f } });
      toast.success(t('payables:suppliers.created', { name: r.supplier.name }));
      navigate(PAY.supplier(r.supplier.id));
    } catch (e) {
      setError(e);
      if (!(e instanceof ApiError) || !Object.keys(e.problem.errors ?? {}).length) problem(e);
    }
  };
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('payables:suppliers.newTitle')}
      subtitle={<bdi>{list.scope.entity.name}</bdi>}
      testId="pay-supplier-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button className={WRAP} variant="quiet" onPress={onClose}>
            {t('payables:common.cancel')}
          </Button>
          <Button className={WRAP} variant="primary" icon={Plus} isPending={create.isPending} onPress={() => void save()} data-testid="pay-supplier-save">
            {t('payables:suppliers.save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <InlineAlert tone="info">{t('payables:suppliers.bankLater')}</InlineAlert>
        <PlainTextField label={t('payables:suppliers.name')} value={f.name} onChange={(v) => setF({ ...f, name: v })} errorKey={fieldErrorKey(error, 'name')} testId="pay-supplier-name" />
        {fe('name') && <p className="text-xs font-medium text-error">{fe('name')}</p>}
        <SelectControl label={t('payables:suppliers.category')} value={f.category || null} onChange={(v) => setF({ ...f, category: (v ?? '') as SupplierCategory })} options={SUPPLIER_CATEGORIES.map((c) => ({ id: c, label: category(c) }))} errorKey={fieldErrorKey(error, 'category')} testId="pay-supplier-category" />
        <PlainTextField label={t('payables:suppliers.taxRef')} description={t('payables:suppliers.taxRefHint')} value={f.taxRef} onChange={(v) => setF({ ...f, taxRef: v })} optional dir="ltr" errorKey={fieldErrorKey(error, 'taxRef')} testId="pay-supplier-tax" />
        <PlainTextField label={t('payables:suppliers.contact')} value={f.contactName} onChange={(v) => setF({ ...f, contactName: v })} errorKey={fieldErrorKey(error, 'contactName')} testId="pay-supplier-contact" />
        <PlainTextField label={t('payables:suppliers.phone')} value={f.phone} onChange={(v) => setF({ ...f, phone: v })} dir="ltr" inputMode="tel" errorKey={fieldErrorKey(error, 'phone')} testId="pay-supplier-phone" />
        <PlainTextField label={t('payables:suppliers.email')} value={f.email} onChange={(v) => setF({ ...f, email: v })} dir="ltr" optional type="email" errorKey={fieldErrorKey(error, 'email')} testId="pay-supplier-email" />
        {list.projects.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-text">{t('payables:suppliers.serves')}</legend>
            {list.projects.map((p) => (
              <PlainCheckbox key={p.id} isSelected={f.projectIds.includes(p.id)} onChange={(on) => setF({ ...f, projectIds: on ? [...f.projectIds, p.id] : f.projectIds.filter((x) => x !== p.id) })} testId={`pay-supplier-project-${p.id}`}>
                <bdi>{p.name}</bdi>
              </PlainCheckbox>
            ))}
          </fieldset>
        )}
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}

export function Supplier360Page({ id }: { id: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const category = useCategory();
  const q = useApiQuery<Supplier360>({ method: 'GET', path: `/suppliers/${id}` });
  if (q.isError) return q.error instanceof ApiError && q.error.problem.status === 404 ? <NotFoundState headingLevel={1} actions={<LinkButton href={PAY.suppliers()}>{t('payables:suppliers.back')}</LinkButton>} /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const d = q.data;
  const s = d.supplier;
  const withheld = <span className="text-muted">{t('payables:totals.withheld')}</span>;
  return (
    <div className="@container space-y-5" data-testid="pay-supplier-360" data-id={s.id}>
      <WorkspaceHeader
        breadcrumbs={[{ label: t('payables:suppliers.title'), href: PAY.suppliers() }, { label: s.name }]}
        entityLabel={t('payables:supplier.entity')}
        title={s.name}
        reference={s.ref}
        status={
          <span className="flex flex-wrap gap-1.5">
            <Badge tone="neutral">{category(s.category)}</Badge>
            {s.demo && <DemoTag />}
          </span>
        }
        metrics={[
          { label: t('payables:supplier.obligation'), value: d.totals ? <MetricAmount value={d.totals.approvedObligation} /> : withheld },
          { label: t('payables:supplier.awaiting'), value: d.totals ? <MetricAmount value={d.totals.awaitingApproval} /> : withheld },
          { label: t('payables:supplier.instructed'), value: d.totals ? <MetricAmount value={d.totals.instructed} /> : withheld },
          { label: t('payables:supplier.settled'), value: d.totals ? <MetricAmount value={d.totals.settled} /> : withheld },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            {d.canCreateBill && (
              <LinkButton variant="primary" icon={FilePlus2} href={PAY.newBill({ supplier: s.id })} testId="pay-360-new-bill">
                {t('payables:supplier.newBill')}
              </LinkButton>
            )}
            <LinkButton variant="secondary" icon={BookOpenText} href={PAY.ledger(s.id)} testId="pay-360-ledger">
              {t('payables:supplier.openLedger')}
            </LinkButton>
          </div>
        }
      />
      <PayNav current="suppliers" />
      <ProvisionalNotice screen="supplier" />
      {d.scopeLimited && (
        <InlineAlert tone="info" data-testid="pay-scope-limited">
          {t('payables:scopeLimited')}
        </InlineAlert>
      )}
      <UrlTabs
        label={t('payables:supplier.tabs')}
        phoneLimit={2}
        items={(['overview', 'bills', 'payments', 'orders', 'contracts', 'projects', 'ledger', 'documents', 'activity'] as const).map((id) => ({ id, label: t(`payables:supplier.tab.${id}`) }))}
      >
        {(tab) => (
          <div data-testid={`pay-360-tab-${tab}`}>
            {tab === 'overview' && (
              <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-2">
                <Panel title={t('payables:supplier.details')}>
                  <dl className="grid grid-cols-1 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted">{t('payables:entity.label')}</dt>
                      <dd>
                        <bdi>{d.legalEntity.name}</bdi>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t('payables:suppliers.taxRef')}</dt>
                      <dd>{s.taxRef ? <Ref value={s.taxRef} /> : <span className="text-muted">{t('payables:common.none')}</span>}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t('payables:suppliers.contact')}</dt>
                      {/* One detail per line: a phone number and an email address never interleave in Urdu. */}
                      <dd className="space-y-0.5">
                        <span className="block">
                          <bdi>{s.contactName}</bdi>
                        </span>
                        <span className="block">
                          <bdi dir="ltr">{s.phone}</bdi>
                        </span>
                        {s.email ? (
                          <span className="block [overflow-wrap:anywhere]">
                            <bdi dir="ltr">{s.email}</bdi>
                          </span>
                        ) : null}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t('payables:supplier.payee')}</dt>
                      <dd>
                        <BankLine bank={d.bank} hidden={d.bankHidden} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t('payables:supplier.addedBy')}</dt>
                      <dd>
                        <bdi>{s.createdByName}</bdi> · {fmt.date(s.createdAt)}
                      </dd>
                    </div>
                  </dl>
                </Panel>
                <div className="space-y-4">
                  <Boundary />
                  <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
                    <StatTile label={t('payables:supplier.awaitingCount')} value={fmt.count(s.awaitingApproval)} accessibleValue={String(s.awaitingApproval)} href={PAY.bills({ supplier: s.id, state: 'submitted' })} icon={Hourglass} hue="amber" testId="pay-360-kpi-awaiting" />
                    <StatTile label={t('payables:supplier.openCount')} value={fmt.count(s.openBills)} accessibleValue={String(s.openBills)} href={PAY.bills({ supplier: s.id })} icon={ReceiptText} hue="sky" testId="pay-360-kpi-open" />
                  </div>
                </div>
              </div>
            )}
            {tab === 'bills' && (
              <Panel title={t('payables:supplier.tab.bills')} actions={<Link href={PAY.bills({ supplier: s.id })}>{t('payables:supplier.allBills')}</Link>}>
                {d.bills.length === 0 ? (
                  <p className="text-sm text-muted">{t('payables:supplier.noBills')}</p>
                ) : (
                  <ul className="space-y-2" data-testid="pay-360-bills">
                    {d.bills.map((b) => (
                      <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2 last:border-0">
                        <span className="min-w-0 space-y-1">
                          <Link href={PAY.bill(b.id)} className="font-medium" data-testid="pay-360-bill-link">
                            <Ref value={b.ref} />
                          </Link>
                          <span className="block text-xs text-muted">
                            {t('payables:bills.invoiceNo')}: <Ref value={b.supplierInvoiceNo} /> · {fmt.date(b.invoiceDate)}
                          </span>
                          <ThreeStates approval={<BillBadge state={b.state} />} />
                        </span>
                        <Amount value={b.total} className="font-semibold" />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
            {tab === 'payments' && (
              <Panel title={t('payables:supplier.tab.payments')}>
                <p className="mb-3 text-sm text-muted">{t('payables:payments.intro')}</p>
                {d.payments.length === 0 ? (
                  <p className="text-sm text-muted">{t('payables:supplier.noPayments')}</p>
                ) : (
                  <ul className="space-y-2">
                    {d.payments.map((x) => (
                      <li key={x.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="space-y-1">
                          <Link href={PAY.payments({ record: x.id })}>
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
              </Panel>
            )}
            {(tab === 'orders' || tab === 'contracts') && (
              <EmptyState title={t(`payables:supplier.${tab}Planned`)} body={t(`payables:supplier.${tab}PlannedBody`)} />
            )}
            {tab === 'projects' && (
              <Panel title={t('payables:supplier.tab.projects')}>
                {d.projects.length === 0 ? (
                  <p className="text-sm text-muted">{t('payables:supplier.noProjects')}</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {d.projects.map((p) => (
                      <li key={p.id} className="flex items-center gap-2">
                        <Building2 aria-hidden className="size-4 text-muted" />
                        <bdi>{p.name}</bdi>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
            {tab === 'ledger' && (
              <Panel title={t('payables:supplier.tab.ledger')}>
                <p className="text-sm text-muted">{t('payables:supplier.ledgerIntro')}</p>
                <div className="mt-3">
                  <LinkButton href={PAY.ledger(s.id)} icon={BookOpenText}>
                    {t('payables:supplier.openLedger')}
                  </LinkButton>
                </div>
              </Panel>
            )}
            {tab === 'documents' && (
              <Panel title={t('payables:supplier.tab.documents')}>
                {d.documents.length === 0 ? (
                  <p className="text-sm text-muted">{t('payables:supplier.noDocuments')}</p>
                ) : (
                  <ul className="space-y-2 text-sm" data-testid="pay-360-documents">
                    {d.documents.map((x) => (
                      <li key={x.billId} className="space-y-0.5">
                        <EvidenceLine evidence={x.evidence} />
                        <span className="block text-xs text-muted">
                          {t('payables:supplier.forBill')} <Link href={PAY.bill(x.billId)}><Ref value={x.billRef} /></Link>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
            {tab === 'activity' && (
              <Panel title={t('payables:supplier.tab.activity')}>
                <History events={d.activity} testId="pay-360-activity" />
              </Panel>
            )}
          </div>
        )}
      </UrlTabs>
    </div>
  );
}

export function SupplierLedgerPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const [supplier, setSupplier] = useQueryParam('supplier');
  const list = useApiQuery<SuppliersList>({ method: 'GET', path: '/suppliers' }, KEEP);
  const q = useApiQuery<SupplierLedgerView>({ method: 'GET', path: `/suppliers/${supplier ?? ''}/ledger` }, { enabled: !!supplier });
  const options = (list.data?.items ?? []).map((s) => ({ id: s.id, label: s.name, hint: s.ref }));
  return (
    <div className="@container space-y-5" data-testid="pay-ledger">
      <PageHeader title={t('payables:ledger.title')} description={t('payables:ledger.intro')} breadcrumbs={[{ label: t('payables:suppliers.title'), href: PAY.suppliers() }]} />
      <PayNav current="ledger" />
      <ProvisionalNotice screen="ledger" />
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.data ? (
        <Loading lines={3} />
      ) : (
        <div className="max-w-md">
          <SearchSelect label={t('payables:ledger.supplier')} description={t('payables:ledger.supplierHint')} value={null} onChange={(v) => setSupplier(v)} options={options} testId="pay-ledger-supplier" />
        </div>
      )}
      {!supplier ? (
        <EmptyState title={t('payables:ledger.choose')} body={t('payables:ledger.chooseBody')} />
      ) : q.isError ? (
        q.error instanceof ApiError && q.error.problem.status === 404 ? <NotFoundState /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Loading lines={6} />
      ) : (
        <div className="space-y-4" data-testid="pay-ledger-view" data-supplier={q.data.supplier.id}>
          <p className="text-sm">
            <Link href={PAY.supplier(q.data.supplier.id)} className="font-semibold">
              <bdi>{q.data.supplier.name}</bdi>
            </Link>{' '}
            · <Ref value={q.data.supplier.ref} /> · <bdi>{q.data.legalEntity.name}</bdi>
          </p>
          <Boundary compact />
          <InlineAlert tone="info" title={t('payables:ledger.postingTitle')} data-testid="pay-ledger-posting">
            {t('payables:ledger.postingBody')}
          </InlineAlert>
          {q.data.scopeLimited ? (
            <InlineAlert tone="info" data-testid="pay-ledger-limited">
              {t('payables:ledger.limited')}
            </InlineAlert>
          ) : (
            <Panel title={t('payables:ledger.statement')}>
              {q.data.rows.length === 0 ? (
                <p className="text-sm text-muted" data-testid="pay-ledger-empty">
                  {t('payables:ledger.noObligations')}
                </p>
              ) : (
                <ol className="space-y-2" data-testid="pay-ledger-rows">
                  {q.data.rows.map((r) => (
                    <li key={r.ref} className="grid grid-cols-1 gap-1 border-b border-border/60 pb-2 text-sm last:border-0 @2xl:grid-cols-[8rem_minmax(0,1fr)_10rem_10rem]" data-testid="pay-ledger-row" data-kind={r.kind}>
                      <span className="text-muted">{fmt.date(r.date)}</span>
                      <span className="min-w-0">
                        {r.billId ? (
                          <Link href={PAY.bill(r.billId)}>
                            <Ref value={r.ref} />
                          </Link>
                        ) : (
                          <Ref value={r.ref} />
                        )}{' '}
                        <span className="block text-xs break-words text-muted">
                          <bdi>{r.description}</bdi>
                        </span>
                      </span>
                      <span className="@2xl:text-end">
                        <span className="text-xs text-muted @2xl:hidden">{t('payables:ledger.obligation')}: </span>
                        {r.obligation ? <Amount value={r.obligation} /> : '—'}
                      </span>
                      <span className="font-semibold @2xl:text-end">
                        <span className="text-xs font-normal text-muted @2xl:hidden">{t('payables:ledger.balance')}: </span>
                        <Amount value={r.balance} />
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              {q.data.balance && (
                <p className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-3 text-base font-semibold" data-testid="pay-ledger-balance">
                  <span>{t('payables:ledger.balanceOwed')}</span>
                  <Amount value={q.data.balance} />
                </p>
              )}
              <p className="mt-2 text-xs text-muted">{t('payables:ledger.formula')}</p>
            </Panel>
          )}
          <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-2">
            <Panel title={t('payables:ledger.awaiting')} description={t('payables:ledger.awaitingHint')}>
              {q.data.awaitingApproval.length === 0 ? (
                <p className="text-sm text-muted">{t('payables:common.none')}</p>
              ) : (
                <ul className="space-y-2 text-sm" data-testid="pay-ledger-awaiting">
                  {q.data.awaitingApproval.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={PAY.bill(b.id)}>
                        <Ref value={b.ref} />
                      </Link>
                      <Amount value={b.total} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title={t('payables:ledger.instructions')} description={t('payables:ledger.instructionsHint')}>
              {q.data.instructions.length === 0 ? (
                <p className="text-sm text-muted">{t('payables:common.none')}</p>
              ) : (
                <ul className="space-y-2 text-sm" data-testid="pay-ledger-instructions">
                  {q.data.instructions.map((x) => (
                    <li key={x.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="space-y-1">
                        <Link href={PAY.payments({ record: x.id })}>
                          <Ref value={x.ref} />
                        </Link>
                        <span className="flex flex-wrap gap-1.5">
                          <PaymentBadge state={x.state} />
                          <SettlementBadge />
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Send aria-hidden className="size-4 text-muted" />
                        <Amount value={x.amount} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}
      {!list.data?.items.length && list.data && (
        <EmptyState title={t('payables:suppliers.none')} body={t('payables:suppliers.noneHint')} actions={<LinkButton href={PAY.suppliers()} icon={Truck}>{t('payables:suppliers.back')}</LinkButton>} />
      )}
    </div>
  );
}
