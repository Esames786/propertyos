import type { AmenityBooking, FlatDetail, FlatFact, MoveRecord, OccupancyRow, ResidentsDashboard, SiteSummary } from '@repo/contracts';
import { Badge, Button, Drawer, ErrorState, InlineAlert, Link, PageHeader, PlainTextArea, SelectControl, useApiMutation, useApiQuery, useQueryParam, useQueryParams, useSession, useT, useToast } from '@repo/ui';
import { BadgeCheck, CheckCircle2, DoorOpen, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ACCESS_DATE, OPS, SOCIETY } from '../../../nav.config';
import { Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { WRAP } from '../finance/fkit';
import { BookingBadge, Figure, NoticeBadge, When } from './okit';

/**
 * RES-001 residents dashboard (Gate D.2): how the flats are lived in (occupied, vacant, owners or
 * tenants, who uses the app) and what residents are waiting on from the office (repairs, community
 * issues, visitors, vehicles, notice acknowledgements, amenity bookings). Each figure opens its
 * records when the viewer may open that screen; bookings are decided here; a move-out is recorded
 * with an effective date and never changes who pays or who is invited to the app.
 */
export default function ResidentsOffice() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const { allows, can } = useSession();
  const [drawer] = useQueryParam('drawer');
  const setParams = useQueryParams();
  const q = useApiQuery<ResidentsDashboard>({ method: 'GET', path: '/ops/residents/dashboard' });
  const movesAllowed = can('site.manage') && allows({ module: 'residents', permission: 'site.manage' });
  const sites = useApiQuery<SiteSummary[]>(movesAllowed ? { method: 'GET', path: '/sites' } : null);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const d = q.data;
  const siteId = sites.data?.[0]?.id;
  const roster = allows({ module: 'residents' }) && can('site.view');
  const href = (allowed: boolean, to: string) => (allowed ? to : undefined);
  return (
    <div className="@container space-y-6" data-testid="residents-dashboard">
      <PageHeader
        title={t('operations:residentsOffice.title')}
        description={t('operations:residentsOffice.intro')}
        actions={
          movesAllowed && siteId ? (
            <Button variant="secondary" icon={DoorOpen} onPress={() => setParams({ drawer: 'move-out' })} className={WRAP} data-testid="residents-move-out">
              {t('operations:move.title')}
            </Button>
          ) : undefined
        }
      />
      <p className="text-sm text-muted">{t('operations:residentsOffice.asOf', { date: fmt.date(d.asOf) })}</p>

      <section className="space-y-3" aria-labelledby="residents-homes">
        <h2 id="residents-homes" className="text-lg font-semibold text-text">
          {t('operations:residentsOffice.homes')}
        </h2>
        <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @5xl:grid-cols-6" data-testid="residents-homes">
          <Figure label={t('operations:residentsOffice.flats')} value={fmt.count(d.flats)} href={href(roster, SOCIETY.roster())} testId="fig-flats" />
          <Figure label={t('operations:residentsOffice.occupied')} value={fmt.count(d.occupied)} href={href(roster, SOCIETY.roster())} testId="fig-occupied" />
          <Figure label={t('operations:residentsOffice.vacant')} value={fmt.count(d.vacant)} href={href(roster, SOCIETY.roster('vacant'))} testId="fig-vacant" />
          <Figure label={t('operations:residentsOffice.ownerOccupied')} value={fmt.count(d.ownerOccupied)} href={href(roster, SOCIETY.roster('owner_occupied'))} testId="fig-owner-occupied" />
          <Figure label={t('operations:residentsOffice.tenantOccupied')} value={fmt.count(d.tenantOccupied)} href={href(roster, SOCIETY.roster('tenant_occupied'))} testId="fig-tenant-occupied" />
          <Figure label={t('operations:residentsOffice.appAccounts')} value={fmt.count(d.appAccounts)} href={href(allows({ module: 'dues' }) && can('portal_access.view'), '/backoffice/residents/portal-access')} testId="fig-app-accounts" />
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="residents-services">
        <h2 id="residents-services" className="text-lg font-semibold text-text">
          {t('operations:residentsOffice.services')}
        </h2>
        <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @5xl:grid-cols-6" data-testid="residents-services">
          <Figure label={t('operations:residentsOffice.openRequests')} value={fmt.count(d.openRequests)} href={href(allows({ module: 'maintenance', permission: 'operations.view' }), OPS.requests({ status: 'open' }))} testId="fig-open-requests" />
          <Figure label={t('operations:residentsOffice.communityIssues')} value={fmt.count(d.communityIssues)} href={href(allows({ module: 'maintenance', feature: 'maintenance.community_issues', permission: 'issues.view' }), OPS.issues())} testId="fig-community-issues" />
          <Figure label={t('operations:residentsOffice.visitorsToday')} value={fmt.count(d.visitorsToday)} href={href(allows({ module: 'visitors', anyOf: ['visitors.view', 'visitors.manage'] }), OPS.visits())} testId="fig-visitors-today" />
          <Figure label={t('operations:residentsOffice.vehiclesPending')} value={fmt.count(d.vehiclesPending)} tone={d.vehiclesPending ? 'warning' : 'default'} href={href(allows({ module: 'parking', anyOf: ['parking.view', 'vehicles.approve'] }), OPS.vehicles({ status: 'pending' }))} testId="fig-vehicles-pending" />
          <Figure label={t('operations:residentsOffice.noticesAwaitingAck')} value={fmt.count(d.noticesAwaitingAck)} href={href(allows({ module: 'residents', permission: 'residents.view' }), OPS.notices())} testId="fig-notices-ack" />
          <Figure label={t('operations:residentsOffice.bookingRequests')} value={fmt.count(d.bookingRequests)} tone={d.bookingRequests ? 'warning' : 'default'} testId="fig-booking-requests" />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Bookings items={d.bookings} />
        <div className="space-y-5">
          <Card title={t('operations:residentsOffice.movesTitle')} id="residents-moves" testId="residents-moves">
            <MoveList items={d.recentMoves} empty={t('operations:residentsOffice.noMoves')} />
          </Card>
          <Card
            title={t('operations:residentsOffice.noticesTitle')}
            id="residents-notices"
            testId="residents-notices"
            action={
              <Link href={OPS.notices()} className="text-sm">
                {t('operations:residentsOffice.allNotices')}
              </Link>
            }
          >
            {d.latestNotices.length === 0 ? (
              <p className="text-sm text-muted">{t('operations:residentsOffice.noNotices')}</p>
            ) : (
              <ul className="space-y-2">
                {d.latestNotices.map((n) => (
                  <li key={n.id}>
                    <Link href={OPS.notice(n.id)} variant="plain" className="block rounded-tile border border-border/70 p-3 hover:bg-raised" data-testid="residents-notice-row">
                      <span className="block font-medium text-text [overflow-wrap:anywhere]">
                        <bdi>{n.title}</bdi>
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <span>
                          <bdi dir="ltr" className="ltr-ref">{n.ref}</bdi>
                          {n.publishedAt ? <> · <When at={n.publishedAt} style="date" /></> : null}
                        </span>
                        <NoticeBadge state={n.state} />
                        {n.ackRequired && (
                          <Badge tone="info" icon={BadgeCheck}>
                            {t('operations:notices.askAck')}
                          </Badge>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {movesAllowed && siteId && <MoveOutDrawer isOpen={drawer === 'move-out'} onClose={() => setParams({ drawer: null })} siteId={siteId} />}
    </div>
  );
}

function Card({ title, id, testId, action, children }: { title: string; id: string; testId: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-card border border-border/70 bg-panel p-5 shadow-card" aria-labelledby={id} data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-lg font-semibold text-text">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Amenity slots are times ("18:00") or parts of the day ("evening"). */
function useSlotLabel() {
  const { t } = useT();
  return (slot: string) => (/^\d/.test(slot) ? slot : t(`operations:slot.${slot}` as 'operations:slot.morning'));
}

function Bookings({ items }: { items: AmenityBooking[] }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const { allows } = useSession();
  const toast = useToast();
  const slot = useSlotLabel();
  const decide = useApiMutation<AmenityBooking>();
  const [declining, setDeclining] = useState<AmenityBooking | null>(null);
  const [error, setError] = useState<unknown>(null);
  const manage = allows({ module: 'amenities', permission: 'amenities.manage' });
  const approve = async (b: AmenityBooking) => {
    setError(null);
    try {
      await decide.mutateAsync({ method: 'POST', path: `/ops/bookings/${b.id}/approve`, body: {} });
      toast.success(t('operations:residentsOffice.approved', { ref: b.ref }));
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Card title={t('operations:residentsOffice.bookingsTitle')} id="residents-bookings" testId="residents-bookings">
      <p className="text-sm text-muted">{manage ? t('operations:residentsOffice.bookingsIntro') : t('operations:residentsOffice.onlyManagers')}</p>
      {error ? <ProblemAlert error={error} /> : null}
      {items.length === 0 ? (
        <p className="text-sm text-muted">{t('operations:residentsOffice.noBookings')}</p>
      ) : (
        <ul className="space-y-2" data-testid="booking-list">
          {items.map((b) => (
            <li key={b.id} className="space-y-2 rounded-tile border border-border/70 p-3" data-testid="booking-row" data-ref={b.ref} data-state={b.state}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block font-medium text-text">
                    {t(`operations:amenity.${b.amenityKind}.name`)} · {fmt.date(b.on)} · {slot(b.slot)}
                  </span>
                  <span className="block text-xs text-muted">
                    <bdi dir="ltr" className="ltr-ref">{b.ref}</bdi> · <bdi dir="ltr" className="ltr-ref">{b.flatCode}</bdi> · <bdi>{b.name}</bdi> · {t('operations:residentsOffice.guests', { count: b.guests })}
                  </span>
                  <span className="block text-xs text-muted">
                    {t('operations:residentsOffice.askedOn')} <When at={b.at} />
                    {b.decidedByName ? ` · ${t('operations:residentsOffice.decidedBy', { name: b.decidedByName })}` : ''}
                  </span>
                </span>
                <BookingBadge state={b.state} />
              </div>
              {b.state === 'requested' && manage && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" size="sm" icon={CheckCircle2} isPending={decide.isPending} onPress={() => void approve(b)} data-testid="booking-approve">
                    {t('operations:residentsOffice.approve')}
                  </Button>
                  <Button variant="secondary" size="sm" icon={XCircle} onPress={() => setDeclining(b)} data-testid="booking-decline">
                    {t('operations:residentsOffice.decline')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <DeclineDrawer key={declining?.id ?? 'none'} booking={declining} onClose={() => setDeclining(null)} />
    </Card>
  );
}

function DeclineDrawer({ booking, onClose }: { booking: AmenityBooking | null; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const decide = useApiMutation<AmenityBooking>();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const submit = async () => {
    if (!booking) return;
    setError(null);
    try {
      await decide.mutateAsync({ method: 'POST', path: `/ops/bookings/${booking.id}/decline`, body: { reason } });
      toast.success(t('operations:residentsOffice.declined', { ref: booking.ref }));
      onClose();
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Drawer
      isOpen={!!booking}
      onOpenChange={(o) => !o && onClose()}
      title={booking ? t('operations:residentsOffice.declineTitle', { ref: booking.ref }) : ''}
      subtitle={t('operations:residentsOffice.declineSubtitle')}
      testId="decline-drawer"
      footer={
        <>
          <Button variant="quiet" onPress={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="primary" icon={XCircle} isPending={decide.isPending} isDisabled={reason.trim().length < 10} onPress={() => void submit()} data-testid="decline-submit">
            {t('operations:residentsOffice.declineSubmit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <PlainTextArea label={t('operations:residentsOffice.declineReason')} description={t('operations:residentsOffice.declineHint')} value={reason} onChange={setReason} rows={4} testId="decline-reason" />
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}

/** Moves, newest first: who leaves which flat and when (a future date is still to come). */
export function MoveList({ items, empty, showFlat = true }: { items: MoveRecord[]; empty: string; showFlat?: boolean }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-2" data-testid="move-list">
      {items.map((m) => (
        <li key={m.id} className="rounded-tile border border-border/70 p-3 text-sm" data-testid="move-row" data-ref={m.ref}>
          <span className="block font-medium text-text">
            <bdi>{m.partyName}</bdi>
            {showFlat ? (
              <>
                {' · '}
                <bdi dir="ltr" className="ltr-ref">{m.flatCode}</bdi>
              </>
            ) : null}
          </span>
          <span className="block text-xs text-muted">
            {m.effectiveOn > ACCESS_DATE ? t('operations:move.movesOut', { date: fmt.date(m.effectiveOn) }) : t('operations:move.movedOut', { date: fmt.date(m.effectiveOn) })} · <bdi>{m.reason}</bdi>
          </span>
          <span className="block text-xs text-muted">
            <bdi dir="ltr" className="ltr-ref">{m.ref}</bdi> · {t('operations:move.recordedBy', { name: m.recordedByName })}
          </span>
        </li>
      ))}
    </ul>
  );
}

const DAY = 86400_000;
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const current = (f: FlatFact) => f.from <= ACCESS_DATE && (f.to === undefined || ACCESS_DATE < f.to);

/**
 * Record that an occupant leaves a flat (effective-dated). The flat is fixed when opened from Flat 360;
 * from the residents dashboard it is chosen among the flats someone lives in. Liability and app
 * invitations never follow a move: the result says so, and links to changing the payer when needed.
 */
export function MoveOutDrawer({ isOpen, onClose, siteId, flatId: fixedFlat }: { isOpen: boolean; onClose: () => void; siteId: string; flatId?: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const save = useApiMutation<{ move: MoveRecord; stillLiable: boolean }>();
  const [flatId, setFlatId] = useState<string | null>(fixedFlat ?? null);
  const [partyId, setPartyId] = useState<string | null>(null);
  const [effectiveOn, setEffectiveOn] = useState(ACCESS_DATE);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<{ move: MoveRecord; stillLiable: boolean } | null>(null);
  const roster = useApiQuery<OccupancyRow[]>(isOpen && !fixedFlat ? { method: 'GET', path: `/sites/${siteId}/roster` } : null);
  const detail = useApiQuery<FlatDetail>(isOpen && flatId && !done ? { method: 'GET', path: `/sites/${siteId}/units/${flatId}` } : null);
  const occupants = (detail.data?.occupants ?? []).filter((f) => current(f) && f.occupancyKind !== 'association').filter((f, i, all) => all.findIndex((x) => x.partyId === f.partyId) === i);
  const lived = (roster.data ?? []).filter((r) => r.occupantNames.length > 0 && r.occupancy !== 'association_use');
  // One person living there is chosen for you; with several, the office picks who is leaving.
  const person = partyId ?? (occupants.length === 1 ? occupants[0]!.partyId : null);
  const close = () => {
    setDone(null);
    setReason('');
    setPartyId(null);
    setEffectiveOn(ACCESS_DATE);
    setError(null);
    if (!fixedFlat) setFlatId(null);
    onClose();
  };
  const submit = async () => {
    if (!flatId || !person) return;
    setError(null);
    try {
      const r = await save.mutateAsync({ method: 'POST', path: '/ops/moves', body: { flatId, partyId: person, effectiveOn, reason } });
      toast.success(t('operations:move.done', { ref: r.move.ref }));
      setDone(r);
    } catch (e) {
      setError(e);
    }
  };
  const valid = !!flatId && !!person && /^\d{4}-\d{2}-\d{2}$/.test(effectiveOn) && reason.trim().length >= 5;
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(o) => !o && close()}
      title={t('operations:move.title')}
      subtitle={t('operations:move.subtitle')}
      testId="move-out-drawer"
      footer={
        done ? (
          <Button variant="primary" onPress={close} data-testid="move-close">
            {t('operations:move.close')}
          </Button>
        ) : (
          <>
            <Button variant="quiet" onPress={close}>
              {t('common:actions.cancel')}
            </Button>
            <Button variant="primary" icon={DoorOpen} isPending={save.isPending} isDisabled={!valid} onPress={() => void submit()} data-testid="move-submit">
              {t('operations:move.submit')}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="space-y-4" data-testid="move-result" data-still-liable={done.stillLiable}>
          <InlineAlert tone="success" title={t('operations:move.resultTitle', { name: done.move.partyName, flat: done.move.flatCode, date: fmt.date(done.move.effectiveOn) })}>
            <p>
              <bdi dir="ltr" className="ltr-ref">{done.move.ref}</bdi> · <bdi>{done.move.reason}</bdi>
            </p>
          </InlineAlert>
          {done.stillLiable && (
            <InlineAlert tone="warning" title={t('operations:move.stillLiableTitle', { name: done.move.partyName })} data-testid="move-still-liable">
              <p>{t('operations:move.stillLiableBody')}</p>
              <p className="mt-2">
                <Link href={SOCIETY.flat(siteId, done.move.flatId, 'payer')} data-testid="move-change-payer">
                  {t('operations:move.changePayer')}
                </Link>
              </p>
            </InlineAlert>
          )}
          <p className="text-sm text-muted">{t('operations:move.appNote')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {!fixedFlat &&
            (roster.isError ? (
              <ProblemAlert error={roster.error} />
            ) : !roster.data ? (
              <Loading lines={2} />
            ) : (
              <SelectControl
                label={t('operations:move.flat')}
                description={t('operations:move.flatHint')}
                value={flatId}
                onChange={(v) => {
                  setFlatId(v);
                  setPartyId(null);
                }}
                options={lived.map((r) => ({ id: r.flatId, label: `${r.flatCode} · ${r.occupantNames.join(', ')}` }))}
                testId="move-flat"
              />
            ))}
          {fixedFlat && detail.data && (
            <p className="text-sm text-text" data-testid="move-fixed-flat">
              <span className="font-medium">{t('operations:move.flat')}:</span> <bdi dir="ltr" className="ltr-ref">{detail.data.flat.code}</bdi>
            </p>
          )}
          {flatId &&
            (detail.isError ? (
              <ProblemAlert error={detail.error} />
            ) : !detail.data ? (
              <Loading lines={2} />
            ) : occupants.length === 0 ? (
              <InlineAlert tone="info" title={t('operations:move.noOccupant')} />
            ) : (
              <SelectControl label={t('operations:move.person')} value={person} onChange={setPartyId} options={occupants.map((f) => ({ id: f.partyId, label: `${f.partyName} · ${t(`operations:move.kind.${f.occupancyKind === 'tenant' ? 'tenant' : 'owner'}`)}` }))} testId="move-person" />
            ))}
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
            {t('operations:move.date')}
            <span className="text-xs font-normal text-muted">{t('operations:move.dateHint')}</span>
            <input type="date" min={shift(ACCESS_DATE, -30)} max={shift(ACCESS_DATE, 90)} value={effectiveOn} onChange={(e) => setEffectiveOn(e.target.value)} className="min-h-11 rounded-control border border-border-control bg-panel px-3 text-sm text-text" data-testid="move-date" />
          </label>
          <PlainTextArea label={t('operations:move.reason')} description={t('operations:move.reasonHint')} value={reason} onChange={setReason} rows={3} testId="move-reason" />
          <InlineAlert tone="info" title={t('operations:move.ruleTitle')}>
            <p>{t('operations:move.ruleBody')}</p>
          </InlineAlert>
          {error ? <ProblemAlert error={error} /> : null}
        </div>
      )}
    </Drawer>
  );
}
