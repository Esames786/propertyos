import { ApiError, type HoldLeadOption, type UnitInventoryDetail } from '@repo/contracts';
import { Button, DateTime, Drawer, KeyValueList, Link, SkeletonBlock, useAnnounce, useApiMutation, useApiQuery, useKeyedCreate, useSession, useT, useToast } from '@repo/ui';
import { Clock3, Lock, LockOpen, Package, UserRound } from 'lucide-react';
import { useState } from 'react';
import { ProblemAlert } from '../../society/kit';
import { SearchSelect } from '../../society/hr/hkit';
import { BucketBadge, PRJ, SeedBadge, unbroken, useEventText, useInvFormat, useLocationText } from './pkit';

/**
 * INV-002 unit quick view (Gate E.2's own drawer; the CRM drawer of Lead 360 is left as it is). Opened
 * from the matrix, its list, live availability and storage, and deep-linkable (`?unit=` here, or the
 * register address `/backoffice/inv/unit-quick-view?record=…`). It shows the three status dimensions,
 * the hold in force as this reader may see it, storage and the unit's history; a person with the hold
 * permission holds an available unit for an open lead of its project (48 hours, demo session only),
 * and only the person who placed a hold may release it. Every change refreshes every screen at once.
 */
export function UnitDrawer({ unitId, onClose }: { unitId: string | null; onClose: () => void }) {
  const { t } = useT();
  const q = useApiQuery<UnitInventoryDetail>(unitId ? { method: 'GET', path: `/inventory/units/${unitId}` } : null, { retry: false });
  const u = q.data && q.data.id === unitId ? q.data : undefined;
  const where = useWhere();
  const notFound = q.isError && q.error instanceof ApiError && q.error.problem.status === 404;
  return (
    <Drawer
      isOpen={!!unitId}
      onOpenChange={(open) => !open && onClose()}
      title={u ? t('projects:unit.title', { ref: unbroken(u.ref) }) : notFound ? t('projects:common.notFoundTitle') : t('projects:common.loading')}
      subtitle={
        u ? (
          <span>
            <bdi>{u.project.name}</bdi> · {where(u)}
          </span>
        ) : undefined
      }
      testId="inv-quick-view"
      size="lg"
      footer={u ? <HoldActions u={u} /> : undefined}
    >
      {notFound ? (
        <p className="text-sm text-text" data-testid="inv-quick-view-not-found">
          {t('projects:common.notFoundBody')}
        </p>
      ) : q.isError ? (
        <ProblemAlert error={q.error} />
      ) : !u ? (
        <SkeletonBlock lines={8} />
      ) : (
        <UnitBody u={u} />
      )}
    </Drawer>
  );
}

export function useWhere() {
  const { t } = useT();
  return (u: { towerName?: string; floor?: number; block?: string }) => (u.towerName ? t('projects:matrix.where.tower', { tower: u.towerName, floor: String(u.floor ?? '') }) : t('projects:matrix.where.phase', { phase: u.block ?? '' }));
}

function UnitBody({ u }: { u: UnitInventoryDetail }) {
  const { t } = useT();
  const f = useInvFormat();
  const event = useEventText();
  const location = useLocationText();
  const seeded = ['held', 'reserved', 'booked', 'allocated'].includes(u.dimensions.inventory);
  return (
    <div className="space-y-6" data-testid="inv-unit" data-unit={u.id} data-bucket={u.bucket}>
      <div className="flex flex-wrap items-center gap-2">
        <BucketBadge bucket={u.bucket} testId="inv-unit-bucket" />
        {seeded && <SeedBadge />}
      </div>
      <section aria-labelledby="inv-dim" className="@container space-y-2">
        <h3 id="inv-dim" className="text-sm font-semibold text-text">
          {t('projects:unit.dimensions')}
        </h3>
        <KeyValueList
          className="@container"
          items={[
            { label: t('projects:dimension.inventory'), value: <span data-testid="inv-dim-inventory">{t(`projects:inventory.${u.dimensions.inventory}`)}</span> },
            { label: t('projects:dimension.delivery'), value: <span data-testid="inv-dim-delivery">{t(`projects:delivery.${u.dimensions.delivery}`)}</span> },
            { label: t('projects:dimension.occupancy'), value: <span data-testid="inv-dim-occupancy">{t(`projects:occupancy.${u.dimensions.occupancy}`)}</span> },
          ]}
        />
      </section>
      <section aria-labelledby="inv-facts" className="@container space-y-2">
        <h3 id="inv-facts" className="text-sm font-semibold text-text">
          {t('projects:unit.facts')}
        </h3>
        <KeyValueList
          className="@container"
          items={[
            { label: t('projects:unit.type'), value: unbroken(t(`crm:types.${u.type}`)) },
            { label: t('projects:unit.area'), value: <bdi dir="ltr">{f.area(u.areaSqft)}</bdi> },
            { label: t('projects:unit.price'), value: <span><bdi dir="ltr" className="font-semibold">{f.moneyExact(u.price)}</bdi><span className="block text-xs text-muted">{t('projects:unit.priceNote')}</span></span> },
          ]}
        />
      </section>
      <HoldSection u={u} />
      <section aria-labelledby="inv-storage" className="space-y-2">
        <h3 id="inv-storage" className="text-sm font-semibold text-text">
          {t('projects:unit.storageTitle')}
        </h3>
        {u.storage.length === 0 ? (
          <p className="text-sm text-muted">{t('projects:unit.storageNone')}</p>
        ) : (
          <ul className="space-y-1 text-sm" data-testid="inv-unit-storage">
            {u.storage.map((s) => (
              <li key={s.storageId}>
                <Package aria-hidden className="me-1 inline size-4 text-muted" />
                <Link href={PRJ.storage({ project: u.project.id, q: s.storageRef })}>
                  <bdi dir="ltr">{unbroken(s.storageRef)}</bdi>
                </Link>{' '}
                · {location(s.location)} · <span className="text-muted">{t('projects:storage.allocatedBy', { name: s.byName, date: f.date(s.allocatedAt) })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="inv-history" className="space-y-2">
        <h3 id="inv-history" className="text-sm font-semibold text-text">
          {t('projects:unit.historyTitle')}
        </h3>
        {u.history.length === 0 ? (
          <p className="text-sm text-muted">{t('projects:unit.historyEmpty')}</p>
        ) : (
          <ol className="space-y-2 border-s border-border ps-4 text-sm" data-testid="inv-unit-history">
            {u.history.map((e) => (
              <li key={e.id} data-kind={e.kind}>
                <p className="text-text">{event(e)}</p>
                <p className="text-xs text-muted">
                  <DateTime value={e.at} style="dateTime" />
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function HoldSection({ u }: { u: UnitInventoryDetail }) {
  const { t } = useT();
  const f = useInvFormat();
  const h = u.hold;
  return (
    <section aria-labelledby="inv-hold" className="space-y-2" data-testid="inv-hold-section" data-source={h?.source ?? 'none'}>
      <h3 id="inv-hold" className="text-sm font-semibold text-text">
        {t('projects:unit.holdTitle')}
      </h3>
      {h?.source === 'live' ? (
        <div className="space-y-1 rounded-control border border-warning/40 bg-warning-soft p-3 text-sm text-text">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <Clock3 aria-hidden className="size-4 shrink-0" />
            <span data-testid="inv-hold-until">{t('projects:unit.heldLive', { until: f.when(h.until!) })}</span>
          </p>
          {h.holderName && (
            <p>
              <UserRound aria-hidden className="me-1 inline size-4" />
              {t('projects:unit.heldBy', { name: h.holderName })}
            </p>
          )}
          {h.leadRef && h.leadId && (
            <p data-testid="inv-hold-lead">
              {t('projects:unit.heldFor')}{' '}
              <Link href={PRJ.lead(h.leadId)}>
                <bdi dir="ltr">{unbroken(h.leadRef)}</bdi>
              </Link>
            </p>
          )}
          <p className="text-muted">{h.mine ? t('projects:unit.heldMine') : t('projects:unit.heldOther')}</p>
        </div>
      ) : h?.source === 'seed' ? (
        <p className="rounded-control bg-sunken p-3 text-sm text-text" data-testid="inv-hold-seed">
          {t('projects:unit.heldSeed')}
        </p>
      ) : u.bucket !== 'available' ? (
        <p className="text-sm text-muted">{t('projects:unit.notHoldable')}</p>
      ) : null}
    </section>
  );
}

/** The drawer's sticky footer: hold an available unit for a lead, or release one's own hold. */
function HoldActions({ u }: { u: UnitInventoryDetail }) {
  const { t } = useT();
  const { can } = useSession();
  const f = useInvFormat();
  const toast = useToast();
  const announce = useAnnounce();
  const [leadId, setLeadId] = useState<string | null>(null);
  const leads = useApiQuery<HoldLeadOption[]>(u.canHold && can('unit.hold') ? { method: 'GET', path: `/inventory/units/${u.id}/hold-leads` } : null);
  const hold = useKeyedCreate<{ unitRef: string; until: string }>('inv-hold');
  const release = useApiMutation<{ released: true }>();
  const [error, setError] = useState<unknown>(null);

  if (u.canRelease) {
    const doRelease = async () => {
      setError(null);
      try {
        await release.mutateAsync({ method: 'POST', path: `/inventory/units/${u.id}/release` });
        const msg = t('projects:unit.released', { unit: u.ref });
        toast.success(msg);
        announce(msg);
      } catch (e) {
        setError(e);
      }
    };
    return (
      <div className="space-y-2">
        {error ? <ProblemAlert error={error} /> : null}
        <Button variant="secondary" icon={LockOpen} onPress={() => void doRelease()} isPending={release.isPending} data-testid="inv-release">
          {t('projects:unit.release')}
        </Button>
      </div>
    );
  }
  if (!u.canHold || !can('unit.hold')) return null;
  const options = (leads.data ?? []).map((l) => ({ id: l.id, label: `${l.name} · ${l.ref}`, hint: t(`status:lead.${l.status as 'new'}`) }));
  const lead = leads.data?.find((l) => l.id === leadId);
  const doHold = async () => {
    setError(null);
    try {
      const res = await hold.send({ method: 'POST', path: `/inventory/units/${u.id}/hold`, body: { leadId: leadId ?? '' } });
      const msg = t('projects:unit.holdDone', { unit: u.ref, lead: lead?.ref ?? '', until: f.when(res.until) });
      toast.success(msg);
      announce(msg);
      setLeadId(null);
    } catch (e) {
      setError(e);
    }
  };
  return (
    <div className="space-y-3" data-testid="inv-hold-form">
      {error ? <ProblemAlert error={error} /> : null}
      {leads.data && leads.data.length === 0 ? (
        <p className="text-sm text-muted">{t('projects:unit.holdNoLeads')}</p>
      ) : (
        <SearchSelect options={options} value={leadId} onChange={setLeadId} label={t('projects:unit.holdLead')} description={t('projects:unit.holdLeadHint')} testId="inv-hold-lead" />
      )}
      <Button variant="primary" icon={Lock} onPress={() => void doHold()} isPending={hold.isPending} isDisabled={!leadId} data-testid="inv-hold">
        {t('projects:unit.hold')}
      </Button>
    </div>
  );
}
