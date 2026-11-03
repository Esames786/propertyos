import { ADVANCE_KINDS, type AdvanceKind, type AdvancesList, type AdvanceState, type SettlementCandidates, type StaffAdvanceView } from '@repo/contracts';
import { Button, ConfirmDialog, DateTime, Drawer, EmptyState, ErrorState, FilterPills, InlineAlert, Link, Money, PageHeader, Panel, PlainTextArea, PlainTextField, SelectControl, useApiMutation, useApiQuery, useQueryParam, useQueryParams, useT, useToast } from '@repo/ui';
import { Check, HandCoins, Info, Link2, Plus, Undo2, X } from 'lucide-react';
import { useState } from 'react';
import { HR } from '../../../nav.config';
import { Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { AdvanceBadge, fieldErrorKey, HrNav, StaffSelect, unbroken, useProblemToast } from './hkit';

/**
 * HR-007 staff advances and loans, and HR-008 their settlement. A request has a repayment plan and
 * evidence; someone else with hr.advances.approve decides it (never the requester, never the staff
 * member). An approval is an instruction only: nothing is paid and nothing is owed until a payment
 * voucher already posted in the cashbook (S.1) is linked as evidence; only posted receipts linked
 * the same way reduce what is owed. Paying staff by bank and deducting instalments from pay need
 * payroll and outgoing bank payments (S.2b), which are not built: settlement is PARTIAL.
 */
const VIEWS = ['open', 'submitted', 'approved', 'disbursed', 'closed', 'all'] as const;
type View = (typeof VIEWS)[number];
const inView = (v: View, s: AdvanceState) => (v === 'all' ? true : v === 'open' ? s === 'submitted' || s === 'approved' || s === 'disbursed' : v === 'closed' ? s === 'repaid' || s === 'rejected' || s === 'withdrawn' : s === v);

export function AdvancesPage() {
  const { t } = useT();
  const [status] = useQueryParam('status');
  const setParams = useQueryParams();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const view: View = (VIEWS as readonly string[]).includes(status ?? '') ? (status as View) : 'open';
  const q = useApiQuery<AdvancesList>({ method: 'GET', path: '/hr/advances' });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  const shown = d.items.filter((a) => inView(view, a.state));
  const selected = d.items.find((a) => a.id === open);
  return (
    <div className="@container space-y-5" data-testid="hr-advances">
      <PageHeader
        title={t('hr:advances.title')}
        description={t('hr:advances.intro')}
        actions={
          d.canRequest ? (
            <Button variant="primary" icon={Plus} onPress={() => setCreating(true)} data-testid="hr-advance-new">
              {t('hr:advances.new')}
            </Button>
          ) : undefined
        }
      />
      <HrNav current="advances" />
      <InlineAlert tone="warning" title={t('hr:advances.ruleTitle')} data-testid="hr-advances-rule">
        {t('hr:advances.neverPaid')}
      </InlineAlert>
      <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
        <Panel title={t('hr:advances.approvedNotPaid')}>
          <p className="text-xl font-semibold text-text" data-testid="hr-advances-not-paid">
            <Money value={d.totals.approvedNotPaid} />
          </p>
          <p className="text-xs text-muted">{t('hr:advances.approvedNotPaidNote')}</p>
        </Panel>
        <Panel title={t('hr:advances.owed')}>
          <p className="text-xl font-semibold text-text" data-testid="hr-advances-owed">
            <Money value={d.totals.outstanding} />
          </p>
          <p className="text-xs text-muted">
            {t('hr:advances.owedNote')} <Link href={HR.settlement()}>{t('hr:advances.toSettlement')}</Link>
          </p>
        </Panel>
      </div>
      <FilterPills label={t('hr:advances.show')} value={view} onChange={(v) => setParams({ status: v === 'open' ? null : v })} options={VIEWS.map((v) => ({ id: v, label: t(`hr:advances.view.${v}`), count: d.items.filter((a) => inView(v, a.state)).length }))} testId="hr-advances-show" />
      {shown.length === 0 ? (
        <EmptyState title={t('hr:advances.empty')} />
      ) : (
        <ul className="space-y-2" data-testid="hr-advance-rows">
          {shown.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => setOpen(a.id)} className="grid w-full gap-2 rounded-tile border border-border/70 bg-panel p-3 text-start shadow-card outline-none hover:bg-raised focus-visible:outline-2 focus-visible:outline-focus @3xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] @3xl:items-center" data-testid="hr-advance-row" data-ref={a.ref} data-state={a.state}>
                <span className="min-w-0">
                  <bdi className="block font-semibold text-text">{a.employeeName}</bdi>
                  <span className="block text-xs text-muted">
                    <bdi dir="ltr">{a.ref}</bdi> · {t(`hr:advances.kind.${a.kind}`)} · {t('hr:advances.instalments', { count: a.instalments })}
                  </span>
                </span>
                <span className="text-sm">
                  <Money value={a.amount} />
                  {a.state === 'disbursed' && (
                    <span className="block text-xs text-muted">
                      {t('hr:advances.owes')} <Money value={a.outstanding} />
                    </span>
                  )}
                </span>
                <AdvanceBadge state={a.state} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && <AdvanceDrawer advance={selected} onClose={() => setOpen(null)} />}
      {d.canRequest && <AdvanceRequestDrawer key={String(creating)} open={creating} onClose={() => setCreating(false)} staff={d.staff} firstMonth={nextMonth(d.today)} />}
    </div>
  );
}

function AdvanceDrawer({ advance: a, onClose }: { advance: StaffAdvanceView; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const problem = useProblemToast();
  const fmt = useSocietyFormat();
  const act = useApiMutation<StaffAdvanceView>();
  const [deciding, setDeciding] = useState<'approve' | 'reject' | 'withdraw' | null>(null);
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={`${unbroken(a.ref)} · ${a.employeeName}`}
      subtitle={t(`hr:advances.kind.${a.kind}`)}
      size="lg"
      testId="hr-advance-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {a.actions.withdraw && (
            <Button variant="quiet" icon={Undo2} onPress={() => setDeciding('withdraw')} data-testid="hr-advance-withdraw">
              {t('hr:advances.withdraw')}
            </Button>
          )}
          {a.actions.reject && (
            <Button icon={X} onPress={() => setDeciding('reject')} data-testid="hr-advance-reject">
              {t('hr:decision.reject')}
            </Button>
          )}
          {a.actions.approve && (
            <Button variant="primary" icon={Check} onPress={() => setDeciding('approve')} data-testid="hr-advance-approve">
              {t('hr:advances.approve')}
            </Button>
          )}
          {(a.actions.linkDisbursement || a.actions.linkRepayment) && (
            <Link href={HR.settlement(a.id)} className="self-center text-sm" data-testid="hr-advance-to-settlement">
              {t(a.actions.linkDisbursement ? 'hr:advances.recordPayment' : 'hr:advances.recordRepayment')}
            </Link>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <p className="flex flex-wrap items-center gap-2">
          <AdvanceBadge state={a.state} />
          <span className="text-lg font-semibold text-text">
            <Money value={a.amount} />
          </span>
        </p>
        {a.state === 'approved' && (
          <InlineAlert tone="warning" data-testid="hr-advance-not-paid">
            {t('hr:advances.approvedExplain')}
          </InlineAlert>
        )}
        {a.blocked && (
          <p className="flex items-center gap-1.5 text-sm text-muted" data-testid="hr-advance-blocked">
            <Info aria-hidden className="size-4 shrink-0" />
            {t(`hr:decision.blocked.${a.blocked}`)}
          </p>
        )}
        <p className="text-sm break-words text-text">“{a.reason}”</p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">{t('hr:advances.requested')}</dt>
          <dd>
            <bdi>{a.requestedByName}</bdi> · <DateTime value={a.requestedAt} style="date" />
          </dd>
          {a.decidedByName && (
            <>
              <dt className="text-muted">{t('hr:advances.decided')}</dt>
              <dd>
                <bdi>{a.decidedByName}</bdi> · <DateTime value={a.decidedAt!} style="date" />
                {a.decisionNote ? ` · “${a.decisionNote}”` : ''}
              </dd>
            </>
          )}
          <dt className="text-muted">{t('hr:advances.evidence')}</dt>
          <dd className="break-words">{a.evidence.map((f) => f.name).join(', ')}</dd>
          <dt className="text-muted">{t('hr:advances.owes')}</dt>
          <dd data-testid="hr-advance-outstanding">
            <Money value={a.outstanding} />
          </dd>
        </dl>
        <section aria-labelledby="hr-adv-plan" className="space-y-2">
          <h3 id="hr-adv-plan" className="text-sm font-semibold text-text">
            {t('hr:advances.plan')}
          </h3>
          <p className="text-xs text-muted">{t('hr:advances.planNote')}</p>
          <ol className="space-y-1" data-testid="hr-advance-plan">
            {a.schedule.map((s) => (
              <li key={s.n} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border px-3 py-1.5 text-sm">
                <span>
                  {t('hr:advances.instalment', { n: s.n })} · {fmt.period(s.month)}
                </span>
                <span className="flex items-center gap-2">
                  <Money value={s.amount} />
                  <span className={s.state === 'received' ? 'text-xs font-medium text-success' : 'text-xs text-muted'}>{t(`hr:advances.instalmentState.${s.state}`)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
        {(a.disbursement || a.repayments.length > 0) && (
          <section aria-labelledby="hr-adv-evidence" className="space-y-2">
            <h3 id="hr-adv-evidence" className="text-sm font-semibold text-text">
              {t('hr:advances.settledBy')}
            </h3>
            <ul className="space-y-1 text-sm">
              {[...(a.disbursement ? [{ ...a.disbursement, what: 'disbursement' as const }] : []), ...a.repayments.map((r) => ({ ...r, what: 'repayment' as const }))].map((l) => (
                <li key={l.voucherId} className="break-words">
                  {t(`hr:advances.link.${l.what}`)} · <bdi dir="ltr">{l.voucherRef}</bdi> · <Money value={l.amount} /> · {l.accountName} · {fmt.date(l.postedOn)}
                </li>
              ))}
            </ul>
          </section>
        )}
        <section aria-labelledby="hr-adv-history" className="space-y-2">
          <h3 id="hr-adv-history" className="text-sm font-semibold text-text">
            {t('hr:e360.activity')}
          </h3>
          <ol className="space-y-2">
            {[...a.history].reverse().map((h, i) => (
              <li key={i} className="border-s-2 border-border ps-3 text-sm">
                {t(`hr:history.${h.action as 'advance_requested'}`, { defaultValue: h.action, ...(h.values ?? {}) })}
                <span className="block text-xs text-muted">
                  <bdi>{h.byName}</bdi> · <bdi><DateTime value={h.at} style="dateTime" /></bdi>
                </span>
                {h.note && <span className="block text-xs break-words text-muted">“{h.note}”</span>}
              </li>
            ))}
          </ol>
        </section>
      </div>
      <ConfirmDialog
        isOpen={!!deciding}
        onOpenChange={(o) => !o && setDeciding(null)}
        title={deciding ? t(`hr:advances.confirm.${deciding}`, { ref: a.ref }) : ''}
        effect={deciding ? t(`hr:advances.effect.${deciding}`, { name: a.employeeName }) : ''}
        confirmLabel={deciding === 'approve' ? t('hr:advances.approve') : deciding === 'reject' ? t('hr:decision.reject') : t('hr:advances.withdraw')}
        destructive={deciding !== 'approve'}
        {...(deciding && deciding !== 'approve' ? { reasonLabel: t('hr:decision.reason') } : {})}
        onConfirm={async (note) => {
          if (!deciding) return;
          try {
            await act.mutateAsync({ method: 'POST', path: `/hr/advances/${a.id}/${deciding}`, body: deciding === 'withdraw' ? { reason: note } : note ? { note } : {} });
            toast.success(t(`hr:advances.done.${deciding}`, { ref: a.ref }));
          } catch (e) {
            problem(e);
          }
          setDeciding(null);
        }}
      />
    </Drawer>
  );
}

const FILE_ACCEPT = 'application/pdf,image/jpeg,image/png';

const nextMonth = (date: string) => new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 1)).toISOString().slice(0, 7);

function AdvanceRequestDrawer({ open, onClose, staff, firstMonth: defaultMonth }: { open: boolean; onClose: () => void; staff: AdvancesList['staff']; firstMonth: string }) {
  const { t } = useT();
  const toast = useToast();
  const [who, setWho] = useState<string | null>(null);
  const [kind, setKind] = useState<AdvanceKind>('advance');
  const [amount, setAmount] = useState('');
  const [instalments, setInstalments] = useState('1');
  const [firstMonth, setFirstMonth] = useState(defaultMonth);
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<{ name: string; type: string; sizeBytes: number } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const save = useApiMutation<StaffAdvanceView>();
  const close = () => {
    setError(null);
    onClose();
  };
  return (
    <Drawer
      isOpen={open}
      onOpenChange={(o) => !o && close()}
      title={t('hr:advances.new')}
      subtitle={t('hr:advances.newSubtitle')}
      testId="hr-advance-request"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onPress={close}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="primary"
            isPending={save.isPending}
            isDisabled={!who}
            onPress={async () => {
              setError(null);
              try {
                const a = await save.mutateAsync({ method: 'POST', path: '/hr/advances', body: { employeeId: who, kind, amount, instalments: Number(instalments), firstMonth, reason, evidence: file ? [file] : [] } });
                toast.success(t('hr:advances.requestedToast', { ref: a.ref }));
                close();
              } catch (e) {
                setError(e);
              }
            }}
            data-testid="hr-advance-submit"
          >
            {t('hr:advances.submit')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <StaffSelect label={t('hr:advances.employee')} options={staff.map((s) => ({ id: s.id, name: s.name, role: s.role }))} value={who} onChange={setWho} testId="hr-advance-employee" />
        <SelectControl label={t('hr:advances.kindLabel')} value={kind} onChange={(v) => v && setKind(v as AdvanceKind)} options={ADVANCE_KINDS.map((k) => ({ id: k, label: t(`hr:advances.kind.${k}`) }))} description={t(`hr:advances.kindHint.${kind}`)} testId="hr-advance-kind" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PlainTextField label={t('hr:advances.amount')} value={amount} onChange={setAmount} inputMode="decimal" dir="ltr" testId="hr-advance-amount" {...(fieldErrorKey(error, 'amount') ? { errorKey: fieldErrorKey(error, 'amount')! } : {})} />
          <PlainTextField label={t('hr:advances.instalmentsLabel')} value={instalments} onChange={setInstalments} inputMode="numeric" dir="ltr" description={t(`hr:advances.instalmentsHint.${kind}`)} testId="hr-advance-instalments" {...(fieldErrorKey(error, 'instalments') ? { errorKey: fieldErrorKey(error, 'instalments')! } : {})} />
        </div>
        <div className="space-y-1">
          <label htmlFor="hr-adv-month" className="block text-sm font-medium text-text">
            {t('hr:advances.firstMonth')}
          </label>
          <input id="hr-adv-month" type="month" value={firstMonth} onChange={(e) => setFirstMonth(e.currentTarget.value)} className="block min-h-11 w-full max-w-xs rounded-control border border-border-control bg-bg px-3 text-text" data-testid="hr-advance-month" />
        </div>
        <PlainTextArea label={t('hr:advances.reason')} value={reason} onChange={setReason} rows={3} testId="hr-advance-reason" {...(fieldErrorKey(error, 'reason') ? { errorKey: fieldErrorKey(error, 'reason')! } : {})} />
        <div className="space-y-1">
          <label htmlFor="hr-adv-file" className="block text-sm font-medium text-text">
            {t('hr:advances.evidenceLabel')}
          </label>
          <input id="hr-adv-file" type="file" accept={FILE_ACCEPT} onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            setFile(f ? { name: f.name, type: f.type, sizeBytes: f.size } : null);
          }} className="block w-full text-sm text-text file:me-3 file:min-h-10 file:rounded-control file:border file:border-border-control file:bg-panel file:px-3 file:text-sm file:font-medium" data-testid="hr-advance-file" />
          <p className="text-xs text-muted">{t('hr:documents.fileHint')}</p>
        </div>
        <InlineAlert tone="info">{t('hr:advances.noPolicy')}</InlineAlert>
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}

/** HR-008: obligations evidenced only by posted cashbook vouchers (PARTIAL: no bank or payroll leg). */
export function SettlementPage() {
  const { t } = useT();
  const toast = useToast();
  const problem = useProblemToast();
  const fmt = useSocietyFormat();
  const [advanceParam] = useQueryParam('advance');
  const setParams = useQueryParams();
  const list = useApiQuery<AdvancesList>({ method: 'GET', path: '/hr/advances' });
  const open = (list.data?.items ?? []).filter((a) => a.state === 'approved' || a.state === 'disbursed');
  const selected = open.find((a) => a.id === advanceParam) ?? open[0];
  const purpose = selected?.state === 'disbursed' ? 'repayment' : 'disbursement';
  const candidates = useApiQuery<SettlementCandidates>(selected && list.data?.canRequest ? { method: 'GET', path: `/hr/advances/${selected.id}/candidates`, query: { purpose } } : null);
  const link = useApiMutation<StaffAdvanceView>();
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  if (!list.data) return <Loading lines={8} />;
  return (
    <div className="@container space-y-5" data-testid="hr-settlement">
      <PageHeader title={t('hr:settlement.title')} description={t('hr:settlement.intro')} breadcrumbs={[{ label: t('hr:advances.title'), href: HR.advances() }]} />
      <HrNav current="advances" />
      <InlineAlert tone="warning" title={t('hr:settlement.partialTitle')} data-testid="hr-settlement-partial">
        {t('hr:settlement.partial')}
      </InlineAlert>
      {open.length === 0 ? (
        <EmptyState title={t('hr:settlement.empty')} />
      ) : (
        <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Panel title={t('hr:settlement.toSettle')}>
            <ul className="space-y-2" data-testid="hr-settlement-list">
              {open.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => setParams({ advance: a.id })} aria-pressed={a.id === selected?.id} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-tile border border-border px-3 py-2 text-start text-sm outline-none hover:bg-raised focus-visible:outline-2 focus-visible:outline-focus aria-pressed:border-primary aria-pressed:bg-primary-soft/40" data-testid="hr-settlement-advance" data-ref={a.ref}>
                    <span className="min-w-0">
                      <bdi className="block font-medium">{a.employeeName}</bdi>
                      <span className="block text-xs text-muted">
                        <bdi dir="ltr">{a.ref}</bdi> · <Money value={a.amount} />
                      </span>
                    </span>
                    <AdvanceBadge state={a.state} />
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          {selected && (
            <Panel title={t(`hr:settlement.purpose.${purpose}`, { ref: unbroken(selected.ref) })} description={t(`hr:settlement.purposeNote.${purpose}`)}>
              <p className="mb-3 text-sm">
                {t('hr:settlement.expected')} <Money value={candidates.data?.expected ?? (purpose === 'disbursement' ? selected.amount : selected.outstanding)} />
              </p>
              {!list.data.canRequest ? (
                <p className="text-sm text-muted">{t('hr:settlement.readOnly')}</p>
              ) : !candidates.data ? (
                <Loading lines={3} />
              ) : candidates.data.vouchers.length === 0 ? (
                <EmptyState title={t('hr:settlement.noVouchers')} body={t(`hr:settlement.noVouchersHint.${purpose}`)} />
              ) : (
                <ul className="space-y-2" data-testid="hr-settlement-vouchers">
                  {candidates.data.vouchers.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border px-3 py-2 text-sm" data-testid="hr-settlement-voucher" data-ref={v.ref} data-eligible={v.eligible}>
                      <span className="min-w-0 flex-1 basis-[min(100%,16rem)]">
                        <span className="block font-medium">
                          <bdi dir="ltr">{v.ref}</bdi> · <Money value={v.amount} />
                        </span>
                        <span className="block text-xs break-words text-muted">
                          {v.accountName} · {fmt.date(v.postedOn)} · {v.description}
                        </span>
                        {!v.eligible && <span className="block text-xs text-warning">{t(`hr:settlement.why.${v.reason!}`)}</span>}
                      </span>
                      {v.eligible && (
                        <Button
                          size="sm"
                          variant="primary"
                          icon={Link2}
                          isPending={link.isPending}
                          onPress={async () => {
                            try {
                              await link.mutateAsync({ method: 'POST', path: `/hr/advances/${selected.id}/link`, body: { purpose, voucherId: v.id } });
                              toast.success(t(`hr:settlement.linked.${purpose}`, { ref: v.ref }));
                            } catch (e) {
                              problem(e);
                            }
                          }}
                          data-testid="hr-settlement-link"
                        >
                          {t('hr:settlement.link')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted">
                <HandCoins aria-hidden className="me-1 inline size-3.5" />
                {t('hr:settlement.cashbookNote')}
              </p>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
