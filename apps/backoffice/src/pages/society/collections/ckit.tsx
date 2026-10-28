import type { AllocationLine, BankLine, CollectionMethod, CollectionPayment, PaymentAllocation, ProofFile, SubmissionRow, SubmissionState } from '@repo/contracts';
import { Badge, cn, Money, Stepper, useT, type StatusTone, type StepperStep } from '@repo/ui';
import {
  Ban,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  Copy,
  CreditCard,
  FileQuestion,
  FileText,
  Fingerprint,
  Hand,
  Hourglass,
  Landmark,
  Link2,
  Link2Off,
  ScanSearch,
  ScrollText,
  SearchX,
  TriangleAlert,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { ScrollRegion, useSocietyFormat } from '../kit';

/**
 * Shared pieces of the collections screens (Gate C.2): states that never rely on colour alone, the
 * bank-match signal, a stand-in for the uploaded proof (the prototype keeps no files), allocation
 * tables, and the compact progress of a proof.
 */

const SUBMISSION: Record<SubmissionState, [StatusTone, LucideIcon]> = {
  submitted: ['info', Hourglass],
  under_review: ['warning', ScanSearch],
  needs_information: ['warning', FileQuestion],
  verified: ['success', CheckCircle2],
  rejected: ['error', XCircle],
};

export function SubmissionStateBadge({ state, className }: { state: SubmissionState; className?: string }) {
  const { t } = useT();
  const [tone, icon] = SUBMISSION[state];
  return (
    <Badge tone={tone} icon={icon} className={className} data-testid="submission-state" data-state={state}>
      {t(`collections:states.${state}`)}
    </Badge>
  );
}

const MATCH: Record<SubmissionRow['match'], [StatusTone, LucideIcon]> = {
  exact: ['success', Link2],
  possible: ['info', ScanSearch],
  already_matched: ['error', Copy],
  none: ['neutral', SearchX],
};

export function MatchBadge({ match, className }: { match: SubmissionRow['match']; className?: string }) {
  const { t } = useT();
  const [tone, icon] = MATCH[match];
  return (
    <Badge tone={tone} icon={icon} className={className} data-testid="match-badge" data-match={match}>
      {t(`collections:match.${match}`)}
    </Badge>
  );
}

const METHOD: Record<CollectionMethod, LucideIcon> = { bank_transfer: Landmark, office_cash: Banknote, cheque: ScrollText, online: CreditCard };

export function MethodBadge({ method }: { method: CollectionMethod }) {
  const { t } = useT();
  return (
    <Badge tone="neutral" icon={METHOD[method]}>
      {t(`collections:method.${method}`)}
    </Badge>
  );
}

const VERIFICATION: Record<CollectionPayment['verification'], [StatusTone, LucideIcon]> = { bank_matched: ['success', Link2], manual: ['warning', Hand], counter: ['info', Banknote] };

export function VerificationBadge({ verification }: { verification: CollectionPayment['verification'] }) {
  const { t } = useT();
  const [tone, icon] = VERIFICATION[verification];
  return (
    <Badge tone={tone} icon={icon} data-testid="verification-badge" data-verification={verification}>
      {t(`collections:verification.${verification}`)}
    </Badge>
  );
}

const LINE: Record<BankLine['state'] | 'unidentified', [StatusTone, LucideIcon]> = { matched: ['success', Link2], unmatched: ['warning', Link2Off], excluded: ['neutral', Ban], unidentified: ['error', TriangleAlert] };

export function BankLineBadge({ state, unidentified }: { state: BankLine['state']; unidentified?: boolean }) {
  const { t } = useT();
  const key = state === 'unmatched' && unidentified ? 'unidentified' : state;
  const [tone, icon] = LINE[key];
  return (
    <Badge tone={tone} icon={icon} data-testid="bank-line-state" data-state={key}>
      {t(`collections:bankState.${key}`)}
    </Badge>
  );
}

/**
 * What the resident uploaded. The prototype stores the file's description, not the file, so the
 * screen draws a labelled stand-in that shows what the reviewer would look for (a readable slip, a
 * blurred photo, a transfer to another account, a PDF).
 */
export function ProofPreview({ file, amount, reference, date, payer, testId = 'proof-preview' }: { file: ProofFile; amount: string; reference: string; date: string; payer: string; testId?: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const look = file.look ?? (file.type === 'application/pdf' ? 'document' : 'transfer_slip');
  const sizeKb = Math.max(1, Math.round(file.size / 1024));
  return (
    <figure className="space-y-2" data-testid={testId} data-look={look}>
      <div className="relative overflow-hidden rounded-tile border border-border bg-gradient-to-b from-sunken to-panel p-4" aria-hidden>
        <div className={cn('mx-auto max-w-72 rounded-control bg-panel p-4 shadow-card', look === 'blurry' && 'blur-[3px]')}>
          {look === 'document' ? (
            <div className="flex flex-col items-center gap-2 py-6 text-muted">
              <FileText className="size-10" />
              <bdi dir="ltr" className="ltr-ref text-xs">{file.name}</bdi>
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text">{t('collections:proof.slipBank')}</span>
                <BadgeCheck className="size-4 text-success" />
              </div>
              <p className="text-figure-xs font-bold tracking-tight text-text">
                <bdi dir="ltr" className="ltr-ref">{fmt.money({ amount, currency: 'PKR' })}</bdi>
              </p>
              <dl className="space-y-1 text-muted">
                <div className="flex justify-between gap-3">
                  <dt>{t('collections:proof.slipTo')}</dt>
                  <dd className={cn('text-end', look === 'other_account' ? 'font-semibold text-error' : 'text-text')}>
                    <bdi dir="ltr" className="ltr-ref">{look === 'other_account' ? 'PK19DEMO0000009999000012' : 'PK36DEMO0000001234567890'}</bdi>
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>{t('collections:proof.slipRef')}</dt>
                  <dd className="text-text"><bdi dir="ltr" className="ltr-ref">{reference}</bdi></dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>{t('collections:proof.slipDate')}</dt>
                  <dd className="text-text">{fmt.date(date)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>{t('collections:proof.slipFrom')}</dt>
                  <dd className="text-text"><bdi>{payer}</bdi></dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <Fingerprint aria-hidden className="size-3.5" />
          <bdi dir="ltr" className="ltr-ref">{file.name}</bdi>
        </span>
        <span>{t('collections:proof.size', { kb: sizeKb })}</span>
        <span className="font-medium text-text">{t(`collections:proof.look.${look}`)}</span>
        <span>{t('collections:proof.standIn')}</span>
      </figcaption>
    </figure>
  );
}

/** Lines a payment settles (or would settle): which invoice, which flat, which charge, how much. */
export function AllocationTable({ lines, unapplied, label, edit, testId = 'allocation-table' }: { lines: Array<AllocationLine | PaymentAllocation>; unapplied?: { amount: string; currency: 'PKR' }; label: string; edit?: (line: AllocationLine) => ReactNode; testId?: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  return (
    <ScrollRegion label={label}>
      <table className="w-full min-w-[34rem] text-sm" data-testid={testId}>
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr className="border-b border-border text-start text-xs text-muted">
            <th scope="col" className="py-2 pe-3 text-start font-medium">{t('collections:allocation.invoice')}</th>
            <th scope="col" className="py-2 pe-3 text-start font-medium">{t('collections:allocation.charge')}</th>
            <th scope="col" className="py-2 pe-3 text-start font-medium">{t('collections:allocation.due')}</th>
            {'open' in (lines[0] ?? {}) && <th scope="col" className="py-2 pe-3 text-end font-medium">{t('collections:allocation.open')}</th>}
            <th scope="col" className="py-2 text-end font-medium">{t('collections:allocation.amount')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.lineId} className="border-b border-border/60" data-testid="allocation-line" data-kind={l.kind} data-flat={l.unitCode}>
              <td className="py-2 pe-3">
                <bdi dir="ltr" className="ltr-ref font-medium text-text">{l.invoiceRef}</bdi>
                <span className="block text-xs text-muted"><bdi dir="ltr" className="ltr-ref">{l.unitCode}</bdi> · {fmt.period(l.period)}</span>
              </td>
              <td className="py-2 pe-3 text-text">{l.kind === 'opening_balance' ? t('collections:allocation.opening') : t(`billing:categories.${l.category ?? 'maintenance'}`)}</td>
              <td className="py-2 pe-3 text-muted">{'dueOn' in l ? fmt.date(l.dueOn) : '—'}</td>
              {'open' in l && <td className="py-2 pe-3 text-end text-muted"><Money value={l.open} /></td>}
              <td className="py-2 text-end font-semibold text-text">{edit && 'open' in l ? edit(l) : <Money value={l.amount} />}</td>
            </tr>
          ))}
          {lines.length === 0 && (
            <tr>
              <td colSpan={5} className="py-3 text-sm text-muted">{t('collections:allocation.none')}</td>
            </tr>
          )}
        </tbody>
        {unapplied && (
          <tfoot>
            <tr>
              <th scope="row" colSpan={'open' in (lines[0] ?? {}) ? 4 : 3} className="pt-3 pe-3 text-start text-xs font-medium text-muted">{t('collections:allocation.unapplied')}</th>
              <td className="pt-3 text-end font-semibold text-text" data-testid="allocation-unapplied"><Money value={unapplied} /></td>
            </tr>
          </tfoot>
        )}
      </table>
    </ScrollRegion>
  );
}

/** A proof's progress, for staff and residents alike: sent → reviewed → verified (or what stopped it). */
export function SubmissionStepper({ state, versions, testId = 'submission-stepper' }: { state: SubmissionState; versions: number; testId?: string }) {
  const { t } = useT();
  const steps: StepperStep[] = [
    { id: 'submitted', label: versions > 1 ? t('collections:steps.resubmitted') : t('collections:steps.submitted'), state: 'done' },
    {
      id: 'review',
      label: state === 'needs_information' ? t('collections:steps.needsInformation') : t('collections:steps.review'),
      state: state === 'submitted' ? 'upcoming' : state === 'under_review' ? 'current' : state === 'needs_information' ? 'waiting' : 'done',
    },
    {
      id: 'decision',
      label: state === 'rejected' ? t('collections:steps.rejected') : t('collections:steps.verified'),
      state: state === 'verified' ? 'done' : state === 'rejected' ? 'failed' : 'upcoming',
    },
    { id: 'receipt', label: t('collections:steps.receipt'), state: state === 'verified' ? 'done' : 'upcoming' },
  ];
  if (state === 'submitted') steps[1] = { ...steps[1]!, state: 'current' };
  return <Stepper steps={steps} label={t('collections:steps.label')} testId={testId} />;
}

