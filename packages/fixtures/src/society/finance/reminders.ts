import type { ReminderChannel, ReminderPolicy, ReminderPreviewRow, ReminderSkip, ReminderStep } from '@repo/contracts';
import { money } from './model';

/**
 * Reminder rules (COL-007/009, D-36). Pure and table-tested: who receives what, on which channel,
 * and why everyone else is skipped. Only the liable payer is reminded; never a payer who has paid,
 * whose proof is pending in any C.2 state (one that needs information gets that request instead),
 * or whose cheque waits to clear; SMS and WhatsApp need recorded consent and the metered feature,
 * and wait outside quiet hours; at most N a month; the same step is never sent twice.
 */

export interface ReminderTarget {
  billingAccountId: string;
  accountNo: string;
  partyId: string;
  payerName: string;
  flats: string[];
  /** Open and overdue amounts of this payer's own lines (paisa). */
  open: bigint;
  overdue: bigint;
  /** Due date of the oldest open line. */
  oldestDue?: string;
  proof: 'none' | 'pending' | 'needs_information';
  chequePending: boolean;
  consents: Record<Exclude<ReminderChannel, 'in_app'>, boolean>;
  /** Reminders sent to this payer this month (distinct sends). */
  sentThisMonth: number;
  /** `${offsetDays}|${channel}` already sent for the current bill. */
  alreadySent: ReadonlySet<string>;
}

export interface ReminderPlanInput {
  policy: Pick<ReminderPolicy, 'steps' | 'quietHours' | 'monthlyCap' | 'status'>;
  today: string;
  /** Local time of day of the send ("HH:MM"). */
  clock: string;
  licensed: Record<Exclude<ReminderChannel, 'in_app'>, boolean>;
  /** A manual send (COL-009): the step in force, or the first step when none is due yet. */
  manual?: boolean;
}

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The step in force: the latest whose offset (days after the due date) has been reached. */
export function stepFor(steps: readonly ReminderStep[], oldestDue: string | undefined, today: string): ReminderStep | null {
  if (!oldestDue) return null;
  const late = days(oldestDue, today);
  return [...steps].sort((a, b) => a.offsetDays - b.offsetDays).filter((s) => s.offsetDays <= late).at(-1) ?? null;
}

/** Quiet hours wrap midnight (21:00–09:00): the time is inside when after `from` or before `to`. */
export function inQuietHours(clock: string, quiet: { from: string; to: string }): boolean {
  return quiet.from > quiet.to ? clock >= quiet.from || clock < quiet.to : clock >= quiet.from && clock < quiet.to;
}

export function planFor(target: ReminderTarget, input: ReminderPlanInput): ReminderPreviewRow & { step: number | null } {
  const base = { billingAccountId: target.billingAccountId, accountNo: target.accountNo, partyId: target.partyId, payerName: target.payerName, flats: target.flats, amount: money(target.open), overdue: money(target.overdue) };
  const all = (skip: ReminderSkip, channels: readonly ReminderChannel[] = ['in_app']) => ({ ...base, step: null, channels: channels.map((channel) => ({ channel, outcome: 'skip' as const, skip })) });
  if (target.open <= 0n) return all('paid');
  if (target.proof === 'pending') return all('proof_pending');
  if (target.proof === 'needs_information') return all('needs_information');
  if (target.chequePending) return all('cheque_pending');
  const step = stepFor(input.policy.steps, target.oldestDue, input.today) ?? (input.manual ? ([...input.policy.steps].sort((a, b) => a.offsetDays - b.offsetDays)[0] ?? null) : null);
  if (!step) return all('not_due_yet');
  if (target.sentThisMonth >= input.policy.monthlyCap) return { ...all('monthly_cap', step.channels), step: step.offsetDays };
  const quiet = inQuietHours(input.clock, input.policy.quietHours);
  return {
    ...base,
    step: step.offsetDays,
    channels: step.channels.map((channel) => {
      if (target.alreadySent.has(`${step.offsetDays}|${channel}`)) return { channel, outcome: 'skip' as const, skip: 'already_sent' as const };
      if (channel === 'in_app') return { channel, outcome: 'send' as const };
      if (!input.licensed[channel]) return { channel, outcome: 'skip' as const, skip: 'channel_not_licensed' as const };
      if (!target.consents[channel]) return { channel, outcome: 'skip' as const, skip: 'no_consent' as const };
      if (quiet) return { channel, outcome: 'defer' as const, skip: 'quiet_hours' as const };
      return { channel, outcome: 'send' as const };
    }),
  };
}
