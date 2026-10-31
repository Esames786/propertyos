import type { BatchDetail, BatchLine, BatchLineInput, BatchList, ChequeDetail, ChequeList, CollectionCandidate } from '@repo/contracts';
import {
  Badge,
  Button,
  ConfirmDialog,
  DirectionalIcon,
  Drawer,
  dynamicT,
  EmptyState,
  ErrorState,
  FilterPills,
  InlineAlert,
  Link,
  Money,
  PageHeader,
  PlainCheckbox,
  PlainTextArea,
  PlainTextField,
  SelectControl,
  UrlTabs,
  useApiMutation,
  useApiQuery,
  useQueryParam,
  useQueryParams,
  useSession,
  useT,
  useToast,
} from '@repo/ui';
import { Banknote, Ban, CheckCircle2, ChevronRight, Coins, FileSpreadsheet, Landmark, Link2, Plus, ReceiptText, Search, Send, Trash2, TriangleAlert, Undo2, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { COLLECTIONS, FINANCE } from '../../../nav.config';
import { AmountInput, Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { MethodBadge } from '../collections/ckit';
import { BatchBadge, ChequeBadge, ChequeNotice, Fact, FactGrid, HistoryList, WRAP } from './fkit';
import { CandidateRow, DemoStatementDrawer } from './TransfersPage';

const BATCH_STATUSES = ['all', 'draft', 'submitted', 'confirmed', 'returned'] as const;
const CHEQUE_STATUSES = ['pending', 'all', 'received', 'deposited', 'cleared', 'returned', 'reversed'] as const;

/**
 * FIN-013 bulk office collection and FIN-014 batch review (reference experience 2, Gate S.1).
 * Cash and cheques behave differently on purpose. Cash: the collector counts it, a second person
 * counts it again and confirms; only then are payments, allocations (each payer's own lines) and
 * receipts created. Cheques: confirmation only acknowledges them ("Cheque received — not a receipt
 * of payment"); a cheque settles nothing until its bank line clears it.
 */
export default function OfficeCollectionsPage() {
  const { t } = useT();
  const { can } = useSession();
  const toast = useToast();
  const [batch] = useQueryParam('batch');
  const [cheque] = useQueryParam('cheque');
  const setParams = useQueryParams();
  const create = useApiMutation<BatchDetail>();
  const [error, setError] = useState<unknown>(null);
  const [key] = useState(() => `ocb-${Date.now().toString(36)}`);
  return (
    <div className="@container space-y-6" data-testid="office-collections-page">
      <PageHeader
        title={t('nav:pages.officeCollections')}
        description={t('finance:batch.intro')}
        actions={
          can('payment.receive') ? (
            <Button
              variant="primary"
              icon={Plus}
              isPending={create.isPending}
              onPress={async () => {
                setError(null);
                try {
                  const r = await create.mutateAsync({ method: 'POST', path: '/office-collections', body: { idempotencyKey: key } });
                  toast.success(t('finance:batch.started', { ref: r.batch.ref }));
                  setParams({ batch: r.batch.id });
                } catch (e) {
                  setError(e);
                }
              }}
              className={WRAP}
              data-testid="new-batch"
            >
              {t('finance:batch.new')}
            </Button>
          ) : undefined
        }
      />
      {error ? <ProblemAlert error={error} /> : null}
      <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
        <InlineAlert tone="info" title={t('finance:batch.cashRuleTitle')}>
          <p>{t('finance:batch.cashRule')}</p>
        </InlineAlert>
        <ChequeNotice testId="batch-cheque-rule" />
      </div>
      <UrlTabs
        label={t('finance:batch.tabsLabel')}
        items={[
          { id: 'batches', label: t('finance:batch.tabs.batches') },
          { id: 'cheques', label: t('finance:batch.tabs.cheques') },
        ]}
      >
        {(tab) => (tab === 'cheques' ? <ChequesTab /> : <BatchesTab />)}
      </UrlTabs>
      <BatchDrawer batchId={batch} onClose={() => setParams({ batch: null })} />
      <ChequeDrawer chequeId={cheque} onClose={() => setParams({ cheque: null })} />
    </div>
  );
}

function BatchesTab() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const [status] = useQueryParam('status');
  const setParams = useQueryParams();
  const filter = (BATCH_STATUSES as readonly string[]).includes(status ?? '') ? status! : 'all';
  const q = useApiQuery<BatchList>({ method: 'GET', path: '/office-collections', query: { status: filter } }, { placeholderData: (prev) => prev });
  return (
    <div className="space-y-4 pt-4">
      <FilterPills label={t('finance:batch.status')} showLabel value={filter} testId="batches-status" onChange={(v) => setParams({ status: v === 'all' ? null : v })} options={BATCH_STATUSES.map((s) => ({ id: s, label: s === 'all' ? t('finance:cashbook.allCategories') : t(`finance:batchState.${s}`), ...(q.data && s !== 'all' ? { count: q.data.counts[s] } : {}) }))} />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Loading lines={4} />
      ) : q.data.items.length === 0 ? (
        <EmptyState title={t('finance:batch.emptyTitle')} body={t('finance:batch.emptyBody')} />
      ) : (
        <ul className="space-y-2" data-testid="batches-list">
          {q.data.items.map((b) => (
            <li key={b.id}>
              <Link href={FINANCE.batch(b.id)} variant="plain" className="grid gap-2 rounded-tile border border-border/70 bg-panel p-4 shadow-card hover:bg-raised @3xl:grid-cols-[minmax(0,1.4fr)_auto_auto] @3xl:items-center" data-testid="batch-row" data-ref={b.ref} data-status={b.status}>
                <span className="min-w-0">
                  <span className="block font-semibold text-text">
                    <bdi dir="ltr" className="ltr-ref">{b.ref}</bdi>
                  </span>
                  <span className="block text-xs text-muted">{t('finance:batch.rowLine', { name: b.collectedByName, date: fmt.date(b.collectedOn), cash: fmt.money(b.totals.cash), cheques: fmt.money(b.totals.cheques), count: b.lines.length })}</span>
                </span>
                <BatchBadge state={b.status} />
                <span className="flex items-center justify-end gap-3">
                  <Money value={b.totals.total} className="text-lg font-bold" />
                  <DirectionalIcon icon={ChevronRight} className="size-4 text-muted" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type EditLine = BatchLineInput & { label: string; payerName: string; key: string };

function toEdit(l: BatchLine): EditLine {
  return { key: l.id, billingAccountId: l.billingAccountId, payerPartyId: l.payerPartyId, method: l.method, amount: l.amount.amount, ...(l.cheque ? { cheque: l.cheque } : {}), label: `${l.accountNo} · ${l.flats.join(', ')}`, payerName: l.payerName };
}

function BatchDrawer({ batchId, onClose }: { batchId: string | null; onClose: () => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const q = useApiQuery<BatchDetail>({ method: 'GET', path: `/office-collections/${batchId}` }, { enabled: !!batchId });
  const act = useApiMutation<BatchDetail>();
  const [lines, setLines] = useState<EditLine[] | null>(null);
  const [declared, setDeclared] = useState('');
  const [counted, setCounted] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const d = q.data;
  useEffect(() => {
    if (d) setLines(d.batch.lines.map(toEdit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.batch.id, d?.batch.status]);
  const run = async (method: 'POST' | 'PATCH', path: string, body: unknown, message: string) => {
    setError(null);
    try {
      const r = await act.mutateAsync({ method, path, body });
      toast.success(message);
      setLines(r.batch.lines.map(toEdit));
      void q.refetch();
      return r;
    } catch (e) {
      setError(e);
      return null;
    }
  };
  const edit = d?.actions.edit ?? false;
  const dirty = !!d && !!lines && JSON.stringify(lines.map(({ key: _k, label: _l, payerName: _p, ...x }) => x)) !== JSON.stringify(d.batch.lines.map((l) => { const { key: _k, label: _l, payerName: _p, ...x } = toEdit(l); return x; }));
  const saveLines = () => run('PATCH', `/office-collections/${batchId}/lines`, { lines: (lines ?? []).map(({ key: _k, label: _l, payerName: _p, ...x }) => x) }, t('finance:batch.saved'));
  return (
    <Drawer
      isOpen={!!batchId}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={d ? t('finance:batch.title', { ref: d.batch.ref }) : t('finance:batch.loading')}
      subtitle={d ? <BatchBadge state={d.batch.status} testId="batch-state" /> : undefined}
      testId="batch-drawer"
      footer={
        <div className="flex flex-wrap gap-2">
          {edit && (
            <Button variant="secondary" isPending={act.isPending} isDisabled={!dirty} onPress={() => void saveLines()} data-testid="batch-save">
              {t('finance:batch.save')}
            </Button>
          )}
          {d?.actions.confirm && (
            <Button variant="primary" icon={UsersRound} isPending={act.isPending} isDisabled={d.totals.cashLines > 0 && !counted.trim()} onPress={() => void run('POST', `/office-collections/${batchId}/confirm`, { countedCash: counted }, t('finance:batch.confirmed'))} data-testid="batch-confirm">
              {t('finance:batch.confirm')}
            </Button>
          )}
          {d?.actions.return && (
            <Button variant="secondary" icon={Undo2} onPress={() => setReturnOpen(true)} data-testid="batch-return">
              {t('finance:batch.return')}
            </Button>
          )}
          <Button variant="quiet" onPress={onClose}>{t('common:actions.close')}</Button>
        </div>
      }
    >
      {!d || !lines ? (
        q.isError ? <ErrorState error={q.error} /> : <Loading lines={6} />
      ) : (
        <div className="space-y-5" data-testid="batch-detail">
          {/* D-46: a single payment recorded at the counter waits here for its second count like any batch. */}
          {d.batch.origin === 'single' && (
            <p className="text-sm text-muted" data-testid="batch-single-origin">
              {t('finance:batch.singleOrigin')}
              {d.batch.note ? (
                <>
                  {' · '}
                  <bdi>{d.batch.note}</bdi>
                </>
              ) : null}
            </p>
          )}
          {d.batch.status === 'returned' && (
            <InlineAlert tone="warning" title={t('finance:batch.returnedTitle')} data-testid="batch-returned">
              <p>
                <bdi>{t('billing:quote', { text: d.batch.returnedReason ?? '' })}</bdi>
              </p>
            </InlineAlert>
          )}
          {d.actions.reason === 'maker_checker_required' && (
            <InlineAlert tone="info" title={t('finance:batch.notYoursTitle')} data-testid="batch-not-yours">
              <p>{t('finance:batch.notYours')}</p>
            </InlineAlert>
          )}
          <FactGrid>
            <Fact label={t('finance:batch.collector')}>{d.batch.collectedByName}</Fact>
            <Fact label={t('finance:batch.date')}>{fmt.date(d.batch.collectedOn)}</Fact>
            <Fact label={t('finance:batch.cash')}>
              <Money value={d.totals.cash} className="font-semibold" /> · {t('finance:batch.lines', { count: d.totals.cashLines })}
            </Fact>
            <Fact label={t('finance:batch.cheques')}>
              <Money value={d.totals.cheques} className="font-semibold" /> · {t('finance:batch.lines', { count: d.totals.chequeLines })}
            </Fact>
            {d.batch.declaredCash && (
              <Fact label={t('finance:batch.declared')}>
                <Money value={d.batch.declaredCash} />
              </Fact>
            )}
            {d.batch.confirmedByName && (
              <Fact label={t('finance:batch.confirmedBy')}>
                {d.batch.confirmedByName}
                {d.batch.confirmedCash ? ` · ${fmt.money(d.batch.confirmedCash)}` : ''}
              </Fact>
            )}
          </FactGrid>
          {edit && <CandidatePicker onAdd={(l) => setLines([...lines, l])} />}
          <section className="space-y-2" aria-label={t('finance:batch.linesTitle')}>
            <h3 className="text-sm font-semibold text-text">{t('finance:batch.linesTitle')}</h3>
            {lines.length === 0 ? (
              <p className="text-sm text-muted">{t('finance:batch.noLines')}</p>
            ) : (
              <ul className="space-y-2" data-testid="batch-lines">
                {lines.map((l, i) => {
                  const stored = d.batch.lines.find((x) => x.id === l.key);
                  const problems = d.problems.filter((p) => p.lineId === l.key);
                  const warnings = d.warnings.filter((w) => w.lineId === l.key);
                  return (
                    <li key={l.key} className="space-y-2 rounded-tile border border-border/70 p-3" data-testid="batch-line" data-method={l.method}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 text-sm">
                          <span className="block font-semibold text-text">
                            <bdi>{l.payerName}</bdi>
                          </span>
                          <span className="block text-xs text-muted">
                            <bdi dir="ltr" className="ltr-ref">{l.label}</bdi>
                          </span>
                        </span>
                        <MethodBadge method={l.method} />
                      </div>
                      {edit ? (
                        <div className="grid grid-cols-1 gap-2 @md:grid-cols-2">
                          <AmountInput label={t('finance:batch.amount')} value={l.amount} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, amount: v } : x)))} testId={`batch-line-amount-${i}`} />
                          {l.method === 'cheque' && (
                            <>
                              <PlainTextField label={t('finance:batch.drawerBank')} value={l.cheque?.drawerBank ?? ''} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, cheque: { ...(x.cheque ?? { number: '', date: '2026-10-26' }), drawerBank: v } } : x)))} testId={`batch-line-bank-${i}`} />
                              <PlainTextField label={t('finance:batch.chequeNumber')} value={l.cheque?.number ?? ''} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, cheque: { ...(x.cheque ?? { drawerBank: '', date: '2026-10-26' }), number: v } } : x)))} inputMode="numeric" dir="ltr" testId={`batch-line-number-${i}`} />
                              <PlainTextField label={t('finance:batch.chequeDate')} value={l.cheque?.date ?? ''} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, cheque: { ...(x.cheque ?? { drawerBank: '', number: '' }), date: v } } : x)))} dir="ltr" testId={`batch-line-date-${i}`} />
                            </>
                          )}
                          <Button variant="quiet" size="sm" icon={Trash2} onPress={() => setLines(lines.filter((_, j) => j !== i))} data-testid={`batch-line-remove-${i}`}>
                            {t('finance:batch.remove')}
                          </Button>
                        </div>
                      ) : (
                        <p className="flex flex-wrap items-center gap-2 text-sm">
                          <Money value={{ amount: l.amount, currency: 'PKR' }} className="font-semibold" />
                          {l.cheque && (
                            <span className="text-muted">
                              {t('finance:batch.chequeLine', { bank: l.cheque.drawerBank, date: fmt.date(l.cheque.date) })} <bdi dir="ltr" className="ltr-ref">{l.cheque.number}</bdi>
                            </span>
                          )}
                        </p>
                      )}
                      {stored?.outcome?.kind === 'payment' && (
                        <p className="flex flex-wrap items-center gap-2 text-sm text-success" data-testid="line-receipt">
                          <ReceiptText aria-hidden className="size-4" />
                          <Link href={COLLECTIONS.payment(stored.outcome.paymentId)}>{t('finance:batch.receipt', { ref: stored.outcome.receiptRef })}</Link>
                          {stored.outcome.reversed && <Badge tone="error" icon={Undo2}>{t('collections:payment.reversedBadge')}</Badge>}
                        </p>
                      )}
                      {stored?.outcome?.kind === 'cheque' && (
                        <p className="flex flex-wrap items-center gap-2 text-sm" data-testid="line-cheque">
                          <Link href={FINANCE.cheque(stored.outcome.chequeId)}>{t('finance:batch.acknowledgement', { ref: stored.outcome.chequeRef })}</Link>
                          <ChequeBadge state={stored.outcome.status} />
                        </p>
                      )}
                      {problems.map((p, k) => (
                        <p key={k} className="flex items-center gap-1.5 text-sm text-error" data-testid="line-problem" data-code={p.code}>
                          <Ban aria-hidden className="size-4" />
                          {dynamicT(t)(`finance:batch.problem.${p.code}`, p.values ?? {})}
                        </p>
                      ))}
                      {warnings.map((w, k) => (
                        <p key={k} className="flex items-center gap-1.5 text-sm text-warning" data-testid="line-warning" data-code={w.code}>
                          <TriangleAlert aria-hidden className="size-4" />
                          {dynamicT(t)(`finance:batch.warning.${w.code}`, w.values ?? {})}
                        </p>
                      ))}
                    </li>
                  );
                })}
              </ul>
            )}
            {d.problems.filter((p) => !p.lineId).map((p, k) => (
              <p key={k} className="text-sm text-error">
                {dynamicT(t)(`finance:batch.problem.${p.code}`)}
              </p>
            ))}
          </section>
          {edit && (
            <section className="space-y-2 rounded-tile border border-border/70 p-4" aria-label={t('finance:batch.submitTitle')}>
              <h3 className="text-sm font-semibold text-text">{t('finance:batch.submitTitle')}</h3>
              <p className="text-sm text-muted">{t('finance:batch.submitBody', { amount: fmt.money(d.totals.cash) })}</p>
              <AmountInput label={t('finance:batch.declareCash')} value={declared} onChange={setDeclared} testId="batch-declared" />
              <Button variant="primary" icon={Send} isPending={act.isPending} isDisabled={dirty || !d.actions.submit} onPress={() => void run('POST', `/office-collections/${batchId}/submit`, { declaredCash: declared || '0' }, t('finance:batch.submitted'))} data-testid="batch-submit">
                {t('finance:batch.submit')}
              </Button>
              {dirty && <p className="text-sm text-muted">{t('finance:batch.saveFirst')}</p>}
            </section>
          )}
          {d.actions.confirm && (
            <section className="space-y-2 rounded-tile border border-primary/40 bg-primary-soft/30 p-4" aria-label={t('finance:batch.reviewTitle')} data-testid="batch-review">
              <h3 className="text-sm font-semibold text-text">{t('finance:batch.reviewTitle')}</h3>
              <p className="text-sm text-text">{t('finance:batch.reviewBody', { name: d.batch.collectedByName, amount: fmt.money(d.totals.cash), count: d.totals.chequeLines })}</p>
              {d.totals.cashLines > 0 && <AmountInput label={t('finance:batch.countYourself')} value={counted} onChange={setCounted} testId="batch-counted" />}
              <ChequeNotice testId="batch-review-cheques" />
            </section>
          )}
          {d.batch.status === 'confirmed' && d.totals.chequeLines > 0 && <ChequeNotice testId="batch-confirmed-cheques" />}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-text">{t('finance:batch.history')}</h3>
            <HistoryList label={t('finance:batch.history')} items={d.batch.history.map((h) => ({ at: h.at, byName: h.byName, label: t(`finance:batch.events.${h.action}`), ...(h.note ? { note: h.note } : {}) }))} />
          </section>
          {error ? <ProblemAlert error={error} /> : null}
          <ConfirmDialog
            isOpen={returnOpen}
            onOpenChange={setReturnOpen}
            title={t('finance:batch.returnTitle')}
            effect={t('finance:batch.returnEffect')}
            confirmLabel={t('finance:batch.return')}
            reasonLabel={t('finance:batch.returnReason')}
            onConfirm={async (reason) => void (await run('POST', `/office-collections/${batchId}/return`, { reason }, t('finance:batch.returnedToast')))}
          />
        </div>
      )}
    </Drawer>
  );
}

/** Finds accounts and their liable payers (only those people can be collected from on that account). */
function CandidatePicker({ onAdd }: { onAdd: (l: EditLine) => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const [q, setQ] = useState('');
  const [unpaid, setUnpaid] = useState(true);
  const list = useApiQuery<CollectionCandidate[]>({ method: 'GET', path: '/office-collections/candidates', query: { q, unpaid: unpaid ? '1' : '0' } }, { enabled: q.trim().length >= 2, placeholderData: (prev) => prev });
  const add = (c: CollectionCandidate, p: CollectionCandidate['payers'][number], method: 'office_cash' | 'cheque') =>
    onAdd({ key: `new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, billingAccountId: c.billingAccountId, payerPartyId: p.partyId, method, amount: p.open.amount, ...(method === 'cheque' ? { cheque: { drawerBank: '', number: '', date: '2026-10-26' } } : {}), label: `${c.accountNo} · ${p.flats.join(', ')}`, payerName: p.name });
  return (
    <section className="space-y-3 rounded-tile border border-border/70 p-4" aria-label={t('finance:batch.findTitle')} data-testid="batch-picker">
      <h3 className="text-sm font-semibold text-text">{t('finance:batch.findTitle')}</h3>
      <div className="flex flex-wrap items-end gap-3">
        <PlainTextField label={t('finance:batch.find')} value={q} onChange={setQ} placeholder={t('finance:batch.findPlaceholder')} testId="batch-find" />
        <PlainCheckbox isSelected={unpaid} onChange={setUnpaid} testId="batch-unpaid">
          {t('finance:batch.unpaidOnly')}
        </PlainCheckbox>
      </div>
      {q.trim().length < 2 ? (
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <Search aria-hidden className="size-4" />
          {t('finance:batch.findHint')}
        </p>
      ) : !list.data ? (
        <Loading lines={2} />
      ) : list.data.length === 0 ? (
        <p className="text-sm text-muted">{t('finance:batch.noMatch')}</p>
      ) : (
        <ul className="space-y-2" data-testid="batch-candidates">
          {list.data.slice(0, 8).map((c) =>
            c.payers.map((p) => (
              <li key={`${c.billingAccountId}-${p.partyId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-tile bg-sunken/50 p-3 text-sm" data-testid="batch-candidate" data-account={c.accountNo}>
                <span className="min-w-0">
                  <span className="block font-medium text-text">
                    <bdi>{p.name}</bdi>
                  </span>
                  <span className="block text-xs text-muted">
                    <bdi dir="ltr" className="ltr-ref">{c.accountNo} · {p.flats.join(', ')}</bdi> · {t('finance:batch.owes', { open: fmt.money(p.open), overdue: fmt.money(p.overdue) })}
                    {c.pendingProof ? ` · ${t('finance:batch.warning.proof_pending')}` : ''}
                    {c.pendingCheque ? ` · ${t('finance:batch.chequePending')}` : ''}
                  </span>
                </span>
                <span className="flex gap-2">
                  <Button variant="secondary" size="sm" icon={Banknote} onPress={() => add(c, p, 'office_cash')} data-testid="add-cash">
                    {t('finance:batch.addCash')}
                  </Button>
                  <Button variant="secondary" size="sm" icon={Coins} onPress={() => add(c, p, 'cheque')} data-testid="add-cheque">
                    {t('finance:batch.addCheque')}
                  </Button>
                </span>
              </li>
            )),
          )}
        </ul>
      )}
    </section>
  );
}

function ChequesTab() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const [status] = useQueryParam('status');
  const setParams = useQueryParams();
  const { can } = useSession();
  const [statement, setStatement] = useState(false);
  const filter = (CHEQUE_STATUSES as readonly string[]).includes(status ?? '') ? status! : 'pending';
  const q = useApiQuery<ChequeList>({ method: 'GET', path: '/cheques', query: { status: filter } }, { placeholderData: (prev) => prev });
  return (
    <div className="space-y-4 pt-4" data-testid="cheques-tab">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterPills label={t('finance:cheque.status')} showLabel value={filter} testId="cheques-status" onChange={(v) => setParams({ status: v === 'pending' ? null : v })} options={CHEQUE_STATUSES.map((s) => ({ id: s, label: s === 'all' ? t('finance:cashbook.allCategories') : s === 'pending' ? t('finance:cheque.pendingFilter') : t(`finance:chequeState.${s}`) }))} />
        {can('bank.view') && (
          <Button variant="secondary" icon={FileSpreadsheet} onPress={() => setStatement(true)} data-testid="cheques-demo-statement">
            {t('finance:demo.open')}
          </Button>
        )}
      </div>
      {q.data && <p className="text-sm text-muted">{t('finance:cheque.pendingTotal', { amount: fmt.money(q.data.pending) })}</p>}
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Loading lines={4} />
      ) : q.data.items.length === 0 ? (
        <EmptyState title={t('finance:cheque.emptyTitle')} body={t('finance:cheque.emptyBody')} />
      ) : (
        <ul className="space-y-2" data-testid="cheques-list">
          {q.data.items.map((c) => (
            <li key={c.id}>
              <Link href={FINANCE.cheque(c.id)} variant="plain" className="grid gap-2 rounded-tile border border-border/70 bg-panel p-4 shadow-card hover:bg-raised @3xl:grid-cols-[minmax(0,1.4fr)_auto_auto] @3xl:items-center" data-testid="cheque-row" data-ref={c.ref} data-status={c.status}>
                <span className="min-w-0">
                  <span className="block font-semibold text-text">
                    <bdi>{c.payerName}</bdi>
                  </span>
                  <span className="block text-xs text-muted">
                    <bdi dir="ltr" className="ltr-ref">{c.ref} · {c.drawerBank} {c.chequeNumber} · {c.flats.join(', ')}</bdi> · {fmt.date(c.receivedOn)}
                  </span>
                </span>
                <ChequeBadge state={c.status} />
                <span className="flex items-center justify-end gap-3">
                  <Money value={c.amount} className="text-lg font-bold" />
                  <DirectionalIcon icon={ChevronRight} className="size-4 text-muted" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <DemoStatementDrawer isOpen={statement} onClose={() => setStatement(false)} />
    </div>
  );
}

function ChequeDrawer({ chequeId, onClose }: { chequeId: string | null; onClose: () => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const q = useApiQuery<ChequeDetail>({ method: 'GET', path: `/cheques/${chequeId}` }, { enabled: !!chequeId });
  const act = useApiMutation<ChequeDetail>();
  const [slip, setSlip] = useState('');
  const [account, setAccount] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [memo, setMemo] = useState('');
  const [returnOpen, setReturnOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = async (path: string, body: unknown, message: string) => {
    setError(null);
    try {
      await act.mutateAsync({ method: 'POST', path, body });
      toast.success(message);
      setChosen(null);
      setReason('');
      void q.refetch();
    } catch (e) {
      setError(e);
    }
  };
  const d = q.data;
  const c = d?.cheque;
  const candidate = d?.candidates.find((x) => x.bankLine.id === chosen);
  return (
    <Drawer
      isOpen={!!chequeId}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={c ? t('finance:cheque.title', { ref: c.ref }) : t('finance:cheque.loading')}
      subtitle={c ? <ChequeBadge state={c.status} testId="cheque-state" /> : undefined}
      testId="cheque-drawer"
      footer={
        <div className="flex flex-wrap gap-2">
          {d?.actions.return && (
            <Button variant="secondary" icon={Undo2} onPress={() => setReturnOpen(true)} data-testid="cheque-return">
              {t('finance:cheque.return')}
            </Button>
          )}
          {d?.actions.cancel && (
            <Button variant="quiet" icon={Ban} onPress={() => void run(`/cheques/${chequeId}/cancel`, { reason: t('finance:cheque.handedBack') }, t('finance:cheque.cancelled'))} data-testid="cheque-cancel">
              {t('finance:cheque.cancel')}
            </Button>
          )}
          <Button variant="quiet" onPress={onClose}>{t('common:actions.close')}</Button>
        </div>
      }
    >
      {!d || !c ? (
        q.isError ? <ErrorState error={q.error} /> : <Loading lines={6} />
      ) : (
        <div className="space-y-5" data-testid="cheque-detail">
          {(c.status === 'received' || c.status === 'deposited' || c.status === 'exception_pending') && <ChequeNotice testId="cheque-detail-notice" />}
          {c.status === 'returned' && (
            <InlineAlert tone="error" title={t('finance:cheque.returnedTitle')} data-testid="cheque-returned">
              <p>{t('finance:cheque.returnedBody', { reason: c.returned?.reason ?? '', memo: c.returned?.memo ?? '' })}</p>
            </InlineAlert>
          )}
          {c.status === 'reversed' && (
            <InlineAlert tone="error" title={t('finance:cheque.reversedTitle')} data-testid="cheque-reversed">
              <p>{t('finance:cheque.reversedBody', { reason: c.reversal?.reason ?? '' })}</p>
            </InlineAlert>
          )}
          <FactGrid testId="cheque-facts">
            <Fact label={t('finance:cheque.amount')}>
              <Money value={c.amount} className="text-lg font-bold" />
            </Fact>
            <Fact label={t('finance:cheque.payer')}>
              <bdi>{c.payerName}</bdi> · <bdi dir="ltr" className="ltr-ref">{c.accountNo}</bdi>
            </Fact>
            <Fact label={t('finance:cheque.instrument')}>
              <bdi>{c.drawerBank}</bdi> · <bdi dir="ltr" className="ltr-ref">{c.chequeNumber}</bdi> · {fmt.date(c.chequeDate)}
            </Fact>
            <Fact label={t('finance:cheque.received')}>{t('finance:cheque.receivedLine', { name: c.receivedByName, date: fmt.date(c.receivedOn) })}</Fact>
            {c.source.kind === 'batch' && (
              <Fact label={t('finance:cheque.source')}>
                <Link href={FINANCE.batch(c.source.batchId)}>{c.source.batchRef}</Link>
              </Fact>
            )}
            {c.deposit && (
              <Fact label={t('finance:cheque.deposited')}>
                {t('finance:cheque.depositLine', { account: c.deposit.accountName, slip: c.deposit.slipNo, date: fmt.date(c.deposit.on) })}
              </Fact>
            )}
            {c.paymentId && (
              <Fact label={t('finance:cheque.payment')}>
                <Link href={COLLECTIONS.payment(c.paymentId)}>{t('finance:cheque.receiptLine', { payment: c.paymentRef ?? '', receipt: c.receiptRef ?? '' })}</Link>
              </Fact>
            )}
          </FactGrid>
          {d.actions.deposit && (
            <section className="space-y-2 rounded-tile border border-border/70 p-4" aria-label={t('finance:cheque.depositTitle')}>
              <h3 className="text-sm font-semibold text-text">{t('finance:cheque.depositTitle')}</h3>
              <SelectControl label={t('finance:cheque.depositAccount')} value={account ?? d.depositAccounts[0]?.id ?? null} onChange={setAccount} options={d.depositAccounts.map((a) => ({ id: a.id, label: a.name }))} testId="cheque-deposit-account" />
              <PlainTextField label={t('finance:cheque.slip')} value={slip} onChange={setSlip} dir="ltr" testId="cheque-slip" />
              <Button variant="primary" icon={Landmark} isPending={act.isPending} isDisabled={slip.trim().length < 3} onPress={() => void run(`/cheques/${chequeId}/deposit`, { slipNo: slip, accountId: account ?? d.depositAccounts[0]?.id }, t('finance:cheque.depositedToast'))} data-testid="cheque-deposit">
                {t('finance:cheque.deposit')}
              </Button>
            </section>
          )}
          {c.exception && (
            <InlineAlert tone="warning" title={t('finance:transfer.exceptionTitle', { name: c.exception.requestedByName })} data-testid="cheque-exception">
              <p>{t('finance:transfer.exceptionMissing', { list: c.exception.missing.map((m) => t(`collections:review.field.${m}`)).join(', '), txn: c.exception.bankTxnId })}</p>
              <p>
                <bdi>{t('billing:quote', { text: c.exception.reason })}</bdi>
              </p>
              {d.actions.decideException && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="primary" size="sm" onPress={() => void run(`/cheques/${chequeId}/exception/approve`, {}, t('finance:cheque.cleared'))} data-testid="cheque-exception-approve">
                    {t('finance:transfer.exceptionApprove')}
                  </Button>
                  <Button variant="secondary" size="sm" onPress={() => void run(`/cheques/${chequeId}/exception/reject`, {}, t('finance:transfer.exceptionRejected'))} data-testid="cheque-exception-reject">
                    {t('finance:transfer.exceptionReject')}
                  </Button>
                </div>
              )}
            </InlineAlert>
          )}
          {(d.actions.clear || d.actions.requestReversal) && (
            <section className="space-y-2" aria-label={t('finance:cheque.linesTitle')} data-testid="cheque-candidates">
              <h3 className="text-sm font-semibold text-text">{d.actions.clear ? t('finance:cheque.linesTitle') : t('finance:cheque.reversalTitle')}</h3>
              <p className="text-sm text-muted">{d.actions.clear ? t('finance:cheque.linesBody') : t('finance:cheque.reversalBody')}</p>
              {d.candidates.length === 0 ? (
                <p className="text-sm text-muted">{t('finance:transfer.noCandidates')}</p>
              ) : (
                <ul className="space-y-2">
                  {d.candidates.map((x) => (
                    <CandidateRow key={x.bankLine.id} candidate={x} selected={chosen === x.bankLine.id} onSelect={() => setChosen(x.bankLine.id)} />
                  ))}
                </ul>
              )}
              {d.actions.clear && candidate?.strength === 'full' && !candidate.taken && (
                <Button variant="primary" icon={Link2} isPending={act.isPending} onPress={() => void run(`/cheques/${chequeId}/clear`, { bankLineId: candidate.bankLine.id }, t('finance:cheque.cleared'))} data-testid="cheque-clear">
                  {t('finance:cheque.clear')}
                </Button>
              )}
              {d.actions.clear && candidate?.strength === 'partial' && !candidate.taken && (
                <div className="space-y-2">
                  <PlainTextArea label={t('finance:transfer.exceptionReason')} value={reason} onChange={setReason} testId="cheque-exception-reason" />
                  <Button variant="secondary" isDisabled={reason.trim().length < 10} onPress={() => void run(`/cheques/${chequeId}/exception`, { bankLineId: candidate.bankLine.id, reason }, t('finance:transfer.exceptionRequested'))} data-testid="cheque-request-exception">
                    {t('finance:transfer.requestException')}
                  </Button>
                </div>
              )}
              {d.actions.requestReversal && candidate && !candidate.taken && (
                <div className="space-y-2">
                  <PlainTextArea label={t('finance:cheque.reversalReason')} value={reason} onChange={setReason} testId="cheque-reversal-reason" />
                  <Button variant="secondary" icon={Undo2} isDisabled={reason.trim().length < 5} onPress={() => void run(`/cheques/${chequeId}/reversal-request`, { bankLineId: candidate.bankLine.id, reason }, t('finance:cheque.reversalRequested'))} data-testid="cheque-request-reversal">
                    {t('finance:cheque.requestReversal')}
                  </Button>
                </div>
              )}
            </section>
          )}
          {c.reversal && c.status === 'cleared' && (
            <InlineAlert tone="warning" title={t('finance:cheque.reversalPending')} data-testid="cheque-reversal-pending">
              <Link href={FINANCE.approval(c.reversal.approvalId)}>{t('finance:approval.open')}</Link>
            </InlineAlert>
          )}
          {c.status === 'cleared' && (
            <p className="flex items-center gap-1.5 text-sm text-success">
              <CheckCircle2 aria-hidden className="size-4" />
              {t('finance:cheque.clearedNote')}
            </p>
          )}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-text">{t('finance:batch.history')}</h3>
            <HistoryList label={t('finance:batch.history')} items={c.history.map((h) => ({ at: h.at, byName: h.byName, label: t(`finance:cheque.events.${h.action}`), ...(h.note ? { note: h.note } : {}) }))} />
          </section>
          {error ? <ProblemAlert error={error} /> : null}
          <ConfirmDialog
            isOpen={returnOpen}
            onOpenChange={setReturnOpen}
            title={t('finance:cheque.returnTitle')}
            effect={t('finance:cheque.returnEffect')}
            confirmLabel={t('finance:cheque.return')}
            destructive
            reasonLabel={t('finance:cheque.returnReason')}
            onConfirm={async (r) => void (await run(`/cheques/${chequeId}/return`, { reason: r, memo }, t('finance:cheque.returnedToast')))}
          />
          {d.actions.return && <PlainTextField label={t('finance:cheque.memo')} description={t('finance:cheque.memoHint')} value={memo} onChange={setMemo} dir="ltr" optional testId="cheque-memo" />}
        </div>
      )}
    </Drawer>
  );
}
