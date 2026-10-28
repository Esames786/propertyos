import type { ResolvedCharge, SocietyAuditEntry, Statement } from '@repo/contracts';
import { Badge, cn, DateTime, dynamicT, ErrorState, Link, Money, SegmentedControl, useApiQuery, useT } from '@repo/ui';
import { Ban, Check, Equal, Minus, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Radio, RadioGroup, Label as AriaLabel } from 'react-aria-components';
import { COLLECTIONS, SOCIETY } from '../../nav.config';
import { Loading, useSocietyFormat } from './kit';

/**
 * What a statement can show in the demo: go-live arrears (October), the first billed month, and
 * everything since go-live (payments made before the bill's date appear in their own month).
 */
export const STATEMENT_PERIODS = ['2026-10', '2026-11', 'all'] as const;

const lastDay = (period: string) => new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).toISOString().slice(0, 10);
const rangeOf = (period: string) => (period === 'all' ? { from: '2026-10-01', to: lastDay('2026-11') } : { from: `${period}-01`, to: lastDay(period) });

/**
 * Account statement (A4 §4), derived by the server. The previous balance is shown apart from the
 * month's charges, never as an invoice line: previous + charges − credits = total payable.
 */
export function StatementView({ accountId, flat, payer, period, onPeriod, testId = 'statement' }: { accountId: string; flat?: string; payer?: string; period: string; onPeriod: (p: string) => void; testId?: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const q = useApiQuery<Statement>({ method: 'GET', path: `/statements/${accountId}`, query: { ...rangeOf(period), ...(flat ? { flat } : {}), ...(payer ? { payer } : {}) } });
  const periodLabel = period === 'all' ? t('billing:statement.sinceGoLive') : fmt.period(period);
  return (
    <section className="@container space-y-4" data-testid={testId} aria-label={t('billing:statement.title')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-text">{t('billing:statement.titleFor', { period: periodLabel })}</h3>
          {q.data && (
            <p className="text-sm text-muted">
              <bdi dir="ltr" className="ltr-ref">
                {q.data.accountNo}
              </bdi>{' '}
              · <bdi>{q.data.holderName}</bdi>
              {q.data.flat && <> · {t('billing:statement.flatOnly', { flat: q.data.flat.code })}</>}
              {q.data.payer && <> · {t('billing:statement.payerOnly', { name: q.data.payer.name })}</>}
            </p>
          )}
        </div>
        <SegmentedControl label={t('billing:statement.period')} value={period} onChange={onPeriod} options={STATEMENT_PERIODS.map((p) => ({ id: p, label: p === 'all' ? t('billing:statement.sinceGoLive') : fmt.period(p) }))} testId={`${testId}-period`} />
      </div>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Loading lines={4} />
      ) : (
        <>
          <dl className="grid gap-2 @2xl:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] @2xl:items-stretch" data-testid={`${testId}-sum`}>
            <SumCell label={t('billing:statement.previous')} value={<Money value={q.data.previousBalance} />} testId="statement-previous" />
            <Op icon={Plus} />
            <SumCell label={t('billing:statement.charges', { period: periodLabel })} value={<Money value={q.data.periodCharges} />} testId="statement-charges" />
            <Op icon={Minus} />
            <SumCell label={t('billing:statement.credits')} value={<Money value={q.data.periodCredits} />} testId="statement-credits" />
            <Op icon={Equal} />
            <SumCell label={t('billing:statement.closing')} value={<Money value={q.data.closingBalance} />} strong testId="statement-closing" />
          </dl>
          <p className="text-xs text-muted">{t('billing:statement.rule')}</p>
          {q.data.entries.length === 0 ? (
            <p className="rounded-tile bg-sunken/60 px-4 py-6 text-center text-sm text-muted">{t('billing:statement.empty')}</p>
          ) : (
            <>
              <table className="hidden w-full text-sm @2xl:table">
                <caption className="sr-only">{t('billing:statement.titleFor', { period: periodLabel })}</caption>
                <thead>
                  <tr className="border-b border-border text-start text-xs text-muted">
                    <th scope="col" className="py-2 text-start font-medium">{t('billing:statement.date')}</th>
                    <th scope="col" className="py-2 text-start font-medium">{t('billing:statement.entry')}</th>
                    <th scope="col" className="py-2 text-start font-medium">{t('billing:statement.flats')}</th>
                    <th scope="col" className="py-2 text-end font-medium">{t('billing:statement.debit')}</th>
                    <th scope="col" className="py-2 text-end font-medium">{t('billing:statement.credit')}</th>
                    <th scope="col" className="py-2 text-end font-medium">{t('billing:statement.balance')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/60 text-muted">
                    <td className="py-2.5" colSpan={5}>
                      {t('billing:statement.broughtForward')}
                    </td>
                    <td className="py-2.5 text-end">
                      <Money value={q.data.previousBalance} />
                    </td>
                  </tr>
                  {q.data.entries.map((e) => (
                    <tr key={e.refId} className="border-b border-border/60" data-testid="statement-entry" data-kind={e.kind}>
                      <td className="py-2.5 whitespace-nowrap">
                        <DateTime value={e.on} style="calendar" />
                      </td>
                      <td className="py-2.5">
                        <EntryLabel kind={e.kind} refText={e.ref} refId={e.refId} period={e.period ? fmt.period(e.period) : undefined} payer={e.payerName} />
                      </td>
                      <td className="py-2.5">
                        <bdi dir="ltr" className="ltr-ref">
                          {e.flats.join(', ')}
                        </bdi>
                      </td>
                      <td className="py-2.5 text-end">{e.debit ? <Money value={e.debit} /> : ''}</td>
                      <td className="py-2.5 text-end">{e.credit ? <Money value={e.credit} /> : ''}</td>
                      <td className="py-2.5 text-end font-semibold">
                        <Money value={e.balance} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ol className="space-y-2 @2xl:hidden">
                {q.data.entries.map((e) => (
                  <li key={e.refId} className="rounded-tile border border-border px-3 py-2.5" data-testid="statement-entry-card" data-kind={e.kind}>
                    <div className="flex items-start justify-between gap-3">
                      <EntryLabel kind={e.kind} refText={e.ref} refId={e.refId} period={e.period ? fmt.period(e.period) : undefined} payer={e.payerName} />
                      <span className={cn('shrink-0 text-sm font-semibold', e.credit && 'text-success')}>
                        {e.credit ? '−' : ''}
                        <Money value={e.debit ?? e.credit!} />
                      </span>
                    </div>
                    <p className="mt-1 flex justify-between gap-3 text-xs text-muted">
                      <span>
                        <DateTime value={e.on} style="calendar" /> ·{' '}
                        <bdi dir="ltr" className="ltr-ref">
                          {e.flats.join(', ')}
                        </bdi>
                      </span>
                      <span>
                        {t('billing:statement.balance')}: <Money value={e.balance} />
                      </span>
                    </p>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </section>
  );
}

function SumCell({ label, value, strong, testId }: { label: string; value: ReactNode; strong?: boolean; testId: string }) {
  return (
    <div className={cn('rounded-tile px-4 py-3', strong ? 'bg-primary text-on-primary' : 'bg-sunken/70')} data-testid={testId}>
      <dt className={cn('text-xs', strong ? 'text-on-primary/80' : 'text-muted')}>{label}</dt>
      <dd className={cn('mt-1 text-lg font-bold', strong ? 'text-on-primary' : 'text-text')}>{value}</dd>
    </div>
  );
}

function Op({ icon: Icon }: { icon: typeof Plus }) {
  return (
    <span aria-hidden className="hidden items-center justify-center text-muted @2xl:flex">
      <Icon className="size-4" />
    </span>
  );
}

function EntryLabel({ kind, refText, refId, period, payer }: { kind: string; refText: string; refId: string; period?: string; payer?: string }) {
  const { t } = useT();
  const label =
    kind === 'opening_balance'
      ? t('billing:statement.kinds.opening_balance')
      : kind === 'credit_note'
        ? t('billing:statement.kinds.credit_note')
        : kind === 'payment'
          ? t('billing:statement.kinds.payment')
          : t('billing:statement.kinds.invoice', { period: period ?? '' });
  const href = kind === 'credit_note' ? undefined : kind === 'payment' ? COLLECTIONS.payment(refId) : SOCIETY.invoice(refId);
  return (
    <span className="min-w-0">
      <span className="block font-medium text-text">{label}</span>
      <span className="block text-xs text-muted">
        {href ? (
          <Link href={href}>
            <bdi dir="ltr" className="ltr-ref">
              {refText}
            </bdi>
          </Link>
        ) : (
          <bdi dir="ltr" className="ltr-ref">
            {refText}
          </bdi>
        )}
        {payer && <> · {t('billing:statement.payer', { name: payer })}</>}
      </span>
    </span>
  );
}

/** "Which rule wins" for one flat and month (A4 §2): the winning rule and the rules it overrode. */
export function ChargesTable({ lines, testId = 'charges-table' }: { lines: ResolvedCharge[]; testId?: string }) {
  const { t } = useT();
  if (!lines.length) return <p className="text-sm text-muted">{t('billing:charges.noRules')}</p>;
  return (
    <ul className="divide-y divide-border rounded-tile border border-border" data-testid={testId}>
      {lines.map((l) => (
        <li key={l.category} className="grid gap-x-4 gap-y-2 px-4 py-3 @md:grid-cols-[7.5rem_1fr_auto] @md:items-center" data-testid="charge-line" data-category={l.category}>
          <span className="font-semibold text-text">{t(`billing:categories.${l.category}`)}</span>
          <span className="min-w-0 space-y-1 text-sm">
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone="success" icon={Check}>
                {t('billing:charges.wins', { scope: l.winner.scopeName })}
              </Badge>
              <span className="text-xs text-muted">{t('billing:charges.scopeVersion', { level: t(`billing:scope.${l.winner.scope.level}`), version: l.winner.version })}</span>
            </span>
            {l.overridden.length > 0 && (
              <span className="block text-xs text-muted" data-testid="charge-overridden">
                {t('billing:charges.overrides')}{' '}
                {l.overridden.map((o, i) => (
                  <span key={o.id}>
                    {i > 0 && ', '}
                    <bdi>{o.scopeName}</bdi> (<Money value={o.amount} className="line-through" />)
                  </span>
                ))}
              </span>
            )}
            {l.exemption && (
              <span className="flex flex-wrap items-center gap-2 text-xs">
                <Badge tone="info" icon={Ban}>
                  {t('billing:charges.exempt', { percent: l.exemption.percent })}
                </Badge>
                <bdi className="text-muted">{l.exemption.reason}</bdi>
              </span>
            )}
          </span>
          <span className="text-end">
            {l.exemption && (
              <span className="block text-xs text-muted line-through">
                <Money value={l.base} />
              </span>
            )}
            <Money value={l.amount} className="text-base font-bold text-text" />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A few large choices as radio cards (keyboard: arrows move, the group has one tab stop). */
export function ChoiceCards<T extends string>({ label, value, onChange, options, testId }: { label: string; value: T | null; onChange: (v: T) => void; options: Array<{ id: T; title: string; detail?: ReactNode }>; testId?: string }) {
  return (
    <RadioGroup value={value} onChange={(v) => onChange(v as T)} className="space-y-2" data-testid={testId}>
      <AriaLabel className="text-sm font-medium text-text">{label}</AriaLabel>
      {options.map((o) => (
        <Radio
          key={o.id}
          value={o.id}
          data-testid={testId ? `${testId}-${o.id}` : undefined}
          className={cn(
            'group flex cursor-default items-start gap-3 rounded-tile border border-border bg-panel px-4 py-3 outline-none',
            'data-hovered:bg-raised data-selected:border-primary data-selected:bg-primary-soft/40',
            'data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
          )}
        >
          <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-pill border-2 border-border-control group-data-selected:border-primary">
            <span className="size-2.5 rounded-pill bg-primary opacity-0 group-data-selected:opacity-100" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-text">{o.title}</span>
            {o.detail && <span className="block text-xs text-muted">{o.detail}</span>}
          </span>
        </Radio>
      ))}
    </RadioGroup>
  );
}

/** Who did what, newest first (the society's audit trail, filtered by the server). */
export function AuditList({ query, testId = 'audit-list' }: { query: Record<string, string>; testId?: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const q = useApiQuery<SocietyAuditEntry[]>({ method: 'GET', path: '/society/audit', query });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={4} />;
  if (!q.data.length) return <p className="text-sm text-muted">{t('billing:audit.empty')}</p>;
  const dt = dynamicT(t);
  // Server values are raw (amounts, dates, codes); show them the reader's way.
  const shown = (values: Record<string, string> = {}) =>
    Object.fromEntries(
      Object.entries(values).map(([k, v]) => [
        k,
        ['amount', 'total', 'previous'].includes(k) ? fmt.money({ amount: v, currency: 'PKR' }) : k === 'category' ? dt(`billing:categories.${v}`) : /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmt.date(v) : /^\d{4}-\d{2}$/.test(v) ? fmt.period(v) : v,
      ]),
    );
  return (
    <ol className="relative space-y-4 border-s border-border ps-6" data-testid={testId} aria-label={t('billing:audit.title')}>
      {q.data.map((e) => (
        <li key={e.id} className="relative" data-testid="audit-entry" data-action={e.action}>
          <span aria-hidden className="absolute -start-[1.85rem] top-1 size-3 rounded-pill border-2 border-primary bg-panel" />
          <p className="text-sm text-text">
            <bdi className="font-semibold">{e.byName}</bdi> {dt(`billing:audit.actions.${e.action}`, { label: e.target.label, ...shown(e.values) })}
          </p>
          <p className="text-xs text-muted">
            <DateTime value={e.at} style="dateTime" />
          </p>
        </li>
      ))}
    </ol>
  );
}
