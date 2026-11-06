import type { AccessTarget, AgreementVersionState, IssuingModel, LeaseState, PayoutState, RentEvent, RollState, StatementState } from '@repo/contracts';
import { Badge, cn, DateTime, Link, useSession, useT, type StatusTone } from '@repo/ui';
import { Ban, BadgeCheck, CalendarClock, CircleDashed, CircleOff, Clock3, FileCheck2, FileClock, Hourglass, Landmark, Lock, PencilLine, Scale, ShieldAlert, Undo2, type LucideIcon } from 'lucide-react';
import { RENTALS } from '../../nav.config';
import { unbroken } from '../society/hr/hkit';
import { useSocietyFormat } from '../society/kit';

/**
 * Shared pieces of the rentals screens (Gate S.3): the section navigation, state badges that never
 * rely on colour alone and never say "paid", the boundary between contract, demand, money and
 * instruction, the D-33 notice on the issuing model, and an activity list.
 */
export const RENT_VIEW: AccessTarget = { module: 'rentals', permission: 'lease.view' };
export const ROLL_TARGET: AccessTarget = { module: 'rentals', anyOf: ['rent.bill', 'rent.approve'] };
export const STATEMENTS_TARGET: AccessTarget = { module: 'rentals', feature: 'rentals.owner_statements', permission: 'owner_statement.view' };
export const PAYOUTS_TARGET: AccessTarget = { module: 'rentals', feature: 'rentals.owner_payouts', anyOf: ['owner_payout.prepare', 'owner_payout.approve', 'owner_statement.view'] };
export const SETTINGS_TARGET: AccessTarget = { module: 'rentals', permission: 'rentals.configure' };

/** A button whose label wraps at its spaces (320 px with 200 % text, long Urdu labels). */
export const WRAP = 'max-w-full whitespace-normal text-center';

type Section = 'leases' | 'rentRoll' | 'statements' | 'payouts' | 'settings';

const SECTIONS: Array<{ id: Section; href: string; target: AccessTarget }> = [
  { id: 'leases', href: RENTALS.leases(), target: RENT_VIEW },
  { id: 'rentRoll', href: RENTALS.rentRoll(), target: ROLL_TARGET },
  { id: 'statements', href: RENTALS.statements(), target: STATEMENTS_TARGET },
  { id: 'payouts', href: RENTALS.payouts(), target: PAYOUTS_TARGET },
  { id: 'settings', href: RENTALS.settings(), target: SETTINGS_TARGET },
];

/** Each rentals screen one step from every other the person may open. */
export function RentNav({ current }: { current: Section }) {
  const { t } = useT();
  const { allows } = useSession();
  const shown = SECTIONS.filter((s) => allows(s.target));
  if (shown.length < 2) return null;
  return (
    <nav aria-label={t('rentals:nav.label')} className="-mt-2 mb-5" data-testid="rent-nav">
      <ul className="flex flex-wrap gap-1.5">
        {shown.map((s) => (
          <li key={s.id}>
            <Link
              href={s.href}
              variant="plain"
              aria-current={s.id === current ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-9 items-center rounded-pill border px-3 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-focus',
                s.id === current ? 'border-primary bg-primary text-on-primary' : 'border-border bg-panel text-text hover:bg-raised',
              )}
              data-testid={`rent-nav-${s.id}`}
            >
              {t(`rentals:nav.${s.id}`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const LEASE: Record<LeaseState | 'ending', [StatusTone, LucideIcon]> = {
  draft: ['neutral', PencilLine],
  review: ['info', Hourglass],
  active: ['success', BadgeCheck],
  ending: ['warning', CalendarClock],
  ended: ['neutral', Lock],
  terminated: ['neutral', Undo2],
  cancelled: ['neutral', Ban],
};

export function LeaseBadge({ state, ending = false }: { state: LeaseState; ending?: boolean }) {
  const { t } = useT();
  const key = state === 'active' && ending ? 'ending' : state;
  const [tone, icon] = LEASE[key];
  return (
    <Badge tone={tone} icon={icon} data-testid="lease-state" data-state={key}>
      {t(`rentals:leaseState.${key}`)}
    </Badge>
  );
}

const ROLL: Record<RollState, [StatusTone, LucideIcon]> = { not_prepared: ['neutral', CircleDashed], draft: ['info', FileClock], approved: ['warning', ShieldAlert] };

/** "Approved demand — not invoiced" is spelled out: an approval never reads as rent billed or paid. */
export function RollBadge({ state }: { state: RollState }) {
  const { t } = useT();
  const [tone, icon] = ROLL[state];
  return (
    <Badge tone={tone} icon={icon} data-testid="roll-state" data-state={state}>
      {t(`rentals:rollState.${state}`)}
    </Badge>
  );
}

export function StatementBadge({ state }: { state: StatementState }) {
  const { t } = useT();
  return (
    <Badge tone={state === 'issued' ? 'info' : 'neutral'} icon={state === 'issued' ? FileCheck2 : PencilLine} data-testid="statement-state" data-state={state}>
      {t(`rentals:statementState.${state}`)}
    </Badge>
  );
}

const PAYOUT: Record<PayoutState, [StatusTone, LucideIcon]> = { awaiting_approval: ['info', Hourglass], approved: ['warning', ShieldAlert], rejected: ['neutral', CircleOff], cancelled: ['neutral', Ban] };

/** "Approved instruction — not sent": never "sent", never "paid out". */
export function PayoutBadge({ state }: { state: PayoutState }) {
  const { t } = useT();
  const [tone, icon] = PAYOUT[state];
  return (
    <Badge tone={tone} icon={icon} data-testid="payout-state" data-state={state}>
      {t(`rentals:payoutState.${state}`)}
    </Badge>
  );
}

const VERSION: Record<AgreementVersionState, [StatusTone, LucideIcon]> = { draft: ['neutral', PencilLine], scheduled: ['info', Clock3], active: ['success', BadgeCheck], superseded: ['neutral', Lock] };

export function VersionBadge({ state }: { state: AgreementVersionState }) {
  const { t } = useT();
  const [tone, icon] = VERSION[state];
  return (
    <Badge tone={tone} icon={icon} data-testid="version-state" data-state={state}>
      {t(`rentals:versionState.${state}`)}
    </Badge>
  );
}

/** The issuing model, always with its "fictional alternative pending D-33" label. */
export function ModelBadge({ model }: { model: IssuingModel }) {
  const { t } = useT();
  return (
    <Badge tone="neutral" icon={model === 'agent' ? Scale : Landmark} data-testid="issuing-model" data-model={model}>
      {t(`rentals:model.${model}`)}
    </Badge>
  );
}

/** The only settlement status this gate has. */
export function NotSettled({ testId = 'rent-settlement' }: { testId?: string }) {
  const { t } = useT();
  return (
    <Badge tone="neutral" icon={CircleDashed} data-testid={testId} data-state="not_settled">
      {t('rentals:settlement.not_settled')}
    </Badge>
  );
}

/** Contract, demand, money, deposit and instruction: the five things that never mix. */
export function Boundary({ compact = false }: { compact?: boolean }) {
  const { t } = useT();
  return (
    <section aria-labelledby="rent-boundary-title" className="rounded-tile border border-warning/40 bg-warning-soft/40 p-3 text-sm text-text" data-testid="rent-boundary">
      <h2 id="rent-boundary-title" className="font-semibold">
        {t('rentals:boundary.title')}
      </h2>
      {compact ? (
        <p className="mt-1 text-muted">{t('rentals:boundary.short')}</p>
      ) : (
        <ol className="mt-1.5 list-decimal space-y-0.5 ps-5">
          <li>{t('rentals:boundary.lease')}</li>
          <li>{t('rentals:boundary.roll')}</li>
          <li>{t('rentals:boundary.money')}</li>
          <li>{t('rentals:boundary.deposit')}</li>
          <li>{t('rentals:boundary.payout')}</li>
        </ol>
      )}
    </section>
  );
}

/** D-33: the issuing model is a fictional alternative until a legal and tax adviser rules. */
export function D33Note() {
  const { t } = useT();
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted" data-testid="rent-d33">
      <Scale aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 break-words">{unbroken(t('rentals:d33'))}</span>
    </p>
  );
}

export function Activity({ events, testId }: { events: RentEvent[]; testId?: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  // Amounts recorded with an event read as money; references never break at their hyphens.
  const shown = (values: Record<string, string> = {}) =>
    Object.fromEntries(Object.entries(values).map(([k, v]) => [k, /^-?\d+\.\d{2}$/.test(v) ? fmt.money({ amount: v, currency: 'PKR' }) : /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmt.date(v) : /^\d{4}-\d{2}$/.test(v) ? fmt.period(v) : unbroken(v)]));
  if (!events.length) return <p className="text-sm text-muted">{t('rentals:history.none')}</p>;
  return (
    <ol className="space-y-2" data-testid={testId}>
      {[...events].reverse().map((h, i) => (
        <li key={i} className="border-s-2 border-border ps-3 text-sm">
          {t(`rentals:history.${h.action as 'lease_drafted'}`, { defaultValue: h.action, ...shown(h.values) })}
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

/** A masked account: never more than the last four characters. */
export function AccountText({ label, last4, verified }: { label?: string; last4: string; verified: boolean }) {
  const { t } = useT();
  return (
    <span>
      {label ? (
        <>
          <bdi>{label}</bdi> ·{' '}
        </>
      ) : null}
      {t('rentals:account.ending', { last4 })} · {t(verified ? 'rentals:account.verified' : 'rentals:account.unverified')}
    </span>
  );
}

/** "50.00 %" in the reader's numerals is left as written: shares are agreed figures. */
export const share = (s: string) => `${s}%`;
