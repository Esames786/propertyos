import { VEHICLE_KINDS, type Amenity, type AmenityBooking, type ResidentAmenities, type ResidentParking, type Vehicle, type VehicleKind } from '@repo/contracts';
import { Badge, Button, EmptyState, Link, PlainTextField, SegmentedControl, SelectControl, useApiMutation, useApiQuery, useQueryParam, useQueryParams, useT, useToast, type StatusTone } from '@repo/ui';
import { BadgeCheck, Ban, Car, CheckCircle2, Clock3, Hourglass, ParkingSquare, Plus, Send, Trash2, XCircle, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { OPS } from '../../nav.config';
import { PortalSkeleton, usePortalFormat } from '../portal/shared';
import { DEMO_TODAY, Sheet } from './rkit';
import { NotAvailable, ProblemText } from './ProblemText';

/**
 * Gate D.2 resident services: PORTAL-026 vehicles (submit for approval; the office decides),
 * PORTAL-021 parking (the household's slots and the rules) and PORTAL-022 amenities (book a slot; the
 * hall and the rooftop need the office's approval). Only people who live in a flat register vehicles
 * for it; taken slots never say who took them.
 */
const VEHICLE_TONE: Record<Vehicle['state'], [StatusTone, LucideIcon]> = { pending: ['warning', Hourglass], approved: ['success', BadgeCheck], rejected: ['error', XCircle], retired: ['neutral', Trash2] };

export function VehicleChip({ state }: { state: Vehicle['state'] }) {
  const { t } = useT();
  const [tone, icon] = VEHICLE_TONE[state];
  return (
    <Badge tone={tone} icon={icon} data-testid="vehicle-state" data-state={state}>
      {t(`operations:vehicleState.${state}`)}
    </Badge>
  );
}

export function VehiclesPage() {
  const { t } = useT();
  const toast = useToast();
  const fmt = usePortalFormat(`${DEMO_TODAY}T09:00:00Z`);
  const [isNew] = useQueryParam('new');
  const setParams = useQueryParams();
  const q = useApiQuery<ResidentParking>({ method: 'GET', path: '/portal/parking' });
  const retire = useApiMutation<Vehicle>();
  if (q.isError) return <NotAvailable error={q.error} />;
  if (!q.data) return <PortalSkeleton title={t('operations:vehicles.title')} />;
  const d = q.data;
  return (
    <div className="@container space-y-6" data-testid="vehicles-page">
      <header className="space-y-2">
        <h1 id="page-title" tabIndex={-1} className="text-2xl font-bold text-text outline-none sm:text-3xl">{t('operations:vehicles.title')}</h1>
        <p className="text-sm text-muted">{t('operations:vehicles.intro')}</p>
        {d.flats.length > 0 ? (
          <Button variant="primary" size="lg" icon={Plus} onPress={() => setParams({ new: '1' })} className="w-full justify-center whitespace-normal text-center sm:w-auto" data-testid="vehicle-new">
            {t('operations:vehicles.add')}
          </Button>
        ) : (
          <p className="text-sm text-muted">{t('operations:vehicles.onlyOccupants')}</p>
        )}
        <Link href={OPS.parking} className="text-sm">{t('operations:vehicles.toParking')}</Link>
      </header>
      {d.vehicles.length === 0 ? (
        <EmptyState title={t('operations:vehicles.emptyTitle')} body={t('operations:vehicles.emptyBody')} />
      ) : (
        <ul className="space-y-3" data-testid="vehicle-list">
          {d.vehicles.map((v) => (
            <li key={v.id} className="space-y-2 rounded-card border border-border bg-panel p-4 shadow-card" data-testid="vehicle-card" data-plate={v.plate} data-state={v.state}>
              <p className="flex flex-wrap items-start justify-between gap-2">
                <span className="min-w-0">
                  <bdi dir="ltr" className="ltr-ref block text-lg font-bold tracking-wide text-text">{v.plate}</bdi>
                  <span className="block text-sm text-muted">
                    {t(`operations:vehicleKind.${v.kind}`)} · <bdi>{v.make}</bdi> · <bdi>{v.colour}</bdi> · <bdi dir="ltr" className="ltr-ref">{v.flat.code}</bdi>
                  </span>
                </span>
                <VehicleChip state={v.state} />
              </p>
              {v.slot && <p className="flex items-center gap-1.5 text-sm text-text"><ParkingSquare aria-hidden className="size-4 text-muted" />{t('operations:vehicles.slot', { slot: v.slot })}</p>}
              {v.state === 'pending' && <p className="text-sm text-muted">{t('operations:vehicles.pendingHint', { date: fmt.instant(v.submittedAt) })}</p>}
              {v.state === 'rejected' && v.reason && <p className="text-sm text-error"><bdi>{t('operations:vehicles.rejectedBecause', { reason: v.reason })}</bdi></p>}
              {(v.state === 'approved' || v.state === 'pending') && (
                <Button
                  variant="quiet"
                  size="sm"
                  icon={Trash2}
                  isPending={retire.isPending}
                  className="max-w-full whitespace-normal text-start"
                  onPress={async () => {
                    await retire.mutateAsync({ method: 'POST', path: `/portal/vehicles/${v.id}/retire`, body: {} });
                    toast.success(t('operations:vehicles.removed'));
                    void q.refetch();
                  }}
                  data-testid="vehicle-retire"
                >
                  {v.state === 'pending' ? t('operations:vehicles.withdraw') : t('operations:vehicles.remove')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <NewVehicleSheet isOpen={isNew === '1'} flats={d.flats} onClose={() => setParams({ new: null })} onDone={() => { setParams({ new: null }); void q.refetch(); }} />
    </div>
  );
}

function NewVehicleSheet({ isOpen, flats, onClose, onDone }: { isOpen: boolean; flats: ResidentParking['flats']; onClose: () => void; onDone: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const add = useApiMutation<Vehicle>();
  const [flatId, setFlatId] = useState<string | null>(flats[0]?.id ?? null);
  const [plate, setPlate] = useState('');
  const [kind, setKind] = useState<VehicleKind>('car');
  const [make, setMake] = useState('');
  const [colour, setColour] = useState('');
  const [error, setError] = useState<unknown>(null);
  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('operations:vehicles.addTitle')}
      subtitle={t('operations:vehicles.addSubtitle')}
      testId="vehicle-sheet"
      footer={
        <Button
          variant="primary"
          size="lg"
          icon={Send}
          className="w-full justify-center"
          isPending={add.isPending}
          isDisabled={!flatId || plate.trim().length < 4 || make.trim().length < 2 || colour.trim().length < 3}
          onPress={async () => {
            setError(null);
            try {
              const v = await add.mutateAsync({ method: 'POST', path: '/portal/vehicles', body: { flatId, plate, kind, make, colour } });
              toast.success(t('operations:vehicles.submitted', { plate: v.plate }));
              setPlate('');
              setMake('');
              setColour('');
              onDone();
            } catch (e) {
              setError(e);
            }
          }}
          data-testid="vehicle-submit"
        >
          {t('operations:vehicles.submit')}
        </Button>
      }
    >
      <div className="space-y-4">
        {flats.length > 1 && <SelectControl label={t('operations:vehicles.flat')} value={flatId} onChange={setFlatId} options={flats.map((f) => ({ id: f.id, label: f.code }))} testId="vehicle-flat" />}
        <PlainTextField label={t('operations:vehicles.plate')} description={t('operations:vehicles.plateHint')} value={plate} onChange={setPlate} dir="ltr" testId="vehicle-plate" />
        <SegmentedControl label={t('operations:vehicles.kind')} value={kind} onChange={setKind} options={VEHICLE_KINDS.map((k) => ({ id: k, label: t(`operations:vehicleKind.${k}`) }))} testId="vehicle-kind" wrap />
        <PlainTextField label={t('operations:vehicles.make')} value={make} onChange={setMake} testId="vehicle-make" />
        <PlainTextField label={t('operations:vehicles.colour')} value={colour} onChange={setColour} testId="vehicle-colour" />
        <p className="text-xs text-muted">{t('operations:vehicles.approvalNote')}</p>
        {error ? <ProblemText error={error} /> : null}
      </div>
    </Sheet>
  );
}

export function ParkingPage() {
  const { t } = useT();
  const q = useApiQuery<ResidentParking>({ method: 'GET', path: '/portal/parking' });
  if (q.isError) return <NotAvailable error={q.error} />;
  if (!q.data) return <PortalSkeleton title={t('operations:parking.title')} />;
  const d = q.data;
  return (
    <div className="@container space-y-6" data-testid="parking-page">
      <header className="space-y-2">
        <h1 id="page-title" tabIndex={-1} className="text-2xl font-bold text-text outline-none sm:text-3xl">{t('operations:parking.title')}</h1>
        <p className="text-sm text-muted">{t('operations:parking.intro')}</p>
      </header>
      {d.flats.length === 0 ? (
        <EmptyState title={t('operations:parking.noFlatTitle')} body={t('operations:vehicles.onlyOccupants')} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 @xl:grid-cols-2" data-testid="parking-flats">
          {d.flats.map((f) => {
            const parked = d.vehicles.filter((v) => v.flat.id === f.id && v.state === 'approved');
            return (
              <li key={f.id} className="space-y-3 rounded-card border border-border bg-panel p-4 shadow-card" data-testid="parking-flat">
                <p className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-text">{t('operations:parking.flat', { flat: f.code })}</span>
                  <span className="text-sm text-muted">{t('operations:parking.used', { used: parked.length, allowance: f.allowance })}</span>
                </p>
                <ul className="space-y-2">
                  {f.slots.map((s) => {
                    const v = parked.find((x) => x.slot === s);
                    return (
                      <li key={s} className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border p-3 text-sm">
                        <span className="flex items-center gap-2 font-medium text-text"><ParkingSquare aria-hidden className="size-4 text-muted" /><bdi dir="ltr" className="ltr-ref">{s}</bdi></span>
                        {v ? <span className="flex items-center gap-1.5 text-text"><Car aria-hidden className="size-4 text-muted" /><bdi dir="ltr" className="ltr-ref">{v.plate}</bdi></span> : <span className="text-muted">{t('operations:parking.free')}</span>}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
      <section className="space-y-2 rounded-card border border-border bg-panel p-4" aria-labelledby="parking-rules">
        <h2 id="parking-rules" className="font-semibold text-text">{t('operations:parking.rulesTitle')}</h2>
        <ul className="list-disc space-y-1 ps-5 text-sm text-text">
          {d.rules.map((r) => (
            <li key={r}>{t(`operations:parking.rules.${r}` as 'operations:parking.rules.sticker')}</li>
          ))}
          <li>{t('operations:parking.visitorBays', { count: Number(d.visitorParking) })}</li>
        </ul>
      </section>
      <Link href={OPS.vehicles} className="text-sm" data-testid="parking-to-vehicles">{t('operations:parking.toVehicles')}</Link>
    </div>
  );
}

const BOOKING_TONE: Record<AmenityBooking['state'], [StatusTone, LucideIcon]> = { confirmed: ['success', CheckCircle2], requested: ['warning', Hourglass], approved: ['success', BadgeCheck], declined: ['error', XCircle], cancelled: ['neutral', Ban] };

export function AmenitiesPage() {
  const { t } = useT();
  const toast = useToast();
  const fmt = usePortalFormat(`${DEMO_TODAY}T09:00:00Z`);
  const [book] = useQueryParam('book');
  const setParams = useQueryParams();
  const q = useApiQuery<ResidentAmenities>({ method: 'GET', path: '/portal/amenities' });
  const cancel = useApiMutation<AmenityBooking>();
  if (q.isError) return <NotAvailable error={q.error} />;
  if (!q.data) return <PortalSkeleton title={t('operations:amenities.title')} />;
  const d = q.data;
  const chosen = d.amenities.find((a) => a.id === book);
  return (
    <div className="@container space-y-6" data-testid="amenities-page">
      <header className="space-y-2">
        <h1 id="page-title" tabIndex={-1} className="text-2xl font-bold text-text outline-none sm:text-3xl">{t('operations:amenities.title')}</h1>
        <p className="text-sm text-muted">{t('operations:amenities.intro')}</p>
      </header>
      <ul className="grid grid-cols-1 gap-3 @xl:grid-cols-2" data-testid="amenity-list">
        {d.amenities.map((a) => (
          <li key={a.id} className="space-y-2 rounded-card border border-border bg-panel p-4 shadow-card" data-testid="amenity-card" data-amenity={a.kind}>
            <p className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-text">{t(`operations:amenity.${a.kind}.name`)}</span>
              <Badge tone={a.booking === 'none' ? 'neutral' : a.booking === 'instant' ? 'success' : 'info'} icon={a.booking === 'none' ? CheckCircle2 : a.booking === 'instant' ? CheckCircle2 : Clock3}>
                {t(`operations:amenities.booking.${a.booking}`)}
              </Badge>
            </p>
            <p className="text-sm text-muted">{t('operations:amenities.hours', { hours: a.hours })} · {t('operations:amenities.capacity', { count: a.capacity })}{a.fee ? ` · ${t('operations:amenities.fee', { amount: fmt.money(a.fee.amount) })}` : ''}</p>
            <ul className="list-disc space-y-0.5 ps-5 text-xs text-muted">
              {a.rules.map((r) => <li key={r}>{t(`operations:amenities.rule.${r}` as 'operations:amenities.rule.gym1')}</li>)}
            </ul>
            {a.booking !== 'none' && bookable(a, d).length > 0 && (
              <Button variant="secondary" onPress={() => setParams({ book: a.id })} data-testid="amenity-book">
                {a.booking === 'instant' ? t('operations:amenities.book') : t('operations:amenities.request')}
              </Button>
            )}
            {a.booking !== 'none' && d.flats.length > 0 && bookable(a, d).length === 0 && (
              <p className="text-sm text-muted" data-testid="amenity-residents-only">{t('operations:amenities.residentsOnly')}</p>
            )}
          </li>
        ))}
      </ul>
      <section className="space-y-3" aria-labelledby="my-bookings">
        <h2 id="my-bookings" className="text-lg font-bold text-text">{t('operations:amenities.mine')}</h2>
        {d.bookings.length === 0 ? (
          <p className="text-sm text-muted">{t('operations:amenities.none')}</p>
        ) : (
          <ul className="space-y-2" data-testid="booking-list">
            {d.bookings.map((b) => {
              const [tone, icon] = BOOKING_TONE[b.state];
              return (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border bg-panel p-3 text-sm" data-testid="booking-row" data-state={b.state}>
                  <span>
                    <span className="font-medium text-text">{t(`operations:amenity.${b.amenityKind}.name`)}</span> · {fmt.date(b.on)} · {slotLabel(t, b.slot)}
                    {b.reason && <span className="block text-xs text-muted"><bdi>{b.reason}</bdi></span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={tone} icon={icon}>{t(`operations:bookingState.${b.state}`)}</Badge>
                    {['confirmed', 'requested', 'approved'].includes(b.state) && (
                      <Button variant="quiet" size="sm" isPending={cancel.isPending} onPress={async () => { await cancel.mutateAsync({ method: 'POST', path: `/portal/bookings/${b.id}/cancel`, body: {} }); toast.success(t('operations:amenities.cancelled')); void q.refetch(); }} data-testid="booking-cancel">
                        {t('operations:amenities.cancel')}
                      </Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {chosen && <BookSheet amenity={chosen} data={d} onClose={() => setParams({ book: null })} onDone={() => { setParams({ book: null }); void q.refetch(); }} />}
    </div>
  );
}

/** Flats this resident may book the amenity for: where they live, or as owner where the policy allows. */
const bookable = (a: Amenity, d: ResidentAmenities) => d.flats.filter((f) => f.lives || a.bookers === 'residents_and_owners');

const slotLabel = (t: ReturnType<typeof useT>['t'], slot: string) => (/^\d/.test(slot) ? slot : t(`operations:slot.${slot}` as 'operations:slot.morning'));
const addDays = (n: number) => new Date(Date.parse(`${DEMO_TODAY}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

function BookSheet({ amenity: a, data, onClose, onDone }: { amenity: Amenity; data: ResidentAmenities; onClose: () => void; onDone: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const fmt = usePortalFormat(`${DEMO_TODAY}T09:00:00Z`);
  const book = useApiMutation<AmenityBooking>();
  const flats = bookable(a, data);
  const [flatId, setFlatId] = useState<string | null>(flats[0]?.id ?? null);
  const [on, setOn] = useState(addDays(1));
  const [slot, setSlot] = useState(a.slots[0] ?? '');
  const [guests, setGuests] = useState('0');
  const [error, setError] = useState<unknown>(null);
  const taken = new Set(data.taken.filter((x) => x.amenityId === a.id && x.on === on).map((x) => x.slot));
  return (
    <Sheet
      isOpen
      onClose={onClose}
      title={t('operations:amenities.bookTitle', { name: t(`operations:amenity.${a.kind}.name`) })}
      subtitle={a.booking === 'request' ? t('operations:amenities.requestNote') : t('operations:amenities.instantNote')}
      testId="booking-sheet"
      footer={
        <Button
          variant="primary"
          size="lg"
          icon={Send}
          className="w-full justify-center"
          isPending={book.isPending}
          isDisabled={!flatId || !slot || taken.has(slot)}
          onPress={async () => {
            setError(null);
            try {
              const b = await book.mutateAsync({ method: 'POST', path: '/portal/bookings', body: { amenityId: a.id, flatId, on, slot, guests: Number(guests) || 0 } });
              toast.success(b.state === 'confirmed' ? t('operations:amenities.booked') : t('operations:amenities.requested'));
              onDone();
            } catch (e) {
              setError(e);
            }
          }}
          data-testid="booking-submit"
        >
          {a.booking === 'instant' ? t('operations:amenities.book') : t('operations:amenities.request')}
        </Button>
      }
    >
      <div className="space-y-4">
        {flats.length > 1 && <SelectControl label={t('operations:vehicles.flat')} value={flatId} onChange={setFlatId} options={flats.map((f) => ({ id: f.id, label: f.code }))} testId="booking-flat" />}
        <SelectControl label={t('operations:amenities.day')} value={on} onChange={(v) => setOn(v ?? addDays(1))} options={[1, 2, 3, 4, 5, 6, 7, 10, 14].map((n) => ({ id: addDays(n), label: fmt.date(addDays(n)) }))} testId="booking-day" />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-text">{t('operations:amenities.time')}</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('operations:amenities.time')}>
            {a.slots.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={slot === s} disabled={taken.has(s)} onClick={() => setSlot(s)} className={`min-h-11 rounded-pill border px-4 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50 ${slot === s ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-panel text-text'}`} data-testid={`booking-slot-${s}`}>
                <span dir="auto">{slotLabel(t, s)}</span>
                {taken.has(s) ? ` · ${t('operations:amenities.taken')}` : ''}
              </button>
            ))}
          </div>
        </fieldset>
        {a.capacity > 6 && <PlainTextField label={t('operations:amenities.guests')} value={guests} onChange={(v) => setGuests(v.replace(/\D/g, ''))} inputMode="numeric" dir="ltr" testId="booking-guests" />}
        {a.fee && <p className="text-sm text-text">{t('operations:amenities.feeNote', { amount: fmt.money(a.fee.amount) })}</p>}
        {error ? <ProblemText error={error} /> : null}
      </div>
    </Sheet>
  );
}
