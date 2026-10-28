import { ApiError, type FlatDetail, type FlatFact, type InvoiceList, type ResolvedCharge, type Money as MoneyValue } from '@repo/contracts';
import {
  Badge,
  Breadcrumbs,
  Button,
  buttonClass,
  cn,
  DirectionalIcon,
  Drawer,
  ErrorState,
  InlineAlert,
  Link,
  Money,
  NotFoundState,
  Panel,
  RelatedDrawer,
  UrlTabs,
  useAnnounce,
  useApiMutation,
  useApiQuery,
  useQueryParam,
  useSession,
  useT,
  useToast,
} from '@repo/ui';
import { ArrowRight, Ban, Building, ChevronLeft, ChevronRight, FileText, Layers, Link2, ReceiptText, Repeat2, ScrollText, UserRound, Users, Wallet } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ACCESS_DATE, SOCIETY } from '../../../nav.config';
import { FactList, Loading, OccupancyBadge, ProblemAlert, SettlementBadge, useSocietyFormat } from '../kit';
import { AuditList, ChargesTable, ChoiceCards, StatementView } from '../parts';

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
            <h1 id="page-title" className="mt-0.5 text-[1.75rem] leading-tight font-bold tracking-tight text-text outline-none sm:text-[2rem]">
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
            <PayerTab data={data} onChange={() => setDrawer('change-payer')} />
          ) : tab === 'charges' ? (
            <ChargesTab data={data} />
          ) : tab === 'invoices' ? (
            <InvoicesTab data={data} />
          ) : tab === 'activity' ? (
            <Panel title={t('sites:flat.tabs.activity')}>
              <AuditList query={{ flat: flat.id }} />
            </Panel>
          ) : (
            <OverviewTab data={data} seesMoney={seesMoney} seesCharges={seesCharges} />
          )
        }
      </UrlTabs>

      {can('site.manage') && <ChangePayerDrawer data={data} isOpen={drawer === 'change-payer'} onOpenChange={(open) => setDrawer(open ? 'change-payer' : null)} />}
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

function PayerTab({ data, onChange }: { data: FlatDetail; onChange: () => void }) {
  const { t } = useT();
  const { can } = useSession();
  return (
    <div className="grid gap-5 @4xl:grid-cols-[2fr_1fr]">
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

function ChangePayerDrawer({ data, isOpen, onOpenChange }: { data: FlatDetail; isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const announce = useAnnounce();
  const mutation = useApiMutation();
  const people = [...data.owners, ...data.occupants].filter(isCurrent).filter((f, i, all) => all.findIndex((x) => x.partyId === f.partyId) === i);
  const [partyId, setPartyId] = useState<string | null>(null);
  const [from, setFrom] = useState<string>('2026-11-01');
  const months = ['2026-11-01', '2026-12-01', '2027-01-01'];
  const current = data.currentPayer;

  const submit = async () => {
    if (!partyId) return;
    await mutation.mutateAsync({ method: 'POST', path: `/sites/${data.flat.siteId}/units/${data.flat.id}/payer`, body: { partyId, from } });
    const name = people.find((p) => p.partyId === partyId)?.partyName ?? '';
    const msg = t('sites:payer.done', { name, flat: data.flat.code, date: fmt.date(from) });
    toast.success(msg);
    announce(msg);
    onOpenChange(false);
    setPartyId(null);
  };

  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t('sites:payer.title', { flat: data.flat.code })}
      subtitle={current ? t('sites:payer.current', { name: current.partyName }) : undefined}
      testId="change-payer-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onPress={() => onOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="primary" onPress={() => void submit()} isDisabled={!partyId} isPending={mutation.isPending} data-testid="change-payer-save">
            {t('sites:payer.save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <InlineAlert tone="info">{t('sites:payer.history')}</InlineAlert>
        <ChoiceCards
          label={t('sites:payer.who')}
          value={partyId}
          onChange={setPartyId}
          testId="change-payer-party"
          options={people
            .filter((p) => p.partyId !== current?.partyId)
            .map((p) => ({ id: p.partyId, title: p.partyName, detail: t(`sites:roles.${p.role}`) }))}
        />
        <ChoiceCards
          label={t('sites:payer.from')}
          value={from}
          onChange={setFrom}
          testId="change-payer-from"
          options={months.map((m) => ({ id: m, title: fmt.period(m.slice(0, 7)), detail: m === months[0] ? t('sites:payer.fromNext') : undefined }))}
        />
        {mutation.isError && <ProblemAlert error={mutation.error} />}
      </div>
    </Drawer>
  );
}
