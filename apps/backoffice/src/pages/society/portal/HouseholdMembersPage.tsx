import type { FlatHousehold, HouseholdRequest } from '@repo/contracts';
import { formatInstant, useLocale } from '@repo/i18n';
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, Link, PageHeader, PlainTextField, SelectControl, Skeleton, UrlTabs, useAnnounce, useApiMutation, useApiQuery, useCan, useQueryParams, useQueryParam, useT, useToast, type StatusTone } from '@repo/ui';
import { Check, UserRound, X } from 'lucide-react';
import { useState } from 'react';
import { SOCIETY } from '../../../nav.config';

const SITE = 'site_alnoor';
const OCCUPANCY = ['owner_occupied', 'tenant_occupied', 'vacant', 'association_use'] as const;
const REQUEST_TONE: Record<HouseholdRequest['state'], StatusTone> = { pending: 'info', approved: 'success', rejected: 'neutral', withdrawn: 'neutral' };

/**
 * RES-004 Household members (Gate D.1). Who lives in each flat (owners, occupants, payers and
 * verified household members), and residents' requests to add someone, which the office approves
 * (the person is added as verified) or declines with a reason the resident sees.
 */
export default function HouseholdMembersPage() {
  const { t } = useT();
  const { locale } = useLocale();
  const can = useCan();
  const toast = useToast();
  const announce = useAnnounce();
  const [building] = useQueryParam('building');
  const [occupancy] = useQueryParam('occupancy');
  const [q] = useQueryParam('q');
  const setParams = useQueryParams();
  const query = useApiQuery<{ flats: FlatHousehold[]; requests: HouseholdRequest[]; buildings: Array<{ id: string; name: string }> }>(
    { method: 'GET', path: '/households', query: { building: building ?? undefined, occupancy: occupancy ?? undefined, q: q ?? undefined } },
    { placeholderData: (prev) => prev },
  );
  const decide = useApiMutation<HouseholdRequest>();
  const [declining, setDeclining] = useState<HouseholdRequest | null>(null);
  const mayDecide = can('site.manage');
  const data = query.data;
  const pending = data?.requests.filter((r) => r.state === 'pending').length ?? 0;
  const stamp = (iso: string) => formatInstant(iso, locale, 'dateTime');

  return (
    <div className="@container space-y-6" data-testid="household-members">
      <PageHeader title={t('nav:pages.householdMembers')} description={t('identity:household.office.intro')} />
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <UrlTabs
          label={t('identity:household.office.tabsLabel')}
          items={[
            { id: 'flats', label: t('identity:household.office.tabs.flats') },
            { id: 'requests', label: pending ? `${t('identity:household.office.tabs.requests')} (${pending})` : t('identity:household.office.tabs.requests') },
          ]}
        >
          {(tab) =>
            tab === 'requests' ? (
              data.requests.length === 0 ? (
                <EmptyState title={t('identity:household.office.noRequests')} />
              ) : (
                <ul className="space-y-3" data-testid="household-office-requests">
                  {data.requests.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-start gap-3 rounded-card border border-border/70 bg-panel p-4 shadow-card" data-state={r.state}>
                      <div className="min-w-0 flex-1 basis-[min(100%,14rem)] space-y-1">
                        <p className="flex flex-wrap items-center gap-2">
                          <bdi className="font-semibold text-text">{r.name}</bdi>
                          <span className="text-sm text-muted">{t(`identity:household.relationship.${r.relationship}`)}</span>
                          <Badge tone={REQUEST_TONE[r.state]}>{t(`identity:household.state.${r.state}`)}</Badge>
                        </p>
                        <p className="text-sm text-text">
                          <Link href={SOCIETY.flat(SITE, r.flatId)} className="font-medium">
                            <bdi dir="ltr" className="ltr-ref">
                              {r.flatCode}
                            </bdi>
                          </Link>
                          {r.phoneMasked && (
                            <span className="text-muted">
                              {' · '}
                              <bdi dir="ltr" className="ltr-ref">
                                {r.phoneMasked}
                              </bdi>
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted">
                          {t('identity:household.office.requestedBy', { name: r.requestedByName, date: stamp(r.requestedAt) })}
                          {r.decidedByName && r.decidedAt ? ` · ${t('identity:household.office.decided', { state: t(`identity:household.state.${r.state}`), name: r.decidedByName, date: stamp(r.decidedAt) })}` : ''}
                        </p>
                        {r.note && <p className="text-sm text-muted">“{r.note}”</p>}
                      </div>
                      {mayDecide && r.state === 'pending' && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            icon={Check}
                            className="max-w-full whitespace-normal text-start"
                            isPending={decide.isPending && decide.variables?.path.includes(r.id)}
                            onPress={() =>
                              decide.mutate(
                                { method: 'POST', path: `/household-requests/${r.id}/approve` },
                                {
                                  onSuccess: () => {
                                    const msg = t('identity:household.office.approved', { name: r.name, flat: r.flatCode });
                                    toast.success(msg);
                                    announce(msg);
                                  },
                                  onError: () => toast.error(t('identity:household.office.failed')),
                                },
                              )
                            }
                            data-testid="household-approve"
                          >
                            {t('identity:household.office.approve')}
                          </Button>
                          <Button size="sm" variant="secondary" icon={X} className="max-w-full whitespace-normal text-start" onPress={() => setDeclining(r)} data-testid="household-reject">
                            {t('identity:household.office.reject')}
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <PlainTextField label={t('identity:household.office.search')} value={q ?? ''} onChange={(v) => setParams({ q: v || null })} optional testId="household-search" />
                  <SelectControl label={t('identity:household.office.building')} optional value={building ?? null} onChange={(v) => setParams({ building: v })} options={data.buildings.map((b) => ({ id: b.id, label: b.name }))} testId="household-building" />
                  <SelectControl
                    label={t('identity:household.office.occupancy')}
                    optional
                    value={occupancy ?? null}
                    onChange={(v) => setParams({ occupancy: v })}
                    options={OCCUPANCY.map((o) => ({ id: o, label: t(`identity:household.occupancy.${o}`) }))}
                    testId="household-occupancy"
                  />
                </div>
                <p className="text-sm text-muted" role="status">
                  {t('identity:household.office.flats', { count: data.flats.length })}
                </p>
                {data.flats.length === 0 ? (
                  <EmptyState title={t('identity:household.office.empty')} />
                ) : (
                  <ul className="grid gap-3 @3xl:grid-cols-2" data-testid="household-flats">
                    {data.flats.map((f) => (
                      <li key={f.flatId} className="rounded-card border border-border/70 bg-panel p-4 shadow-card" data-flat={f.flatCode}>
                        <p className="flex flex-wrap items-baseline justify-between gap-2">
                          <Link href={SOCIETY.flat(SITE, f.flatId, 'people')} className="text-base font-semibold">
                            <bdi dir="ltr" className="ltr-ref">
                              {f.flatCode}
                            </bdi>
                          </Link>
                          <span className="text-xs text-muted">
                            <bdi>{f.buildingName}</bdi> · {t(`identity:household.occupancy.${f.occupancy}`)}
                          </span>
                        </p>
                        {f.people.length === 0 ? (
                          <p className="mt-2 text-sm text-muted">{t('identity:household.office.nobody')}</p>
                        ) : (
                          <ul className="mt-2 space-y-1">
                            {f.people.map((p) => (
                              <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                                <UserRound aria-hidden className="size-4 text-muted" />
                                <bdi className="text-text">{p.name}</bdi>
                                <span className="text-xs text-muted">
                                  {t(`identity:portal.roles.${p.role}`)}
                                  {p.relationship ? ` · ${t(`identity:household.relationship.${p.relationship}`)}` : ''}
                                </span>
                                {!p.verified && <Badge tone="warning">{t('identity:household.unverified')}</Badge>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          }
        </UrlTabs>
      )}
      <ConfirmDialog
        isOpen={!!declining}
        onOpenChange={(open) => !open && setDeclining(null)}
        title={t('identity:household.office.rejectTitle', { name: declining?.name ?? '' })}
        effect={t('identity:household.office.rejectEffect')}
        confirmLabel={t('identity:household.office.reject')}
        destructive
        reasonLabel={t('identity:household.office.reason')}
        onConfirm={async (note) => {
          if (!declining) return;
          try {
            await decide.mutateAsync({ method: 'POST', path: `/household-requests/${declining.id}/reject`, body: { note } });
            toast.success(t('identity:household.office.declined'));
            announce(t('identity:household.office.declined'));
          } catch {
            toast.error(t('identity:household.office.failed'));
          }
        }}
      />
    </div>
  );
}
