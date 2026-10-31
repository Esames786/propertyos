import type { FinanceFigure, FinanceOverview } from '@repo/contracts';
import { Badge, buttonClass, cn, DirectionalIcon, ErrorState, Link, PageHeader, SelectControl, StatTile, useApiQuery, useQueryParam, useQueryParams, useSession, useT, type TileHue } from '@repo/ui';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpRight,
  BookOpenText,
  ChevronRight,
  CircleEqual,
  ClipboardCheck,
  Coins,
  FileWarning,
  Hourglass,
  Landmark,
  Lock,
  PiggyBank,
  ReceiptText,
  Scale,
  Truck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { FINANCE } from '../../../nav.config';
import { Loading, useSocietyFormat } from '../kit';
import { PeriodBadge, WRAP, WrapMoney } from './fkit';

/**
 * FIN-001 society finance (Gate S.1 reference experience 1, first stop). What the society holds and
 * why: opening and closing cash and bank, what came in and went out, and everything still on its way
 * (proofs, cheques, instructions, cash in transit) shown apart and never added to a balance. Billed,
 * collected, cash received and bank settled are four different numbers, each explained. Every figure
 * opens the records it counts.
 */
export default function FinanceDashboard() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const { can } = useSession();
  const [period] = useQueryParam('period');
  const setParams = useQueryParams();
  const q = useApiQuery<FinanceOverview>({ method: 'GET', path: '/finance/overview', query: period ? { period } : {} }, { placeholderData: (prev) => prev });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} label={t('finance:dashboard.loading')} />;
  const d = q.data;
  const p = fmt.period(d.period);
  const tile = (id: string, icon: LucideIcon, hue: TileHue, label: string, f: FinanceFigure, context: string) => (
    <StatTile testId={`fin-${id}`} icon={icon} hue={hue} label={label} value={fmt.compact(f.amount)} accessibleValue={`${fmt.money(f.amount)}, ${context}`} context={context} href={f.href} />
  );
  return (
    <div className="@container space-y-6" data-testid="finance-dashboard">
      <PageHeader
        title={t('finance:dashboard.title')}
        description={t('finance:dashboard.intro', { site: d.site.name, entity: d.site.legalEntityName })}
        badge={<PeriodBadge state={d.periodState} testId="period-state" />}
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs">
          <SelectControl
            label={t('finance:dashboard.period')}
            value={d.period}
            onChange={(k) => setParams({ period: k ?? null })}
            options={d.periods.map((x) => ({ id: x.period, label: `${fmt.period(x.period)} · ${t(`finance:periodState.${x.state}`)}` }))}
            testId="finance-period"
          />
        </div>
        <Link href={FINANCE.cashbook({ period: d.period })} variant="plain" className={buttonClass('primary', 'md', `gap-2 ${WRAP}`)} data-testid="open-cashbook">
          <BookOpenText aria-hidden className="size-4 shrink-0" />
          {t('finance:dashboard.openCashbook')}
        </Link>
      </div>

      {/* The four numbers people confuse, side by side and explained (never one figure for all four). */}
      <section aria-labelledby="ladder-title" className="space-y-3 rounded-card bg-panel p-4 shadow-card @md:p-5" data-testid="finance-ladder">
        <div>
          <h2 id="ladder-title" className="text-lg font-bold text-text">
            {t('finance:ladder.title', { period: p })}
          </h2>
          <p className="text-sm text-muted">{t('finance:ladder.intro')}</p>
        </div>
        <ol className="grid grid-cols-1 gap-3 @3xl:grid-cols-4">
          {(['billed', 'collected', 'cashReceived', 'bankSettled'] as const).map((k, i) => (
            <li key={k} className="relative">
              <Link href={d.ladder[k].href} variant="plain" className="flex h-full flex-col gap-1 rounded-tile border border-border/70 p-4 hover:bg-raised" data-testid={`ladder-${k}`}>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t(`finance:ladder.${k}`)}</span>
                <WrapMoney value={d.ladder[k].amount} className="text-lg font-bold @xs:text-xl" />
                <span className="text-xs text-muted">{t(`finance:ladder.${k}Why`, { count: d.ladder[k].count ?? 0 })}</span>
              </Link>
              {i < 3 && (
                <span aria-hidden className="absolute -end-2.5 top-1/2 hidden -translate-y-1/2 rounded-pill bg-panel px-0.5 text-sm font-bold text-muted @3xl:block">
                  ≠
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="movement-title" className="space-y-3">
        <h2 id="movement-title" className="text-lg font-bold text-text">
          {t('finance:dashboard.movement', { period: p })}
        </h2>
        <div className="grid grid-cols-1 gap-4 @lg:grid-cols-2 @5xl:grid-cols-3">
          {tile('opening', Wallet, 'sky', t('finance:kpi.opening'), d.opening, t('finance:kpi.split', { cash: fmt.money(d.opening.cash), bank: fmt.money(d.opening.bank) }))}
          {tile('collected', ArrowDownLeft, 'emerald', t('finance:kpi.collected'), d.collected, t('finance:kpi.payments', { count: d.collected.count ?? 0 }))}
          {tile('other-income', PiggyBank, 'teal', t('finance:kpi.otherIncome'), d.otherIncome, t('finance:kpi.vouchers', { count: d.otherIncome.count ?? 0 }))}
          {tile('expenses', ArrowUpRight, 'gold', t('finance:kpi.expenses'), d.expenses, t('finance:kpi.vouchers', { count: d.expenses.count ?? 0 }))}
          {tile('net', Scale, 'violet', t('finance:kpi.net'), d.netMovement, t('finance:kpi.lines', { count: d.netMovement.count ?? 0 }))}
          {tile('closing', Landmark, 'emerald', t('finance:kpi.closing'), d.closing, t('finance:kpi.split', { cash: fmt.money(d.closing.cash), bank: fmt.money(d.closing.bank) }))}
        </div>
      </section>

      <section aria-labelledby="waiting-title" className="space-y-3">
        <div>
          <h2 id="waiting-title" className="text-lg font-bold text-text">
            {t('finance:dashboard.waiting')}
          </h2>
          <p className="text-sm text-muted">{t('finance:dashboard.waitingIntro')}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 @lg:grid-cols-2 @5xl:grid-cols-3">
          {tile('outstanding', ReceiptText, 'gold', t('finance:kpi.outstanding'), d.outstanding, t('finance:kpi.accounts', { count: d.outstanding.accounts }))}
          {tile('pending', Hourglass, 'sky', t('finance:kpi.pendingVerification'), d.pendingVerification, t('finance:kpi.proofs', { count: d.pendingVerification.count ?? 0 }))}
          {tile('in-transit', Truck, 'violet', t('finance:kpi.inTransit'), d.cashInTransit, t('finance:kpi.deposits', { count: d.cashInTransit.count ?? 0 }))}
          {tile('cheques', Coins, 'teal', t('finance:kpi.cheques'), d.chequesPending, t('finance:kpi.cheque', { count: d.chequesPending.count ?? 0 }))}
          {tile('transfers', ArrowRightLeft, 'sky', t('finance:kpi.transfers'), d.transfersAwaiting, t('finance:kpi.instructions', { count: d.transfersAwaiting.count ?? 0 }))}
          {tile('unreconciled', FileWarning, 'gold', t('finance:kpi.unreconciled'), d.unreconciled, t('finance:kpi.lines', { count: d.unreconciled.count ?? 0 }))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 @5xl:grid-cols-12">
        <section aria-labelledby="accounts-title" className="space-y-3 rounded-card bg-panel p-5 shadow-card @5xl:col-span-7" data-testid="finance-accounts">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="accounts-title" className="text-lg font-bold text-text">
              {t('finance:dashboard.accounts')}
            </h2>
            <Link href={FINANCE.accounts} className="text-sm">
              {t('finance:dashboard.allAccounts')}
            </Link>
          </div>
          <ul className="divide-y divide-border/70">
            {d.accounts.map((a) => (
              <li key={a.id}>
                <Link href={a.href} variant="plain" className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:bg-raised" data-testid="finance-account-row" data-account={a.id}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-text">
                      <bdi>{a.name}</bdi>
                    </span>
                    <span className="block text-xs text-muted">
                      {t(`finance:accountKind.${a.kind}`)}
                      {a.iban ? (
                        <>
                          {' · '}
                          <bdi dir="ltr" className="ltr-ref [overflow-wrap:anywhere]">{a.iban}</bdi>
                        </>
                      ) : null}
                      {a.receivesDues ? ` · ${t('finance:accounts.receivesDues')}` : ''}
                    </span>
                  </span>
                  {a.unreconciled > 0 && <Badge tone="warning" icon={FileWarning}>{t('finance:accounts.unreconciled', { count: a.unreconciled })}</Badge>}
                  <WrapMoney value={a.balance} className="text-base font-bold" />
                  <DirectionalIcon icon={ChevronRight} className="size-4 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <div className="space-y-5 @5xl:col-span-5">
          <section aria-labelledby="close-title" className="space-y-3 rounded-card bg-panel p-5 shadow-card" data-testid="finance-close">
            <h2 id="close-title" className="flex items-center gap-2 text-lg font-bold text-text">
              <Lock aria-hidden className="size-5 text-muted" />
              {t('finance:dashboard.closeTitle', { period: p })}
            </h2>
            <p className="text-sm text-text">{d.close.state === 'closed' ? t('finance:dashboard.closed', { period: p }) : t('finance:dashboard.blocking', { count: d.close.blocking, period: p })}</p>
            <Link href={d.close.href} data-testid="open-close">
              {t('finance:dashboard.openClose')}
            </Link>
          </section>
          <section aria-labelledby="approvals-title" className="space-y-3 rounded-card bg-panel p-5 shadow-card" data-testid="finance-approvals">
            <h2 id="approvals-title" className="flex items-center gap-2 text-lg font-bold text-text">
              <ClipboardCheck aria-hidden className="size-5 text-muted" />
              {t('finance:dashboard.approvals')}
            </h2>
            <p className="text-sm text-text">{d.approvals.yours ? t('finance:dashboard.approvalsYours', { count: d.approvals.yours }) : t('finance:dashboard.approvalsNone', { count: d.approvals.pending })}</p>
            <Link href={d.approvals.href}>{t('finance:dashboard.openApprovals')}</Link>
          </section>
          <section aria-labelledby="actions-title" className="space-y-2 rounded-card bg-panel p-5 shadow-card">
            <h2 id="actions-title" className="text-lg font-bold text-text">
              {t('finance:dashboard.actions')}
            </h2>
            <ul className="grid grid-cols-1 gap-2">
              {can('cash_voucher.prepare') && <QuickLink href={FINANCE.cashbook({ drawer: 'voucher' })} label={t('finance:dashboard.newVoucher')} testId="quick-voucher" />}
              {can('funds_transfer.create') && <QuickLink href={FINANCE.transfers()} label={t('finance:dashboard.newTransfer')} testId="quick-transfer" />}
              {can('payment.receive') && <QuickLink href={FINANCE.batches()} label={t('finance:dashboard.newBatch')} testId="quick-batch" />}
              <QuickLink href={FINANCE.cashbook({ period: d.period })} label={t('finance:dashboard.openCashbook')} testId="quick-cashbook" />
            </ul>
          </section>
        </div>
      </div>

      {d.byCategory.length > 0 && (
        <section aria-labelledby="categories-title" className="space-y-3 rounded-card bg-panel p-5 shadow-card" data-testid="finance-categories">
          <h2 id="categories-title" className="text-lg font-bold text-text">
            {t('finance:dashboard.categories', { period: p })}
          </h2>
          <ul className="grid grid-cols-1 gap-2 @3xl:grid-cols-2">
            {d.byCategory.map((c) => (
              <li key={`${c.category}-${c.direction}`}>
                <Link href={FINANCE.cashbook({ period: d.period, category: c.category })} variant="plain" className="flex flex-wrap items-center justify-between gap-3 rounded-tile border border-border/70 px-4 py-3 hover:bg-raised">
                  <span className="flex min-w-0 items-center gap-2 text-sm text-text">
                    {c.direction === 'in' ? <ArrowDownLeft aria-hidden className="size-4 text-success" /> : <ArrowUpRight aria-hidden className="size-4 text-warning" />}
                    {t(`finance:category.${c.category}`)} · {t(c.direction === 'in' ? 'finance:cashbook.in' : 'finance:cashbook.out')}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted">{t('finance:kpi.lines', { count: c.count })}</span>
                    <WrapMoney value={c.amount} className="font-semibold" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="flex items-center gap-2 text-xs text-muted">
        <CircleEqual aria-hidden className="size-4" />
        {t('finance:dashboard.derived')}
      </p>
    </div>
  );
}

function QuickLink({ href, label, testId }: { href: string; label: string; testId: string }) {
  return (
    <li>
      <Link href={href} variant="plain" className={cn('flex min-h-11 items-center justify-between gap-2 rounded-tile border border-border/70 px-4 py-2 text-sm font-medium text-text hover:bg-raised')} data-testid={testId}>
        {label}
        <DirectionalIcon icon={ArrowRight} className="size-4 text-muted" />
      </Link>
    </li>
  );
}
