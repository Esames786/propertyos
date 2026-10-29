import { ApiError, type FlatDetail, type FlatFact, type InvoiceList, type LiabilityChange, type ResolvedCharge, type Money as MoneyValue } from '@repo/contracts';
import {
  Badge,
  Breadcrumbs,
  Button,
  buttonClass,
  cn,
  ConfirmDialog,
  DateTime,
  DirectionalIcon,
  Drawer,
  ErrorState,
  InlineAlert,
  Link,
  Money,
  NotFoundState,
  Panel,
  RelatedDrawer,
  PlainTextArea,
  UrlTabs,
  useAnnounce,
  useApiMutation,
  useApiQuery,
  useQueryParam,
  useSession,
  useT,
  useToast,
} from '@repo/ui';
import { ArrowRight, Ban, BadgeCheck, Building, ChevronLeft, ChevronRight, Clock3, FileText, History, Layers, Link2, ReceiptText, Repeat2, ScrollText, Undo2, UserRound, Users, Wallet, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ACCESS_DATE, SOCIETY } from '../../../nav.config';
import { FactList, Loading, OccupancyBadge, ProblemAlert, SettlementBadge, useSocietyFormat } from '../kit';
import { AuditList, ChargesTable, ChoiceCards, StatementView } from '../parts';
import { FlatPortalTab } from '../portal/FlatPortalTab';

/**
 * SITE-006 Flat 360 (Gate C.1 reference experience B). One flat and everything connected to it:
 * block and floor, owner, occupant and the person responsible for paying, this month's charges
 * and which rule set each, the invoices and the statement. Each fact links to its own record, the
 * floor's other flats are one tap away, and ownership, occupancy and liability keep their history.
 */
export default function FlatWorkspace({ siteId, unitId }: { siteId: string; unitId: string }) {
  const { t } = useT();
  const detail = useApiQuery<FlatDetail>({ method: 'GET', path: `/sites/${siteId}/units/${unitId}` });
  if (detail.isError && detail.error instanceof ApiError && [403, 404].includes(detail.error.problem.status)) {
    return (
      <div className="space-y-4">
        <h1 id="page-title" className="sr-only">
          {t('sites:flat.notFound')}
        </h1>
        <NotFoundState />
      </div>
    );
  }
  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  if (!detail.data) return <Loading lines={10} />;
  return <Workspace data={detail.data} />;
}

function Workspace({ data }: { data: FlatDetail }) {
  const { t } = useT();
  const { can } = useSession();
  const fmt = useSocietyFormat();
  const [, setTab] = useQueryParam('tab');
  const [drawer, setDrawer] = useQueryParam('drawer');
  const [corrects, setCorrects] = useState<string | null>(null);
  const [related, setRelated] = useState(false);
  const { flat, building, floor, type } = data;
  const owner = data.owners.find((f) => isCurrent(f));
  const occupant = data.occupants.find((f) => isCurrent(f));
  const payer = data.currentPayer;
  const seesMoney = can('invoice.view');
  const seesCharges = can('billing_run.view') || can('charges.manage');
  const index = data.floorFlats.findIndex((f) => f.id === flat.id);
  const prev = data.floorFlats[index - 1];
  const next = data.floorFlats[index + 1];

  const tabs = [
    { id: 'overview', label: t('sites:flat.tabs.overview') },
    { id: 'people', label: t('sites:flat.tabs.people') },
    { id: 'payer', label: t('sites:flat.tabs.payer') },
    ...(seesCharges ? [{ id: 'charges', label: t('sites:flat.tabs.charges') }] : []),
    ...(seesMoney ? [{ id: 'invoices', label: t('sites:flat.tabs.invoices') }] : []),
    ...(can('portal_access.view') ? [{ id: 'portal', label: t('sites:flat.tabs.portal') }] : []),
    { id: 'activity', label: t('sites:flat.tabs.activity') },
  ];

  return (
    <div className="@container space-y-6" data-testid="flat-workspace" data-flat={flat.code}>
      <Breadcrumbs
        items={[
          { label: t('nav:items.sites'), href: SOCIETY.sites },
          { label: data.siteName, href: SOCIETY.site(flat.siteId) },
          { label: building.name, href: SOCIETY.structure(flat.siteId, building.id) },
          { label: t('sites:flat.floorN', { level: floor.level }), href: SOCIETY.structure(flat.siteId, building.id) },
        ]}
      />

      <section aria-labelledby="page-title" className="rounded-card border border-border/70 bg-panel p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-[1.125rem] bg-primary text-on-primary max-sm:hidden">
            <Building className="size-6" />
          </span>
          <div className="min-w-0 flex-1 basis-60">
            <p className="text-sm text-muted">
              {building.name} · {t('sites:flat.floorN', { level: floor.level })} · {type.name} · {t('sites:flat.area', { area: fmt.count(flat.areaSqft) })}
            </p>
            <h1 id="page-title" className="mt-0.5 text-figure-sm leading-tight font-bold tracking-tight text-text outline-none sm:text-figure">
              {t('sites:flat.title')} <bdi dir="ltr" className="whitespace-nowrap">{flat.code}</bdi>
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <OccupancyBadge occupancy={flat.occupancy} />
              {data.exempt && (
                <Badge tone="info" icon={Ban}>
                  {t('sites:flat.exempt')}
                </Badge>
              )}
              {data.account.flats.length > 1 && (
                <Badge tone="neutral" icon={Link2}>
                  {t('sites:flat.sharedAccount', { count: data.account.flats.length })}
                </Badge>
              )}
            </div>
          </div>
          <nav aria-label={t('sites:flat.floorNav')} className="flex items-center gap-1 max-sm:w-full max-sm:justify-between">
            {prev ? (
              <Link href={SOCIETY.flat(flat.siteId, prev.id)} variant="plain" className={cn(buttonClass('secondary', 'sm'), 'gap-1')} data-testid="flat-prev">
                <DirectionalIcon icon={ChevronLeft} className="size-4" />
                <bdi dir="ltr">{prev.code}</bdi>
              </Link>
            ) : null}
            {next ? (
              <Link href={SOCIETY.flat(flat.siteId, next.id)} variant="plain" className={cn(buttonClass('secondary', 'sm'), 'gap-1')} data-testid="flat-next">
                <bdi dir="ltr">{next.code}</bdi>
                <DirectionalIcon icon={ChevronRight} className="size-4" />
              </Link>
            ) : null}
          </nav>
        </div>

        {/* The four facts that people confuse, kept apart (I-4): who owns, who lives, who pays, what is owed. */}
        <dl className="mt-5 grid gap-3 @xl:grid-cols-2 @4xl:grid-cols-4" data-testid="flat-facts" data-tour-id="flat-facts">
          <Fact icon={UserRound} label={t('sites:flat.owner')} testId="fact-owner">
            {owner ? <PersonLink fact={owner} /> : <span className="text-muted">—</span>}
          </Fact>
          <Fact icon={Users} label={t('sites:flat.occupant')} testId="fact-occupant">
            {occupant ? <PersonLink fact={occupant} /> : <span className="text-muted">{t('sites:occupancy.vacant')}</span>}
          </Fact>
          <Fact icon={Wallet} label={t('sites:flat.payer')} testId="fact-payer">
            {payer ? <PersonLink fact={payer} /> : <span className="text-muted">—</span>}
            {payer && <span className="block text-xs text-muted">{t('sites:flat.payerSince', { date: fmt.date(payer.from) })}</span>}
          </Fact>
          <Fact icon={ReceiptText} label={t('sites:flat.balance')} testId="fact-balance">
            {seesMoney ? (
              <button type="button" onClick={() => setTab('invoices')} className="rounded-control text-start font-semibold text-primary outline-none hover:underline focus-visible:outline-2 focus-visible:outline-focus">
                <Money value={data.balance} />
              </button>
            ) : (
              <span className="text-xs text-muted">{t('sites:flat.balanceHidden')}</span>
            )}
          </Fact>
        </dl>

        <div role="group" aria-label={t('sites:flat.actions')} className="mt-5 flex flex-wrap gap-2 border-t border-border/80 pt-4">
          {can('site.manage') && (
            <Button variant="secondary" size="sm" icon={Repeat2} onPress={() => setDrawer('change-payer')} data-testid="flat-change-payer">
              {t('sites:flat.changePayer')}
            </Button>
          )}
          {seesMoney && (
            <Button variant="secondary" size="sm" icon={ScrollText} onPress={() => setTab('invoices')} data-testid="flat-open-statement">
              {t('sites:flat.statement')}
            </Button>
          )}
          {seesCharges && (
            <Button variant="secondary" size="sm" icon={Layers} onPress={() => setTab('charges')} data-testid="flat-which-rule">
              {t('sites:flat.whichRule')}
            </Button>
          )}
          <Button variant="quiet" size="sm" icon={FileText} onPress={() => setRelated(true)} data-testid="flat-related">
            {t('sites:flat.related')}
          </Button>
        </div>
      </section>

      <UrlTabs label={t('sites:flat.tabsLabel')} items={tabs}>
        {(tab) =>
          tab === 'people' ? (
            <PeopleTab data={data} />
          ) : tab === 'payer' ? (
            <PayerTab
              data={data}
              onChange={() => {
                setCorrects(null);
                setDrawer('change-payer');
              }}
              onCorrect={(id) => {
                setCorrects(id);
                setDrawer('change-payer');
              }}
            />
          ) : tab === 'charges' ? (
            <ChargesTab data={data} />
          ) : tab === 'invoices' ? (
            <InvoicesTab data={data} />
          ) : tab === 'portal' && can('portal_access.view') ? (
            <FlatPortalTab flatId={flat.id} />
          ) : tab === 'activity' ? (
            <Panel title={t('sites:flat.tabs.activity')}>
              <AuditList query={{ flat: flat.id }} />
            </Panel>
          ) : (
            <OverviewTab data={data} seesMoney={seesMoney} seesCharges={seesCharges} />
          )
        }
      </UrlTabs>

      {can('site.manage') && (
        <ChangePayerDrawer
          key={corrects ?? 'new'}
          data={data}
          isOpen={drawer === 'change-payer'}
          onOpenChange={(open) => setDrawer(open ? 'change-payer' : null)}
          {...((c) => (c ? { corrects: c } : {}))(data.changes.find((c) => c.id === corrects))}
        />
      )}
      <RelatedDrawer
        isOpen={related}
        onOpenChange={setRelated}
        recordName={flat.code}
        groups={[
          {
            title: t('sites:flat.relatedPeople'),
            items: [owner, occupant, payer]
              .filter((f): f is FlatFact => !!f)
              .filter((f, i, all) => all.findIndex((x) => x.partyId === f.partyId && x.role === f.role) === i)
              .map((f) => ({ id: `${f.role}-${f.partyId}`, ref: t(`sites:roles.${f.role}`), title: f.partyName, href: SOCIETY.person(f.partyId) })),
          },
          { title: t('sites:flat.relatedAccount'), items: [{ id: data.account.id, ref: data.account.accountNo, title: data.account.holderName, href: SOCIETY.account(data.account.id) }] },
          { title: t('sites:flat.relatedFloor'), items: data.floorFlats.filter((f) => f.id !== flat.id).map((f) => ({ id: f.id, ref: f.code, title: t('sites:flat.flatN', { code: f.code }), href: SOCIETY.flat(flat.siteId, f.id) })) },
        ]}
      />
    </div>
  );
}

const isCurrent = (f: FlatFact) => f.from <= ACCESS_DATE && (f.to === undefined || ACCESS_DATE < f.to);

function Fact({ icon: Icon, label, children, testId }: { icon: typeof Users; label: string; children: ReactNode; testId: string }) {
  return (
    <div className="min-w-0 rounded-tile bg-sunken/60 px-3 py-3" data-testid={testId}>
      <dt className="flex items-center gap-2 text-xs text-muted">
        <Icon aria-hidden className="size-4 shrink-0" />
        {label}
      </dt>
      <dd className="mt-1 min-w-0 ps-6 text-sm font-semibold break-words text-text">{children}</dd>
    </div>
  );
}

function PersonLink({ fact }: { fact: FlatFact }) {
  return (
    <Link href={SOCIETY.person(fact.partyId)}>
      <bdi>{fact.partyName}</bdi>
    </Link>
  );
}

/** The connected chain the owner asked for: Building → Floor → Flat → people → payer → charges → invoice → statement. */
function OverviewTab({ data, seesMoney, seesCharges }: { data: FlatDetail; seesMoney: boolean; seesCharges: boolean }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const [, setTab] = useQueryParam('tab');
  const period = '2026-11';
  const charges = useApiQuery<{ lines: ResolvedCharge[]; total: MoneyValue }>(seesCharges ? { method: 'GET', path: '/charges/resolve', query: { flat: data.flat.id, period } } : null);
  const invoices = useApiQuery<InvoiceList>(seesMoney ? { method: 'GET', path: '/billing/invoices', query: { flat: data.flat.id } } : null);
  const latest = invoices.data?.items.find((i) => i.source === 'billing_run') ?? invoices.data?.items[0];
  const owner = data.owners.find(isCurrent);
  const occupant = data.occupants.find(isCurrent);
  type Step = { key: string; label: string; value: ReactNode; href?: string; onPress?: () => void; here?: boolean };
  const groups: Array<{ key: string; title: string; steps: Step[] }> = [
    {
      key: 'where',
      title: t('sites:chain.where'),
      steps: [
        { key: 'building', label: t('sites:chain.building'), value: data.building.name, href: SOCIETY.structure(data.flat.siteId, data.building.id) },
        { key: 'floor', label: t('sites:chain.floor'), value: t('sites:flat.floorN', { level: data.floor.level }), href: SOCIETY.structure(data.flat.siteId, data.building.id) },
        { key: 'flat', label: t('sites:chain.flat'), value: <bdi dir="ltr">{data.flat.code}</bdi>, here: true },
      ],
    },
    {
      key: 'who',
      title: t('sites:chain.who'),
      steps: [
        { key: 'owner', label: t('sites:chain.owner'), value: owner ? <bdi>{owner.partyName}</bdi> : '—', ...(owner ? { href: SOCIETY.person(owner.partyId) } : {}) },
        { key: 'occupant', label: t('sites:chain.occupant'), value: occupant ? <bdi>{occupant.partyName}</bdi> : t('sites:occupancy.vacant'), ...(occupant ? { href: SOCIETY.person(occupant.partyId) } : {}) },
        { key: 'payer', label: t('sites:chain.payer'), value: data.currentPayer ? <bdi>{data.currentPayer.partyName}</bdi> : '—', onPress: () => setTab('payer') },
      ],
    },
    ...(seesCharges || seesMoney
      ? [
          {
            key: 'money',
            title: t('sites:chain.money'),
            steps: [
              ...(seesCharges ? [{ key: 'charges', label: t('sites:chain.charges', { period: fmt.period(period) }), value: charges.data ? <Money value={charges.data.total} /> : '…', onPress: () => setTab('charges') }] : []),
              ...(seesMoney
                ? [
                    { key: 'invoice', label: t('sites:chain.invoice'), value: latest ? <bdi dir="ltr">{latest.ref}</bdi> : t('sites:chain.noInvoice'), ...(latest ? { href: SOCIETY.invoice(latest.id) } : {}) },
                    { key: 'statement', label: t('sites:chain.statement'), value: <Money value={data.balance} />, onPress: () => setTab('invoices') },
                  ]
                : []),
            ],
          },
        ]
      : []),
  ];
  const row = 'flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm outline-none';
  return (
    <div className="space-y-6">
      <Panel title={t('sites:chain.title')} description={t('sites:chain.description')}>
        <ol className="grid gap-3 @3xl:grid-cols-3" data-testid="flat-chain">
          {groups.map((g, gi) => (
            <li key={g.key} className="relative min-w-0" data-group={g.key}>
              <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{g.title}</h3>
              <ol className="divide-y divide-border overflow-hidden rounded-tile border border-border">
                {g.steps.map((s) => {
                  const body = (
                    <>
                      <span className="shrink-0 text-muted">{s.label}</span>
                      <span className="min-w-0 truncate text-end font-semibold text-text">{s.value}</span>
                    </>
                  );
                  return (
                    <li key={s.key} data-step={s.key}>
                      {s.href ? (
                        <Link href={s.href} variant="plain" className={cn(row, 'hover:bg-raised')}>
                          {body}
                        </Link>
                      ) : s.onPress ? (
                        <button type="button" onClick={s.onPress} className={cn(row, 'hover:bg-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus')}>
                          {body}
                        </button>
                      ) : (
                        <span className={cn(row, s.here && 'bg-primary-soft/50')} {...(s.here ? { 'aria-current': 'true' as const } : {})}>
                          {body}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
              {gi < groups.length - 1 && (
                <span aria-hidden className="absolute top-1/2 -end-3 hidden translate-x-1/2 text-muted @3xl:block rtl:-translate-x-1/2">
                  <DirectionalIcon icon={ChevronRight} className="size-4" />
                </span>
              )}
            </li>
          ))}
        </ol>
      </Panel>
      <div className="grid gap-5 @4xl:grid-cols-2">
        {seesCharges && (
          <Panel
            title={t('sites:flat.monthCharges', { period: fmt.period(period) })}
            actions={
              <Link href={SOCIETY.rules(data.flat.id)} variant="plain" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary">
                {t('sites:flat.allRules')}
                <DirectionalIcon icon={ArrowRight} className="size-4" />
              </Link>
            }
          >
            {charges.data ? <ChargesTable lines={charges.data.lines} /> : <Loading lines={4} />}
          </Panel>
        )}
        <Panel title={t('sites:flat.accountTitle')}>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t('sites:flat.accountNo')}</dt>
              <dd>
                <Link href={SOCIETY.account(data.account.id)}>
                  <bdi dir="ltr">{data.account.accountNo}</bdi>
                </Link>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t('sites:flat.holder')}</dt>
              <dd className="text-end font-medium text-text">
                <bdi>{data.account.holderName}</bdi>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t('sites:flat.covers')}</dt>
              <dd className="flex flex-wrap justify-end gap-1.5">
                {data.account.flats.map((f) => (
                  <Link key={f.id} href={SOCIETY.flat(data.flat.siteId, f.id)} variant="plain" className="rounded-pill border border-border px-2 py-0.5 text-xs font-medium hover:bg-raised">
                    <bdi dir="ltr">{f.code}</bdi>
                  </Link>
                ))}
              </dd>
            </div>
          </dl>
          {data.account.flats.length > 1 && <p className="mt-3 rounded-tile bg-info-soft px-3 py-2 text-xs text-info">{t('sites:flat.sharedAccountNote')}</p>}
        </Panel>
      </div>
    </div>
  );
}

function PeopleTab({ data }: { data: FlatDetail }) {
  const { t } = useT();
  return (
    <div className="grid gap-5 @4xl:grid-cols-2">
      <Panel title={t('sites:flat.ownership')} description={t('sites:flat.ownershipHint')}>
        <FactList facts={data.owners} today={ACCESS_DATE} emptyText={t('sites:flat.noOwner')} testId="ownership-history" renderExtra={(f) => (f.sharePct ? <span className="text-xs text-muted">{t('sites:flat.share', { pct: f.sharePct })}</span> : null)} />
      </Panel>
      <Panel title={t('sites:flat.occupancy')} description={t('sites:flat.occupancyHint')}>
        <FactList facts={data.occupants} today={ACCESS_DATE} emptyText={t('sites:flat.noOccupant')} testId="occupancy-history" renderExtra={(f) => (f.occupancyKind ? <span className="text-xs text-muted">{t(`sites:flat.kind.${f.occupancyKind}`)}</span> : null)} />
      </Panel>
      <Panel title={t('sites:flat.booking')} className="@4xl:col-span-2">
        <p className="text-sm text-muted">{t('sites:flat.bookingNone')}</p>
      </Panel>
    </div>
  );
}

function PayerTab({ data, onChange, onCorrect }: { data: FlatDetail; onChange: () => void; onCorrect: (changeId: string) => void }) {
  const { t } = useT();
  const { can } = useSession();
  return (
    <div className="grid gap-5 @4xl:grid-cols-[2fr_1fr]">
      {data.changes.length > 0 && (
        <div className="@4xl:col-span-2">
          <LiabilityChanges data={data} onCorrect={onCorrect} />
        </div>
      )}
      <Panel
        title={t('sites:flat.liability')}
        description={t('sites:flat.liabilityHint')}
        actions={
          can('site.manage') ? (
            <Button variant="secondary" size="sm" icon={Repeat2} onPress={onChange}>
              {t('sites:flat.changePayer')}
            </Button>
          ) : undefined
        }
      >
        <FactList facts={data.payers} today={ACCESS_DATE} emptyText={t('sites:flat.noPayer')} testId="liability-history" />
      </Panel>
      <Panel title={t('sites:flat.accountTitle')}>
        <p className="text-sm text-text">
          <Link href={SOCIETY.account(data.account.id)}>
            <bdi dir="ltr">{data.account.accountNo}</bdi>
          </Link>{' '}
          · <bdi>{data.account.holderName}</bdi>
        </p>
        <p className="mt-2 text-xs text-muted">{t('sites:flat.perUnit')}</p>
      </Panel>
    </div>
  );
}

function ChargesTab({ data }: { data: FlatDetail }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const period = '2026-11';
  const q = useApiQuery<{ lines: ResolvedCharge[]; total: MoneyValue }>({ method: 'GET', path: '/charges/resolve', query: { flat: data.flat.id, period } });
  return (
    <Panel
      title={t('sites:flat.whichRuleTitle', { period: fmt.period(period) })}
      description={t('sites:flat.whichRuleHint')}
      actions={
        <Link href={SOCIETY.rules(data.flat.id)} variant="plain" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary">
          {t('sites:flat.allRules')}
          <DirectionalIcon icon={ArrowRight} className="size-4" />
        </Link>
      }
    >
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Loading lines={4} />
      ) : (
        <div className="space-y-3">
          <ChargesTable lines={q.data.lines} />
          <p className="flex justify-between gap-3 border-t border-border pt-3 text-sm">
            <span className="font-semibold text-text">{t('sites:flat.monthTotal')}</span>
            <Money value={q.data.total} className="text-base font-bold text-text" />
          </p>
        </div>
      )}
    </Panel>
  );
}

function InvoicesTab({ data }: { data: FlatDetail }) {
  const { t } = useT();
  const [period, setPeriod] = useQueryParam('period');
  const q = useApiQuery<InvoiceList>({ method: 'GET', path: '/billing/invoices', query: { flat: data.flat.id } });
  return (
    <div className="space-y-5">
      <Panel title={t('sites:flat.invoices')}>
        {q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : !q.data ? (
          <Loading lines={3} />
        ) : q.data.items.length === 0 ? (
          <p className="text-sm text-muted">{t('sites:flat.noInvoices')}</p>
        ) : (
          <ul className="divide-y divide-border" data-testid="flat-invoices">
            {q.data.items.map((i) => (
              <li key={i.id}>
                <Link href={SOCIETY.invoice(i.id)} variant="plain" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-control px-2 py-2.5 hover:bg-raised" data-testid="flat-invoice">
                  <span className="min-w-0 flex-1">
                    <bdi dir="ltr" className="ltr-ref block font-semibold text-text">
                      {i.ref}
                    </bdi>
                    <span className="block text-xs text-muted">
                      {t(`billing:source.${i.source}`)} · {t('sites:flat.payerOf', { name: i.payerName })}
                    </span>
                  </span>
                  <SettlementBadge invoice={i} />
                  <Money value={i.total} className="font-semibold" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel>
        <StatementView accountId={data.account.id} flat={data.flat.id} period={period ?? '2026-11'} onPeriod={(p) => setPeriod(p === '2026-11' ? null : p)} />
      </Panel>
    </div>
  );
}

/** The next few unbilled months a change may start in (the server checks again on approval). */
const monthsFrom = (period: string, n = 4) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)) - 1 + i, 1));
    return d.toISOString().slice(0, 10);
  });

function ChangePayerDrawer({ data, isOpen, onOpenChange, corrects }: { data: FlatDetail; isOpen: boolean; onOpenChange: (open: boolean) => void; corrects?: LiabilityChange }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const announce = useAnnounce();
  const mutation = useApiMutation();
  const people = [...data.owners, ...data.occupants].filter(isCurrent).filter((f, i, all) => all.findIndex((x) => x.partyId === f.partyId) === i);
  const months = monthsFrom(data.firstOpenPeriod);
  const [partyId, setPartyId] = useState<string | null>(null);
  const [from, setFrom] = useState<string>(months[0]!);
  const [reason, setReason] = useState('');
  const current = data.currentPayer;

  const submit = async () => {
    if (!partyId) return;
    await mutation.mutateAsync({ method: 'POST', path: `/sites/${data.flat.siteId}/units/${data.flat.id}/payer`, body: { partyId, from, reason, ...(corrects ? { corrects: corrects.id } : {}) } });
    const name = people.find((p) => p.partyId === partyId)?.partyName ?? '';
    const msg = t('sites:payer.requested', { name, flat: data.flat.code, date: fmt.date(from) });
    toast.success(msg);
    announce(msg);
    onOpenChange(false);
    setPartyId(null);
    setReason('');
  };

  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={corrects ? t('sites:payer.correctTitle', { flat: data.flat.code }) : t('sites:payer.title', { flat: data.flat.code })}
      subtitle={current ? t('sites:payer.current', { name: current.partyName }) : undefined}
      testId="change-payer-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onPress={() => onOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="primary" onPress={() => void submit()} isDisabled={!partyId || reason.trim().length < 5} isPending={mutation.isPending} data-testid="change-payer-save">
            {t('sites:payer.request')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <InlineAlert tone="info">{t('sites:payer.approvalNote')}</InlineAlert>
        {corrects && (
          <InlineAlert tone="warning" title={t('sites:payer.correcting', { name: corrects.partyName, date: fmt.date(corrects.from) })}>
            <p>{t('sites:payer.correctingBody')}</p>
          </InlineAlert>
        )}
        <ChoiceCards
          label={t('sites:payer.who')}
          value={partyId}
          onChange={setPartyId}
          testId="change-payer-party"
          options={people
            .filter((p) => corrects || p.partyId !== current?.partyId)
            .map((p) => ({ id: p.partyId, title: p.partyName, detail: t(`sites:roles.${p.role}`) }))}
        />
        <ChoiceCards
          label={t('sites:payer.from')}
          value={from}
          onChange={setFrom}
          testId="change-payer-from"
          options={months.map((m) => ({ id: m, title: fmt.period(m.slice(0, 7)), detail: m === months[0] ? t('sites:payer.fromNext') : undefined }))}
        />
        <PlainTextArea label={t('sites:payer.reason')} description={t('sites:payer.reasonHelp')} value={reason} onChange={setReason} testId="change-payer-reason" />
        {mutation.isError && <ProblemAlert error={mutation.error} />}
      </div>
    </Drawer>
  );
}

const CHANGE_STATE: Record<LiabilityChange['state'], ['warning' | 'success' | 'error' | 'neutral', typeof Clock3]> = {
  pending_approval: ['warning', Clock3],
  approved: ['success', BadgeCheck],
  rejected: ['error', XCircle],
  withdrawn: ['neutral', Undo2],
  superseded: ['neutral', History],
};

/**
 * Changes of liability for this flat: requested by one person, decided by another (never the
 * requester); an approved change that has not started yet can be corrected (a new request that
 * supersedes it on approval). History is kept: nothing is overwritten.
 */
function LiabilityChanges({ data, onCorrect }: { data: FlatDetail; onCorrect: (changeId: string) => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const { can, persona } = useSession();
  const toast = useToast();
  const mutation = useApiMutation<LiabilityChange>();
  const [rejecting, setRejecting] = useState<LiabilityChange | null>(null);
  const [error, setError] = useState<unknown>(null);
  const decide = async (c: LiabilityChange, decision: 'approve' | 'reject' | 'withdraw', note?: string) => {
    setError(null);
    try {
      await mutation.mutateAsync({ method: 'POST', path: `/payer-changes/${c.id}/${decision}`, body: note ? { note } : {} });
      toast.success(t(`sites:payer.decided.${decision}`, { flat: c.flatCode }));
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Panel title={t('sites:payer.changesTitle')} description={t('sites:payer.changesHint')}>
      <ol className="space-y-2" data-testid="liability-changes">
        {data.changes.map((c) => {
          const [tone, Icon] = CHANGE_STATE[c.state];
          const mine = c.requestedBy === persona?.principalId;
          return (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 rounded-tile border border-border px-4 py-3" data-testid="liability-change" data-state={c.state}>
              <span className="min-w-0 text-sm">
                <span className="block font-semibold text-text">
                  {t('sites:payer.changeLine', { name: c.partyName, date: fmt.date(c.from) })}
                </span>
                <span className="block text-xs text-muted">
                  {c.previousName && <>{t('sites:payer.insteadOf', { name: c.previousName })} · </>}
                  {t('sites:payer.requestedBy', { name: c.requestedByName })} · <DateTime value={c.requestedAt} style="dateTime" />
                  {c.decidedByName && <> · {t('sites:payer.decidedBy', { name: c.decidedByName })}</>}
                </span>
                <span className="block text-xs text-muted"><bdi>{t('billing:quote', { text: c.reason })}</bdi></span>
                {c.corrects && <span className="block text-xs text-muted">{t('sites:payer.isCorrection')}</span>}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={tone} icon={Icon}>{t(`sites:payer.states.${c.state}`)}</Badge>
                {c.state === 'pending_approval' && can('liability.approve') && !mine && (
                  <>
                    <Button variant="primary" size="sm" icon={BadgeCheck} onPress={() => void decide(c, 'approve')} data-testid="liability-approve">{t('sites:payer.approve')}</Button>
                    <Button variant="secondary" size="sm" icon={XCircle} onPress={() => setRejecting(c)} data-testid="liability-reject">{t('sites:payer.reject')}</Button>
                  </>
                )}
                {c.state === 'pending_approval' && mine && (
                  <Button variant="quiet" size="sm" icon={Undo2} onPress={() => void decide(c, 'withdraw')} data-testid="liability-withdraw">{t('sites:payer.withdraw')}</Button>
                )}
                {c.state === 'approved' && c.from.slice(0, 7) >= data.firstOpenPeriod && can('site.manage') && !data.changes.some((x) => x.state === 'pending_approval') && (
                  <Button variant="secondary" size="sm" icon={Repeat2} onPress={() => onCorrect(c.id)} data-testid="liability-correct">{t('sites:payer.correct')}</Button>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {error ? <ProblemAlert error={error} className="mt-3" /> : null}
      <ConfirmDialog
        isOpen={rejecting !== null}
        onOpenChange={(o) => !o && setRejecting(null)}
        title={t('sites:payer.rejectTitle')}
        effect={t('sites:payer.rejectEffect')}
        confirmLabel={t('sites:payer.reject')}
        destructive
        reasonLabel={t('sites:payer.rejectReason')}
        onConfirm={async (note) => {
          if (rejecting) await decide(rejecting, 'reject', note);
          setRejecting(null);
        }}
      />
    </Panel>
  );
}
