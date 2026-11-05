import type { AccessTarget, PayEvent, PayInstructionState, PayPeriodState, PayRunState } from '@repo/contracts';
import { Badge, cn, DateTime, Link, useSession, useT, type StatusTone } from '@repo/ui';
import { Ban, BadgeCheck, CircleDashed, FileClock, Hourglass, Lock, LockOpen, PencilLine, Send, ShieldAlert, Undo2, type LucideIcon } from 'lucide-react';
import { PAYROLL } from '../../../nav.config';

/**
 * Shared pieces of the payroll screens (Gate S.2b): the section navigation (each screen one step
 * from every other), status badges that never rely on colour alone and never say "paid", the
 * three-part boundary (owed / instructed / paid) and an activity list.
 */
export const PAY_TARGET: AccessTarget = { module: 'payroll', permission: 'payroll.view' };

/** A button whose label wraps at its spaces (320 px with 200 % text, long Urdu labels). */
export const WRAP = 'max-w-full whitespace-normal text-center';

type Section = 'dashboard' | 'periods' | 'run' | 'finalisation' | 'disbursement' | 'accounting';

const SECTIONS: Array<{ id: Section; href: string }> = [
  { id: 'dashboard', href: PAYROLL.dashboard },
  { id: 'periods', href: PAYROLL.periods() },
  { id: 'run', href: PAYROLL.run() },
  { id: 'finalisation', href: PAYROLL.finalisation() },
  { id: 'disbursement', href: PAYROLL.disbursement() },
  { id: 'accounting', href: PAYROLL.accounting() },
];

export function PayNav({ current }: { current: Section }) {
  const { t } = useT();
  const { allows } = useSession();
  if (!allows(PAY_TARGET)) return null;
  return (
    <nav aria-label={t('payroll:nav.label')} className="-mt-2 mb-5" data-testid="pay-nav">
      <ul className="flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <Link
              href={s.href}
              variant="plain"
              aria-current={s.id === current ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-9 items-center rounded-pill border px-3 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-focus',
                s.id === current ? 'border-primary bg-primary text-on-primary' : 'border-border bg-panel text-text hover:bg-raised',
              )}
              data-testid={`pay-nav-${s.id}`}
            >
              {t(`payroll:nav.${s.id}`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const PERIOD: Record<PayPeriodState, [StatusTone, LucideIcon]> = { draft: ['neutral', PencilLine], open: ['info', LockOpen], closed: ['neutral', Lock] };

export function PeriodBadge({ state }: { state: PayPeriodState }) {
  const { t } = useT();
  const [tone, icon] = PERIOD[state];
  return (
    <Badge tone={tone} icon={icon} data-testid="pay-period-state" data-state={state}>
      {t(`payroll:period.state.${state}`)}
    </Badge>
  );
}

const RUN: Record<PayRunState, [StatusTone, LucideIcon]> = { draft: ['neutral', PencilLine], submitted: ['info', Hourglass], approved: ['warning', ShieldAlert], reversed: ['neutral', Undo2] };

/** "Approved obligation — not paid" is spelled out: an approval never reads as money moved. */
export function RunBadge({ state, className }: { state: PayRunState; className?: string }) {
  const { t } = useT();
  const [tone, icon] = RUN[state];
  return (
    <Badge tone={tone} icon={icon} className={className} data-testid="pay-run-state" data-state={state}>
      {t(`payroll:runState.${state}`)}
    </Badge>
  );
}

const INSTRUCTION: Record<PayInstructionState, [StatusTone, LucideIcon]> = { prepared: ['info', FileClock], approved: ['warning', BadgeCheck], sent_simulated: ['warning', Send], cancelled: ['neutral', Ban] };

export function InstructionBadge({ state }: { state: PayInstructionState }) {
  const { t } = useT();
  const [tone, icon] = INSTRUCTION[state];
  return (
    <Badge tone={tone} icon={icon} data-testid="pay-instruction-state" data-state={state}>
      {t(`payroll:instructionState.${state}`)}
    </Badge>
  );
}

/** The only settlement status this gate has. */
export function NotSettled() {
  const { t } = useT();
  return (
    <Badge tone="neutral" icon={CircleDashed} data-testid="pay-settlement" data-state="not_settled">
      {t('payroll:settlement.not_settled')}
    </Badge>
  );
}

/** Owed, instructed and paid: the three things that never mix. */
export function Boundary({ compact = false }: { compact?: boolean }) {
  const { t } = useT();
  return (
    <section aria-labelledby="pay-boundary-title" className="rounded-tile border border-warning/40 bg-warning-soft/40 p-3 text-sm text-text" data-testid="pay-boundary">
      <h2 id="pay-boundary-title" className="font-semibold">
        {t('payroll:boundary.title')}
      </h2>
      {!compact && (
        <ol className="mt-1.5 list-decimal space-y-0.5 ps-5">
          <li>{t('payroll:boundary.run')}</li>
          <li>{t('payroll:boundary.instruction')}</li>
          <li>{t('payroll:boundary.settlement')}</li>
        </ol>
      )}
      {compact && <p className="mt-1 text-muted">{t('payroll:boundary.settlement')}</p>}
    </section>
  );
}

export function Activity({ events, testId }: { events: PayEvent[]; testId?: string }) {
  const { t } = useT();
  return (
    <ol className="space-y-2" data-testid={testId}>
      {[...events].reverse().map((h, i) => (
        <li key={i} className="border-s-2 border-border ps-3 text-sm">
          {t(`payroll:history.${h.action as 'run_prepared'}`, { defaultValue: h.action, ...(h.values ?? {}) })}
          <span className="block text-xs text-muted">
            <bdi>{h.byName}</bdi> ·{' '}
            <bdi>
              <DateTime value={h.at} style="dateTime" />
            </bdi>
          </span>
          {h.note && <span className="block text-xs break-words text-muted">“{h.note}”</span>}
        </li>
      ))}
    </ol>
  );
}

/** A masked account ("Account ending 0201, verified"): never more than the last four characters. */
export function AccountText({ last4, verified }: { last4: string; verified: boolean }) {
  const { t } = useT();
  return (
    <span>
      {t('payroll:account.ending', { last4 })} · {t(verified ? 'payroll:account.verified' : 'payroll:account.unverified')}
    </span>
  );
}
