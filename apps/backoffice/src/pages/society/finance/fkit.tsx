import type { ApprovalDetail, BatchStatus, CashbookEvidence, ChequeStatus, Money as MoneyValue, PeriodState, TransferStatus, VoucherStatus } from '@repo/contracts';
import { Badge, buttonClass, cn, DateTime, InlineAlert, Link, useApiQuery, useT, type StatusTone } from '@repo/ui';
import {
  Ban,
  BadgeCheck,
  CheckCircle2,
  CircleDashed,
  Clock3,
  FileCheck2,
  FileText,
  Hand,
  Hourglass,
  Landmark,
  Lock,
  LockOpen,
  RotateCcw,
  Send,
  ShieldCheck,
  Truck,
  Undo2,
  UsersRound,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { FINANCE } from '../../../nav.config';
import { useSocietyFormat } from '../kit';

/**
 * Shared pieces of the S.1 screens: state badges with an icon and words (never colour alone), the
 * wording the owner requires for money that is not settled, evidence in plain words, and the
 * approval panel every subject shows (who asked, under which rule, who decided, what remains).
 */

const badge = <K extends string>(table: Record<K, [StatusTone, LucideIcon]>, ns: string) =>
  function StateBadge({ state, testId }: { state: K; testId?: string }) {
    const { t } = useT();
    const [tone, icon] = table[state];
    return (
      <Badge tone={tone} icon={icon} data-testid={testId} data-state={state}>
        {t(`finance:${ns}.${state}` as 'finance:voucherState.draft')}
      </Badge>
    );
  };

export const VoucherBadge = badge<VoucherStatus>(
  { draft: ['neutral', CircleDashed], submitted: ['warning', Hourglass], approved: ['info', BadgeCheck], posted: ['success', CheckCircle2], rejected: ['error', XCircle], withdrawn: ['neutral', Ban] },
  'voucherState',
);

export const TransferBadge = badge<TransferStatus>(
  { draft: ['neutral', CircleDashed], awaiting_approval: ['warning', Hourglass], approved_instruction: ['info', FileCheck2], in_transit: ['warning', Truck], settled: ['success', CheckCircle2], rejected: ['error', XCircle], cancelled: ['neutral', Ban] },
  'transferState',
);

export const ChequeBadge = badge<ChequeStatus>(
  { received: ['info', Hand], deposited: ['warning', Landmark], exception_pending: ['warning', Hourglass], cleared: ['success', CheckCircle2], returned: ['error', Undo2], cancelled: ['neutral', Ban], reversed: ['error', RotateCcw] },
  'chequeState',
);

export const BatchBadge = badge<BatchStatus>({ draft: ['neutral', CircleDashed], submitted: ['warning', Hourglass], confirmed: ['success', UsersRound], returned: ['error', Undo2] }, 'batchState');

export const PeriodBadge = badge<PeriodState>({ open: ['info', LockOpen], closing: ['warning', Clock3], closed: ['neutral', Lock], reopened: ['warning', LockOpen] }, 'periodState');

export const ApprovalBadge = badge<'pending' | 'approved' | 'rejected' | 'withdrawn'>(
  { pending: ['warning', Hourglass], approved: ['success', ShieldCheck], rejected: ['error', XCircle], withdrawn: ['neutral', Ban] },
  'approvalState',
);

/** "Approved instruction — not sent": an approval is never a settlement. */
export function InstructionNotice({ testId = 'instruction-notice' }: { testId?: string }) {
  const { t } = useT();
  return (
    <InlineAlert tone="info" title={t('finance:wording.instruction')} data-testid={testId}>
      <p>{t('finance:wording.instructionBody')}</p>
    </InlineAlert>
  );
}

/** "Cheque received — not a receipt of payment". */
export function ChequeNotice({ testId = 'cheque-notice' }: { testId?: string }) {
  const { t } = useT();
  return (
    <InlineAlert tone="info" title={t('finance:wording.cheque')} data-testid={testId}>
      <p>{t('finance:wording.chequeBody')}</p>
    </InlineAlert>
  );
}

/** Sample statements are labelled as in C.2: "Sample: …" and "Demo document, fictional data". */
export function SampleNotice({ fileName }: { fileName?: string }) {
  const { t } = useT();
  return (
    <InlineAlert tone="warning" title={fileName ? t('finance:wording.sampleNamed', { name: fileName }) : t('finance:wording.sample')} data-testid="sample-notice">
      <p>{t('finance:wording.sampleBody')}</p>
    </InlineAlert>
  );
}

/** What a cashbook line was settled on, in words (with the bank transaction where there is one). */
export function EvidenceText({ evidence }: { evidence: CashbookEvidence }) {
  const { t } = useT();
  switch (evidence.kind) {
    case 'statement_line':
      return (
        <span>
          {t(evidence.exception ? 'finance:evidence.lineException' : 'finance:evidence.line')} <bdi dir="ltr" className="ltr-ref">{evidence.bankTxnId}</bdi>
        </span>
      );
    case 'witnessed_count':
      return <span>{t('finance:evidence.witnessedCount', { counted: evidence.countedByName, witness: evidence.witnessedByName })}</span>;
    case 'witnessed_slip':
      return (
        <span>
          {t('finance:evidence.slip', { witness: evidence.witnessedByName })} <bdi dir="ltr" className="ltr-ref">{evidence.slipNo}</bdi>
        </span>
      );
    case 'counter':
      return <span>{t('finance:evidence.counter', { name: evidence.byName })}</span>;
    case 'voucher':
      return (
        <span>
          {t('finance:evidence.voucher', { approver: evidence.approvedByName })} · <bdi>{evidence.evidenceName}</bdi>
        </span>
      );
    case 'handover':
      return <span>{t('finance:evidence.handover', { document: evidence.document, approver: evidence.approvedByName })}</span>;
    case 'approval':
      return (
        <span>
          {t('finance:evidence.approval', { approver: evidence.approvedByName })} <bdi dir="ltr" className="ltr-ref">{evidence.approvalRef}</bdi>
        </span>
      );
  }
}

/**
 * The approval a record waits for or went through: the rule that applied (from the policy version in
 * force), each decision with how the person was eligible, and what remains. Deciding happens in
 * Approval 360 (APR-002/003); this panel links there.
 */
export function ApprovalPanel({ approvalId, testId = 'approval-panel' }: { approvalId: string; testId?: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const q = useApiQuery<ApprovalDetail>({ method: 'GET', path: `/approvals/${approvalId}` });
  if (!q.data) return null;
  const { request, evaluation } = q.data;
  const required = request.rule.approvalsRequired;
  return (
    <section className="space-y-3 rounded-tile border border-border/70 bg-sunken/40 p-4" aria-label={t('finance:approval.title')} data-testid={testId} data-status={request.status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-text">
          {t('finance:approval.title')} · <bdi dir="ltr" className="ltr-ref">{request.ref}</bdi>
        </p>
        <ApprovalBadge state={request.status} />
      </div>
      <p className="text-sm text-muted">
        {t('finance:approval.rule', { version: request.policy.version, count: required })}
        {request.rule.minAmount || request.rule.maxAmount ? ` · ${request.rule.minAmount ? t('finance:approval.from', { amount: fmt.money(request.rule.minAmount) }) : ''}${request.rule.maxAmount ? ` ${t('finance:approval.below', { amount: fmt.money(request.rule.maxAmount) })}` : ''}` : ''}
      </p>
      {request.decisions.length > 0 && (
        <ul className="space-y-1 text-sm">
          {request.decisions.map((d) => (
            <li key={`${d.by}-${d.at}`} className="flex flex-wrap items-center gap-2">
              {d.decision === 'approve' ? <CheckCircle2 aria-hidden className="size-4 text-success" /> : <XCircle aria-hidden className="size-4 text-error" />}
              <span>
                {t(d.decision === 'approve' ? 'finance:approval.approvedBy' : 'finance:approval.rejectedBy', { name: d.byName })}
                {d.as.kind === 'delegate' ? ` · ${t('finance:approval.asDelegate', { name: d.as.forName })}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      {request.status === 'pending' && (
        <p className="text-sm text-text" data-testid="approval-remaining">
          {t('finance:approval.remaining', { count: evaluation.remaining })}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Link href={FINANCE.approval(request.id)} data-testid="open-approval">
          {t('finance:approval.open')}
        </Link>
        {evaluation.you.canDecide && (
          <Link href={FINANCE.approval(request.id, 'decide')} variant="plain" className={buttonClass('secondary', 'sm', 'gap-2')} data-testid="approval-decide-here">
            <Send aria-hidden className="size-4" />
            {t('finance:approval.decide')}
          </Link>
        )}
      </div>
    </section>
  );
}

/** A long action label wraps instead of widening the page (320 px at 200 % text). */
export const WRAP = 'max-w-full whitespace-normal text-start';
/**
 * A large amount on a narrow phone with large text: it may break between the currency and the number
 * (the formatter joins them with a no-break space), never inside the number unless nothing else fits.
 */
export function WrapMoney({ value, className }: { value: MoneyValue; className?: string }) {
  const fmt = useSocietyFormat();
  return (
    <bdi dir="ltr" className={cn('ltr-ref whitespace-normal [overflow-wrap:anywhere]', className)} data-amount={value.amount}>
      {fmt.money(value).replace(/[\u00a0\u202f]/g, ' ')}
    </bdi>
  );
}

/** A row of facts (label: value) for drawers. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-text [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export function FactGrid({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 @md:grid-cols-2" data-testid={testId}>
      {children}
    </dl>
  );
}

export const EvidenceIcon = FileText;

/** A record's history, oldest first: when, who, what (and the note as entered). */
export function HistoryList({ items, label, testId = 'history-list' }: { items: Array<{ at: string; byName: string; label: string; note?: string }>; label: string; testId?: string }) {
  return (
    <ol className="relative space-y-3 border-s border-border ps-5" aria-label={label} data-testid={testId}>
      {items.map((h, i) => (
        <li key={`${h.at}-${i}`} className="relative text-sm">
          <span aria-hidden className="absolute -start-[1.6rem] top-1.5 size-2.5 rounded-pill bg-border-control" />
          <p className="text-text">
            <bdi className="font-medium">{h.byName}</bdi> · {h.label}
          </p>
          {h.note ? (
            <p className="text-xs text-muted">
              <bdi>{h.note}</bdi>
            </p>
          ) : null}
          <p className="text-xs text-muted">
            <DateTime value={h.at} style="dateTime" />
          </p>
        </li>
      ))}
    </ol>
  );
}
