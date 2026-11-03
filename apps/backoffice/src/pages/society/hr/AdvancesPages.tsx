import { ADVANCE_KINDS, type AdvanceKind, type AdvancesList, type AdvanceState, type StaffAdvanceView } from '@repo/contracts';
import { Button, ConfirmDialog, DateTime, Drawer, EmptyState, ErrorState, FilterPills, InlineAlert, Link, Money, PageHeader, Panel, PlainTextArea, PlainTextField, SelectControl, useApiMutation, useApiQuery, useQueryParam, useQueryParams, useT, useToast } from '@repo/ui';
import { Check, CircleDashed, Info, Plus, Undo2, X } from 'lucide-react';
import { useState } from 'react';
import { HR } from '../../../nav.config';
import { Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { AdvanceBadge, fieldErrorKey, HrNav, StaffSelect, unbroken, useProblemToast } from './hkit';

/**
 * HR-007 staff advances and loans, and HR-008 their settlement. A request has a repayment plan and
 * evidence; someone else with hr.advances.approve decides it (never the requester, never the staff
 * member). An approval is an instruction only.
 *
 * Gate S.2a closure (Issue #12, owner decision O8): a payment or repayment cannot be verified yet.
 * The cashbook has no staff-advance voucher subject or category, and a voucher of the same amount
 * proves nothing about this employee or this advance. So nothing is shown as paid, received or owed.
 * Settlement (HR-008) is a read-only PARTIAL page explaining what verification will need (S.2b).
 */
const VIEWS = ['open', 'submitted', 'approved', 'closed', 'all'] as const;
type View = (typeof VIEWS)[number];
const inView = (v: View, s: AdvanceState) => (v === 'all' ? true : v === 'open' ? s === 'submitted' || s === 'approved' : v === 'closed' ? s === 'rejected' || s === 'withdrawn' : s === v);

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
      <Panel title={t('hr:advances.approvedUnverified')}>
        <p className="text-xl font-semibold text-text" data-testid="hr-advances-unverified">
          <Money value={d.totals.approvedUnverified} />
        </p>
        <p className="text-xs text-muted">
          {t('hr:advances.approvedUnverifiedNote')} <Link href={HR.settlement()}>{t('hr:advances.toSettlement')}</Link>
        </p>
      </Panel>
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
          <InlineAlert tone="warning" data-testid="hr-advance-unverified">
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
          <dt className="text-muted">{t('hr:advances.payment')}</dt>
          <dd data-testid="hr-advance-payment" data-payment={a.payment}>
            <span className="inline-flex items-center gap-1.5 text-muted">
              <CircleDashed aria-hidden className="size-4 shrink-0" />
              {t('hr:advances.paymentUnverified')}
            </span>{' '}
            <Link href={HR.settlement()}>{t('hr:advances.toSettlement')}</Link>
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
                  <span className="text-xs text-muted">{t(`hr:advances.instalmentState.${s.state}`)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
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

const NEEDS = ['subject', 'category', 'entity', 'direction', 'amount', 'posted', 'approval'] as const;

/**
 * HR-008 (PARTIAL, read only). Approved advances and loans with their payment marked "not verified",
 * and what a verified payment will need. No voucher is listed (finance records stay in the cashbook)
 * and nothing can be linked: the server refuses any link (Issue #12, owner decision O8).
 */
export function SettlementPage() {
  const { t } = useT();
  const list = useApiQuery<AdvancesList>({ method: 'GET', path: '/hr/advances' });
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  if (!list.data) return <Loading lines={8} />;
  const approved = list.data.items.filter((a) => a.state === 'approved');
  return (
    <div className="@container space-y-5" data-testid="hr-settlement">
      <PageHeader title={t('hr:settlement.title')} description={t('hr:settlement.intro')} breadcrumbs={[{ label: t('hr:advances.title'), href: HR.advances() }]} />
      <HrNav current="advances" />
      <InlineAlert tone="warning" title={t('hr:settlement.partialTitle')} data-testid="hr-settlement-partial">
        {t('hr:settlement.partial')}
      </InlineAlert>
      <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title={t('hr:settlement.approved')}>
          {approved.length === 0 ? (
            <EmptyState title={t('hr:settlement.empty')} />
          ) : (
            <ul className="space-y-2" data-testid="hr-settlement-list">
              {approved.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border px-3 py-2 text-sm" data-testid="hr-settlement-advance" data-ref={a.ref} data-payment={a.payment}>
                  <span className="min-w-0">
                    <bdi className="block font-medium">{a.employeeName}</bdi>
                    <span className="block text-xs text-muted">
                      <bdi dir="ltr">{a.ref}</bdi> · <Money value={a.amount} />
                    </span>
                  </span>
                  <AdvanceBadge state={a.state} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={t('hr:settlement.needsTitle')}>
          <ul className="space-y-2 text-sm" data-testid="hr-settlement-needs">
            {NEEDS.map((n) => (
              <li key={n} className="flex items-start gap-2">
                <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                <span className="min-w-0 break-words">{t(`hr:settlement.needs.${n}`)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
