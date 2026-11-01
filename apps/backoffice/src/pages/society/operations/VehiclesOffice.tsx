import { VEHICLE_STATES, type Vehicle, type VehicleCheck, type VehicleList } from '@repo/contracts';
import { Button, cn, DirectionalIcon, Drawer, dynamicT, EmptyState, ErrorState, FilterPills, InlineAlert, Link, PageHeader, PlainTextArea, PlainTextField, SegmentedControl, SelectControl, useApiMutation, useApiQuery, useQueryParam, useQueryParams, useSession, useT, useToast } from '@repo/ui';
import { BadgeCheck, CheckCircle2, ChevronRight, Info, Trash2, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { OPS } from '../../../nav.config';
import { Fact, FactGrid, HistoryList } from '../finance/fkit';
import { Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { VehicleBadge } from './okit';

/**
 * PARK-005 vehicle register with PARK-007, its approval drawer (Gate D.2). Residents register their
 * vehicles; whoever holds `vehicles.approve` decides with the server's checks in view: the plate is not
 * approved for another flat, the person still lives in (or owns) the flat, and the flat has a free slot.
 * The drawer only shows what the server says; nothing is approved on the resident's word.
 */

const STATES = ['all', ...VEHICLE_STATES] as const;
/** A plate or flat code inside a translated sentence keeps its own direction (U+2068 … U+2069). */
const iso = (s: string) => `⁨${s}⁩`;

export default function VehiclesOffice() {
  const { t } = useT();
  const { allows } = useSession();
  const [status] = useQueryParam('status');
  const [record] = useQueryParam('record');
  const setParams = useQueryParams();
  const [text, setText] = useState('');
  // Someone who decides starts at the queue; everyone else at the whole register.
  const fallback = allows({ module: 'parking', permission: 'vehicles.approve' }) ? 'pending' : 'all';
  const filter = (STATES as readonly string[]).includes(status ?? '') ? status! : fallback;
  const q = useApiQuery<VehicleList>({ method: 'GET', path: '/ops/vehicles', query: { status: filter, ...(text.trim() ? { q: text.trim() } : {}) } }, { placeholderData: (prev) => prev });
  return (
    <div className="@container space-y-5" data-testid="vehicles-page" data-filter={filter}>
      <PageHeader title={t('operations:vehicleOffice.title')} description={t('operations:vehicleOffice.intro')} />
      <p className="flex items-start gap-2 text-sm text-muted">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        {t('operations:vehicleOffice.rule')}
      </p>
      <div className="max-w-xl">
        <PlainTextField label={t('operations:vehicleOffice.search')} value={text} onChange={setText} placeholder={t('operations:vehicleOffice.searchHint')} testId="vehicle-search" />
      </div>
      <FilterPills
        label={t('operations:vehicleOffice.status')}
        value={filter}
        testId="vehicle-status"
        onChange={(v) => setParams({ status: v === fallback ? null : v })}
        options={STATES.map((s) => ({ id: s, label: s === 'all' ? t('operations:vehicleOffice.all') : t(`operations:vehicleState.${s}`), ...(q.data ? { count: q.data.counts[s] } : {}) }))}
      />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Loading lines={6} />
      ) : q.data.items.length === 0 ? (
        filter === 'pending' && !text.trim() ? (
          <EmptyState title={t('operations:vehicleOffice.emptyPendingTitle')} body={t('operations:vehicleOffice.emptyPendingBody')} />
        ) : (
          <EmptyState title={t('operations:vehicleOffice.emptyTitle')} body={t('operations:vehicleOffice.emptyBody')} />
        )
      ) : (
        <VehicleRows items={q.data.items} status={status} />
      )}
      <VehicleDrawer id={record?.startsWith('veh_') ? record : null} onClose={() => setParams({ record: null })} onOpen={(id) => setParams({ record: id })} />
    </div>
  );
}

function VehicleRows({ items, status }: { items: Vehicle[]; status: string | null }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  return (
    <ul className="space-y-2" data-testid="vehicle-list">
      {items.map((v) => (
        <li key={v.id}>
          <Link
            href={OPS.vehicles({ ...(status ? { status } : {}), record: v.id })}
            variant="plain"
            className="grid gap-2 rounded-tile border border-border/70 bg-panel p-3 hover:bg-raised @3xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1fr)_auto] @3xl:items-center"
            data-testid="vehicle-row"
            data-ref={v.ref}
            data-plate={v.plate}
            data-state={v.state}
          >
            <span className="min-w-0">
              <span className="block font-semibold tracking-wide text-text">
                <bdi dir="ltr" className="ltr-ref">{v.plate}</bdi>
              </span>
              <span className="block text-xs text-muted">
                {t(`operations:vehicleKind.${v.kind}`)} · <bdi>{v.make}</bdi> · <bdi>{v.colour}</bdi>
              </span>
            </span>
            <span className="min-w-0 text-sm text-text">
              <bdi dir="ltr" className="ltr-ref font-medium">{v.flat.code}</bdi> · <bdi>{v.ownerName}</bdi>
              <span className="block text-xs text-muted">
                <bdi dir="ltr" className="ltr-ref">{v.ref}</bdi> · {t('operations:vehicleOffice.sent', { date: fmt.date(v.submittedAt) })}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              <VehicleBadge state={v.state} />
              {v.slot ? <span className="text-xs text-text">{t('operations:vehicleOffice.slot', { slot: iso(v.slot) })}</span> : null}
            </span>
            <DirectionalIcon icon={ChevronRight} className="hidden size-4 text-muted @3xl:block" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Check({ ok, testId, children }: { ok: boolean | 'note'; testId: string; children: ReactNode }) {
  const { t } = useT();
  const [Icon, tone, label] = ok === 'note' ? [Info, 'text-muted', t('operations:vehicleOffice.checks.note')] : ok ? [CheckCircle2, 'text-success', t('operations:vehicleOffice.checks.passed')] : [XCircle, 'text-error', t('operations:vehicleOffice.checks.failed')];
  return (
    <li className="flex items-start gap-2 text-sm text-text" data-testid={testId} data-ok={String(ok)}>
      <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', tone)} />
      <span className="min-w-0">
        <span className="sr-only">{label}: </span>
        {children}
      </span>
    </li>
  );
}

function VehicleDrawer({ id, onClose, onOpen }: { id: string | null; onClose: () => void; onOpen: (id: string) => void }) {
  const { t } = useT();
  const q = useApiQuery<VehicleCheck>({ method: 'GET', path: `/ops/vehicles/${id}/check` }, { enabled: !!id });
  const c = id && q.data?.vehicle.id === id ? q.data : null;
  return (
    <Drawer
      isOpen={!!id}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={c ? t('operations:vehicleOffice.drawerTitle', { plate: iso(c.vehicle.plate) }) : t('operations:vehicleOffice.title')}
      subtitle={
        c ? (
          <span className="flex flex-wrap items-center gap-2">
            <VehicleBadge state={c.vehicle.state} testId="vehicle-state" />
            <bdi dir="ltr" className="ltr-ref">{c.vehicle.ref}</bdi>
          </span>
        ) : undefined
      }
      testId="vehicle-drawer"
    >
      {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !c ? <Loading lines={8} /> : <DrawerBody key={`${c.vehicle.id}-${c.vehicle.state}`} check={c} onOpen={onOpen} />}
    </Drawer>
  );
}

function DrawerBody({ check: c, onOpen }: { check: VehicleCheck; onOpen: (id: string) => void }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const { allows } = useSession();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const act = useApiMutation<VehicleCheck>();
  const [error, setError] = useState<unknown>(null);
  const v = c.vehicle;
  const decides = allows({ module: 'parking', permission: 'vehicles.approve' });
  const approvals = allows({ module: 'parking', feature: 'parking.vehicle_approvals', permission: 'vehicles.approve' });
  const suspended = c.reason === 'suspended';
  const pending = v.state === 'pending';
  const [decision, setDecision] = useState<'approve' | 'reject'>(c.canApprove ? 'approve' : 'reject');
  const [slot, setSlot] = useState<string | null>(c.freeSlots[0] ?? null);
  const [reason, setReason] = useState('');
  const [retireReason, setRetireReason] = useState('');
  const list = (items: string[]) => items.map(iso).join(fmt.locale.startsWith('ur') ? '، ' : ', ');

  const run = async (action: 'approve' | 'reject' | 'retire', body: Record<string, string>, message: string) => {
    setError(null);
    try {
      await act.mutateAsync({ method: 'POST', path: `/ops/vehicles/${v.id}/${action}`, body });
      toast.success(message);
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="@container space-y-5" data-testid="vehicle-detail" data-state={v.state} data-can-approve={String(c.canApprove)}>
      <FactGrid testId="vehicle-facts">
        <Fact label={t('operations:vehicleOffice.facts.plate')}>
          <bdi dir="ltr" className="ltr-ref text-lg font-bold tracking-wide">{v.plate}</bdi>
        </Fact>
        <Fact label={t('operations:vehicleOffice.facts.kind')}>{t(`operations:vehicleKind.${v.kind}`)}</Fact>
        <Fact label={t('operations:vehicleOffice.facts.make')}>
          <bdi>{v.make}</bdi> · <bdi>{v.colour}</bdi>
        </Fact>
        <Fact label={t('operations:vehicleOffice.facts.flat')}>
          <Link href={`/backoffice/sites/${v.siteId}/units/${v.flat.id}?tab=services`} data-testid="vehicle-flat-link">
            <bdi dir="ltr">{v.flat.code}</bdi>
          </Link>
        </Fact>
        <Fact label={t('operations:vehicleOffice.facts.owner')}>
          <bdi>{v.ownerName}</bdi>
        </Fact>
        <Fact label={t('operations:vehicleOffice.facts.sent')}>{fmt.date(v.submittedAt)}</Fact>
        <Fact label={t('operations:vehicleOffice.facts.slot')}>{v.slot ? <bdi dir="ltr" className="ltr-ref font-medium">{v.slot}</bdi> : t('operations:vehicleOffice.noSlot')}</Fact>
        {v.decidedByName && v.decidedAt && <Fact label={t('operations:vehicleOffice.facts.decided')}>{t('operations:vehicleOffice.decidedBy', { name: iso(v.decidedByName), date: fmt.date(v.decidedAt) })}</Fact>}
        {v.reason && (
          <Fact label={t('operations:vehicleOffice.facts.reason')}>
            <bdi>{v.reason}</bdi>
          </Fact>
        )}
      </FactGrid>

      {pending && (
        <section className="space-y-3 rounded-card border border-border/70 bg-panel p-4" aria-labelledby="vehicle-checks-title" data-testid="vehicle-checks">
          <h3 id="vehicle-checks-title" className="font-semibold text-text">{t('operations:vehicleOffice.checks.title')}</h3>
          <ul className="space-y-2">
            {c.duplicateOf ? (
              <Check ok={false} testId="check-plate">
                {t('operations:vehicleOffice.checks.plateDuplicate', { flat: iso(c.duplicateOf.flatCode), ref: iso(c.duplicateOf.ref) })}{' '}
                <button type="button" className="text-primary underline" onClick={() => onOpen(c.duplicateOf!.id)} data-testid="open-duplicate">
                  {t('operations:vehicleOffice.checks.openDuplicate', { ref: iso(c.duplicateOf.ref) })}
                </button>
              </Check>
            ) : (
              <Check ok testId="check-plate">{t('operations:vehicleOffice.checks.plateOk')}</Check>
            )}
            {c.pendingSame > 0 && (
              <Check ok="note" testId="check-pending-same">
                {t('operations:vehicleOffice.checks.pendingSame', { count: c.pendingSame })}
              </Check>
            )}
            <Check ok={c.linkInForce} testId="check-link">
              {t(c.linkInForce ? 'operations:vehicleOffice.checks.linkOk' : 'operations:vehicleOffice.checks.linkEnded', { name: iso(v.ownerName), flat: iso(v.flat.code) })}
            </Check>
            <Check ok={c.flatVehicles < c.allowance} testId="check-allowance">
              {t(c.flatVehicles < c.allowance ? 'operations:vehicleOffice.checks.allowanceOk' : 'operations:vehicleOffice.checks.allowanceFull', { used: fmt.count(c.flatVehicles), allowance: fmt.count(c.allowance) })}
            </Check>
            <Check ok={c.freeSlots.length > 0} testId="check-slots">
              {c.freeSlots.length ? t('operations:vehicleOffice.checks.freeSlots', { slots: list(c.freeSlots) }) : t('operations:vehicleOffice.checks.noFreeSlot')}
            </Check>
          </ul>
        </section>
      )}

      {pending && !c.canApprove && c.reason && c.reason !== 'not_pending' && (
        <InlineAlert tone={suspended ? 'info' : 'warning'} title={t('operations:vehicleOffice.cannot.title')} data-testid="vehicle-cannot" data-reason={c.reason}>
          <p>{dt(`operations:vehicleOffice.cannot.${c.reason}`)}</p>
        </InlineAlert>
      )}

      {!decides && (pending || v.state === 'approved') && (
        <InlineAlert tone="info" data-testid="vehicle-read-only">
          {t('operations:vehicleOffice.readOnly')}
        </InlineAlert>
      )}
      {decides && !approvals && pending && !suspended && (
        <InlineAlert tone="info" data-testid="vehicle-feature-off">
          {t('operations:vehicleOffice.featureOff')}
        </InlineAlert>
      )}

      {decides && approvals && pending && !suspended && (
        <section className="space-y-4 rounded-card border border-border/70 bg-panel p-4" aria-label={t('operations:vehicleOffice.decision')} data-testid="vehicle-decide">
          {c.canApprove && (
            <SegmentedControl
              label={t('operations:vehicleOffice.decision')}
              value={decision}
              onChange={(d) => setDecision(d as 'approve' | 'reject')}
              options={[
                { id: 'approve', label: t('operations:vehicleOffice.approve') },
                { id: 'reject', label: t('operations:vehicleOffice.reject') },
              ]}
              testId="vehicle-decision"
            />
          )}
          {decision === 'approve' && c.canApprove ? (
            <>
              <SelectControl label={t('operations:vehicleOffice.slotPick')} description={t('operations:vehicleOffice.slotHint')} value={slot} onChange={(s) => setSlot(s)} options={c.freeSlots.map((s) => ({ id: s, label: s }))} testId="vehicle-slot" />
              <Button variant="primary" icon={BadgeCheck} isPending={act.isPending} isDisabled={!slot} onPress={() => void run('approve', { slot: slot! }, t('operations:vehicleOffice.approved', { plate: iso(v.plate), slot: iso(slot!) }))} data-testid="vehicle-approve">
                {t('operations:vehicleOffice.approveSubmit')}
              </Button>
            </>
          ) : (
            <>
              <PlainTextArea label={t('operations:vehicleOffice.rejectReason')} description={t('operations:vehicleOffice.rejectReasonHint')} value={reason} onChange={setReason} testId="vehicle-reject-reason" />
              <Button variant="secondary" icon={XCircle} isPending={act.isPending} isDisabled={reason.trim().length < 10} onPress={() => void run('reject', { reason }, t('operations:vehicleOffice.rejected', { plate: iso(v.plate) }))} data-testid="vehicle-reject">
                {t('operations:vehicleOffice.rejectSubmit')}
              </Button>
            </>
          )}
        </section>
      )}

      {decides && v.state === 'approved' && !suspended && (
        <section className="space-y-3 rounded-card border border-border/70 bg-panel p-4" aria-labelledby="vehicle-retire-title" data-testid="vehicle-retire-section">
          <h3 id="vehicle-retire-title" className="font-semibold text-text">{t('operations:vehicleOffice.retireTitle')}</h3>
          <p className="text-sm text-muted">{t('operations:vehicleOffice.retireHint')}</p>
          <PlainTextField label={t('operations:vehicleOffice.retireReason')} description={t('operations:vehicleOffice.retireReasonHint')} value={retireReason} onChange={setRetireReason} testId="vehicle-retire-reason" />
          <Button variant="secondary" icon={Trash2} isPending={act.isPending} isDisabled={retireReason.trim().length < 5} onPress={() => void run('retire', { reason: retireReason }, t('operations:vehicleOffice.retired', { plate: iso(v.plate) }))} data-testid="vehicle-retire">
            {t('operations:vehicleOffice.retireSubmit')}
          </Button>
        </section>
      )}

      {error ? <ProblemAlert error={error} /> : null}

      <section className="space-y-2" aria-labelledby="vehicle-history-title">
        <h3 id="vehicle-history-title" className="font-semibold text-text">{t('operations:vehicleOffice.history')}</h3>
        <HistoryList testId="vehicle-history" label={t('operations:vehicleOffice.history')} items={v.history.map((h) => ({ at: h.at, byName: h.byName, label: dt(`operations:vehicleOffice.event.${h.action}`), ...(h.note ? { note: h.note } : {}) }))} />
      </section>
    </div>
  );
}
