import { ApiError, type CollectionSettings, type SetupStep, type SiteOverview } from '@repo/contracts';
import { formatIban } from '@repo/i18n';
import { Badge, Breadcrumbs, cn, DirectionalIcon, ErrorState, Link, NotFoundState, Panel, UrlTabs, useApiQuery, useSession, useT } from '@repo/ui';
import { BadgeCheck, Ban, Building, Check, ChevronRight, CircleDashed, Clock3, Lock, Upload } from 'lucide-react';
import { SOCIETY } from '../../../nav.config';
import { FlatJump, LaterBadge, Loading, useSocietyFormat } from '../kit';
import { AuditList } from '../parts';

/**
 * SITE-002 Site 360 with SITE-008 (the onboarding checklist, A4 §1) as its overview, the verified
 * collection account (BILL-010) and the payment methods allowed at the site (BILL-012). Changing
 * the collection account or the methods needs two people and arrives with collections (C.2); here
 * they are shown read-only, exactly as residents will see them.
 */
export default function SiteWorkspace({ siteId }: { siteId: string }) {
  const { t } = useT();
  const q = useApiQuery<SiteOverview>({ method: 'GET', path: `/sites/${siteId}` });
  if (q.isError && q.error instanceof ApiError && [403, 404].includes(q.error.problem.status)) {
    return (
      <div>
        <h1 id="page-title" className="sr-only">{t('sites:site.notFound')}</h1>
        <NotFoundState />
      </div>
    );
  }
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const data = q.data;
  const tabs = [
    { id: 'overview', label: t('sites:site.tabs.overview') },
    { id: 'collection-settings', label: t('sites:site.tabs.collection') },
    { id: 'payment-methods', label: t('sites:site.tabs.methods') },
    { id: 'activity', label: t('sites:site.tabs.activity') },
  ];
  return (
    <div className="@container space-y-6" data-testid="site-workspace">
      <Breadcrumbs items={[{ label: t('nav:items.sites'), href: SOCIETY.sites }]} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted">{data.site.city} · <bdi>{data.site.legalEntityName}</bdi></p>
          <h1 id="page-title" className="mt-0.5 text-[1.75rem] leading-tight font-bold tracking-tight text-text outline-none sm:text-[2rem]"><bdi>{data.site.name}</bdi></h1>
          <p className="mt-1 text-sm text-muted">{t('sites:site.summary', { blocks: data.site.buildings, flats: data.site.flats, occupied: data.site.occupied, declared: data.site.declaredFlats })}</p>
        </div>
        {data.site.flats > 0 && <FlatJump siteId={siteId} className="w-full sm:w-72" testId="site-flat-jump" />}
      </header>
      <UrlTabs label={t('sites:site.tabsLabel')} items={tabs}>
        {(tab) =>
          tab === 'collection-settings' ? (
            <CollectionTab siteId={siteId} />
          ) : tab === 'payment-methods' ? (
            <MethodsTab siteId={siteId} />
          ) : tab === 'activity' ? (
            <Panel title={t('sites:site.tabs.activity')}><AuditList query={{}} /></Panel>
          ) : (
            <OverviewTab data={data} />
          )
        }
      </UrlTabs>
    </div>
  );
}

const STEP_ICON = { done: Check, next: ChevronRight, todo: CircleDashed, blocked: Lock, later: Clock3 } as const;

function OverviewTab({ data }: { data: SiteOverview }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const { can } = useSession();
  const done = data.checklist.filter((s) => s.state === 'done').length;
  const total = data.checklist.filter((s) => s.state !== 'later').length;
  return (
    <div className="grid gap-5 @5xl:grid-cols-[3fr_2fr]">
      <Panel title={t('sites:checklist.title')} description={t('sites:checklist.progress', { done, total })}>
        <ol className="space-y-2" data-testid="site-checklist">
          {data.checklist.map((s, i) => (
            <ChecklistRow key={s.key} step={s} n={i + 1} canAct={can('site.manage') || can('opening_balance.import') || can('charges.manage') || can('billing_run.create')} />
          ))}
        </ol>
      </Panel>
      <div className="space-y-5">
        <Panel title={t('sites:site.blocks')} actions={<Link href={SOCIETY.structure(data.site.id)} className="inline-flex min-h-10 items-center text-sm">{t('sites:site.openStructure')}</Link>}>
          <ul className="space-y-2" data-testid="site-blocks">
            {data.buildings.map((b) => (
              <li key={b.id}>
                <Link href={SOCIETY.structure(data.site.id, b.id)} variant="plain" className="flex items-center gap-3 rounded-tile border border-border px-3 py-2.5 hover:bg-raised">
                  <Building aria-hidden className="size-4 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-text">{b.name}</span>
                    <span className="block text-xs text-muted">{t('sites:site.blockLine', { floors: fmt.count(b.floors), flats: fmt.count(b.flats), vacant: fmt.count(b.vacant), arrears: fmt.count(b.arrearsAccounts) })}</span>
                  </span>
                  <DirectionalIcon icon={ChevronRight} className="size-4 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={t('sites:site.types')} actions={<Link href={SOCIETY.unitTypes(data.site.id)} className="inline-flex min-h-10 items-center text-sm">{t('sites:site.openTypes')}</Link>}>
          <ul className="space-y-1 text-sm">
            {data.types.map((ty) => (
              <li key={ty.id} className="flex justify-between gap-3">
                <span className="text-text">{ty.name}</span>
                <span className="text-muted">{t('sites:site.typeLine', { flats: fmt.count(ty.flats), area: fmt.count(ty.areaSqft) })}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function ChecklistRow({ step, n, canAct }: { step: SetupStep; n: number; canAct: boolean }) {
  const { t } = useT();
  const Icon = STEP_ICON[step.state];
  const body = (
    <>
      <span aria-hidden className={cn('grid size-8 shrink-0 place-items-center rounded-pill text-sm font-bold', step.state === 'done' ? 'bg-success-soft text-success' : step.state === 'next' ? 'bg-primary text-on-primary' : 'bg-sunken text-muted')}>
        {step.state === 'done' || step.state === 'next' ? <Icon className="size-4" /> : n}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-text">{t(`sites:checklist.steps.${step.key}.title`)}</span>
        <span className="block text-xs text-muted">
          {step.state === 'blocked' && step.waitsFor
            ? t('sites:checklist.waitsFor', { step: t(`sites:checklist.steps.${step.waitsFor}.title`) })
            : t(`sites:checklist.steps.${step.key}.${step.state === 'done' ? 'done' : 'todo'}`, { count: step.count ?? 0 })}
        </span>
      </span>
      {step.state === 'later' && step.gate ? <LaterBadge gate={step.gate} /> : <span className="sr-only">{t(`sites:checklist.state.${step.state}`)}</span>}
      {step.state === 'next' && <Badge tone="info" icon={ChevronRight}>{t('sites:checklist.state.next')}</Badge>}
    </>
  );
  const linkable = step.state !== 'blocked' && step.state !== 'later' && (step.state === 'done' || canAct);
  return (
    <li data-step={step.key} data-state={step.state}>
      {linkable ? (
        <Link href={step.href} variant="plain" className={cn('flex items-center gap-3 rounded-tile border px-3 py-2.5 hover:bg-raised', step.state === 'next' ? 'border-primary/40 bg-primary-soft/30' : 'border-border')}>
          {body}
        </Link>
      ) : (
        <div className={cn('flex items-center gap-3 rounded-tile border border-border px-3 py-2.5', step.state === 'blocked' && 'opacity-80')}>{body}</div>
      )}
    </li>
  );
}

function CollectionTab({ siteId }: { siteId: string }) {
  const { t } = useT();
  const q = useApiQuery<CollectionSettings>({ method: 'GET', path: `/sites/${siteId}/collection-settings` });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={6} />;
  const s = q.data;
  return (
    <div className="grid gap-5 @4xl:grid-cols-2">
      <Panel title={t('sites:collection.payeeTitle')} description={t('sites:collection.payeeHint')}>
        {s.payee ? (
          <dl className="space-y-3 text-sm" data-testid="payee-card">
            <Row label={t('sites:collection.status')} value={<Badge tone="success" icon={BadgeCheck}>{t('sites:collection.verified')}</Badge>} />
            <Row label={t('sites:collection.title')} value={<bdi>{s.payee.accountTitle}</bdi>} />
            <Row label={t('sites:collection.bank')} value={s.payee.bankName} />
            <Row label={t('sites:collection.iban')} value={<bdi dir="ltr" className="ltr-ref font-mono">{formatIban(s.payee.iban)}</bdi>} />
            <Row label={t('sites:collection.reference')} value={<bdi dir="ltr" className="ltr-ref font-mono">{s.payee.referenceFormat}</bdi>} />
          </dl>
        ) : (
          <p className="text-sm text-muted">{t('sites:collection.none')}</p>
        )}
        <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">{t('sites:collection.change')} <LaterBadge gate="C.2" /></p>
      </Panel>
      <Panel title={t('sites:collection.rulesTitle')}>
        <dl className="space-y-3 text-sm">
          <Row label={t('sites:collection.issueDay')} value={t('sites:collection.dayN', { day: s.issueDay })} />
          <Row label={t('sites:collection.dueDay')} value={t('sites:collection.dayN', { day: s.dueDay })} />
          <Row label={t('sites:collection.allocation')} value={t('sites:collection.oldestFirst')} />
          <Row label={t('sites:collection.lateFees')} value={t('sites:collection.lateFeesNone')} />
          <Row label={t('sites:collection.reminders')} value={<LaterBadge gate="C.2" />} />
        </dl>
        <p className="mt-4 text-xs text-muted">{t('sites:collection.platformNote')}</p>
      </Panel>
    </div>
  );
}

function MethodsTab({ siteId }: { siteId: string }) {
  const { t } = useT();
  const q = useApiQuery<CollectionSettings>({ method: 'GET', path: `/sites/${siteId}/collection-settings` });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={4} />;
  return (
    <Panel title={t('sites:methods.title')} description={t('sites:methods.hint')}>
      <ul className="divide-y divide-border rounded-tile border border-border" data-testid="payment-methods">
        {q.data.methods.map((m) => (
          <li key={m.method} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-method={m.method} data-allowed={m.allowed}>
            <span className="min-w-0">
              <span className="block font-semibold text-text">{t(`sites:methods.kinds.${m.method}`)}</span>
              <span className="block text-xs text-muted">{t(`sites:methods.hints.${m.method}`)}</span>
            </span>
            {m.allowed ? <Badge tone="success" icon={Check}>{t('sites:methods.allowed')}</Badge> : m.gate ? <LaterBadge gate={m.gate} /> : <Badge tone="neutral" icon={Ban}>{t('sites:methods.notAllowed')}</Badge>}
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-center gap-2 text-xs text-muted"><Upload aria-hidden className="size-3.5" />{t('sites:methods.proofNote')}</p>
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
      <dt className="text-muted">{label}</dt>
      <dd className="text-end font-medium text-text">{value}</dd>
    </div>
  );
}
