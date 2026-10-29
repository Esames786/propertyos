import type { PortalAccessList } from '@repo/contracts';
import { formatNumber, useLocale } from '@repo/i18n';
import {
  Button,
  EmptyState,
  ErrorState,
  FilterPills,
  Link,
  MetricCard,
  PageHeader,
  PlainCheckbox,
  PlainTextField,
  SelectControl,
  useApiQuery,
  useCan,
  useQueryParam,
  useQueryParams,
  useT,
} from '@repo/ui';
import { Ban, CircleCheck, CircleDashed, Clock3, DoorOpen, Home, MailX, MoonStar, Send, ShieldQuestion, UsersRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SOCIETY } from '../../../nav.config';
import { Loading } from '../kit';
import { invitable, PortalPersonRow, usePortalActions } from './PortalPeople';

const FILTERS = ['all', 'active', 'inactive', 'invited', 'expired', 'not_invited', 'unverified', 'revoked'] as const;
type Filter = (typeof FILTERS)[number] | 'never';
const SITE = 'site_alnoor';

/**
 * RES-007 Resident app access (Gate D.1). Who uses the resident app, who has not signed in for a
 * month, who was invited and did not accept, who is still to be invited and the flats nobody lives
 * in. Every figure filters the list below it. Last sign-in is a date and a kind of device only (D-27);
 * residents never see any of this about each other. Invitations are simulated.
 */
export default function PortalAccessPage() {
  const { t } = useT();
  const { locale } = useLocale();
  const can = useCan();
  const [status] = useQueryParam('status');
  const [building] = useQueryParam('building');
  const [role] = useQueryParam('role');
  const [q] = useQueryParam('q');
  const setParams = useQueryParams();
  const filter: Filter = status === 'never' || (FILTERS as readonly string[]).includes(status ?? '') ? (status as Filter) : 'all';
  const query = useApiQuery<PortalAccessList>({ method: 'GET', path: '/portal-access', query: { status: filter, building: building ?? undefined, role: role ?? undefined, q: q ?? undefined } }, { placeholderData: (prev) => prev });
  const [selected, setSelected] = useState<string[]>([]);
  const actions = usePortalActions({ onInvited: () => setSelected([]) });
  const mayInvite = can('portal_access.invite');
  const rows = useMemo(() => query.data?.rows ?? [], [query.data]);
  const selectable = useMemo(() => rows.filter(invitable).map((r) => r.partyId), [rows]);
  const fmt = (n: number) => formatNumber(n, locale);
  const data = query.data;
  const s = data?.summary;
  const metric = (key: Filter, value: number, icon: typeof Clock3, hue: 'emerald' | 'slate' | 'sky' | 'amber' | 'rose' | 'violet' | 'teal', label: string, caption?: string) => (
    <MetricCard label={label} value={fmt(value)} accessibleValue={fmt(value)} caption={caption} icon={icon} hue={hue} href={`?status=${key}`} testId={`portal-kpi-${key}`} />
  );

  return (
    <div className="@container space-y-6" data-testid="portal-access">
      <PageHeader
        title={t('nav:pages.portalAccess')}
        description={t('identity:portal.intro')}
        actions={
          mayInvite && selected.length > 0 ? (
            <Button variant="primary" icon={Send} onPress={() => actions.invite(rows.filter((r) => selected.includes(r.partyId)))} data-testid="portal-invite-selected">
              {t('identity:portal.inviteSelected', { count: selected.length })}
            </Button>
          ) : undefined
        }
      />
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !s || !data ? (
        <Loading lines={8} />
      ) : (
        <>
          <section aria-labelledby="portal-adoption" className="rounded-card border border-border/70 bg-panel p-4 shadow-card sm:p-5" data-testid="portal-adoption">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="portal-adoption" className="text-base font-semibold text-text">
                  {t('identity:portal.adoptionTitle')}
                </h2>
                <p className="text-sm text-muted">{t('identity:portal.adoptionBody', { flats: fmt(s.flatsWithActiveUser), occupied: fmt(s.occupiedFlats) })}</p>
              </div>
              <p className="text-figure-sm font-bold text-text">
                <bdi dir="ltr" className="ltr-ref">{s.occupiedFlats ? Math.round((s.flatsWithActiveUser / s.occupiedFlats) * 100) : 0}%</bdi>
              </p>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-pill bg-sunken" role="img" aria-label={t('identity:portal.adoptionBody', { flats: fmt(s.flatsWithActiveUser), occupied: fmt(s.occupiedFlats) })}>
              <div className="h-full rounded-pill bg-primary" style={{ width: `${s.occupiedFlats ? (s.flatsWithActiveUser / s.occupiedFlats) * 100 : 0}%` }} />
            </div>
          </section>
          <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4" data-testid="portal-kpis">
            {metric('active', s.active, CircleCheck, 'emerald', t('identity:portal.kpi.active'), t('identity:portal.kpi.activeHint'))}
            {metric('inactive', s.inactive, MoonStar, 'slate', t('identity:portal.kpi.inactive'), t('identity:portal.kpi.inactiveHint'))}
            {metric('invited', s.invited, Clock3, 'sky', t('identity:portal.kpi.invited'), t('identity:portal.kpi.invitedHint'))}
            {metric('never', s.neverSignedIn, CircleDashed, 'amber', t('identity:portal.kpi.never'), t('identity:portal.kpi.neverHint', { expired: fmt(s.expired), notInvited: fmt(s.notInvited) }))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm" data-testid="portal-secondary">
            <Link href="?status=expired" className="inline-flex items-center gap-1.5">
              <MailX aria-hidden className="size-4" />
              {t('identity:portal.kpi.expired', { count: s.expired })}
            </Link>
            <Link href="?status=unverified" className="inline-flex items-center gap-1.5">
              <ShieldQuestion aria-hidden className="size-4" />
              {t('identity:portal.kpi.unverified', { count: s.unverified })}
            </Link>
            <Link href="?status=revoked" className="inline-flex items-center gap-1.5">
              <Ban aria-hidden className="size-4" />
              {t('identity:portal.kpi.revoked', { count: s.revoked })}
            </Link>
            <a href="#vacant" className="inline-flex items-center gap-1.5 font-medium text-primary underline underline-offset-2">
              <DoorOpen aria-hidden className="size-4" />
              {t('identity:portal.kpi.vacant', { count: s.vacantFlats })}
            </a>
            <Link href="/backoffice/res/household-members" className="inline-flex items-center gap-1.5">
              <UsersRound aria-hidden className="size-4" />
              {t('identity:portal.households')}
            </Link>
          </div>

          <div className="space-y-3">
            <FilterPills
              label={t('identity:portal.filterStatus')}
              value={filter === 'never' ? 'all' : filter}
              testId="portal-filter"
              onChange={(v) => {
                setSelected([]);
                setParams({ status: v === 'all' ? null : v });
              }}
              options={FILTERS.map((f) => ({ id: f, label: t(`identity:portal.filters.${f}`) }))}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <SelectControl
                label={t('identity:portal.building')}
                optional
                value={building ?? null}
                onChange={(v) => setParams({ building: v })}
                options={data.buildings.map((b) => ({ id: b.id, label: b.name }))}
                testId="portal-building"
              />
              <SelectControl
                label={t('identity:portal.role')}
                optional
                value={role ?? null}
                onChange={(v) => setParams({ role: v })}
                options={(['owner', 'occupant', 'payer'] as const).map((r) => ({ id: r, label: t(`identity:portal.roles.${r}`) }))}
                testId="portal-role"
              />
              <PlainTextField label={t('identity:portal.search')} value={q ?? ''} onChange={(v) => setParams({ q: v || null })} testId="portal-search" />
            </div>
          </div>

          <section aria-labelledby="portal-people" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="portal-people" className="text-base font-semibold text-text">
                {t('identity:portal.peopleTitle', { count: rows.length })}
              </h2>
              {mayInvite && selectable.length > 0 && (
                <PlainCheckbox isSelected={selectable.every((id) => selected.includes(id))} onChange={(v) => setSelected(v ? selectable : [])} testId="portal-select-all">
                  {t('identity:portal.selectAll', { count: selectable.length })}
                </PlainCheckbox>
              )}
            </div>
            {rows.length === 0 ? (
              <EmptyState title={t('identity:portal.emptyTitle')} body={t('identity:portal.emptyBody')} />
            ) : (
              <ul className="space-y-2" data-testid="portal-rows">
                {rows.map((r) => (
                  <PortalPersonRow
                    key={r.partyId}
                    row={r}
                    mayInvite={mayInvite}
                    actions={actions}
                    leading={
                      mayInvite && invitable(r) ? (
                        <PlainCheckbox isSelected={selected.includes(r.partyId)} onChange={(v) => setSelected((cur) => (v ? [...cur, r.partyId] : cur.filter((x) => x !== r.partyId)))} testId="portal-row-select">
                          <span className="sr-only">{t('identity:portal.select', { name: r.name })}</span>
                        </PlainCheckbox>
                      ) : undefined
                    }
                  />
                ))}
              </ul>
            )}
          </section>

          <section id="vacant" tabIndex={-1} aria-labelledby="portal-vacant" className="scroll-mt-24 rounded-card border border-border/70 bg-panel p-4 shadow-card outline-none sm:p-5" data-testid="portal-vacant">
            <h2 id="portal-vacant" className="flex items-center gap-2 text-base font-semibold text-text">
              <Home aria-hidden className="size-4 text-muted" />
              {t('identity:portal.vacantTitle', { count: data.vacant.length })}
            </h2>
            <p className="text-sm text-muted">{t('identity:portal.vacantBody')}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {data.vacant.map((v) => (
                <li key={v.flatId}>
                  <Link href={SOCIETY.flat(SITE, v.flatId)} variant="plain" className="inline-flex min-h-9 items-center rounded-pill border border-border px-3 text-sm text-text hover:bg-raised">
                    <bdi dir="ltr" className="ltr-ref">{v.flatCode}</bdi>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      {actions.overlays}
    </div>
  );
}
