import { ApiError, type FlatHousehold, type HouseholdPerson, type HouseholdRelationship, type HouseholdRequest, type MyProperty, type PropertyDetail } from '@repo/contracts';
import { Badge, Breadcrumbs, Button, EmptyState, ErrorState, InlineAlert, Link, NotFoundState, Panel, PlainTextField, SelectControl, UrlTabs, useAnnounce, useApiMutation, useApiQuery, useQueryParam, useSession, useT, useToast, type StatusTone } from '@repo/ui';
import { ArrowRight, Building2, House, ShieldCheck, UserPlus, UserRound } from 'lucide-react';
import { useState } from 'react';
import { DUES } from '../../nav.config';
import { PortalSkeleton, usePortalFormat } from '../portal/shared';
import { DEMO_TODAY } from '../dues/kit';

const useFmt = () => usePortalFormat(`${DEMO_TODAY}T09:00:00Z`);
const RELATIONSHIPS: readonly HouseholdRelationship[] = ['spouse', 'child', 'parent', 'sibling', 'relative', 'domestic_staff', 'other'];
const BALANCE_TONE: Record<MyProperty['balanceState'], StatusTone> = { paid_up: 'success', due: 'warning', overdue: 'error', credit: 'info' };
const BILL_TONE: Record<PropertyDetail['bills'][number]['state'], StatusTone> = { paid: 'success', partly_paid: 'warning', due: 'warning', overdue: 'error' };
const REQUEST_TONE: Record<HouseholdRequest['state'], StatusTone> = { pending: 'info', approved: 'success', rejected: 'neutral', withdrawn: 'neutral' };

export const PROPERTY = (flatId: string) => `/customer/portal/property-360-workspace?record=${flatId}`;
export const HOUSEHOLD = '/customer/portal/household';

function Title({ title, intro }: { title: string; intro?: string }) {
  return (
    <header className="space-y-1">
      <h1 id="page-title" tabIndex={-1} className="text-figure-sm font-bold tracking-tight text-text outline-none">
        {title}
      </h1>
      {intro && <p className="text-sm text-muted">{intro}</p>}
    </header>
  );
}

function Roles({ roles }: { roles: readonly string[] }) {
  const { t } = useT();
  return <>{roles.map((r) => t(`identity:portal.roles.${r}` as 'identity:portal.roles.owner')).join(' · ')}</>;
}

/**
 * PORTAL-002 My properties (Gate D.1): every flat the resident's verified links reach in this
 * organisation, with their own balance for it (per-unit liability) and a way into each flat.
 */
export function MyPropertiesPage() {
  const { t } = useT();
  const fmt = useFmt();
  const { tenant } = useSession();
  const q = useApiQuery<MyProperty[]>({ method: 'GET', path: '/portal/properties' });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <PortalSkeleton title={t('nav:pages.myProperties')} />;
  return (
    <div className="@container space-y-6" data-testid="my-properties">
      <Title title={t('nav:pages.myProperties')} intro={t('identity:properties.intro', { org: tenant.name })} />
      <ul className="grid gap-3 @2xl:grid-cols-2">
        {q.data.map((p) => (
          <li key={p.flatId}>
            <Link href={PROPERTY(p.flatId)} variant="plain" className="flex h-full flex-col gap-3 rounded-card border border-border/70 bg-panel p-5 shadow-card hover:border-primary/40" data-testid="property-card" data-flat={p.flatCode}>
              <span className="flex items-start gap-3">
                <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-tile bg-primary-soft text-primary">
                  <House className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold text-text">
                    <bdi dir="ltr" className="ltr-ref">
                      {p.flatCode}
                    </bdi>
                  </span>
                  <span className="block text-sm text-muted">
                    <bdi>{p.buildingName}</bdi> · <Roles roles={p.roles} />
                  </span>
                </span>
                <Badge tone={BALANCE_TONE[p.balanceState]}>{t(`identity:properties.balanceState.${p.balanceState}`)}</Badge>
              </span>
              <span className="text-xs text-muted">{t('identity:properties.facts', { type: p.typeName, area: fmt.count(p.areaSqft), floor: p.floor })}</span>
              <span className="mt-auto flex flex-wrap items-end justify-between gap-2 border-t border-border pt-3">
                <span>
                  <span className="block text-figure-sm font-bold text-text">
                    {p.balanceState === 'credit' ? t('identity:properties.inCredit', { amount: fmt.money(p.balance.replace('-', '')) }) : Number(p.balance) > 0 ? t('identity:properties.owes', { amount: fmt.money(p.balance) }) : t('identity:properties.nothingOwed')}
                  </span>
                  <span className="block text-xs text-muted">
                    {t('identity:properties.account', { account: p.accountNo })} · {t('identity:properties.since', { date: fmt.date(p.since) })}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  {t('identity:properties.open')}
                  <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * PORTAL-003 Property 360 (Gate D.1): one of the resident's flats: the facts, their own bills for it
 * (only what they are responsible for), and the household registered there.
 */
export function PropertyPage() {
  const { t } = useT();
  const fmt = useFmt();
  const [record] = useQueryParam('record');
  const q = useApiQuery<PropertyDetail>(record ? { method: 'GET', path: `/portal/properties/${record}` } : null);
  if (!record || (q.isError && q.error instanceof ApiError && [403, 404].includes(q.error.problem.status)))
    return (
      <div className="space-y-4">
        <h1 id="page-title" className="sr-only">
          {t('identity:properties.notFound')}
        </h1>
        <NotFoundState />
      </div>
    );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <PortalSkeleton title={t('nav:pages.propertyDetail')} />;
  const p = q.data;
  return (
    <div className="@container space-y-6" data-testid="property-detail" data-flat={p.flatCode}>
      <Breadcrumbs items={[{ label: t('nav:pages.myProperties'), href: '/customer/portal/my-properties' }]} />
      <section aria-labelledby="page-title" className="rounded-card border border-border/70 bg-panel p-5 shadow-card">
        <div className="flex flex-wrap items-start gap-4">
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-tile bg-primary text-on-primary">
            <Building2 className="size-6" />
          </span>
          <div className="min-w-0 flex-1 basis-[min(100%,14rem)]">
            <p className="text-sm text-muted">
              <bdi>{p.siteName}</bdi> · <bdi>{p.buildingName}</bdi>
            </p>
            <h1 id="page-title" tabIndex={-1} className="text-figure-sm font-bold tracking-tight text-text outline-none">
              <bdi dir="ltr" className="ltr-ref">
                {p.flatCode}
              </bdi>
            </h1>
            <p className="text-sm text-muted">
              <Roles roles={p.roles} /> · {t(`identity:household.occupancy.${p.occupancy}`)}
            </p>
          </div>
          <div className="text-end">
            <Badge tone={BALANCE_TONE[p.balanceState]}>{t(`identity:properties.balanceState.${p.balanceState}`)}</Badge>
            <p className="mt-1 text-figure-sm font-bold text-text">{Number(p.balance) > 0 ? fmt.money(p.balance) : t('identity:properties.nothingOwed')}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          {Number(p.balance) > 0 && (
            <Link href={DUES.pay} variant="plain" className="inline-flex min-h-10 items-center rounded-control bg-primary px-4 text-sm font-semibold text-on-primary">
              {t('identity:properties.pay')}
            </Link>
          )}
          <Link href={DUES.statement} variant="plain" className="inline-flex min-h-10 items-center rounded-control border border-border-control px-4 text-sm font-semibold text-text hover:bg-raised">
            {t('identity:properties.statement')}
          </Link>
        </div>
      </section>
      <UrlTabs
        label={t('identity:properties.tabsLabel')}
        items={[
          { id: 'overview', label: t('identity:properties.tabs.overview') },
          { id: 'bills', label: t('identity:properties.tabs.bills') },
          { id: 'household', label: t('identity:properties.tabs.household') },
        ]}
      >
        {(tab) =>
          tab === 'bills' ? (
            <Panel title={t('identity:properties.billsTitle')} description={t('identity:properties.onlyYours')}>
              {p.bills.length === 0 ? (
                <p className="text-sm text-muted">{t('identity:properties.noBills')}</p>
              ) : (
                <ul className="divide-y divide-border" data-testid="property-bills">
                  {p.bills.map((b) => (
                    <li key={b.invoiceId} className="flex flex-wrap items-center gap-3 py-3">
                      <span className="min-w-0 flex-1 basis-[min(100%,14rem)]">
                        <span className="block font-medium text-text">{fmt.monthYear(`${b.period}-01`)}</span>
                        <bdi dir="ltr" className="ltr-ref text-xs text-muted">
                          {b.reference}
                        </bdi>
                      </span>
                      <Badge tone={BILL_TONE[b.state]}>{t(`identity:properties.billState.${b.state}`)}</Badge>
                      <span className="font-semibold text-text">{fmt.money(b.amount)}</span>
                      <Link href={DUES.bill(b.invoiceId)} className="text-sm">
                        {t('identity:properties.seeBill')}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : tab === 'household' ? (
            <Panel title={t('nav:pages.household')}>
              <PeopleList people={p.household} />
              <Link href={HOUSEHOLD} className="mt-4 inline-flex items-center gap-1.5 text-sm">
                <UserPlus aria-hidden className="size-4" />
                {t('identity:household.addTitle')}
              </Link>
            </Panel>
          ) : (
            <Panel>
              <dl className="grid gap-4 @lg:grid-cols-3">
                {[
                  [t('identity:properties.label.flat'), t('identity:properties.facts', { type: p.typeName, area: fmt.count(p.areaSqft), floor: p.floor })],
                  [t('identity:properties.label.account'), p.accountNo],
                  [t('identity:properties.label.since'), fmt.date(p.since)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted">{k}</dt>
                    <dd className="text-sm font-medium text-text">
                      <bdi>{v}</bdi>
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>
          )
        }
      </UrlTabs>
    </div>
  );
}

function PeopleList({ people }: { people: HouseholdPerson[] }) {
  const { t } = useT();
  const fmt = useFmt();
  if (!people.length) return <p className="text-sm text-muted">{t('identity:household.office.nobody')}</p>;
  return (
    <ul className="space-y-2" data-testid="household-people">
      {people.map((x) => (
        <li key={x.id} className="flex flex-wrap items-center gap-3 rounded-tile bg-sunken/50 p-3">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-pill bg-panel text-muted">
            <UserRound className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 font-medium text-text">
              <bdi>{x.name}</bdi>
              {x.isYou && <Badge tone="success">{t('identity:household.you')}</Badge>}
              {!x.verified && <Badge tone="warning">{t('identity:household.unverified')}</Badge>}
            </span>
            <span className="block text-xs text-muted">
              {t(`identity:portal.roles.${x.role}`)}
              {x.relationship ? ` · ${t(`identity:household.relationship.${x.relationship}`)}` : ''}
              {x.since ? ` · ${t('identity:household.since', { date: fmt.date(x.since) })}` : ''}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * PORTAL-025 Household (Gate D.1): who is registered at each of the resident's flats (names and roles
 * only), and requests to the office to add someone, which the office verifies (RES-004).
 */
export function HouseholdPage() {
  const { t } = useT();
  const fmt = useFmt();
  const toast = useToast();
  const announce = useAnnounce();
  const q = useApiQuery<{ flats: FlatHousehold[]; requests: HouseholdRequest[] }>({ method: 'GET', path: '/portal/household' });
  const send = useApiMutation<HouseholdRequest>();
  const withdraw = useApiMutation<HouseholdRequest>();
  const [flatId, setFlatId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState<HouseholdRelationship | null>(null);
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [problem, setProblem] = useState<string | null>(null);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <PortalSkeleton title={t('nav:pages.household')} />;
  const { flats, requests } = q.data;
  const target = flatId ?? (flats.length === 1 ? flats[0]!.flatId : null);

  return (
    <div className="@container space-y-6" data-testid="household">
      <Title title={t('nav:pages.household')} intro={t('identity:household.intro')} />
      <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-4">
          {flats.map((f) => (
            <Panel key={f.flatId} title={`${f.flatCode}`} description={`${f.buildingName} · ${t(`identity:household.occupancy.${f.occupancy}`)}`}>
              <PeopleList people={f.people} />
            </Panel>
          ))}
          <p className="flex items-start gap-2 text-sm text-muted">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t('identity:household.privacyNote')}
          </p>
        </div>
        <div className="min-w-0 space-y-6">
          <Panel title={t('identity:household.addTitle')}>
            <form
              className="space-y-4"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                setProblem(null);
                const next: Record<string, string | undefined> = {
                  flatId: target ? undefined : 'forms:errors.selectOne',
                  name: name.trim().length >= 2 ? undefined : 'forms:errors.required',
                  relationship: relationship ? undefined : 'forms:errors.selectOne',
                };
                setErrors(next);
                if (Object.values(next).some(Boolean)) {
                  announce(t('errors:validation.summary'), 'assertive');
                  return;
                }
                send.mutate(
                  { method: 'POST', path: '/portal/household/requests', body: { flatId: target, name, relationship, ...(phone.trim() ? { phone } : {}) } },
                  {
                    onSuccess: (r) => {
                      setName('');
                      setPhone('');
                      setRelationship(null);
                      toast.success(t('identity:household.sent', { name: r.name }));
                      announce(t('identity:household.sent', { name: r.name }));
                    },
                    onError: (err) => {
                      if (!(err instanceof ApiError)) return;
                      const f = err.problem.errors;
                      if (f) setErrors(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v[0]?.code])));
                      else setProblem(err.problem.messageKey);
                    },
                  },
                );
              }}
              data-testid="household-form"
            >
              {flats.length > 1 && (
                <SelectControl label={t('identity:household.flat')} value={target} onChange={setFlatId} options={flats.map((f) => ({ id: f.flatId, label: f.flatCode }))} errorKey={errors.flatId} testId="household-flat" />
              )}
              <PlainTextField label={t('identity:household.name')} value={name} onChange={setName} autoComplete="off" errorKey={errors.name} testId="household-name" />
              <SelectControl
                label={t('identity:household.relationshipLabel')}
                value={relationship}
                onChange={(v) => setRelationship(v as HouseholdRelationship | null)}
                options={RELATIONSHIPS.map((r) => ({ id: r, label: t(`identity:household.relationship.${r}`) }))}
                errorKey={errors.relationship}
                testId="household-relationship"
              />
              <PlainTextField label={t('identity:household.phone')} description={t('identity:household.phoneHint')} value={phone} onChange={setPhone} type="tel" inputMode="tel" dir="ltr" optional errorKey={errors.phone} testId="household-phone" />
              {problem && <InlineAlert tone="warning">{t(problem as 'identity:household.errors.notHousehold')}</InlineAlert>}
              <Button type="submit" variant="primary" icon={UserPlus} isPending={send.isPending} data-testid="household-submit">
                {t('identity:household.submit')}
              </Button>
            </form>
          </Panel>
          <Panel title={t('identity:household.requestsTitle')}>
            {requests.length === 0 ? (
              <EmptyState title={t('identity:household.noRequests')} />
            ) : (
              <ul className="divide-y divide-border" data-testid="household-requests">
                {requests.map((r) => (
                  <li key={r.id} className="space-y-2 py-3" data-state={r.state}>
                    <span className="block min-w-0">
                      <span className="block font-medium text-text">
                        <bdi>{r.name}</bdi> <span className="text-muted">· {t(`identity:household.relationship.${r.relationship}`)}</span>
                      </span>
                      <span className="block text-xs text-muted">
                        <bdi dir="ltr" className="ltr-ref">
                          {r.flatCode}
                        </bdi>{' '}
                        · {fmt.instant(r.requestedAt)}
                        {r.note ? ` · ${r.note}` : ''}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center justify-between gap-2">
                    <Badge tone={REQUEST_TONE[r.state]}>{t(`identity:household.state.${r.state}`)}</Badge>
                    {r.state === 'pending' && (
                      <Button
                        size="sm"
                        variant="quiet"
                        onPress={() => withdraw.mutate({ method: 'POST', path: `/portal/household/requests/${r.id}/withdraw` }, { onSuccess: () => toast.info(t('identity:household.withdrawnToast')) })}
                        data-testid="household-withdraw"
                      >
                        {t('identity:household.withdraw')}
                      </Button>
                    )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
