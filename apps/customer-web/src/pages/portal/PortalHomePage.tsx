import type { InstalmentItem, PortalHome } from '@repo/contracts';
import { imageScrimGradient, IMAGE_SCRIM } from '@repo/tokens';
import {
  buttonClass,
  cn,
  DirectionalIcon,
  dynamicT,
  ErrorState,
  IconTile,
  Link,
  MetricCard,
  Photo,
  ProgressRing,
  QuickActions,
  RevealItem,
  Stagger,
  useApiQuery,
  useT,
  type QuickAction,
} from '@repo/ui';
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CircleAlert,
  FileText,
  HardHat,
  Hourglass,
  KeyRound,
  ReceiptText,
  ShieldCheck,
  Upload,
  UserRound,
  Wallet,
  Wrench,
} from 'lucide-react';
import {
  Amount,
  InstalmentStatusChip,
  instalmentLabel,
  MilestoneList,
  PORTAL,
  PortalSkeleton,
  ProgressBar,
  ReceiptCard,
  Section,
  usePortalFormat,
  type PortalFormat,
} from './shared';

/** PORTAL-001: the owner's home. Property, next instalment, plan figures, quick actions, receipts, construction. */
export default function PortalHomePage() {
  const { t } = useT();
  const query = useApiQuery<PortalHome>({ method: 'GET', path: '/portal/home' });
  if (query.isPending) return <PortalSkeleton title={t('portal:pages.home')} variant="home" />;
  if (query.isError)
    return (
      <>
        <h1 className="sr-only">{t('portal:pages.home')}</h1>
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </>
    );
  return <HomeView data={query.data} />;
}

function HomeView({ data }: { data: PortalHome }) {
  const { t } = useT();
  const fmt = usePortalFormat(data.asOf);
  const { plan, construction } = data;
  const next = data.nextInstalment;
  const remaining = plan.instalmentCount - plan.paidCount;

  const quick: QuickAction[] = [
    { id: 'pay', label: t('portal:home.quick.pay'), icon: Wallet, hue: 'emerald', href: `${PORTAL.pay}?mode=online`, testId: 'quick-pay' },
    { id: 'upload', label: t('portal:home.quick.upload'), icon: Upload, hue: 'teal', href: `${PORTAL.pay}?mode=upload`, testId: 'quick-upload' },
    { id: 'receipts', label: t('portal:home.quick.receipts'), icon: ReceiptText, hue: 'sky', href: `${PORTAL.payments}?status=paid`, testId: 'quick-receipts' },
    { id: 'maintenance', label: t('portal:home.quick.maintenance'), icon: Wrench, hue: 'orange', href: `${PORTAL.services}?tab=maintenance&new=1`, testId: 'quick-maintenance' },
    { id: 'visitor', label: t('portal:home.quick.visitor'), icon: KeyRound, hue: 'violet', href: `${PORTAL.services}?tab=visitors&new=1`, testId: 'quick-visitor' },
    { id: 'documents', label: t('portal:home.quick.documents'), icon: FileText, hue: 'slate', href: PORTAL.documents, testId: 'quick-documents' },
    { id: 'construction', label: t('portal:home.quick.construction'), icon: HardHat, hue: 'amber', href: PORTAL.construction, testId: 'quick-construction' },
  ];

  return (
    <div className="space-y-8 sm:space-y-10" data-testid="portal-home">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <PropertyHero data={data} fmt={fmt} className="lg:col-span-7" />
        <NextInstalmentCard item={next} fmt={fmt} className="lg:col-span-5" />
      </div>

      {data.attention.map((item) => (
        <AttentionCard key={item.id} item={item} />
      ))}

      <section aria-labelledby="portal-metrics-title">
        <h2 id="portal-metrics-title" className="sr-only">
          {t('portal:home.metrics.label')}
        </h2>
        <Stagger as="ul" className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          <RevealItem as="li" className="flex min-w-0">
            <MetricCard
              testId="metric-paid"
              label={t('portal:home.metrics.paid')}
              value={fmt.compact(plan.paidToDate.amount)}
              accessibleValue={fmt.money(plan.paidToDate.amount)}
              valueTone="success"
              icon={ShieldCheck}
              hue="emerald"
              href={`${PORTAL.payments}?status=paid`}
              caption={
                <span className="block space-y-1.5">
                  <span className="block">{t('portal:home.metrics.paidCaption', { percent: fmt.percent(plan.paidShare), total: fmt.compact(plan.totalPrice.amount) })}</span>
                  <ProgressBar value={plan.paidShare} label={t('portal:payments.summary.progressLabel')} className="h-1.5" />
                </span>
              }
            />
          </RevealItem>
          <RevealItem as="li" className="flex min-w-0">
            <MetricCard
              testId="metric-outstanding"
              label={t('portal:home.metrics.outstanding')}
              value={fmt.compact(plan.outstanding.amount)}
              accessibleValue={fmt.money(plan.outstanding.amount)}
              icon={CalendarClock}
              hue="amber"
              href={PORTAL.payments}
              caption={t('portal:home.metrics.outstandingCaption', { count: remaining })}
            />
          </RevealItem>
          <RevealItem as="li" className="flex min-w-0">
            <MetricCard
              testId="metric-construction"
              label={t('portal:home.metrics.construction')}
              value={fmt.percent(construction.progress)}
              valueTone="primary"
              icon={HardHat}
              hue="teal"
              href={PORTAL.construction}
              caption={t('portal:home.metrics.constructionCaption', { project: construction.projectName })}
            />
          </RevealItem>
          <RevealItem as="li" className="flex min-w-0">
            <MetricCard
              testId="metric-documents"
              label={t('portal:home.metrics.documents')}
              value={fmt.count(data.documents.count)}
              icon={FileText}
              hue="sky"
              href={PORTAL.documents}
              caption={data.documents.newCount ? t('portal:home.metrics.documentsNew', { count: data.documents.newCount }) : t('portal:home.metrics.documentsNone')}
            />
          </RevealItem>
        </Stagger>
      </section>

      <QuickActions title={t('portal:home.quick.title')} actions={quick} tourId="portal-quick-actions" testId="portal-quick-actions" />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-6">
        <Section
          id="portal-receipts-title"
          title={t('portal:home.receipts.title')}
          action={{ label: t('portal:home.receipts.viewAll'), href: `${PORTAL.payments}?status=paid` }}
          tourId="portal-receipts"
          testId="portal-receipts"
          className="lg:col-span-7 lg:self-start"
        >
          {data.recentReceipts.length ? (
            <Stagger as="ul" className="space-y-3">
              {data.recentReceipts.map((r) => (
                <RevealItem as="li" key={r.id}>
                  <ReceiptCard receipt={r} fmt={fmt} />
                </RevealItem>
              ))}
            </Stagger>
          ) : (
            <p className="rounded-card border border-dashed border-border bg-panel p-5 text-sm text-muted">{t('portal:home.receipts.empty')}</p>
          )}
        </Section>
        <Section
          id="portal-construction-title"
          title={t('portal:home.construction.title')}
          action={{ label: t('portal:home.construction.viewAll'), href: PORTAL.construction }}
          tourId="portal-construction"
          testId="portal-construction"
          className="lg:col-span-5 lg:self-start"
        >
          <ConstructionCard data={data} fmt={fmt} />
        </Section>
      </div>
    </div>
  );
}

function PropertyHero({ data, fmt, className }: { data: PortalHome; fmt: PortalFormat; className?: string }) {
  const { t } = useT();
  const { owner, property } = data;
  const chip = 'inline-flex min-h-8 items-center gap-1.5 rounded-pill px-3 text-sm font-semibold';
  return (
    <section
      aria-labelledby="page-title"
      data-tour-id="portal-hero"
      data-testid="portal-hero"
      className={cn('relative isolate flex min-h-[16rem] flex-col justify-end overflow-hidden rounded-card bg-text shadow-raised motion-safe:animate-rise-in sm:min-h-[18rem]', className)}
    >
      <Photo imageKey={property.imageKey} sizes="(min-width: 1024px) 640px, 100vw" priority className="absolute inset-0 -z-10 size-full" labelPosition="top-end" />
      <div className="px-5 pb-5 text-inverse sm:px-6 sm:pb-6" style={{ paddingTop: IMAGE_SCRIM.fade, background: imageScrimGradient() }}>
        <p className="text-sm font-medium text-inverse">{t('portal:home.welcome')}</p>
        <h1 id="page-title" className="mt-0.5 font-display text-3xl leading-tight text-inverse outline-none sm:text-4xl">
          <bdi>{owner.displayName}</bdi>
        </h1>
        <p className="mt-1 text-sm text-inverse">
          {property.towerName && property.floor !== undefined
            ? t('portal:home.propertyLine', { project: property.projectName, tower: property.towerName, floor: fmt.count(property.floor) })
            : property.projectName}
          {' · '}
          {t('portal:home.typeArea', { type: t(`common:unitType.${property.type}`), area: fmt.area(property.areaSqft) })}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={cn(chip, 'bg-panel text-text shadow-card')} data-testid="hero-unit">
            <Building2 aria-hidden className="size-4 text-primary" />
            <span className="sr-only">{t('portal:home.unit')}</span>
            <bdi dir="ltr" className="ltr-ref">
              {property.unitRef}
            </bdi>
          </span>
          <span className={cn(chip, 'bg-tile-emerald-soft text-tile-emerald-ink')} data-testid="hero-owner">
            <KeyRound aria-hidden className="size-4" />
            {t('portal:home.owner')}
          </span>
          {property.possessionOn && (
            <span className={cn(chip, 'bg-[rgb(12_17_15/0.66)] font-medium text-inverse backdrop-blur-sm')}>
              <UserRound aria-hidden className="size-4" />
              {t('portal:home.possession', { date: fmt.monthYear(property.possessionOn) })}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function NextInstalmentCard({ item, fmt, className }: { item: InstalmentItem | null; fmt: PortalFormat; className?: string }) {
  const { t } = useT();
  const frame = cn(
    'relative isolate flex flex-col overflow-hidden rounded-card p-5 text-inverse shadow-raised sm:p-6',
    'bg-[linear-gradient(135deg,#1e4d42_0%,#1a5a4a_55%,#256b58_100%)]',
    className,
  );
  const decoration = (
    <>
      <span aria-hidden className="pointer-events-none absolute -end-16 -top-20 -z-10 size-56 rounded-pill bg-inverse/[0.07]" />
      <span aria-hidden className="pointer-events-none absolute -end-6 -bottom-24 -z-10 size-44 rounded-pill bg-brass/15" />
    </>
  );
  if (!item) {
    return (
      <section aria-labelledby="next-title" data-tour-id="portal-next-instalment" data-testid="next-instalment" className={frame}>
        {decoration}
        <h2 id="next-title" className="text-sm font-medium text-inverse">
          {t('portal:home.next.title')}
        </h2>
        <p className="mt-3 text-2xl font-bold">{t('portal:home.next.noneTitle')}</p>
        <p className="mt-1 text-sm text-inverse">{t('portal:home.next.noneBody')}</p>
        <div data-tour-id="portal-pay-actions" className="mt-auto pt-5">
          <Link href={PORTAL.payments} variant="plain" className={buttonClass('secondary', 'md', 'border-transparent bg-panel text-primary')}>
            {t('portal:home.next.viewStatus')}
          </Link>
        </div>
      </section>
    );
  }
  const awaiting = item.status === 'awaiting_verification';
  return (
    <section aria-labelledby="next-title" data-tour-id="portal-next-instalment" data-testid="next-instalment" data-status={item.status} className={frame}>
      {decoration}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="next-title" className="text-sm font-semibold tracking-wide text-inverse">
            {t('portal:home.next.title')}
          </h2>
          <p className="text-sm text-inverse/90">{instalmentLabel(t, item)}</p>
        </div>
        <span className="rounded-pill bg-panel p-0.5 shadow-card">
          <InstalmentStatusChip status={item.status} className="border-transparent" />
        </span>
      </div>
      <p className="mt-4 text-4xl leading-none font-bold tracking-tight sm:text-figure-lg" data-testid="next-amount">
        <Amount value={item.amount.amount} />
      </p>
      <p className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-inverse">
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock aria-hidden className="size-4 shrink-0" />
          {t('portal:instalment.dueOn', { date: fmt.date(item.dueDate) })}
        </span>
        {!awaiting && <span className="rounded-pill bg-inverse/15 px-2.5 py-0.5 text-xs font-semibold">{daysLeft(t, fmt, item.dueDate)}</span>}
      </p>
      {awaiting ? (
        <div className="mt-5 rounded-tile bg-inverse/10 p-3.5 text-sm text-inverse" data-tour-id="portal-pay-actions">
          <p className="flex items-center gap-2 font-semibold">
            <Hourglass aria-hidden className="size-4 shrink-0" />
            {t('portal:home.next.awaitingTitle', { date: item.proof ? fmt.instant(item.proof.submittedAt) : '' })}
          </p>
          <p className="mt-1">{t('portal:home.next.awaitingBody')}</p>
          <Link href={`${PORTAL.payments}?status=awaiting`} variant="plain" className="mt-2 inline-flex min-h-11 items-center gap-1 font-semibold text-inverse underline underline-offset-4">
            {t('portal:home.next.viewStatus')}
            <DirectionalIcon icon={ArrowRight} className="size-4" />
          </Link>
        </div>
      ) : (
        <div className="mt-auto pt-6">
          <div className="grid grid-cols-2 gap-2.5" data-tour-id="portal-pay-actions" data-testid="pay-actions">
            <Link
              href={`${PORTAL.pay}?record=${item.id}&mode=online`}
              variant="plain"
              data-testid="next-pay"
              className={buttonClass('secondary', 'lg', 'w-full gap-1.5 border-transparent bg-panel px-3 text-md font-semibold text-primary data-hovered:bg-primary-soft')}
            >
              <Wallet aria-hidden className="size-5 shrink-0" />
              <span className="truncate">{t('portal:home.next.payOnline')}</span>
            </Link>
            <Link
              href={`${PORTAL.pay}?record=${item.id}&mode=upload`}
              variant="plain"
              data-testid="next-upload"
              className={buttonClass('secondary', 'lg', 'w-full gap-1.5 border-inverse/60 bg-transparent px-3 text-md font-semibold text-inverse data-hovered:bg-inverse/10')}
            >
              <Upload aria-hidden className="size-5 shrink-0" />
              <span className="truncate">{t('portal:home.next.uploadProof')}</span>
            </Link>
          </div>
          <p className="mt-2.5 text-xs text-inverse/90">{t('portal:home.next.simulationHint')}</p>
        </div>
      )}
    </section>
  );
}

function daysLeft(t: ReturnType<typeof useT>['t'], fmt: PortalFormat, dueDate: string) {
  const days = fmt.daysUntil(dueDate);
  if (days === 0) return t('portal:instalment.dueToday');
  if (days < 0) return t('portal:instalment.overdueBy', { count: -days });
  return t('portal:instalment.daysLeft', { count: days });
}

function AttentionCard({ item }: { item: InstalmentItem }) {
  const { t } = useT();
  const needsInfo = item.status === 'needs_information';
  return (
    <section
      aria-labelledby={`attention-${item.id}`}
      data-testid="portal-attention"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card border border-warning/30 bg-warning-soft p-4 shadow-card sm:p-5"
    >
      <IconTile icon={CircleAlert} hue={needsInfo ? 'amber' : 'rose'} size="lg" className="bg-panel" />
      <div className="min-w-0 flex-1 basis-56">
        <h2 id={`attention-${item.id}`} className="text-base font-bold text-warning">
          {t('portal:home.attention.title')}
        </h2>
        <p className="text-sm text-text">{needsInfo ? t('portal:home.attention.needsInfo', { number: item.number }) : t('portal:home.attention.overdue', { number: item.number })}</p>
        <p className="mt-1 text-lg font-bold text-warning">
          <Amount value={item.amount.amount} />
        </p>
      </div>
      <Link href={`${PORTAL.pay}?record=${item.id}&mode=upload`} variant="plain" data-testid="attention-action" className={buttonClass('primary', 'md', 'shrink-0')}>
        <Upload aria-hidden className="size-4" />
        {needsInfo ? t('portal:home.attention.action') : t('portal:home.attention.pay')}
      </Link>
    </section>
  );
}

function ConstructionCard({ data, fmt }: { data: PortalHome; fmt: PortalFormat }) {
  const { t } = useT();
  const { construction } = data;
  const latest = construction.latest;
  return (
    <article className="overflow-hidden rounded-card border border-border/70 bg-panel shadow-card">
      {latest?.imageKey && (
        <Photo imageKey={latest.imageKey} sizes="(min-width: 1024px) 420px, 100vw" className="aspect-[16/7]" labelPosition="top-end" decorative />
      )}
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <ProgressRing value={construction.progress} size={72} stroke={7} label={t('portal:construction.progressLabel', { project: construction.projectName, percent: fmt.percent(construction.progress) })}>
            <span className="leading-none">
              <bdi dir="ltr" className="ltr-ref block text-base font-bold text-text">
                {fmt.percent(construction.progress)}
              </bdi>
              <span className="text-micro text-muted">{t('portal:home.construction.built')}</span>
            </span>
          </ProgressRing>
          {latest && (
            <div className="min-w-0">
              <h3 className="text-base leading-snug font-bold text-text">{dynamicT(t)(latest.titleKey, latest.params)}</h3>
              <p className="mt-0.5 text-xs text-muted">{fmt.instant(latest.at)}</p>
            </div>
          )}
        </div>
        {latest && <p className="text-sm text-text">{dynamicT(t)(latest.bodyKey, latest.params)}</p>}
        <MilestoneList milestones={construction.milestones.slice(1, 5)} fmt={fmt} dense />
        <Link href={PORTAL.construction} variant="plain" className={buttonClass('secondary', 'md', 'w-full')}>
          <HardHat aria-hidden className="size-4" />
          {t('portal:home.construction.viewAll')}
        </Link>
      </div>
    </article>
  );
}

