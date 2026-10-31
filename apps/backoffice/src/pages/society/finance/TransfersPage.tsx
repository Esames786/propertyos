import { TRANSFER_KINDS, type CashbookView, type DemoLineVariant, type DemoStatementFile, type DemoStatementOptions, type LegCandidate, type TransferDetail, type TransferKind, type TransferLeg, type TransferList } from '@repo/contracts';
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
  PlainTextArea,
  PlainTextField,
  SelectControl,
  useApiMutation,
  useApiQuery,
  useQueryParam,
  useQueryParams,
  useSession,
  useT,
  useToast,
} from '@repo/ui';
import { ArrowRight, Ban, CheckCircle2, ChevronRight, FileDown, FileSpreadsheet, Hand, Link2, PenLine, Plus, Send, Truck, Undo2, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { COLLECTIONS, FINANCE } from '../../../nav.config';
import { AmountInput, Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { ApprovalPanel, Fact, FactGrid, HistoryList, InstructionNotice, SampleNotice, TransferBadge, WRAP } from './fkit';

const STATUSES = ['all', 'awaiting_approval', 'approved_instruction', 'in_transit', 'settled', 'cancelled'] as const;

/**
 * BANK-006 deposits and transfers (reference experience 1, Gate S.1). An instruction is prepared,
 * approved under the policy (never by its preparer) and only then is each side settled on evidence:
 * a cash side on a slip recorded by one person and witnessed by another, a bank side on a statement
 * line of that verified account (full match; a partial one through a second person's exception).
 * The cashbook moves at each settlement, never at approval.
 */
export default function TransfersPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const { can } = useSession();
  const [status] = useQueryParam('status');
  const [record] = useQueryParam('record');
  const [drawer] = useQueryParam('drawer');
  const setParams = useQueryParams();
  const filter = (STATUSES as readonly string[]).includes(status ?? '') ? status! : 'all';
  const q = useApiQuery<TransferList>({ method: 'GET', path: '/finance/transfers', query: { status: filter } }, { placeholderData: (prev) => prev });
  return (
    <div className="@container space-y-6" data-testid="transfers-page">
      <PageHeader
        title={t('nav:pages.transfers')}
        description={t('finance:transfer.intro')}
        actions={
          <div className="flex flex-wrap gap-2">
            {can('funds_transfer.create') && (
              <Button variant="primary" icon={Plus} onPress={() => setParams({ drawer: 'new', record: null })} className={WRAP} data-testid="new-transfer">
                {t('finance:transfer.new')}
              </Button>
            )}
            {can('bank.view') && (
              <Button variant="secondary" icon={FileSpreadsheet} onPress={() => setParams({ drawer: 'statement', record: null })} className={WRAP} data-testid="open-demo-statement">
                {t('finance:demo.open')}
              </Button>
            )}
          </div>
        }
      />
      <InstructionNotice />
      <FilterPills label={t('finance:transfer.status')} showLabel value={filter} testId="transfers-status" onChange={(v) => setParams({ status: v === 'all' ? null : v })} options={STATUSES.map((s) => ({ id: s, label: s === 'all' ? t('finance:cashbook.allCategories') : t(`finance:transferState.${s}`), ...(q.data && s !== 'all' ? { count: q.data.counts[s] } : {}) }))} />
      {q.data && Number(q.data.inTransit.amount) > 0 && (
        <p className="flex items-center gap-2 text-sm text-text" data-testid="transfers-in-transit">
          <Truck aria-hidden className="size-4 text-warning" />
          {t('finance:transfer.inTransitNow', { amount: fmt.money(q.data.inTransit) })}
        </p>
      )}
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Loading lines={6} />
      ) : q.data.items.length === 0 ? (
        <EmptyState title={t('finance:transfer.emptyTitle')} body={t('finance:transfer.emptyBody')} />
      ) : (
        <ul className="space-y-2" data-testid="transfers-list">
          {q.data.items.map((x) => (
            <li key={x.id}>
              <Link href={FINANCE.transfer(x.id)} variant="plain" className="grid gap-2 rounded-tile border border-border/70 bg-panel p-4 shadow-card hover:bg-raised @3xl:grid-cols-[minmax(0,1.4fr)_auto_auto] @3xl:items-center" data-testid="transfer-row" data-ref={x.ref} data-status={x.status}>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 font-semibold text-text">
                    <bdi>{x.legs[0]!.accountName}</bdi>
                    <DirectionalIcon icon={ArrowRight} className="size-4 text-muted" />
                    <bdi>{x.legs[1]!.accountName}</bdi>
                  </span>
                  <span className="block text-xs text-muted">
                    <bdi dir="ltr" className="ltr-ref">{x.ref}</bdi> · {t(`finance:transferKind.${x.kind}`)} · <bdi>{x.purpose}</bdi>
                  </span>
                </span>
                <TransferBadge state={x.status} />
                <span className="flex items-center justify-end gap-3">
                  <Money value={x.amount} className="text-lg font-bold" />
                  <DirectionalIcon icon={ChevronRight} className="size-4 text-muted" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <NewTransferDrawer isOpen={drawer === 'new'} onClose={() => setParams({ drawer: null })} onCreated={(id) => setParams({ drawer: null, record: id })} />
      <TransferDrawer transferId={record} onClose={() => setParams({ record: null })} />
      <DemoStatementDrawer isOpen={drawer === 'statement'} onClose={() => setParams({ drawer: null })} />
    </div>
  );
}

const SIDES: Record<TransferKind, ['cash' | 'bank', 'cash' | 'bank']> = { deposit: ['cash', 'bank'], withdrawal: ['bank', 'cash'], transfer: ['bank', 'bank'], cash_transfer: ['cash', 'cash'] };

function NewTransferDrawer({ isOpen, onClose, onCreated }: { isOpen: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const book = useApiQuery<CashbookView>({ method: 'GET', path: '/finance/cashbook' }, { enabled: isOpen });
  const create = useApiMutation<TransferDetail>();
  const [kind, setKind] = useState<TransferKind>('deposit');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [key] = useState(() => `trf-${Date.now().toString(36)}`);
  const accounts = book.data?.accounts ?? [];
  const side = (k: string) => (k === 'bank' ? 'bank' : 'cash');
  const [fromSide, toSide] = SIDES[kind];
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title={t('finance:transfer.new')}
      subtitle={t('finance:transfer.newSubtitle')}
      testId="new-transfer-drawer"
      footer={
        <>
          <Button variant="quiet" onPress={onClose}>{t('common:actions.cancel')}</Button>
          <Button
            variant="primary"
            icon={Send}
            isPending={create.isPending}
            isDisabled={!from || !to || !amount.trim() || purpose.trim().length < 5}
            onPress={async () => {
              setError(null);
              try {
                const r = await create.mutateAsync({ method: 'POST', path: '/finance/transfers', body: { kind, fromAccountId: from, toAccountId: to, amount, purpose, bankReference: reference, idempotencyKey: key } });
                toast.success(t('finance:transfer.created', { ref: r.transfer.ref }));
                onCreated(r.transfer.id);
              } catch (e) {
                setError(e);
              }
            }}
            data-testid="transfer-submit"
          >
            {t('finance:transfer.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectControl
          label={t('finance:transfer.kind')}
          value={kind}
          onChange={(k) => {
            setKind((k ?? 'deposit') as TransferKind);
            setFrom('');
            setTo('');
          }}
          options={TRANSFER_KINDS.map((k) => ({ id: k, label: t(`finance:transferKind.${k}`) }))}
          testId="transfer-kind"
        />
        <SelectControl label={t('finance:transfer.from')} value={from || null} onChange={(k) => setFrom(k ?? '')} options={accounts.filter((a) => side(a.kind) === fromSide).map((a) => ({ id: a.id, label: `${a.name} · ${fmt.money(a.balance)}` }))} testId="transfer-from" />
        <SelectControl label={t('finance:transfer.to')} value={to || null} onChange={(k) => setTo(k ?? '')} options={accounts.filter((a) => side(a.kind) === toSide && a.id !== from).map((a) => ({ id: a.id, label: a.name }))} testId="transfer-to" />
        <AmountInput label={t('finance:transfer.amount')} value={amount} onChange={setAmount} testId="transfer-amount" />
        <PlainTextArea label={t('finance:transfer.purpose')} value={purpose} onChange={setPurpose} testId="transfer-purpose" />
        <PlainTextField label={t('finance:transfer.reference')} description={t('finance:transfer.referenceHint')} value={reference} onChange={setReference} dir="ltr" optional testId="transfer-reference" />
        <InstructionNotice testId="new-transfer-notice" />
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}

function TransferDrawer({ transferId, onClose }: { transferId: string | null; onClose: () => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const q = useApiQuery<TransferDetail>({ method: 'GET', path: `/finance/transfers/${transferId}` }, { enabled: !!transferId });
  const act = useApiMutation<TransferDetail | { reversalOf: string }>();
  const toast = useToast();
  const [error, setError] = useState<unknown>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const run = async (path: string, body: unknown, message: string) => {
    setError(null);
    try {
      const r = await act.mutateAsync({ method: 'POST', path, body });
      toast.success(message);
      void q.refetch();
      return r;
    } catch (e) {
      setError(e);
      return null;
    }
  };
  const d = q.data;
  return (
    <Drawer
      isOpen={!!transferId}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={d ? t('finance:transfer.title', { ref: d.transfer.ref }) : t('finance:transfer.loading')}
      subtitle={d ? <TransferBadge state={d.transfer.status} testId="transfer-state" /> : undefined}
      testId="transfer-drawer"
      footer={
        <div className="flex flex-wrap gap-2">
          {d?.actions.reverse && (
            <Button
              variant="secondary"
              icon={Undo2}
              onPress={async () => {
                const prefill = (await run(`/finance/transfers/${d.transfer.id}/reverse`, {}, t('finance:transfer.reversalReady'))) as { reversalOf: string; kind: string; fromAccountId: string; toAccountId: string; amount: string } | null;
                if (prefill) {
                  const created = (await run('/finance/transfers', { ...prefill, purpose: t('finance:transfer.reversalPurpose', { ref: d.transfer.ref }) }, t('finance:transfer.reversalPrepared'))) as TransferDetail | null;
                  if (created) window.history.replaceState(null, '', FINANCE.transfer(created.transfer.id));
                }
              }}
              data-testid="transfer-reverse"
            >
              {t('finance:transfer.reverse')}
            </Button>
          )}
          {d?.actions.cancel && (
            <Button variant="quiet" icon={Ban} onPress={() => setCancelOpen(true)} data-testid="transfer-cancel">
              {t('finance:transfer.cancel')}
            </Button>
          )}
          <Button variant="quiet" onPress={onClose}>{t('common:actions.close')}</Button>
        </div>
      }
    >
      {!d ? (
        q.isError ? <ErrorState error={q.error} /> : <Loading lines={6} />
      ) : (
        <div className="space-y-5" data-testid="transfer-detail">
          {d.transfer.status === 'approved_instruction' && <InstructionNotice testId="transfer-instruction-notice" />}
          <FactGrid testId="transfer-facts">
            <Fact label={t('finance:transfer.amount')}>
              <Money value={d.transfer.amount} className="text-lg font-bold" />
            </Fact>
            <Fact label={t('finance:transfer.kind')}>{t(`finance:transferKind.${d.transfer.kind}`)}</Fact>
            <Fact label={t('finance:transfer.purpose')}>
              <bdi>{d.transfer.purpose}</bdi>
            </Fact>
            <Fact label={t('finance:transfer.reference')}>
              <bdi dir="ltr" className="ltr-ref">{d.transfer.bankReference}</bdi>
            </Fact>
            <Fact label={t('finance:transfer.preparedBy')}>{d.transfer.preparedByName}</Fact>
            {d.transfer.reversalOf && (
              <Fact label={t('finance:transfer.reversalOf')}>
                <Link href={FINANCE.transfer(d.transfer.reversalOf.id)}>{d.transfer.reversalOf.ref}</Link>
              </Fact>
            )}
          </FactGrid>
          {d.approval && <ApprovalPanel approvalId={d.approval.id} />}
          <ol className="space-y-3" aria-label={t('finance:transfer.legs')}>
            {d.transfer.legs.map((leg) => (
              <LegCard key={leg.leg} leg={leg} detail={d} onRun={run} pending={act.isPending} />
            ))}
          </ol>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-text">{t('finance:transfer.history')}</h3>
            <HistoryList label={t('finance:transfer.history')} items={d.transfer.history.map((h) => ({ at: h.at, byName: h.byName, label: `${t(`finance:transfer.events.${h.action}`)}${h.leg ? ` · ${t(`finance:transfer.leg.${h.leg}`)}` : ''}`, ...(h.note ? { note: h.note } : {}) }))} />
          </section>
          {error ? <ProblemAlert error={error} /> : null}
          <p className="text-xs text-muted">{t('finance:transfer.preparedOn', { date: fmt.date(d.transfer.preparedAt) })}</p>
          <ConfirmDialog
            isOpen={cancelOpen}
            onOpenChange={setCancelOpen}
            title={t('finance:transfer.cancelTitle', { ref: d.transfer.ref })}
            effect={t('finance:transfer.cancelEffect')}
            confirmLabel={t('finance:transfer.cancel')}
            destructive
            reasonLabel={t('finance:transfer.cancelReason')}
            onConfirm={async (reason) => void (await run(`/finance/transfers/${d.transfer.id}/cancel`, { reason }, t('finance:transfer.cancelled')))}
          />
        </div>
      )}
    </Drawer>
  );
}

function LegCard({ leg, detail, onRun, pending }: { leg: TransferLeg; detail: TransferDetail; onRun: (path: string, body: unknown, message: string) => Promise<unknown>; pending: boolean }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const id = detail.transfer.id;
  const [slip, setSlip] = useState('');
  const [reason, setReason] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const candidates = detail.candidates[leg.leg];
  const canMatch = detail.actions.match.includes(leg.leg);
  const settlement = detail.settlements.find((s) => s.leg === leg.leg);
  const c = candidates.find((x) => x.bankLine.id === chosen);
  return (
    <li className="space-y-3 rounded-tile border border-border/70 p-4" data-testid={`leg-${leg.leg}`} data-status={leg.status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-text">
          {t(`finance:transfer.leg.${leg.leg}`)}: <bdi>{leg.accountName}</bdi>
        </p>
        <Badge tone={leg.status === 'settled' ? 'success' : leg.status === 'pending' ? 'neutral' : 'warning'} icon={leg.status === 'settled' ? CheckCircle2 : leg.evidence === 'statement_line' ? Link2 : Hand}>
          {t(`finance:transfer.legState.${leg.status}`)}
        </Badge>
      </div>
      <p className="text-sm text-muted">{t(leg.evidence === 'statement_line' ? 'finance:transfer.needsLine' : 'finance:transfer.needsSlip')}</p>
      {settlement && (
        <p className="text-sm text-text" data-testid={`leg-${leg.leg}-settled`}>
          {settlement.evidenceType === 'statement_line'
            ? t(settlement.exception ? 'finance:transfer.settledException' : 'finance:transfer.settledLine', { txn: settlement.bankTxnId ?? '', date: fmt.date(settlement.settledOn), by: settlement.confirmedByName, approver: settlement.exception?.approvedByName ?? '' })
            : t('finance:transfer.settledSlip', { slip: settlement.slipNo ?? '', date: fmt.date(settlement.settledOn), witness: settlement.confirmedByName, by: leg.slip?.recordedByName ?? '' })}
        </p>
      )}
      {leg.slip && leg.status === 'slip_recorded' && <p className="text-sm text-text">{t('finance:transfer.slipRecorded', { slip: leg.slip.number, name: leg.slip.recordedByName })}</p>}
      {detail.actions.recordSlip.includes(leg.leg) && (
        <div className="flex flex-wrap items-end gap-2">
          <PlainTextField label={t('finance:transfer.slipNo')} value={slip} onChange={setSlip} dir="ltr" testId={`leg-${leg.leg}-slip`} />
          <Button variant="secondary" icon={PenLine} isPending={pending} isDisabled={slip.trim().length < 3} onPress={() => void onRun(`/finance/transfers/${id}/legs/${leg.leg}/slip`, { slipNo: slip }, t('finance:transfer.slipSaved'))} data-testid={`leg-${leg.leg}-record-slip`}>
            {t('finance:transfer.recordSlip')}
          </Button>
        </div>
      )}
      {detail.actions.witnessSlip.includes(leg.leg) && (
        <Button variant="primary" icon={UserCheck} isPending={pending} onPress={() => void onRun(`/finance/transfers/${id}/legs/${leg.leg}/witness`, {}, t('finance:transfer.witnessed'))} data-testid={`leg-${leg.leg}-witness`}>
          {t('finance:transfer.witness')}
        </Button>
      )}
      {leg.exception && (
        <InlineAlert tone="warning" title={t('finance:transfer.exceptionTitle', { name: leg.exception.requestedByName })} data-testid={`leg-${leg.leg}-exception`}>
          <p>{t('finance:transfer.exceptionMissing', { list: leg.exception.missing.map((m) => t(`collections:review.field.${m}`)).join(', '), txn: leg.exception.bankTxnId })}</p>
          <p>
            <bdi>{t('billing:quote', { text: leg.exception.reason })}</bdi>
          </p>
          {detail.actions.decideException.includes(leg.leg) && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onPress={() => void onRun(`/finance/transfers/${id}/legs/${leg.leg}/exception/approve`, { note: '' }, t('finance:transfer.exceptionApproved'))} data-testid={`leg-${leg.leg}-exception-approve`}>
                {t('finance:transfer.exceptionApprove')}
              </Button>
              <Button variant="secondary" size="sm" onPress={() => void onRun(`/finance/transfers/${id}/legs/${leg.leg}/exception/reject`, { note: '' }, t('finance:transfer.exceptionRejected'))} data-testid={`leg-${leg.leg}-exception-reject`}>
                {t('finance:transfer.exceptionReject')}
              </Button>
            </div>
          )}
        </InlineAlert>
      )}
      {canMatch && (
        <div className="space-y-2" data-testid={`leg-${leg.leg}-candidates`}>
          <p className="text-sm font-medium text-text">{t('finance:transfer.candidates')}</p>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted">
              {t('finance:transfer.noCandidates')} <Link href={COLLECTIONS.bankFeed()}>{t('finance:transfer.importHint')}</Link>
            </p>
          ) : (
            <ul className="space-y-2">
              {candidates.map((x) => (
                <CandidateRow key={x.bankLine.id} candidate={x} selected={chosen === x.bankLine.id} onSelect={() => setChosen(x.bankLine.id)} />
              ))}
            </ul>
          )}
          {c && c.strength === 'full' && !c.taken && (
            <Button variant="primary" icon={Link2} isPending={pending} onPress={() => void onRun(`/finance/transfers/${id}/legs/${leg.leg}/match`, { bankLineId: c.bankLine.id }, t('finance:transfer.matched'))} data-testid={`leg-${leg.leg}-match`}>
              {t('finance:transfer.match')}
            </Button>
          )}
          {c && c.strength === 'partial' && !c.taken && (
            <div className="space-y-2">
              <PlainTextArea label={t('finance:transfer.exceptionReason')} value={reason} onChange={setReason} testId={`leg-${leg.leg}-exception-reason`} />
              <Button variant="secondary" isPending={pending} isDisabled={reason.trim().length < 10} onPress={() => void onRun(`/finance/transfers/${id}/legs/${leg.leg}/exception`, { bankLineId: c.bankLine.id, reason }, t('finance:transfer.exceptionRequested'))} data-testid={`leg-${leg.leg}-request-exception`}>
                {t('finance:transfer.requestException')}
              </Button>
            </div>
          )}
        </div>
      )}
      {detail.actions.reason === 'maker_checker_required' && leg.evidence === 'statement_line' && leg.status === 'pending' && <p className="text-sm text-muted">{t('finance:transfer.notYours')}</p>}
    </li>
  );
}

export function CandidateRow({ candidate: c, selected, onSelect }: { candidate: LegCandidate; selected: boolean; onSelect: () => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        disabled={!!c.taken}
        className={`w-full rounded-tile border p-3 text-start text-sm ${selected ? 'border-primary bg-primary-soft/50' : 'border-border/70 hover:bg-raised'} disabled:opacity-60`}
        data-testid="line-candidate"
        data-strength={c.strength}
        data-line={c.bankLine.id}
      >
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span>
            <bdi dir="ltr" className="ltr-ref font-medium">{c.bankLine.bankTxnId}</bdi> · {fmt.date(c.bankLine.valueDate)} · <bdi>{c.bankLine.counterpartyName}</bdi>
          </span>
          <Money value={c.bankLine.amount} className="font-semibold" />
        </span>
        <span className="mt-1 block text-xs text-muted">
          {c.taken
            ? t('finance:transfer.taken', { ref: c.taken.ref })
            : c.strength === 'full'
              ? t('finance:transfer.full')
              : t('finance:transfer.partial', { list: c.missing.map((m) => t(`collections:review.field.${m}`)).join(', ') })}
        </span>
      </button>
    </li>
  );
}

/**
 * Demo helper (D-48): generates a sample statement (fictional) for what waits on bank evidence on
 * one verified account, then imports it like any statement. It settles nothing by itself: lines are
 * matched afterwards, by someone other than the preparer.
 */
export function DemoStatementDrawer({ isOpen, onClose, accountId: fixed }: { isOpen: boolean; onClose: () => void; accountId?: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const { can } = useSession();
  const book = useApiQuery<CashbookView>({ method: 'GET', path: '/finance/cashbook' }, { enabled: isOpen && !fixed });
  const [account, setAccount] = useState(fixed ?? 'ben_anr_main');
  const opts = useApiQuery<DemoStatementOptions>({ method: 'GET', path: '/finance/demo-statement', query: { account } }, { enabled: isOpen && !!account });
  const generate = useApiMutation<DemoStatementFile>();
  const importer = useApiMutation<unknown>();
  const [variants, setVariants] = useState<Record<string, DemoLineVariant>>({});
  const [file, setFile] = useState<DemoStatementFile | null>(null);
  const [error, setError] = useState<unknown>(null);
  const keyOf = (i: { id: string; kind: string; leg?: string }) => `${i.kind}:${i.id}:${i.leg ?? ''}`;
  const tr = dynamicT(t);
  const close = () => {
    setFile(null);
    setVariants({});
    setError(null);
    onClose();
  };
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(o) => !o && close()}
      size="lg"
      title={t('finance:demo.title')}
      subtitle={t('finance:demo.subtitle')}
      testId="demo-statement-drawer"
      footer={
        <>
          <Button variant="quiet" onPress={close}>{t('common:actions.close')}</Button>
          {!file ? (
            <Button
              variant="primary"
              icon={FileDown}
              isPending={generate.isPending}
              isDisabled={!opts.data?.items.length}
              onPress={async () => {
                setError(null);
                try {
                  const f = await generate.mutateAsync({ method: 'POST', path: '/finance/demo-statement', body: { accountId: account, choices: (opts.data?.items ?? []).map((i) => ({ id: i.id, kind: i.kind, ...(i.leg ? { leg: i.leg } : {}), variant: variants[keyOf(i)] ?? i.variants[0] })) } });
                  setFile(f);
                } catch (e) {
                  setError(e);
                }
              }}
              className={WRAP}
              data-testid="demo-generate"
            >
              {t('finance:demo.generate')}
            </Button>
          ) : (
            can('bank.reconcile') && (
              <Button
                variant="primary"
                isPending={importer.isPending}
                isDisabled={file.lines === 0}
                onPress={async () => {
                  setError(null);
                  try {
                    await importer.mutateAsync({ method: 'POST', path: '/bank/statements', body: { beneficiaryId: account, fileName: file.fileName, content: file.content, from: file.from, to: file.to } });
                    toast.success(t('finance:demo.imported', { count: file.lines }));
                    close();
                  } catch (e) {
                    setError(e);
                  }
                }}
                className={WRAP}
                data-testid="demo-import"
              >
                {t('finance:demo.import')}
              </Button>
            )
          )}
        </>
      }
    >
      <div className="space-y-4">
        <SampleNotice fileName={file?.fileName} />
        {!fixed && (
          <SelectControl
            label={t('finance:demo.account')}
            value={account}
            onChange={(k) => {
              setAccount(k ?? '');
              setFile(null);
            }}
            options={(book.data?.accounts ?? []).filter((a) => a.kind === 'bank').map((a) => ({ id: a.id, label: a.name }))}
            testId="demo-account"
          />
        )}
        {file ? (
          <div className="space-y-2" data-testid="demo-file">
            <p className="text-sm text-text">{t('finance:demo.ready', { count: file.lines, from: fmt.date(file.from), to: fmt.date(file.to) })}</p>
            <pre dir="ltr" className="max-h-60 overflow-auto rounded-tile bg-sunken p-3 text-xs text-text">{file.content}</pre>
            {!can('bank.reconcile') && <p className="text-sm text-muted">{t('finance:demo.importBy')}</p>}
          </div>
        ) : !opts.data ? (
          <Loading lines={4} />
        ) : opts.data.items.length === 0 ? (
          <EmptyState title={t('finance:demo.nothingTitle')} body={t('finance:demo.nothingBody')} />
        ) : (
          <ul className="space-y-3" data-testid="demo-items">
            {opts.data.items.map((i) => (
              <li key={keyOf(i)} className="space-y-2 rounded-tile border border-border/70 p-3" data-testid="demo-item" data-kind={i.kind}>
                <p className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <bdi dir="ltr" className="ltr-ref font-medium">{i.ref}</bdi> · {tr(`finance:demo.items.${i.describe.key}`, { ...(i.describe.values ?? {}), ...(i.describe.values?.kind ? { kind: tr(`finance:transferKind.${i.describe.values.kind}`) } : {}) })}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Money value={i.amount} className="font-semibold" />
                    <span className="text-xs text-muted">{t(i.direction === 'debit' ? 'finance:account.debit' : 'finance:account.credit')}</span>
                  </span>
                </p>
                <SelectControl label={t('finance:demo.variant')} value={variants[keyOf(i)] ?? i.variants[0]!} onChange={(k) => setVariants({ ...variants, [keyOf(i)]: (k ?? i.variants[0]) as DemoLineVariant })} options={i.variants.map((v) => ({ id: v, label: t(`finance:demo.variants.${v}`) }))} testId="demo-variant" />
              </li>
            ))}
          </ul>
        )}
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}
