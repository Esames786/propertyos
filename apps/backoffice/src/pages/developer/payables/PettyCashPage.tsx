import { ApiError, CASH_NOTES, type CashCountView, type PayablesEvidence, type PettyCashFloatView, type PettyCashList, type TopUpView } from '@repo/contracts';
import { Button, ConfirmDialog, Drawer, EmptyState, ErrorState, InlineAlert, PageHeader, PlainTextArea, PlainTextField, useApiQuery, useKeyedCreate, useT, useToast } from '@repo/ui';
import { Ban, Calculator, CheckCircle2, CircleHelp, HandCoins, ShieldX } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  Amount,
  BlockedNote,
  CostCentreName,
  CountBadge,
  EntityBar,
  EvidenceLine,
  EvidencePicker,
  Fact,
  FactGrid,
  fieldErrorKey,
  History,
  KEEP,
  Loading,
  PAY,
  PayNav,
  ProblemAlert,
  ProvisionalNotice,
  Ref,
  SettlementBadge,
  TopUpBadge,
  useAction,
  useEntityParam,
  useFieldError,
  useProblemToast,
  useSocietyFormat,
  WRAP,
} from './apkit';
import { ExpenseRow } from './ExpensePages';
import { moneyText } from './money';

/**
 * Gate E.8 EXP-005 petty cash (provisional, PARTIAL). Reuses S.1's `petty_cash` account kind, its note
 * denominations and witnessing (BANK-008): the custodian counts, a second person witnesses, and only a
 * witnessed count is evidence of cash on hand. A top-up is a transfer instruction approved by someone
 * else, "Approved instruction — not sent": no cash moves and no balance is computed from it.
 */
export default function PettyCashPage() {
  const { t } = useT();
  const [entity, setEntity] = useEntityParam();
  const q = useApiQuery<PettyCashList>({ method: 'GET', path: '/petty-cash', query: entity ? { entity } : {} }, KEEP);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const d = q.data;
  return (
    <div className="@container space-y-5" data-testid="pay-petty">
      <PageHeader title={t('payables:petty.title')} description={t('payables:petty.intro')} breadcrumbs={[{ label: t('payables:expenses.title'), href: PAY.expenses() }]} />
      <PayNav current="pettyCash" />
      <ProvisionalNotice screen="pettyCash" />
      <EntityBar scope={d.scope} onChange={setEntity} />
      {d.floats.length === 0 ? (
        <EmptyState title={t('payables:petty.none')} body={t('payables:petty.noneHint')} />
      ) : (
        d.floats.map((f) => <FloatPanel key={f.id} f={f} />)
      )}
    </div>
  );
}

function FloatPanel({ f }: { f: PettyCashFloatView }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const [drawer, setDrawer] = useState<'count' | 'topup' | null>(null);
  return (
    <section className="space-y-4 rounded-card border border-border/70 bg-panel p-3 shadow-card @md:p-5" aria-labelledby={`float-${f.id}`} data-testid="pay-float" data-id={f.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id={`float-${f.id}`} className="text-lg font-semibold break-words">
            <bdi>{f.name}</bdi>
          </h2>
          <p className="text-sm text-muted">
            <CostCentreName cc={f.costCentre} /> · {t('payables:petty.custodian', { name: f.custodianName })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {f.canCount && (
            <Button className={WRAP} variant="primary" icon={Calculator} onPress={() => setDrawer('count')} data-testid="pay-float-count">
              {t('payables:petty.recordCount')}
            </Button>
          )}
          {f.canRequestTopUp && (
            <Button className={WRAP} icon={HandCoins} onPress={() => setDrawer('topup')} data-testid="pay-float-topup">
              {t('payables:petty.requestTopUp')}
            </Button>
          )}
        </div>
      </div>
      <FactGrid testId="pay-float-facts">
        <Fact label={t('payables:petty.imprest')}>
          <Amount value={f.imprest} /> <span className="block text-xs text-muted">{t('payables:petty.imprestHint')}</span>
        </Fact>
        <Fact label={t('payables:petty.onHand')}>
          {f.lastWitnessed ? (
            <span data-testid="pay-float-witnessed">
              <Amount value={f.lastWitnessed.amount} className="font-semibold" />
              <span className="block text-xs text-muted">{t('payables:petty.witnessedLine', { date: fmt.date(f.lastWitnessed.countedOn), counted: f.lastWitnessed.countedByName, witness: f.lastWitnessed.witnessedByName ?? '' })}</span>
            </span>
          ) : (
            <span className="inline-flex items-start gap-1.5 text-muted" data-testid="pay-float-unknown">
              <CircleHelp aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t('payables:petty.unknown')}
            </span>
          )}
        </Fact>
      </FactGrid>
      <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-2">
        <Part title={t('payables:petty.counts')}>
          {f.counts.length === 0 ? <p className="text-sm text-muted">{t('payables:petty.noCounts')}</p> : <ul className="space-y-3">{f.counts.map((c) => <CountItem key={c.id} floatId={f.id} c={c} />)}</ul>}
        </Part>
        <Part title={t('payables:petty.topUps')} description={t('payables:petty.topUpsHint')}>
          {f.topUps.length === 0 ? <p className="text-sm text-muted">{t('payables:petty.noTopUps')}</p> : <ul className="space-y-3">{f.topUps.map((x) => <TopUpItem key={x.id} floatId={f.id} x={x} />)}</ul>}
        </Part>
      </div>
      <Part title={t('payables:petty.expenses')} description={t('payables:petty.expensesHint')}>
        {f.expenses.length === 0 ? (
          <p className="text-sm text-muted">{t('payables:common.none')}</p>
        ) : (
          <ul className="space-y-2" data-testid="pay-float-expenses">
            {f.expenses.map((e) => (
              <ExpenseRow key={e.id} e={e} />
            ))}
          </ul>
        )}
      </Part>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium outline-none focus-visible:outline-2 focus-visible:outline-focus">{t('payables:history.title')}</summary>
        <div className="mt-2">
          <History events={f.history} />
        </div>
      </details>
      {drawer === 'count' && <CountDrawer f={f} onClose={() => setDrawer(null)} />}
      {drawer === 'topup' && <TopUpDrawer f={f} onClose={() => setDrawer(null)} />}
    </section>
  );
}

/** A part of a float's card: a heading and its content, without another card around it (room at 320 px / 200 %). */
function Part({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-2 border-t border-border/60 pt-3" aria-label={title}>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="text-sm text-muted">{description}</p>}
      {children}
    </section>
  );
}

function CountItem({ floatId, c }: { floatId: string; c: CashCountView }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const act = useAction<PettyCashFloatView>();
  const [dialog, setDialog] = useState<'confirm' | 'dispute' | null>(null);
  return (
    <li className="space-y-1.5 border-b border-border/60 pb-3 text-sm last:border-0" data-testid="pay-count" data-id={c.id} data-state={c.state}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <Amount value={c.amount} className="font-semibold" />
          <CountBadge state={c.state} />
        </span>
        <span className="text-xs text-muted">{fmt.date(c.countedOn)}</span>
      </div>
      <p className="text-xs text-muted">
        {t('payables:petty.countedBy', { name: c.countedByName })}
        {c.witnessedByName ? ` · ${t(c.state === 'disputed' ? 'payables:petty.disputedBy' : 'payables:petty.witnessedBy', { name: c.witnessedByName })}` : ''}
      </p>
      <p className="text-xs text-muted">
        {Object.entries(c.notes)
          .map(([n, k]) => t('payables:petty.noteLine', { note: n, count: k }))
          .join(' · ')}
      </p>
      {c.note && <p className="text-xs text-muted">“<bdi>{c.note}</bdi>”</p>}
      <EvidenceLine evidence={c.evidence} />
      {c.canWitness ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button className={WRAP} size="sm" variant="primary" icon={CheckCircle2} onPress={() => setDialog('confirm')} data-testid="pay-count-witness">
            {t('payables:petty.witness')}
          </Button>
          <Button className={WRAP} size="sm" variant="secondary" icon={ShieldX} onPress={() => setDialog('dispute')} data-testid="pay-count-dispute">
            {t('payables:petty.dispute')}
          </Button>
        </div>
      ) : (
        <BlockedNote reason={c.blocked} testId="pay-count-blocked" />
      )}
      {act.error ? <ProblemAlert error={act.error} /> : null}
      <ConfirmDialog
        isOpen={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t(dialog === 'dispute' ? 'payables:petty.disputeTitle' : 'payables:petty.witnessTitle', { amount: fmt.money(c.amount) })}
        effect={t(dialog === 'dispute' ? 'payables:petty.disputeEffect' : 'payables:petty.witnessEffect')}
        confirmLabel={t(dialog === 'dispute' ? 'payables:petty.dispute' : 'payables:petty.witness')}
        destructive={dialog === 'dispute'}
        {...(dialog === 'dispute' ? { reasonLabel: t('payables:petty.disputeReason') } : {})}
        onConfirm={async (reason) => !!(await act.run(`/petty-cash/${floatId}/counts/${c.id}/witness`, { decision: dialog ?? 'confirm', ...(reason ? { note: reason } : {}) }, t(dialog === 'dispute' ? 'payables:petty.disputedToast' : 'payables:petty.witnessedToast')))}
      />
    </li>
  );
}

function TopUpItem({ floatId, x }: { floatId: string; x: TopUpView }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const act = useAction<PettyCashFloatView>();
  const [dialog, setDialog] = useState<'approve' | 'cancel' | null>(null);
  return (
    <li className="space-y-1.5 border-b border-border/60 pb-3 text-sm last:border-0" data-testid="pay-topup" data-id={x.id} data-state={x.state}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <Ref value={x.ref} className="font-medium" />
          <TopUpBadge state={x.state} />
          <SettlementBadge />
        </span>
        <Amount value={x.amount} className="font-semibold" />
      </div>
      <p className="text-xs text-muted">
        <span className="block">
          “<bdi>{x.reason}</bdi>”
        </span>
        <span className="block">{t('payables:petty.requestedBy', { name: x.requestedByName, date: fmt.date(x.requestedAt) })}</span>
        {x.approvedByName ? <span className="block">{t('payables:petty.approvedBy', { name: x.approvedByName })}</span> : null}
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        {x.canApprove && (
          <Button className={WRAP} size="sm" variant="primary" icon={CheckCircle2} onPress={() => setDialog('approve')} data-testid="pay-topup-approve">
            {t('payables:petty.approveTopUp')}
          </Button>
        )}
        {x.canCancel && (
          <Button className={WRAP} size="sm" variant="quiet" icon={Ban} onPress={() => setDialog('cancel')} data-testid="pay-topup-cancel">
            {t('payables:petty.cancelTopUp')}
          </Button>
        )}
      </div>
      {!x.canApprove && <BlockedNote reason={x.blocked} testId="pay-topup-blocked" />}
      {act.error ? <ProblemAlert error={act.error} /> : null}
      <ConfirmDialog
        isOpen={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t(dialog === 'cancel' ? 'payables:petty.cancelTopUpTitle' : 'payables:petty.approveTopUpTitle', { ref: x.ref })}
        effect={t(dialog === 'cancel' ? 'payables:petty.cancelTopUpEffect' : 'payables:petty.approveTopUpEffect')}
        confirmLabel={t(dialog === 'cancel' ? 'payables:petty.cancelTopUp' : 'payables:petty.approveTopUp')}
        destructive={dialog === 'cancel'}
        {...(dialog === 'cancel' ? { reasonLabel: t('payables:common.reason') } : {})}
        onConfirm={async (reason) => !!(await act.run(`/petty-cash/${floatId}/top-ups/${x.id}/${dialog ?? 'approve'}`, reason ? { reason } : {}, t(dialog === 'cancel' ? 'payables:petty.topUpCancelledToast' : 'payables:petty.topUpApprovedToast', { ref: x.ref })))}
      />
    </li>
  );
}

function CountDrawer({ f, onClose }: { f: PettyCashFloatView; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const problem = useProblemToast();
  const create = useKeyedCreate<PettyCashFloatView>('pcc');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState<PayablesEvidence | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const fe = useFieldError(error);
  const total = CASH_NOTES.reduce((s, n) => s + BigInt(n) * 100n * BigInt(Math.max(0, Math.trunc(Number(notes[n] ?? 0)) || 0)), 0n);
  const save = async () => {
    setError(null);
    try {
      await create.send({ method: 'POST', path: `/petty-cash/${f.id}/counts`, body: { notes: Object.fromEntries(CASH_NOTES.filter((n) => Number(notes[n] ?? 0) > 0).map((n) => [n, Number(notes[n])])), ...(note.trim() ? { note } : {}), ...(evidence ? { evidence } : {}) } });
      toast.success(t('payables:petty.countRecorded'));
      onClose();
    } catch (e) {
      setError(e);
      if (!(e instanceof ApiError) || !Object.keys(e.problem.errors ?? {}).length) problem(e);
    }
  };
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('payables:petty.countTitle')}
      subtitle={<bdi>{f.name}</bdi>}
      testId="pay-count-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button className={WRAP} variant="quiet" onPress={onClose}>
            {t('payables:common.cancel')}
          </Button>
          <Button className={WRAP} variant="primary" icon={Calculator} isPending={create.isPending} onPress={() => void save()} data-testid="pay-count-save">
            {t('payables:petty.saveCount')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <InlineAlert tone="info">{t('payables:petty.countRule')}</InlineAlert>
        <div className="grid grid-cols-2 gap-3">
          {CASH_NOTES.map((n) => (
            <PlainTextField key={n} label={t('payables:petty.noteLabel', { note: n })} value={notes[n] ?? ''} onChange={(v) => setNotes({ ...notes, [n]: v })} inputMode="numeric" dir="ltr" optional testId={`pay-count-note-${n}`} />
          ))}
        </div>
        {fe('notes') && <p className="text-sm font-medium text-error">{fe('notes')}</p>}
        <p className="text-base font-semibold" data-testid="pay-count-total">
          {t('payables:petty.countTotal')}: <Amount value={{ amount: moneyText(total), currency: 'PKR' }} />
        </p>
        <PlainTextArea label={t('payables:petty.countNote')} value={note} onChange={setNote} optional errorKey={fieldErrorKey(error, 'note')} testId="pay-count-note" />
        <EvidencePicker value={evidence} onChange={setEvidence} kind="count_sheet" sampleName={t('payables:evidence.sampleCount')} error={fe('evidence')} testId="pay-count-evidence" />
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}

function TopUpDrawer({ f, onClose }: { f: PettyCashFloatView; onClose: () => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const problem = useProblemToast();
  const create = useKeyedCreate<PettyCashFloatView>('pct');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const save = async () => {
    setError(null);
    try {
      await create.send({ method: 'POST', path: `/petty-cash/${f.id}/top-ups`, body: { amount, reason } });
      toast.success(t('payables:petty.topUpRequested'));
      onClose();
    } catch (e) {
      setError(e);
      if (!(e instanceof ApiError) || !Object.keys(e.problem.errors ?? {}).length) problem(e);
    }
  };
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('payables:petty.topUpTitle')}
      subtitle={<bdi>{f.name}</bdi>}
      testId="pay-topup-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button className={WRAP} variant="quiet" onPress={onClose}>
            {t('payables:common.cancel')}
          </Button>
          <Button className={WRAP} variant="primary" icon={HandCoins} isPending={create.isPending} onPress={() => void save()} data-testid="pay-topup-save">
            {t('payables:petty.requestTopUp')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <InlineAlert tone="warning" title={t('payables:petty.topUpRuleTitle')}>
          {t('payables:petty.topUpRule', { amount: fmt.money(f.imprest) })}
        </InlineAlert>
        <PlainTextField label={t('payables:petty.topUpAmount')} value={amount} onChange={setAmount} inputMode="decimal" dir="ltr" errorKey={fieldErrorKey(error, 'amount')} testId="pay-topup-amount" />
        <PlainTextArea label={t('payables:common.reason')} value={reason} onChange={setReason} errorKey={fieldErrorKey(error, 'reason')} testId="pay-topup-reason" />
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}
