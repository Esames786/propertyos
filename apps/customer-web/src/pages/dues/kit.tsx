import type { ResidentBillStatus, SubmissionState } from '@repo/contracts';
import { Badge, cn, Stepper, useT, useTransport, type StatusTone, type StepperStep } from '@repo/ui';
import { CheckCircle2, CircleAlert, Clock3, FileQuestion, Hourglass, Link2, Link2Off, ScanSearch, Smile, XCircle, type LucideIcon } from 'lucide-react';
import { useCallback, useSyncExternalStore } from 'react';

/**
 * Pieces of the resident dues screens (Gate C.2). Words carry every state (never colour alone); a
 * proof is "Pending verification" until finance verifies it, never "Paid".
 */

const STATUS: Record<ResidentBillStatus, [StatusTone, LucideIcon]> = {
  unpaid: ['warning', Clock3],
  overdue: ['error', CircleAlert],
  partially_paid: ['warning', Hourglass],
  paid: ['success', CheckCircle2],
  pending_verification: ['info', Hourglass],
  nothing_due: ['success', Smile],
};

export function BillStatusChip({ status, className }: { status: ResidentBillStatus; className?: string }) {
  const { t } = useT();
  const [tone, icon] = STATUS[status];
  return (
    <Badge tone={tone} icon={icon} className={className} data-testid="bill-status" data-status={status}>
      {t(`dues:status.${status}`)}
    </Badge>
  );
}

const PROOF: Record<SubmissionState, [StatusTone, LucideIcon]> = {
  submitted: ['info', Hourglass],
  under_review: ['info', ScanSearch],
  needs_information: ['warning', FileQuestion],
  verified: ['success', CheckCircle2],
  rejected: ['error', XCircle],
};

/** The resident's words for a proof's state ("Pending verification", never "Paid" before it is). */
export function ProofStateChip({ state, className }: { state: SubmissionState; className?: string }) {
  const { t } = useT();
  const [tone, icon] = PROOF[state];
  return (
    <Badge tone={tone} icon={icon} className={className} data-testid="proof-state" data-state={state}>
      {t(`dues:proofState.${state}`)}
    </Badge>
  );
}

/** Sent → checked by the office → verified → receipt (or what stopped it), compact on phones. */
export function ProofStepper({ state, resubmitted }: { state: SubmissionState; resubmitted?: boolean }) {
  const { t } = useT();
  const steps: StepperStep[] = [
    { id: 'sent', label: resubmitted ? t('dues:steps.resent') : t('dues:steps.sent'), state: 'done' },
    { id: 'check', label: state === 'needs_information' ? t('dues:steps.needsInfo') : t('dues:steps.check'), state: state === 'submitted' || state === 'under_review' ? 'current' : state === 'needs_information' ? 'waiting' : 'done' },
    { id: 'decision', label: state === 'rejected' ? t('dues:steps.rejected') : t('dues:steps.verified'), state: state === 'verified' ? 'done' : state === 'rejected' ? 'failed' : 'upcoming' },
    { id: 'receipt', label: t('dues:steps.receipt'), state: state === 'verified' ? 'done' : 'upcoming' },
  ];
  return <Stepper steps={steps} label={t('dues:steps.label')} testId="proof-stepper" />;
}

/**
 * Prototype notice: whether this app's society demo is linked with the office app of this browser
 * (a proof sent here reaches finance there), or kept in this app only.
 */
export function DemoLinkNote({ className }: { className?: string }) {
  const { t } = useT();
  const { transport } = useTransport();
  // Follows the link as it changes (the office app may answer after a slow first load).
  const subscribe = useCallback((onChange: () => void) => transport.subscribe?.(onChange) ?? (() => undefined), [transport]);
  const status = useSyncExternalStore(subscribe, () => transport.linkStatus?.() ?? 'none');
  if (status === 'none') return null;
  const Icon = status === 'linked' ? Link2 : Link2Off;
  return (
    <p className={cn('flex items-start gap-1.5 text-xs text-muted', className)} data-testid="demo-link" data-status={status}>
      <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      {t(`dues:demoLink.${status}`)}
    </p>
  );
}

/** Calendar helpers on the data's clock ("due in 15 days"). */
export function daysUntil(today: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export const DEMO_TODAY = '2026-10-26';
