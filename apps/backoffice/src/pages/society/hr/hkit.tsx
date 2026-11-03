import { ApiError, type AccessTarget, type AdvanceState, type AttendanceState, type DocumentStatus, type DutyState, type EmploymentView, type HrRole, type LeaveState, type ShiftKey } from '@repo/contracts';
import { Badge, buttonClass, cn, DateTime, dynamicT, Link, useSession, useT, useToast, type StatusTone } from '@repo/ui';
import { AlarmClock, BadgeCheck, Ban, CalendarClock, CalendarOff, CheckCircle2, CircleDashed, Clock3, FileWarning, Hourglass, Moon, PauseCircle, Search, ShieldAlert, Undo2, UserCheck, UserX, XCircle, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { ComboBox, Input, Label, ListBox, ListBoxItem, Popover } from 'react-aria-components';
import { HR } from '../../../nav.config';

/**
 * Shared pieces of the society HR screens (Gate S.2a): the HR section navigation (every screen one
 * step from every other, shown only to the people allowed), status badges that never rely on colour
 * alone, shift times that say when a night shift ends the next day, a searchable staff picker, and
 * the server's refusals in plain words.
 */

export const T = {
  view: { module: 'hr', permission: 'hr.view' },
  manage: { module: 'hr', permission: 'hr.manage' },
  roster: { module: 'hr', feature: 'hr.shifts', anyOf: ['shifts.manage', 'hr.view', 'attendance.record'] },
  attendance: { module: 'hr', feature: 'hr.shifts', anyOf: ['hr.view', 'attendance.record'] },
  leave: { module: 'hr', anyOf: ['hr.view', 'leave.manage', 'attendance.adjust', 'attendance.record'] },
  advances: { module: 'hr', anyOf: ['hr.advances.manage', 'hr.advances.approve'] },
  documents: { module: 'hr', permission: 'hr.view' },
} as const satisfies Record<string, AccessTarget>;

type Section = 'dashboard' | 'employees' | 'roster' | 'attendance' | 'leave' | 'documents' | 'advances';

const SECTIONS: Array<{ id: Section; href: string; target: AccessTarget }> = [
  { id: 'dashboard', href: HR.dashboard, target: T.view },
  { id: 'employees', href: HR.employees(), target: T.view },
  { id: 'roster', href: HR.roster(), target: T.roster },
  { id: 'attendance', href: HR.attendance(), target: T.attendance },
  { id: 'leave', href: HR.leave(), target: T.leave },
  { id: 'documents', href: HR.documents(), target: T.documents },
  { id: 'advances', href: HR.advances(), target: T.advances },
];

/**
 * A reference such as ANR-AD-0002, or a shift window such as 07:00–15:00, kept on one line in a
 * heading or a choice: a word joiner after each hyphen or dash forbids the line break there (it is
 * invisible and not announced).
 */
const WORD_JOINER = String.fromCharCode(0x2060);
export const unbroken = (ref: string) => ref.replace(/[-–]/g, (c) => c + WORD_JOINER);

/**
 * A time range as plain text (an option label): each time isolated (first-strong isolate … pop
 * directional isolate), so the times are never reordered inside an Urdu line; the range flows in the
 * page's direction and does not break at the dash.
 */
const isolate = (s: string) => String.fromCharCode(0x2068) + s + String.fromCharCode(0x2069);
export const timeRangeText = (start: string, end: string) => `${isolate(start)}–${WORD_JOINER}${isolate(end)}`;

/**
 * A time of day. The organisation's times carry Latin AM/PM in Urdu too: the isolate keeps "7:00 AM"
 * whole instead of letting a right-to-left line reorder its parts.
 */
export function Time({ value }: { value: string }) {
  return (
    <bdi>
      <DateTime value={value} style="time" />
    </bdi>
  );
}

/** The HR section's own navigation: from any HR screen to any other, without the main menu. */
export function HrNav({ current }: { current: Section }) {
  const { t } = useT();
  const { allows } = useSession();
  const items = SECTIONS.filter((s) => allows(s.target));
  if (items.length < 2) return null;
  return (
    <nav aria-label={t('hr:nav.label')} className="-mt-2 mb-5" data-testid="hr-nav">
      <ul className="flex flex-wrap gap-1.5">
        {items.map((s) => (
          <li key={s.id}>
            <Link
              href={s.href}
              variant="plain"
              aria-current={s.id === current ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-9 items-center rounded-pill border px-3 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-focus',
                s.id === current ? 'border-primary bg-primary text-on-primary' : 'border-border bg-panel text-text hover:bg-raised',
              )}
              data-testid={`hr-nav-${s.id}`}
            >
              {t(`hr:nav.${s.id}`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const DUTY: Record<DutyState, [StatusTone, LucideIcon]> = {
  on_duty: ['success', UserCheck],
  late: ['warning', AlarmClock],
  absent: ['error', UserX],
  on_leave: ['info', CalendarOff],
  scheduled: ['neutral', CalendarClock],
  done: ['neutral', CheckCircle2],
  off: ['neutral', CircleDashed],
};

export function DutyBadge({ state, className }: { state: DutyState; className?: string }) {
  const { t } = useT();
  const [tone, icon] = DUTY[state];
  return (
    <Badge tone={tone} icon={icon} className={className} data-testid="duty-state" data-state={state}>
      {t(`hr:duty.${state}`)}
    </Badge>
  );
}

const ATTENDANCE: Record<AttendanceState | 'not_checked_in' | 'not_recorded', [StatusTone, LucideIcon]> = {
  planned: ['neutral', CalendarClock],
  present: ['success', UserCheck],
  late: ['warning', AlarmClock],
  absent: ['error', UserX],
  on_leave: ['info', CalendarOff],
  not_checked_in: ['warning', Hourglass],
  not_recorded: ['warning', FileWarning],
};

export function AttendanceBadge({ state, className }: { state: AttendanceState | 'not_checked_in' | 'not_recorded'; className?: string }) {
  const { t } = useT();
  const [tone, icon] = ATTENDANCE[state];
  return (
    <Badge tone={tone} icon={icon} className={className} data-testid="attendance-state" data-state={state}>
      {t(`hr:attendance.state.${state}`)}
    </Badge>
  );
}

const EMPLOYMENT: Record<EmploymentView, [StatusTone, LucideIcon]> = { active: ['success', BadgeCheck], upcoming: ['info', CalendarClock], suspended: ['warning', PauseCircle], ended: ['neutral', Ban] };

export function EmploymentBadge({ status }: { status: EmploymentView }) {
  const { t } = useT();
  const [tone, icon] = EMPLOYMENT[status];
  return (
    <Badge tone={tone} icon={icon} data-testid="employment-status" data-state={status}>
      {t(`hr:employment.${status}`)}
    </Badge>
  );
}

const DOCUMENT: Record<DocumentStatus, [StatusTone, LucideIcon]> = { valid: ['success', BadgeCheck], expiring: ['warning', Clock3], expired: ['error', XCircle], missing: ['error', FileWarning] };

export function DocumentBadge({ status }: { status: DocumentStatus }) {
  const { t } = useT();
  const [tone, icon] = DOCUMENT[status];
  return (
    <Badge tone={tone} icon={icon} data-testid="document-status" data-state={status}>
      {t(`hr:documents.status.${status}`)}
    </Badge>
  );
}

const ADVANCE: Record<AdvanceState, [StatusTone, LucideIcon]> = { submitted: ['info', Hourglass], approved: ['warning', ShieldAlert], rejected: ['neutral', XCircle], withdrawn: ['neutral', Undo2] };

/** "Approved — payment not verified" is spelled out: an approval never reads as money moved. */
export function AdvanceBadge({ state }: { state: AdvanceState }) {
  const { t } = useT();
  const [tone, icon] = ADVANCE[state];
  return (
    <Badge tone={tone} icon={icon} data-testid="advance-state" data-state={state}>
      {t(`hr:advances.state.${state}`)}
    </Badge>
  );
}

const DECISION: Record<LeaveState | 'pending' | 'approved' | 'rejected', [StatusTone, LucideIcon]> = { pending: ['info', Hourglass], approved: ['success', BadgeCheck], rejected: ['neutral', XCircle], cancelled: ['neutral', Undo2] };

export function DecisionBadge({ state, testId = 'decision-state' }: { state: LeaveState; testId?: string }) {
  const { t } = useT();
  const [tone, icon] = DECISION[state];
  return (
    <Badge tone={tone} icon={icon} data-testid={testId} data-state={state}>
      {t(`hr:decision.${state}`)}
    </Badge>
  );
}

/** "23:00 – 07:00 next day" (times in the organisation's zone; a night shift says it ends the next day). */
export function ShiftTime({ start, end, className }: { start: string; end: string; className?: string }) {
  const { t } = useT();
  const nextDay = new Date(end).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }) !== new Date(start).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
  return (
    // Each time stays whole; the line may break after the dash or before "(next day)" (320 px, 200 % text).
    // Each time is isolated (Time) and the range flows in the page's direction: in Urdu the start time
    // stands on the right, where reading begins.
    <span className={cn('tabular-nums', className)}>
      <span className="whitespace-nowrap">
        <Time value={start} /> –
      </span>{' '}
      <span className="whitespace-nowrap">
        <Time value={end} />
      </span>
      {nextDay && (
        <span className="ms-1 inline-flex items-center gap-0.5 text-xs whitespace-nowrap text-muted">
          <Moon aria-hidden className="size-3" />
          {t('hr:shift.nextDay')}
        </span>
      )}
    </span>
  );
}

/** A shift's name: morning, evening, night, or the department's day shift. */
export function useShiftName() {
  const { t } = useT();
  return (key: ShiftKey, department?: string) => (key === 'day' && department ? t(`hr:shift.dayOf.${department as 'maintenance' | 'housekeeping' | 'office'}`) : t(`hr:shift.${key}`));
}

export const useRole = () => {
  const { t } = useT();
  return (role: HrRole) => t(`hr:role.${role}`);
};

/** Initials in a circle: never a photo of a real person. */
export function Initials({ text, className }: { text: string; className?: string }) {
  return (
    <span aria-hidden className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-pill bg-primary-soft text-sm font-semibold text-primary', className)}>
      {text}
    </span>
  );
}

/** A refusal as a toast: the first field problem, else the summary, in the reader's language. */
export function useProblemToast() {
  const { t } = useT();
  const dt = dynamicT(t);
  const toast = useToast();
  return (e: unknown) => {
    const fields = e instanceof ApiError ? Object.values(e.problem.errors ?? {}).flat() : [];
    toast.error(e instanceof ApiError ? (fields[0] ? dt(fields[0].code, fields[0].params) : dt(e.problem.messageKey)) : t('errors:network.unavailable'));
  };
}

export interface StaffOption {
  id: string;
  name: string;
  role: HrRole;
  hint?: string;
  disabled?: boolean;
}

/** Choose a staff member by typing part of a name, role or code. */
export function StaffSelect({ options, value, onChange, label, testId, description }: { options: StaffOption[]; value: string | null; onChange: (id: string) => void; label: string; testId?: string; description?: string }) {
  const { t } = useT();
  const role = useRole();
  const [typed, setTyped] = useState<string | null>(null);
  const norm = (s: string) => s.toLowerCase().normalize('NFKD');
  return (
    <ComboBox
      className="flex min-w-0 flex-col gap-1.5"
      defaultItems={options}
      selectedKey={value}
      inputValue={typed ?? options.find((o) => o.id === value)?.name ?? ''}
      onInputChange={setTyped}
      onSelectionChange={(key) => {
        if (!key) return;
        setTyped(null);
        onChange(String(key));
      }}
      disabledKeys={options.filter((o) => o.disabled).map((o) => o.id)}
      defaultFilter={(text, input) => norm(text).includes(norm(input))}
      menuTrigger="focus"
      data-testid={testId}
    >
      <Label className="text-sm font-medium text-text">{label}</Label>
      <div className="flex min-h-11 items-center gap-2 rounded-control border border-border-control bg-panel px-3 focus-within:outline-2 focus-within:outline-focus">
        <Search aria-hidden className="size-4 shrink-0 text-muted" />
        <Input placeholder={t('hr:staffSelect.placeholder')} className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-subtle" />
      </div>
      {description && <p className="text-xs text-muted">{description}</p>}
      <Popover placement="bottom start" offset={6} className="w-[--trigger-width] min-w-64 rounded-tile border border-border bg-panel p-1.5 shadow-overlay">
        <ListBox className="max-h-72 overflow-auto outline-none" renderEmptyState={() => <p className="px-3 py-2 text-sm text-muted">{t('hr:staffSelect.none')}</p>}>
          {(o: StaffOption) => (
            <ListBoxItem id={o.id} textValue={`${o.name} ${role(o.role)}`} className="flex cursor-default flex-col rounded-control px-3 py-2 text-sm text-text outline-none data-disabled:opacity-60 data-focused:bg-primary-soft data-selected:font-semibold pointer-coarse:py-3">
              <bdi className="font-medium">{o.name}</bdi>
              <span className="text-xs text-muted">
                {role(o.role)}
                {o.hint ? ` · ${o.hint}` : ''}
              </span>
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}

/** Choose one of a list by typing part of its name (roles, kinds …). */
export function SearchSelect({ options, value, onChange, label, testId, description, errorText }: { options: Array<{ id: string; label: string; hint?: string }>; value: string | null; onChange: (id: string) => void; label: string; testId?: string; description?: string; errorText?: string }) {
  const { t } = useT();
  const [typed, setTyped] = useState<string | null>(null);
  const norm = (s: string) => s.toLowerCase().normalize('NFKD');
  return (
    <ComboBox
      className="flex min-w-0 flex-col gap-1.5"
      defaultItems={options}
      selectedKey={value}
      inputValue={typed ?? options.find((o) => o.id === value)?.label ?? ''}
      onInputChange={setTyped}
      onSelectionChange={(key) => {
        if (!key) return;
        setTyped(null);
        onChange(String(key));
      }}
      isInvalid={!!errorText}
      defaultFilter={(text, input) => norm(text).includes(norm(input))}
      menuTrigger="focus"
      data-testid={testId}
    >
      <Label className="text-sm font-medium text-text">{label}</Label>
      <div className={cn('flex min-h-11 items-center gap-2 rounded-control border bg-panel px-3 focus-within:outline-2 focus-within:outline-focus', errorText ? 'border-error' : 'border-border-control')}>
        <Search aria-hidden className="size-4 shrink-0 text-muted" />
        <Input placeholder={t('hr:staffSelect.typeToFind')} className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-subtle" />
      </div>
      {description && <p className="text-xs text-muted">{description}</p>}
      {errorText && <p className="text-xs font-medium text-error">{errorText}</p>}
      <Popover placement="bottom start" offset={6} className="w-[--trigger-width] min-w-56 rounded-tile border border-border bg-panel p-1.5 shadow-overlay">
        <ListBox className="max-h-72 overflow-auto outline-none" renderEmptyState={() => <p className="px-3 py-2 text-sm text-muted">{t('hr:staffSelect.none')}</p>}>
          {(o: { id: string; label: string; hint?: string }) => (
            <ListBoxItem id={o.id} textValue={o.label} className="flex cursor-default flex-col rounded-control px-3 py-2 text-sm text-text outline-none data-focused:bg-primary-soft data-selected:font-semibold pointer-coarse:py-3">
              <span>{o.label}</span>
              {o.hint && <span className="text-xs text-muted">{o.hint}</span>}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}

/**
 * A field's problem from the server as a translation key for the field (plain fields translate it
 * themselves). A problem that needs values (a minimum length …) marks the field with a general
 * "check this" and is spelled out in full in the form's problem summary.
 */
export function fieldErrorKey(error: unknown, field: string): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  const e = error.problem.errors?.[field]?.[0];
  if (!e) return undefined;
  return e.params ? 'hr:errors.checkField' : e.code;
}

/** The same problem as text (for controls that show text, such as a date or a searchable list). */
export function useFieldError(error: unknown) {
  const { t } = useT();
  const dt = dynamicT(t);
  return (field: string) => {
    if (!(error instanceof ApiError)) return undefined;
    const e = error.problem.errors?.[field]?.[0];
    return e ? dt(e.code, e.params) : undefined;
  };
}

/** A link that looks like a button (navigation, not an action). */
export function LinkButton({ href, variant = 'secondary', size = 'md', icon: Icon, children, testId, className }: { href: string; variant?: 'primary' | 'secondary' | 'quiet'; size?: 'sm' | 'md'; icon?: LucideIcon; children: string; testId?: string; className?: string }) {
  return (
    // A long label wraps inside the button rather than running off a 320 px screen at 200 % text.
    <Link href={href} variant="plain" className={buttonClass(variant, size, cn('max-w-full whitespace-normal text-center', className))} data-testid={testId}>
      {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
      <span>{children}</span>
    </Link>
  );
}

/** A labelled date input (the browser's date picker; the value is a plain date). */
export function DateInput({ id, label, value, onChange, min, max, testId, description }: { id: string; label: string; value: string; onChange: (v: string) => void; min?: string; max?: string; testId?: string; description?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-text">
        {label}
      </label>
      <input id={id} type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.currentTarget.value)} className="block min-h-11 w-full max-w-xs rounded-control border border-border-control bg-bg px-3 text-text" data-testid={testId} />
      {description && <p className="text-xs text-muted">{description}</p>}
    </div>
  );
}

/** Today's business date (the demo's) and helpers on plain dates. */
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const weekStartOf = (date: string) => addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
