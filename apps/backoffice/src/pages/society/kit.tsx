import { ApiError, type BillingRunEvent, type BillingRunState, type CustomerInvoice, type FlatFact, type Money as MoneyValue, type OccupancyStatus, type SiteStructure } from '@repo/contracts';
import { formatCalendarDate, formatMoney, formatMoneyCompact, formatNumber, useLocale } from '@repo/i18n';
import { Badge, cn, DateTime, dynamicT, InlineAlert, Link, SkeletonBlock, Stepper, useApiQuery, useNavigation, useT, type StatusTone, type StepperStep } from '@repo/ui';
import {
  BadgeCheck,
  Ban,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleDashed,
  Clock3,
  DoorOpen,
  Eye,
  Home,
  Hourglass,
  KeyRound,
  Landmark,
  RefreshCw,
  Search,
  Send,
  TriangleAlert,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { ComboBox, Input, Label, ListBox, ListBoxItem, Popover, TextField } from 'react-aria-components';
import { SOCIETY } from '../../nav.config';

/**
 * Shared pieces of the society screens (Gate C.1): formatting, state badges that never rely on
 * colour alone, the server's problems in plain words, effective-dated facts, the billing-run
 * progress and a flat finder that opens Flat 360 from anywhere.
 */

export function useSocietyFormat() {
  const { locale } = useLocale();
  return {
    locale,
    count: (n: number) => formatNumber(n, locale),
    money: (m: MoneyValue) => formatMoney(m, locale),
    compact: (m: MoneyValue) => formatMoneyCompact(m, locale, 1),
    /** "November 2026" in the reader's language. */
    period: (p: string) => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${p}-01T00:00:00Z`)),
    date: (iso: string) => formatCalendarDate(iso.slice(0, 10), locale),
  };
}
export type SocietyFormat = ReturnType<typeof useSocietyFormat>;

const RUN: Record<BillingRunState, [StatusTone, LucideIcon]> = {
  DRAFT: ['neutral', CircleDashed],
  PREVIEWED: ['info', Eye],
  APPROVAL_PENDING: ['warning', Hourglass],
  APPROVED: ['success', BadgeCheck],
  POSTED: ['success', CheckCircle2],
  NOTIFIED: ['success', Send],
  CANCELLED: ['neutral', XCircle],
};

export function RunStateBadge({ state, stale, className }: { state: BillingRunState; stale?: boolean; className?: string }) {
  const { t } = useT();
  const [tone, icon] = RUN[state];
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)} data-testid="run-state" data-state={state}>
      <Badge tone={tone} icon={icon}>
        {t(`billing:runState.${state}`)}
      </Badge>
      {stale && (
        <Badge tone="warning" icon={RefreshCw}>
          {t('billing:run.staleBadge')}
        </Badge>
      )}
    </span>
  );
}

const OCCUPANCY: Record<OccupancyStatus, [StatusTone, LucideIcon]> = {
  owner_occupied: ['success', Home],
  tenant_occupied: ['info', KeyRound],
  vacant: ['neutral', DoorOpen],
  association_use: ['neutral', Landmark],
};

export function OccupancyBadge({ occupancy, className }: { occupancy: OccupancyStatus; className?: string }) {
  const { t } = useT();
  const [tone, icon] = OCCUPANCY[occupancy];
  return (
    <Badge tone={tone} icon={icon} className={className}>
      {t(`sites:occupancy.${occupancy}`)}
    </Badge>
  );
}

export function SettlementBadge({ invoice, className }: { invoice: Pick<CustomerInvoice, 'settlement' | 'overdue'>; className?: string }) {
  const { t } = useT();
  if (invoice.overdue) {
    return (
      <Badge tone="error" icon={TriangleAlert} className={className}>
        {t('billing:settlement.overdue')}
      </Badge>
    );
  }
  const spec: Record<CustomerInvoice['settlement'], [StatusTone, LucideIcon]> = {
    unpaid: ['warning', Clock3],
    partially_paid: ['warning', Hourglass],
    paid: ['success', CheckCircle2],
    credited: ['neutral', Ban],
  };
  const [tone, icon] = spec[invoice.settlement];
  return (
    <Badge tone={tone} icon={icon} className={className}>
      {t(`billing:settlement.${invoice.settlement}`)}
    </Badge>
  );
}

/** An honest future state: what arrives later, and in which gate. Never a fake number. */
export function LaterBadge({ gate, className }: { gate: string; className?: string }) {
  const { t } = useT();
  return (
    <Badge tone="neutral" icon={CalendarClock} className={className}>
      {t('billing:later.badge', { gate })}
    </Badge>
  );
}

/** The server's refusal in plain words: the summary and every field problem it named. */
export function ProblemAlert({ error, className }: { error: unknown; className?: string }) {
  const { t } = useT();
  const dt = dynamicT(t);
  if (!(error instanceof ApiError)) {
    return (
      <InlineAlert tone="error" role="alert" className={className}>
        {t('errors:network.unavailable')}
      </InlineAlert>
    );
  }
  const p = error.problem;
  const fields = Object.entries(p.errors ?? {}).flatMap(([field, list]) => list.map((e, i) => ({ key: `${field}-${i}`, text: dt(e.code, e.params) })));
  return (
    <InlineAlert tone="error" role="alert" title={dt(p.messageKey)} className={className}>
      {fields.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 ps-5" data-testid="problem-fields">
          {fields.map((f) => (
            <li key={f.key}>{f.text}</li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs text-muted">{t('billing:problem.nothingChanged')}</p>
    </InlineAlert>
  );
}

/**
 * A wide table's horizontal scroller: keyboard-focusable and named, so its hidden columns can be
 * reached without a mouse (WCAG 2.1.1; axe scrollable-region-focusable).
 */
export function ScrollRegion({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className={cn('overflow-x-auto rounded-control outline-none focus-visible:outline-2 focus-visible:outline-focus', className)}>
      {children}
    </div>
  );
}

/** Loading placeholder with a spoken status. */
export function Loading({ lines = 6, label }: { lines?: number; label?: string }) {
  const { t } = useT();
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{label ?? t('common:state.loading')}</span>
      <SkeletonBlock lines={lines} />
    </div>
  );
}

/** Effective-dated facts (ownership, occupancy, liability): current first, history kept and dated. */
export function FactList({ facts, today, emptyText, testId, renderExtra, hidePerson }: { facts: FlatFact[]; today: string; emptyText: string; testId?: string; renderExtra?: (f: FlatFact) => ReactNode; /** On the person's own page: no link to themselves. */ hidePerson?: boolean }) {
  const { t } = useT();
  if (!facts.length) return <p className="text-sm text-muted">{emptyText}</p>;
  return (
    <ol className="space-y-2" data-testid={testId}>
      {facts.map((f) => {
        const current = f.from <= today && (f.to === undefined || today < f.to);
        const upcoming = f.from > today;
        return (
          <li key={f.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 rounded-tile border px-3 py-2.5', current ? 'border-primary/30 bg-primary-soft/40' : 'border-border bg-panel')} data-current={current || undefined}>
            <span className="min-w-0 flex-1">
              {hidePerson ? (
                <span className="font-semibold text-text">{t(`sites:roles.${f.role}`)}</span>
              ) : (
                <Link href={SOCIETY.person(f.partyId)} className="font-semibold">
                  <bdi>{f.partyName}</bdi>
                </Link>
              )}
              <span className="block text-xs text-muted">
                {f.to ? (
                  <>
                    <DateTime value={f.from} style="calendar" /> – <DateTime value={f.to} style="calendar" />
                  </>
                ) : (
                  <>
                    {t('sites:facts.since')} <DateTime value={f.from} style="calendar" />
                  </>
                )}
              </span>
            </span>
            {renderExtra?.(f)}
            <Badge tone={current ? 'success' : upcoming ? 'info' : 'neutral'} icon={current ? Check : upcoming ? CalendarClock : Clock3}>
              {current ? t('sites:facts.current') : upcoming ? t('sites:facts.upcoming') : t('sites:facts.ended')}
            </Badge>
          </li>
        );
      })}
    </ol>
  );
}

const STEPS: BillingRunState[] = ['DRAFT', 'PREVIEWED', 'APPROVAL_PENDING', 'APPROVED', 'POSTED', 'NOTIFIED'];

/**
 * A billing run's progress as a compact, responsive stepper (owner, C.1 review): every state in
 * order and who moved it; on a phone, one row of segments with the current step named.
 */
export function RunProgress({ state, history, compact = false }: { state: BillingRunState; history: BillingRunEvent[]; compact?: boolean }) {
  const { t } = useT();
  const at = STEPS.indexOf(state);
  const lastFor = (s: BillingRunState) => [...history].reverse().find((h) => h.to === s && !h.replay);
  if (state === 'CANCELLED') {
    const c = lastFor('CANCELLED');
    return (
      <p className="flex items-center gap-2 text-sm text-muted" data-testid="run-progress" data-state={state}>
        <XCircle aria-hidden className="size-4" />
        {t('billing:run.cancelledBy', { name: c?.byName ?? '' })}
      </p>
    );
  }
  const steps: StepperStep[] = STEPS.map((s, i) => {
    const event = lastFor(s);
    return {
      id: s,
      label: t(`billing:runState.${s}`),
      state: i < at || (i === at && state === 'NOTIFIED') ? 'done' : i === at ? 'current' : 'upcoming',
      ...(event && i <= at && !compact ? { detail: <bdi>{event.byName}</bdi> } : {}),
    };
  });
  return (
    <div data-testid="run-progress" data-state={state}>
      <Stepper steps={steps} label={t('billing:run.progressLabel')} />
    </div>
  );
}

/**
 * Open any flat's 360 from anywhere: type part of a flat number ("A-10", "b5"). Intelligent: matches
 * with or without the dash, and shows who lives there and who pays, so the right flat is chosen.
 */
export function FlatJump({ siteId, className, testId = 'flat-jump' }: { siteId: string; className?: string; testId?: string }) {
  const { t } = useT();
  const { navigate } = useNavigation();
  const structure = useApiQuery<SiteStructure>({ method: 'GET', path: `/sites/${siteId}/structure` });
  const flats = (structure.data?.buildings ?? []).flatMap((b) => b.levels.flatMap((l) => l.flats));
  const norm = (s: string) => s.toLowerCase().replace(/[\s-]/g, '');
  return (
    <ComboBox
      className={cn('flex min-w-0 flex-col gap-1', className)}
      defaultItems={flats}
      defaultFilter={(text, input) => norm(text).includes(norm(input))}
      onSelectionChange={(key) => key && navigate(SOCIETY.flat(siteId, String(key)))}
      menuTrigger="input"
      data-testid={testId}
    >
      <Label className="sr-only">{t('sites:jump.label')}</Label>
      <div className="flex min-h-11 items-center gap-2 rounded-pill border border-border-control bg-panel px-3 shadow-inset focus-within:outline-2 focus-within:outline-focus">
        <Search aria-hidden className="size-4 shrink-0 text-muted" />
        <Input placeholder={t('sites:jump.placeholder')} className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-subtle" />
      </div>
      <Popover placement="bottom start" offset={6} className="w-[--trigger-width] min-w-64 rounded-tile border border-border bg-panel p-1.5 shadow-overlay data-entering:animate-overlay-in">
        <ListBox className="max-h-80 overflow-auto outline-none" renderEmptyState={() => <p className="px-3 py-2 text-sm text-muted">{t('sites:jump.none')}</p>}>
          {(f: (typeof flats)[number]) => (
            <ListBoxItem id={f.id} textValue={f.code} className="flex cursor-default items-center gap-3 rounded-control px-3 py-2 text-sm text-text outline-none data-focused:bg-primary-soft pointer-coarse:py-3">
              <bdi dir="ltr" className="ltr-ref w-14 shrink-0 font-semibold">
                {f.code}
              </bdi>
              <span className="min-w-0 flex-1 truncate text-xs text-muted">
                {f.payerName ? t('sites:jump.payer', { name: f.payerName }) : t(`sites:occupancy.${f.occupancy}`)}
              </span>
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}

/** Choose one flat (a form field): type part of its number; shows who pays so the right flat is picked. */
export function FlatSelect({ siteId, value, onChange, label, testId }: { siteId: string; value: string | null; onChange: (flatId: string) => void; label: string; testId?: string }) {
  const { t } = useT();
  const structure = useApiQuery<SiteStructure>({ method: 'GET', path: `/sites/${siteId}/structure` });
  const flats = (structure.data?.buildings ?? []).flatMap((b) => b.levels.flatMap((l) => l.flats));
  const norm = (s: string) => s.toLowerCase().replace(/[\s-]/g, '');
  return (
    <ComboBox
      className="flex min-w-0 flex-col gap-1.5"
      defaultItems={flats}
      selectedKey={value}
      onSelectionChange={(key) => key && onChange(String(key))}
      defaultFilter={(text, input) => norm(text).includes(norm(input))}
      menuTrigger="focus"
      data-testid={testId}
    >
      <Label className="text-sm font-medium text-text">{label}</Label>
      <div className="flex min-h-11 items-center gap-2 rounded-control border border-border-control bg-panel px-3 focus-within:outline-2 focus-within:outline-focus">
        <Search aria-hidden className="size-4 shrink-0 text-muted" />
        <Input placeholder={t('sites:jump.placeholder')} className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-subtle" />
      </div>
      <Popover placement="bottom start" offset={6} className="w-[--trigger-width] min-w-64 rounded-tile border border-border bg-panel p-1.5 shadow-overlay">
        <ListBox className="max-h-72 overflow-auto outline-none" renderEmptyState={() => <p className="px-3 py-2 text-sm text-muted">{t('sites:jump.none')}</p>}>
          {(f: (typeof flats)[number]) => (
            <ListBoxItem id={f.id} textValue={f.code} className="flex cursor-default items-center gap-3 rounded-control px-3 py-2 text-sm text-text outline-none data-focused:bg-primary-soft data-selected:font-semibold pointer-coarse:py-3">
              <bdi dir="ltr" className="ltr-ref w-14 shrink-0">{f.code}</bdi>
              <span className="min-w-0 flex-1 truncate text-xs text-muted">{f.payerName ? t('sites:jump.payer', { name: f.payerName }) : t(`sites:occupancy.${f.occupancy}`)}</span>
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}

/** A money amount typed as text (validated by the server; shown back exactly as entered). */
export function AmountInput({ label, value, onChange, testId, error }: { label: string; value: string; onChange: (v: string) => void; testId?: string; error?: string }) {
  const { t } = useT();
  return (
    <TextField value={value} onChange={onChange} isInvalid={!!error} className="flex min-w-0 flex-col gap-1.5">
      <Label className="text-sm font-medium text-text">{label}</Label>
      <div className="flex min-h-11 items-center gap-2 rounded-control border border-border-control bg-panel px-3 focus-within:outline-2 focus-within:outline-focus data-invalid:border-error">
        <span aria-hidden className="text-sm text-muted">{t('billing:currency')}</span>
        <Input inputMode="decimal" dir="ltr" className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none" data-testid={testId} />
      </div>
      {error && <span className="text-xs text-error">{error}</span>}
    </TextField>
  );
}

const paisa = (amount: string) => {
  const [whole = '0', frac = ''] = amount.replace('-', '').split('.');
  const v = BigInt(whole) * 100n + BigInt(`${frac}00`.slice(0, 2));
  return amount.startsWith('-') ? -v : v;
};

/** a − b on two-decimal amounts, in integer paisa (money is never a float). */
export function moneyMinus(a: MoneyValue, b: MoneyValue): MoneyValue {
  const d = paisa(a.amount) - paisa(b.amount);
  const digits = (d < 0n ? -d : d).toString().padStart(3, '0');
  return { amount: `${d < 0n ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`, currency: 'PKR' };
}
