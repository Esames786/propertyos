import type { AccessTarget, GatePass, GateVisit, MoveRecord, OpsFlat, RequestRow, Vehicle } from '@repo/contracts';
import { Button, buttonClass, EmptyState, ErrorState, Link, Panel, useApiQuery, useSession, useT } from '@repo/ui';
import { DoorOpen, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { OPS } from '../../../nav.config';
import { Loading } from '../kit';
import { RequestCards } from './MaintenancePages';
import { PassBadge, VehicleBadge, useOpsWords, When } from './okit';
import { MoveList } from './ResidentsOffice';
import { VisitList } from './VisitorPages';

/** What each service module shows for one flat; a section the viewer may not see comes back null. */
interface FlatServices {
  flat: OpsFlat;
  requests: RequestRow[] | null;
  openRequests: number | null;
  passes: GatePass[] | null;
  visits: GateVisit[] | null;
  vehicles: Vehicle[] | null;
  slots: string[];
  moves: MoveRecord[] | null;
}

/** Who may see the services tab of Flat 360 (each section is then filtered by the server). */
export const FLAT_SERVICES_TARGET: AccessTarget = { module: 'residents', anyOf: ['operations.view', 'visitors.view', 'visitors.manage', 'parking.view', 'residents.view'] };

/**
 * Flat 360 "Services" tab (Gate D.2): the flat's repairs, visitor passes and arrivals, vehicles and
 * parking slots, and moves, each by its own permission. Opening a row goes to its own record.
 */
export function FlatServicesTab({ flatId, onMoveOut }: { flatId: string; onMoveOut?: () => void }) {
  const { t } = useT();
  const w = useOpsWords();
  const { allows } = useSession();
  const q = useApiQuery<FlatServices>({ method: 'GET', path: `/ops/flats/${flatId}/services` });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  const shown = d.requests || d.passes || d.vehicles || d.moves;
  if (!shown) return <EmptyState title={t('operations:flatServices.emptyTitle')} body={t('operations:flatServices.emptyBody')} />;
  const raise = allows({ module: 'maintenance', permission: 'maintenance.manage' });
  return (
    <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-2" data-testid="flat-services">
      {d.requests && (
        <Section
          id="flat-services-repairs"
          title={t('operations:flatServices.repairs')}
          note={t('operations:flatServices.openCount', { count: d.openRequests ?? 0 })}
          action={
            raise ? (
              <Link href={OPS.newRequest({ flat: flatId })} variant="plain" className={buttonClass('secondary', 'sm', 'gap-1.5')} data-testid="flat-services-new-request">
                <Plus aria-hidden className="size-4" />
                {t('operations:flatServices.newRequest')}
              </Link>
            ) : undefined
          }
        >
          {d.requests.length === 0 ? <p className="text-sm text-muted">{t('operations:flatServices.noRequests')}</p> : <RequestCards items={d.requests} testId="flat-services-requests" />}
        </Section>
      )}
      {d.passes && (
        <Section id="flat-services-visitors" title={t('operations:flatServices.visitors')}>
          <h3 className="text-sm font-semibold text-text">{t('operations:flatServices.passes')}</h3>
          {d.passes.length === 0 ? (
            <p className="text-sm text-muted">{t('operations:flatServices.noPasses')}</p>
          ) : (
            <ul className="space-y-2" data-testid="flat-services-passes">
              {d.passes.map((p) => (
                <li key={p.id}>
                  <Link href={OPS.pass(p.id)} variant="plain" className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border/70 p-3 text-sm hover:bg-raised" data-testid="flat-services-pass" data-ref={p.ref}>
                    <span className="min-w-0">
                      <bdi className="font-medium text-text">{p.visitorName}</bdi>
                      <span className="block text-xs text-muted">
                        <bdi dir="ltr" className="ltr-ref">{p.ref}</bdi> · {w.purpose(p.purpose)} · <When at={p.from} /> – <When at={p.to} />
                      </span>
                    </span>
                    <PassBadge state={p.state} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {d.visits && (
            <>
              <h3 className="pt-2 text-sm font-semibold text-text">{t('operations:flatServices.recentVisits')}</h3>
              <VisitList items={d.visits} />
            </>
          )}
        </Section>
      )}
      {d.vehicles && (
        <Section id="flat-services-vehicles" title={t('operations:flatServices.vehicles')}>
          <p className="text-sm text-text" data-testid="flat-services-slots">
            <span className="font-medium">{t('operations:flatServices.slots')}:</span>{' '}
            {d.slots.length ? (
              d.slots.map((s, i) => (
                <span key={s}>
                  {i ? ', ' : ''}
                  <bdi dir="ltr" className="ltr-ref">{s}</bdi>
                </span>
              ))
            ) : (
              <span className="text-muted">{t('operations:flatServices.noSlots')}</span>
            )}
          </p>
          {d.vehicles.length === 0 ? (
            <p className="text-sm text-muted">{t('operations:flatServices.noVehicles')}</p>
          ) : (
            <ul className="space-y-2" data-testid="flat-services-vehicle-list">
              {d.vehicles.map((v) => (
                <li key={v.id}>
                  <Link href={OPS.vehicle(v.id)} variant="plain" className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border/70 p-3 text-sm hover:bg-raised" data-testid="flat-services-vehicle" data-state={v.state}>
                    <span className="min-w-0">
                      <bdi dir="ltr" className="font-semibold text-text">{v.plate}</bdi>
                      <span className="block text-xs text-muted">
                        {t(`operations:vehicleKind.${v.kind}`)} · <bdi>{v.make}</bdi> · <bdi>{v.colour}</bdi> · <bdi>{v.ownerName}</bdi>
                        {v.slot ? (
                          <>
                            {' · '}
                            <bdi dir="ltr" className="ltr-ref">{v.slot}</bdi>
                          </>
                        ) : null}
                      </span>
                    </span>
                    <VehicleBadge state={v.state} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
      {d.moves && (
        <Section
          id="flat-services-moves"
          title={t('operations:flatServices.moves')}
          action={
            onMoveOut ? (
              <Button variant="secondary" size="sm" icon={DoorOpen} onPress={onMoveOut} data-testid="flat-services-move-out">
                {t('operations:move.title')}
              </Button>
            ) : undefined
          }
        >
          <MoveList items={d.moves} empty={t('operations:flatServices.noMoves')} showFlat={false} />
        </Section>
      )}
    </div>
  );
}

function Section({ id, title, note, action, children }: { id: string; title: string; note?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div data-testid={id}>
      <Panel title={title} description={note} actions={action}>
        <div className="space-y-3">{children}</div>
      </Panel>
    </div>
  );
}
