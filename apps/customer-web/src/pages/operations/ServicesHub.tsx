import { GATE_PURPOSES, type GatePass, type GatePurpose, type ResidentNotices, type ResidentRequests, type ResidentVisitors, type ResidentIssues } from '@repo/contracts';
import { Badge, Button, DirectionalIcon, EmptyState, Link, PlainTextArea, PlainTextField, SegmentedControl, SelectControl, useApiMutation, useApiQuery, useQueryParam, useQueryParams, useT, useToast, type StatusTone } from '@repo/ui';
import { CalendarClock, Car, CheckCircle2, ChevronRight, Clock3, Copy, DoorClosed, DoorOpen, Dumbbell, LogIn, LogOut, Megaphone, ParkingSquare, Plus, Send, ShieldX, Ticket, Users, Wrench, XCircle, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { OPS } from '../../nav.config';
import { PortalSkeleton, usePortalFormat } from '../portal/shared';
import { DEMO_TODAY, demoNow, Labelled, Sheet, useWords, When } from './rkit';
import { NotAvailable, ProblemText } from './ProblemText';

/**
 * PORTAL-015, society edition (Gate D.2): Requests. One place for what a resident asks of the building:
 * repairs in their flat, issues in shared places, visitors and the gate, vehicles and parking, and
 * amenity bookings. The visitors tab (PORTAL-019/020) invites a guest for a time window and shows who
 * came; a visitor waiting at the gate is asked about in the global prompt (PORTAL-040).
 */
export default function ServicesHub() {
  const { t } = useT();
  const [tab] = useQueryParam('tab');
  const setParams = useQueryParams();
  return (
    <div className="@container space-y-6" data-testid="services-hub">
      <header className="space-y-2">
        <h1 id="page-title" tabIndex={-1} className="text-2xl font-bold text-text outline-none sm:text-3xl">
          {t('operations:hub.title')}
        </h1>
        <p className="text-sm text-muted">{t('operations:hub.intro')}</p>
      </header>
      <SegmentedControl label={t('operations:hub.show')} value={tab === 'visitors' ? 'visitors' : 'all'} onChange={(v) => setParams({ tab: v === 'all' ? null : v, new: null })} options={[{ id: 'all', label: t('operations:hub.everything') }, { id: 'visitors', label: t('operations:hub.visitors') }]} testId="hub-tabs" wrap />
      {tab === 'visitors' ? <VisitorsTab /> : <Overview />}
    </div>
  );
}

function Overview() {
  const { t } = useT();
  const repairs = useApiQuery<ResidentRequests>({ method: 'GET', path: '/portal/requests' }, { retry: false });
  const issues = useApiQuery<ResidentIssues>({ method: 'GET', path: '/portal/issues' }, { retry: false });
  const visitors = useApiQuery<ResidentVisitors>({ method: 'GET', path: '/portal/visitors' }, { retry: false });
  const notices = useApiQuery<ResidentNotices>({ method: 'GET', path: '/portal/notices' }, { retry: false });
  const openRepairs = repairs.data?.items.filter((r) => !['closed', 'cancelled'].includes(r.state)).length ?? 0;
  const awaiting = repairs.data?.items.filter((r) => r.canConfirm).length ?? 0;
  const tiles: Array<{ id: string; href: string; icon: LucideIcon; title: string; line: string; hidden?: boolean }> = [
    { id: 'repairs', href: OPS.repairs, icon: Wrench, title: t('operations:hub.repairs'), line: awaiting ? t('operations:hub.repairsAwaiting', { count: awaiting }) : t('operations:hub.repairsOpen', { count: openRepairs }), hidden: repairs.isError },
    { id: 'issues', href: OPS.issues, icon: Users, title: t('operations:hub.issues'), line: t('operations:hub.issuesLine', { count: issues.data?.items.filter((i) => i.nearMe && !['resolved', 'merged', 'hidden'].includes(i.state)).length ?? 0 }), hidden: issues.isError },
    { id: 'visitors', href: OPS.visitors, icon: DoorOpen, title: t('operations:hub.visitors'), line: visitors.data ? t('operations:hub.visitorsLine', { count: visitors.data.passes.filter((p) => p.state === 'active' || p.state === 'scheduled').length }) : '', hidden: visitors.isError },
    { id: 'notices', href: OPS.notices, icon: Megaphone, title: t('operations:hub.notices'), line: t('operations:hub.noticesLine', { count: notices.data?.counts.unread ?? 0 }), hidden: notices.isError },
    { id: 'vehicles', href: OPS.vehicles, icon: Car, title: t('operations:hub.vehicles'), line: t('operations:hub.vehiclesLine') },
    { id: 'parking', href: OPS.parking, icon: ParkingSquare, title: t('operations:hub.parking'), line: t('operations:hub.parkingLine') },
    { id: 'amenities', href: OPS.amenities, icon: Dumbbell, title: t('operations:hub.amenities'), line: t('operations:hub.amenitiesLine') },
  ];
  if (!repairs.data && !repairs.isError) return <PortalSkeleton title={t('operations:hub.title')} />;
  return (
    <ul className="grid grid-cols-1 gap-3 @xl:grid-cols-2" data-testid="hub-tiles">
      {tiles
        .filter((x) => !x.hidden)
        .map((x) => {
          const Icon = x.icon;
          return (
            <li key={x.id}>
              <Link href={x.href} variant="plain" className="flex min-h-20 items-center gap-4 rounded-card border border-border bg-panel p-4 shadow-card hover:bg-raised" data-testid={`hub-${x.id}`}>
                <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-tile bg-primary-soft text-primary">
                  <Icon className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-text">{x.title}</span>
                  {x.line && <span className="block text-sm text-muted">{x.line}</span>}
                </span>
                <DirectionalIcon icon={ChevronRight} className="size-5 text-muted" />
              </Link>
            </li>
          );
        })}
    </ul>
  );
}

const PASS_TONE: Record<GatePass['state'], [StatusTone, LucideIcon]> = { scheduled: ['info', CalendarClock], active: ['success', DoorOpen], checked_in: ['info', LogIn], checked_out: ['neutral', LogOut], expired: ['neutral', Clock3], cancelled: ['neutral', XCircle] };

export function PassChip({ state }: { state: GatePass['state'] }) {
  const { t } = useT();
  const [tone, icon] = PASS_TONE[state];
  return (
    <Badge tone={tone} icon={icon} data-testid="pass-state" data-state={state}>
      {t(`operations:passState.${state}`)}
    </Badge>
  );
}

function VisitorsTab() {
  const { t } = useT();
  const w = useWords();
  const fmt = usePortalFormat(`${DEMO_TODAY}T09:00:00Z`);
  const [isNew] = useQueryParam('new');
  const [pass] = useQueryParam('pass');
  const setParams = useQueryParams();
  const q = useApiQuery<ResidentVisitors>({ method: 'GET', path: '/portal/visitors' });
  if (q.isError) return <NotAvailable error={q.error} />;
  if (!q.data) return <PortalSkeleton title={t('operations:hub.visitors')} />;
  const d = q.data;
  const upcoming = d.passes.filter((p) => p.state === 'active' || p.state === 'scheduled' || p.state === 'checked_in');
  const past = d.passes.filter((p) => !upcoming.includes(p));
  const shown = pass ? d.passes.find((p) => p.id === pass) : undefined;
  return (
    <div className="space-y-6" data-testid="visitors-tab">
      {d.flats.length === 0 ? (
        <EmptyState title={t('operations:visitors.onlyOccupantsTitle')} body={t('operations:visitors.onlyOccupantsBody')} />
      ) : (
        <Button variant="primary" size="lg" icon={Plus} onPress={() => setParams({ new: '1' })} className="w-full justify-center whitespace-normal text-center sm:w-auto" data-testid="invite-guest">
          {t('operations:visitors.invite')}
        </Button>
      )}
      {!d.liveQueue && <p className="text-sm text-muted">{t('operations:visitors.noLiveQueue')}</p>}
      <section className="space-y-3" aria-labelledby="passes-upcoming" data-testid="passes-upcoming">
        <h2 id="passes-upcoming" className="text-lg font-bold text-text">{t('operations:visitors.upcoming')}</h2>
        {upcoming.length === 0 ? <p className="text-sm text-muted">{t('operations:visitors.noUpcoming')}</p> : upcoming.map((p) => <PassCard key={p.id} pass={p} onOpen={() => setParams({ pass: p.id })} />)}
      </section>
      {d.requests.length > 0 && (
        <section className="space-y-2" aria-labelledby="gate-asked" data-testid="gate-asked">
          <h2 id="gate-asked" className="text-lg font-bold text-text">{t('operations:visitors.asked')}</h2>
          <ul className="space-y-2">
            {d.requests.map((r) => (
              <li key={r.id} className="space-y-2 rounded-tile border border-border bg-panel p-3 text-sm" data-testid="asked-row" data-state={r.state}>
                <span className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 flex-[1_1_10em] space-y-0.5">
                    <bdi className="block font-medium text-text break-words">{r.visitorName}</bdi>
                    <span className="block text-xs text-muted">{w.purpose(r.purpose)}</span>
                    <Labelled label={t('operations:visitors.askedAt')}><When iso={r.createdAt} fmt={fmt} /></Labelled>
                  </span>
                  <Badge tone={r.state === 'approved' ? 'success' : r.state === 'denied' ? 'error' : r.state === 'waiting' ? 'warning' : 'neutral'}>{t(`operations:gateRequestState.${r.state}`)}</Badge>
                </span>
                {r.state === 'waiting' && <AskedActions id={r.id} name={r.visitorName} onDone={() => void q.refetch()} />}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="space-y-2" aria-labelledby="visits-recent" data-testid="visits-recent">
        <h2 id="visits-recent" className="text-lg font-bold text-text">{t('operations:visitors.recent')}</h2>
        {d.visits.length === 0 ? (
          <p className="text-sm text-muted">{t('operations:visitors.noVisits')}</p>
        ) : (
          <ul className="space-y-2">
            {d.visits.map((v) => (
              <li key={v.id} className="flex flex-wrap items-start justify-between gap-2 rounded-tile border border-border bg-panel p-3 text-sm" data-testid="visit-row" data-outcome={v.outcome}>
                <span className="min-w-0 flex-[1_1_10em] space-y-0.5">
                  <bdi className="block font-medium text-text break-words">{v.visitorName}</bdi>
                  <span className="block text-xs text-muted">{w.purpose(v.purpose)}</span>
                  <Labelled label={t('operations:visitors.arrived')}><When iso={v.at} fmt={fmt} /></Labelled>
                  {v.checkedOutAt && <Labelled label={t('operations:visitors.left')}><When iso={v.checkedOutAt} fmt={fmt} /></Labelled>}
                </span>
                <Badge tone={v.outcome === 'refused' ? 'error' : v.outcome === 'inside' ? 'info' : 'neutral'} icon={v.outcome === 'refused' ? ShieldX : v.outcome === 'inside' ? LogIn : LogOut}>
                  {v.refusal ? t(`operations:refusal.${v.refusal}`) : t(`operations:visitOutcome.${v.outcome}`)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
      {past.length > 0 && (
        <section className="space-y-3" aria-labelledby="passes-past">
          <h2 id="passes-past" className="text-lg font-bold text-text">{t('operations:visitors.past')}</h2>
          {past.map((p) => (
            <PassCard key={p.id} pass={p} onOpen={() => setParams({ pass: p.id })} />
          ))}
        </section>
      )}
      <InviteSheet isOpen={isNew === '1'} flats={d.flats} onClose={() => setParams({ new: null })} onCreated={(id) => { setParams({ new: null, pass: id }); void q.refetch(); }} />
      <PassSheet pass={shown ?? null} onClose={() => setParams({ pass: null })} onChanged={() => void q.refetch()} />
    </div>
  );
}

function PassCard({ pass: p, onOpen }: { pass: GatePass; onOpen: () => void }) {
  const { t } = useT();
  const w = useWords();
  const fmt = usePortalFormat(`${DEMO_TODAY}T09:00:00Z`);
  return (
    <button type="button" onClick={onOpen} className="block w-full space-y-2 rounded-card border border-border bg-panel p-4 text-start shadow-card outline-none hover:bg-raised focus-visible:outline-2 focus-visible:outline-focus" data-testid="pass-card" data-ref={p.ref} data-state={p.state}>
      <span className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0 flex-[1_1_10em]">
          <span className="block font-semibold text-text break-words"><bdi>{p.visitorName}</bdi></span>
          <span className="block text-xs text-muted">
            {w.purpose(p.purpose)} · <bdi dir="ltr" className="ltr-ref whitespace-nowrap">{p.flat.code}</bdi>
            {p.vehiclePlate ? <> · <bdi dir="ltr" className="ltr-ref whitespace-nowrap">{p.vehiclePlate}</bdi></> : null}
          </span>
        </span>
        <PassChip state={p.state} />
      </span>
      <span className="block space-y-0.5 text-sm" data-testid="pass-window">
        <Labelled label={t('operations:visitors.starts')}><When iso={p.from} fmt={fmt} /></Labelled>
        <Labelled label={t('operations:visitors.ends')}><When iso={p.to} fmt={fmt} /></Labelled>
        <Labelled label={t('operations:visitors.entries')}>{p.entries === 'single' ? t('operations:visitors.single') : t('operations:visitors.multiple')}</Labelled>
      </span>
      <span className="flex items-center gap-2 text-sm">
        <Ticket aria-hidden className="size-4 text-muted" />
        {t('operations:visitors.code')} <bdi dir="ltr" className="ltr-ref font-semibold tracking-widest">{p.code}</bdi>
      </span>
    </button>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
/** "2026-10-26T18:00" in Pakistan time for a datetime input. */
const localValue = (d: Date) => {
  const k = new Date(d.getTime() + 5 * 3600_000);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}T${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`;
};
const fromLocal = (v: string) => new Date(`${v}:00+05:00`).toISOString();

function InviteSheet({ isOpen, flats, onClose, onCreated }: { isOpen: boolean; flats: ResidentVisitors['flats']; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useT();
  const w = useWords();
  const toast = useToast();
  const create = useApiMutation<GatePass>();
  const start = demoNow();
  const [flatId, setFlatId] = useState<string | null>(flats[0]?.id ?? null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [purpose, setPurpose] = useState<GatePurpose>('guest');
  const [plate, setPlate] = useState('');
  const [from, setFrom] = useState(localValue(new Date(start.getTime() + 15 * 60_000)));
  const [to, setTo] = useState(localValue(new Date(start.getTime() + 4 * 3600_000)));
  const [entries, setEntries] = useState<'single' | 'multiple'>('single');
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('operations:visitors.inviteTitle')}
      subtitle={t('operations:visitors.inviteSubtitle')}
      testId="invite-sheet"
      footer={
        <Button
          variant="primary"
          size="lg"
          icon={Send}
          className="w-full justify-center"
          isPending={create.isPending}
          isDisabled={!flatId || name.trim().length < 2}
          onPress={async () => {
            setError(null);
            try {
              const p = await create.mutateAsync({ method: 'POST', path: '/portal/passes', body: { flatId, visitorName: name, visitorPhone: phone, purpose, vehiclePlate: plate, from: fromLocal(from), to: fromLocal(to), entries, note } });
              toast.success(t('operations:visitors.created', { code: p.code }));
              setName('');
              setPhone('');
              setPlate('');
              setNote('');
              onCreated(p.id);
            } catch (e) {
              setError(e);
            }
          }}
          data-testid="invite-submit"
        >
          {t('operations:visitors.createPass')}
        </Button>
      }
    >
      <div className="space-y-4">
        {flats.length > 1 && <SelectControl label={t('operations:visitors.forFlat')} value={flatId} onChange={setFlatId} options={flats.map((f) => ({ id: f.id, label: f.code }))} testId="invite-flat" />}
        <PlainTextField label={t('operations:visitors.name')} value={name} onChange={setName} testId="invite-name" />
        <PlainTextField label={t('operations:visitors.phone')} description={t('operations:visitors.phoneHint')} value={phone} onChange={setPhone} type="tel" inputMode="tel" dir="ltr" optional testId="invite-phone" />
        <SelectControl label={t('operations:visitors.purpose')} value={purpose} onChange={(v) => setPurpose((v ?? 'guest') as GatePurpose)} options={GATE_PURPOSES.map((p) => ({ id: p, label: w.purpose(p) }))} testId="invite-purpose" />
        <PlainTextField label={t('operations:visitors.plate')} description={t('operations:visitors.plateHint')} value={plate} onChange={setPlate} dir="ltr" optional testId="invite-plate" />
        <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
            {t('operations:visitors.from')}
            <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="min-h-11 rounded-control border border-border-control bg-panel px-3 text-sm text-text" data-testid="invite-from" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
            {t('operations:visitors.to')}
            <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="min-h-11 rounded-control border border-border-control bg-panel px-3 text-sm text-text" data-testid="invite-to" />
          </label>
        </div>
        <SegmentedControl label={t('operations:visitors.entries')} value={entries} onChange={setEntries} options={[{ id: 'single', label: t('operations:visitors.single') }, { id: 'multiple', label: t('operations:visitors.multiple') }]} testId="invite-entries" wrap />
        <p className="text-xs text-muted">{entries === 'single' ? t('operations:visitors.singleHint') : t('operations:visitors.multipleHint')}</p>
        <PlainTextArea label={t('operations:visitors.note')} optional value={note} onChange={setNote} testId="invite-note" />
        {error ? <ProblemText error={error} /> : null}
      </div>
    </Sheet>
  );
}

function PassSheet({ pass: p, onClose, onChanged }: { pass: GatePass | null; onClose: () => void; onChanged: () => void }) {
  const { t } = useT();
  const w = useWords();
  const toast = useToast();
  const fmt = usePortalFormat(`${DEMO_TODAY}T09:00:00Z`);
  const cancel = useApiMutation<GatePass>();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <Sheet isOpen={!!p} onClose={onClose} title={p ? t('operations:visitors.passFor', { name: p.visitorName }) : ''} subtitle={p ? <PassChip state={p.state} /> : undefined} testId="pass-sheet">
      {p && (
        <div className="space-y-5" data-testid="pass-detail">
          <div className="space-y-2 rounded-card border-2 border-dashed border-primary/40 bg-primary-soft/30 p-5 text-center">
            <p className="text-sm text-muted">{t('operations:visitors.showCode')}</p>
            <p className="text-4xl font-bold tracking-[0.35em] text-text" data-testid="pass-code">
              <bdi dir="ltr">{p.code}</bdi>
            </p>
            <p className="flex flex-col items-center text-sm text-text">
              <Labelled label={t('operations:visitors.starts')}><When iso={p.from} fmt={fmt} /></Labelled>
              <Labelled label={t('operations:visitors.ends')}><When iso={p.to} fmt={fmt} /></Labelled>
            </p>
            <Button
              variant="secondary"
              icon={Copy}
              onPress={async () => {
                const text = t('operations:visitors.shareText', { name: p.visitorName, code: p.code, from: fmt.instantTime(p.from), to: fmt.instantTime(p.to), flat: p.flat.code });
                try {
                  await navigator.clipboard.writeText(text);
                } catch {
                  /* the message is shown below either way */
                }
                setCopied(true);
              }}
              data-testid="pass-copy"
            >
              {t('operations:visitors.copy')}
            </Button>
            {copied && <p role="status" className="text-xs text-success">{t('operations:visitors.copied')}</p>}
          </div>
          <dl className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted">{t('operations:visitors.purpose')}</dt><dd className="text-text">{w.purpose(p.purpose)}</dd></div>
            <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted">{t('operations:visitors.entries')}</dt><dd className="text-text">{p.entries === 'single' ? t('operations:visitors.single') : t('operations:visitors.multiple')}</dd></div>
            {p.vehiclePlate && <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted">{t('operations:visitors.plate')}</dt><dd className="text-text"><bdi dir="ltr">{p.vehiclePlate}</bdi></dd></div>}
            <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted">{t('operations:visitors.used')}</dt><dd className="text-text">{t('operations:visitors.usedCount', { count: p.usedCount })}</dd></div>
          </dl>
          <p className="text-xs text-muted">{t('operations:visitors.simulated')}</p>
          {(p.state === 'active' || p.state === 'scheduled') && (
            <Button
              variant="quiet"
              icon={XCircle}
              isPending={cancel.isPending}
              onPress={async () => {
                setError(null);
                try {
                  await cancel.mutateAsync({ method: 'POST', path: `/portal/passes/${p.id}/cancel`, body: {} });
                  toast.success(t('operations:visitors.cancelled'));
                  onChanged();
                } catch (e) {
                  setError(e);
                }
              }}
              data-testid="pass-cancel"
            >
              {t('operations:visitors.cancel')}
            </Button>
          )}
          {error ? <ProblemText error={error} /> : null}
        </div>
      )}
    </Sheet>
  );
}

/** PORTAL-040 in the Visitors tab: the same answer as the gate prompt, for a request still waiting. */
function AskedActions({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const act = useApiMutation();
  const answer = async (action: 'approve' | 'deny') => {
    try {
      await act.mutateAsync({ method: 'POST', path: `/portal/gate-requests/${id}/${action}`, body: {} });
      toast.success(t(`operations:gate.answered.${action}`, { name }));
    } catch {
      toast.error(t('operations:gate.tooLate'));
    }
    onDone();
  };
  return (
    <span className="flex w-full flex-wrap gap-2">
      <Button variant="primary" size="sm" icon={CheckCircle2} isPending={act.isPending} onPress={() => void answer('approve')} className="max-w-full whitespace-normal text-start" data-testid="asked-approve">
        {t('operations:gate.approve')}
      </Button>
      <Button variant="secondary" size="sm" icon={DoorClosed} isPending={act.isPending} onPress={() => void answer('deny')} className="max-w-full whitespace-normal text-start" data-testid="asked-deny">
        {t('operations:gate.deny')}
      </Button>
    </span>
  );
}
