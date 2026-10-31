import type { DuesHome as Home, ResidentPosition } from '@repo/contracts';
import { buttonClass, cn, DirectionalIcon, ErrorState, Link, useApiQuery, useT } from '@repo/ui';
import { emitTourEvent } from '@repo/ui/onboarding';
import { ArrowRight, Building2, CalendarClock, ChevronRight, FileQuestion, History, Landmark, ReceiptText, ScrollText, Type, Wallet } from 'lucide-react';
import { useId } from 'react';
import { DUES } from '../../nav.config';
import { Amount, PortalSkeleton, usePortalFormat } from '../portal/shared';
import { BillStatusChip, DemoLinkNote, DEMO_TODAY, daysUntil, ProofStateChip, ProofStepper } from './kit';

/**
 * PORTAL-001, dues edition (Gate C.2 reference experience 1). What a resident needs first, on a
 * phone: this month's bill, the earlier balance, the exact total to pay and by when, one clear
 * "Pay" action; then where their proofs stand, their receipts and the statement. A proof waiting
 * for the office shows as pending, never as paid.
 */
export default function DuesHome() {
  const { t } = useT();
  const q = useApiQuery<Home>({ method: 'GET', path: '/portal/dues/home' });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <PortalSkeleton title={t('dues:home.title')} variant="home" />;
  return <HomeView data={q.data} />;
}

function HomeView({ data }: { data: Home }) {
  const { t } = useT();
  const fmt = usePortalFormat(`${DEMO_TODAY}T09:00:00Z`);
  const first = data.resident.name.split(/\s+/)[0] ?? '';
  const p = data.position;
  const needsAction = data.submissions.find((s) => s.state === 'needs_information');
  const pending = data.submissions.filter((s) => s.state === 'submitted' || s.state === 'under_review');
  return (
    <div className="@container space-y-6 sm:space-y-8" data-testid="dues-home" data-status={p.status}>
      <header className="space-y-2 motion-safe:animate-rise-in">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold tracking-[0.1em] text-accent uppercase">
          <Building2 aria-hidden className="size-3.5" />
          <bdi>{data.property.siteName}</bdi>
          <span aria-hidden>·</span>
          <span>{data.property.buildingName}</span>
        </p>
        <h1 id="page-title" tabIndex={-1} className="text-figure-sm leading-tight font-bold tracking-tight text-text outline-none sm:text-4xl">
          {t('dues:home.greeting', { name: first })}
        </h1>
        <p className="flex flex-wrap gap-2 text-sm text-muted" data-testid="dues-identity">
          {data.property.flats.map((f) => (
            <span key={f.id} className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-panel px-3 py-1 text-xs font-medium text-text">
              {t('dues:home.flat')} <bdi dir="ltr" className="ltr-ref font-semibold">{f.code}</bdi> · {t(`dues:home.role.${f.role}`)}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-panel px-3 py-1 text-xs font-medium text-text">
            {t('dues:home.account')} <bdi dir="ltr" className="ltr-ref font-semibold">{data.property.accountNo}</bdi>
          </span>
        </p>
      </header>

      <BillHero position={p} fmt={fmt} pendingId={pending[0]?.id} />

      {needsAction && (
        <Link href={DUES.submission(needsAction.id)} variant="plain" className="flex items-start gap-3 rounded-card border-2 border-warning/50 bg-warning-soft/60 p-4 hover:bg-warning-soft" data-testid="dues-needs-info">
          <FileQuestion aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-text">{t('dues:home.needsInfoTitle')}</span>
            <span className="block text-sm text-text"><bdi>{t('billing:quote', { text: needsAction.request })}</bdi></span>
            <span className="mt-1 block text-sm font-semibold text-primary">{t('dues:home.needsInfoAction')}</span>
          </span>
          <DirectionalIcon icon={ChevronRight} className="mt-1 size-4 text-muted" />
        </Link>
      )}

      {/* grid-cols-1 (minmax(0, 1fr)): at large text sizes a long reference must wrap, not widen the page. */}
      <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-2">
        <Activity data={data} fmt={fmt} />
        <QuickLinks data={data} />
      </div>
      <DemoLinkNote />
    </div>
  );
}

function BillHero({ position: p, fmt, pendingId }: { position: ResidentPosition; fmt: ReturnType<typeof usePortalFormat>; pendingId?: string }) {
  const { t } = useT();
  const titleId = useId();
  const bill = p.current;
  const owing = Number(p.totalPayable.amount) > 0;
  const days = p.dueOn ? daysUntil(DEMO_TODAY, p.dueOn) : null;
  return (
    <section aria-labelledby={titleId} className="overflow-hidden rounded-card bg-panel shadow-raised" data-tour-id="dues-bill" data-testid="dues-bill">
      <div className="space-y-5 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.1em] text-muted uppercase">{t('dues:home.thisMonth')}</p>
            <h2 id={titleId} className="mt-1 text-xl font-bold text-text">
              {bill ? t('dues:home.billFor', { period: fmt.monthYear(`${bill.period}-01`) }) : t('dues:home.noBill')}
            </h2>
          </div>
          <BillStatusChip status={p.status} />
        </div>

        {/* previous balance + this month's bill − credit = the exact total (never folded into one figure) */}
        <dl className="grid grid-cols-1 gap-2 text-sm" data-testid="dues-breakdown">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <dt className="text-muted">{t('dues:home.current')}</dt>
            <dd className="font-semibold text-text" data-testid="dues-current"><Amount value={bill?.open.amount ?? '0.00'} /></dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <dt className="text-muted">{t('dues:home.previous')}</dt>
            <dd className="font-semibold text-text" data-testid="dues-previous"><Amount value={p.previousBalance.amount} /></dd>
          </div>
          {Number(p.credit.amount) > 0 && (
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <dt className="text-muted">{t('dues:home.credit')}</dt>
              <dd className="font-semibold text-success" data-testid="dues-credit">− <Amount value={p.credit.amount} /></dd>
            </div>
          )}
          {/* Gate S.1 (PORTAL-004): credit with nothing left to pay is money paid in advance (no wallet). */}
          {Number(p.credit.amount) > 0 && Number(p.totalPayable.amount) <= 0 && (
            <p className="text-sm text-success" data-testid="dues-paid-in-advance">
              {t('dues:home.paidInAdvance')}
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3 border-t border-border pt-3" data-tour-id="dues-total">
            <dt className="text-base font-semibold text-text">{t('dues:home.total')}</dt>
            <dd className="text-figure-sm leading-none font-bold tracking-tight text-text sm:text-figure" data-testid="dues-total"><Amount value={p.totalPayable.amount} /></dd>
          </div>
        </dl>

        {owing && p.dueOn && (
          <p className={cn('flex flex-wrap items-center gap-2 text-sm', days !== null && days < 0 ? 'text-error' : 'text-text')} data-testid="dues-due">
            <CalendarClock aria-hidden className="size-4" />
            {t('dues:home.dueOn', { date: fmt.date(p.dueOn) })} · {days === null ? '' : days < 0 ? t('dues:home.overdueBy', { count: -days }) : days === 0 ? t('dues:home.dueToday') : t('dues:home.dueIn', { count: days })}
          </p>
        )}
        {Number(p.overdue.amount) > 0 && <p className="text-sm text-error" data-testid="dues-overdue">{t('dues:home.overdueNote', { amount: fmt.money(p.overdue.amount) })}</p>}
        {Number(p.pendingVerification.amount) > 0 && (
          <p className="rounded-tile bg-info-soft px-3 py-2 text-sm text-info" data-testid="dues-pending">{t('dues:home.pendingNote', { amount: fmt.money(p.pendingVerification.amount) })}</p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {owing && p.status !== 'pending_verification' && (
            <Link href={DUES.pay} variant="plain" className={cn(buttonClass('primary', 'lg'), 'justify-center gap-2')} data-tour-id="dues-pay" data-testid="dues-pay" onPress={() => emitTourEvent('dues.pay.opened')}>
              <Wallet aria-hidden className="size-5" />
              {t('dues:home.pay', { amount: fmt.money(p.totalPayable.amount) })}
            </Link>
          )}
          {p.status === 'pending_verification' && pendingId && (
            <Link href={DUES.submission(pendingId)} variant="plain" className={cn(buttonClass('secondary', 'lg'), 'justify-center gap-2')} data-tour-id="dues-pay" data-testid="dues-pending-open">
              {t('dues:home.seeProof')}
              <DirectionalIcon icon={ArrowRight} className="size-4" />
            </Link>
          )}
          {bill && (
            <Link href={DUES.bill(bill.invoiceId)} variant="plain" className={cn(buttonClass('secondary', 'lg'), 'justify-center')} data-testid="dues-see-bill">
              {t('dues:home.seeBill')}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function Activity({ data, fmt }: { data: Home; fmt: ReturnType<typeof usePortalFormat> }) {
  const { t } = useT();
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="space-y-4 rounded-card bg-panel p-5 shadow-card" data-tour-id="dues-activity" data-testid="dues-activity">
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-lg font-bold text-text">{t('dues:home.activityTitle')}</h2>
        <Link href={DUES.history} variant="plain" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">
          {t('dues:home.allHistory')}
          <DirectionalIcon icon={ArrowRight} className="size-4" />
        </Link>
      </div>
      {data.submissions.length === 0 && data.receipts.length === 0 && <p className="text-sm text-muted">{t('dues:home.activityEmpty')}</p>}
      <ul className="space-y-3">
        {data.submissions.filter((s) => s.state !== 'verified').map((s) => (
          <li key={s.id}>
            <Link href={DUES.submission(s.id)} variant="plain" className="block space-y-3 rounded-tile border border-border p-4 hover:bg-raised" data-testid="dues-proof" data-state={s.state}>
              <span className="flex flex-wrap items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block font-semibold text-text">{t('dues:home.proofOf', { amount: fmt.money(s.amount.amount) })}</span>
                  <span className="block text-xs text-muted">{t('dues:home.sentOn', { date: fmt.instant(s.submittedAt) })}</span>
                </span>
                <ProofStateChip state={s.state} />
              </span>
              <ProofStepper state={s.state} />
              {s.rejectionReason && <span className="block text-sm text-error"><bdi>{t('billing:quote', { text: s.rejectionReason })}</bdi></span>}
            </Link>
          </li>
        ))}
        {data.receipts.map((r) => (
          <li key={r.id}>
            <Link href={DUES.receipt(r.id)} variant="plain" className="flex items-start gap-3 rounded-tile border border-success/30 bg-success-soft/40 p-4 hover:bg-success-soft" data-testid="dues-receipt" data-ref={r.ref}>
              <ReceiptText aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
              <span className="min-w-0 flex-1">
                {/* The amount sits beside the reference while there is room and drops below it at large text sizes. */}
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="min-w-0 flex-1 basis-36 font-semibold [overflow-wrap:break-word] text-text">{t('dues:home.receipt', { ref: r.ref })}</span>
                  <span className="font-semibold text-success"><Amount value={r.amount.amount} /></span>
                </span>
                <span className="block text-xs text-muted">{t(`dues:method.${r.method}`)} · {fmt.date(r.receivedOn)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function QuickLinks({ data }: { data: Home }) {
  const { t } = useT();
  const links = [
    { id: 'statement', href: DUES.statement, icon: ScrollText, label: t('dues:home.links.statement') },
    { id: 'history', href: DUES.history, icon: History, label: t('dues:home.links.history') },
    { id: 'payee', href: DUES.payee, icon: Landmark, label: t('dues:home.links.payee') },
    { id: 'textSize', href: DUES.settings, icon: Type, label: t('dues:home.links.textSize') },
  ];
  return (
    <section aria-label={t('dues:home.linksTitle')} className="space-y-3 rounded-card bg-panel p-5 shadow-card">
      <h2 className="text-lg font-bold text-text">{t('dues:home.linksTitle')}</h2>
      <ul className="grid grid-cols-1 gap-2 @md:grid-cols-2">
        {links.map((l) => {
          const Icon = l.icon;
          return (
            <li key={l.id}>
              <Link href={l.href} variant="plain" className="flex min-h-14 items-center gap-3 rounded-tile border border-border px-4 hover:bg-raised" data-testid={`dues-link-${l.id}`}>
                <Icon aria-hidden className="size-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 font-medium text-text">{l.label}</span>
                <DirectionalIcon icon={ChevronRight} className="size-4 text-muted" />
              </Link>
            </li>
          );
        })}
      </ul>
      {data.methods.officeCash.enabled && data.methods.officeCash.counter && <p className="text-xs text-muted">{t('dues:home.cashNote', { counter: data.methods.officeCash.counter })}</p>}
      <p className="text-xs text-muted">{t('dues:home.onlineLater', { gate: data.methods.online.gate })}</p>
    </section>
  );
}
