import type { UnitDetail } from '@repo/contracts';
import { AmountStrip, Badge, Button, Drawer, ErrorState, KeyValueList, Photo, SkeletonBlock, StatusLabel, useAnnounce, useApiMutation, useApiQuery, useSession, useT, useToast } from '@repo/ui';
import { Clock3, Lock, LockOpen, Wallet } from 'lucide-react';
import { useCrmFormat } from './format';

/**
 * Unit quick view (INV-002) opened from a lead (`?unit=…`): photo, location, size, price and the
 * illustrative payment plan, with a demo hold for this lead (48 hours, session only).
 */
export function UnitQuickView({ unitId, lead, onClose }: { unitId: string | null; lead: { id: string; ref: string; name: string }; onClose: () => void }) {
  const { t } = useT();
  const { can } = useSession();
  const f = useCrmFormat();
  const toast = useToast();
  const announce = useAnnounce();
  const unit = useApiQuery<UnitDetail>(unitId ? { method: 'GET', path: `/units/${unitId}` } : null);
  const act = useApiMutation<{ ok: boolean; until?: string }>();
  const u = unit.data;
  const heldForThisLead = !!u?.hold && u.hold.leadRef === lead.ref;

  const hold = async () => {
    if (!u) return;
    const res = await act.mutateAsync({ method: 'POST', path: `/units/${u.id}/hold`, body: { leadId: lead.id } });
    const msg = t('crm:unit.holdDone', { unit: u.ref, name: lead.name, until: f.when(res.until!) });
    toast.success(msg);
    announce(msg);
  };
  const release = async () => {
    if (!u) return;
    await act.mutateAsync({ method: 'POST', path: `/units/${u.id}/release` });
    const msg = t('crm:unit.released', { unit: u.ref });
    toast.success(msg);
    announce(msg);
  };

  const location = u ? (u.towerName ? t('crm:unit.tower', { tower: u.towerName, floor: u.floor ?? '' }) : t('crm:unit.block', { block: u.block ?? '' })) : '';

  return (
    <Drawer
      isOpen={!!unitId}
      onOpenChange={(open) => !open && onClose()}
      title={u ? t('crm:unit.title', { ref: u.ref }) : t('crm:lead.quickView')}
      subtitle={u ? t('crm:unit.subtitle', { project: u.projectName, location }) : undefined}
      testId="unit-quick-view"
      footer={
        u &&
        can('unit.hold') &&
        (heldForThisLead ? (
          <Button variant="secondary" icon={LockOpen} onPress={release} isPending={act.isPending} data-testid="unit-release">
            {t('crm:unit.release')}
          </Button>
        ) : (
          <Button variant="primary" icon={Lock} onPress={hold} isPending={act.isPending} isDisabled={u.status !== 'available'} data-testid="unit-hold">
            {t('crm:unit.hold', { name: lead.name })}
          </Button>
        ))
      }
    >
      {unit.isError ? (
        <ErrorState error={unit.error} onRetry={() => unit.refetch()} />
      ) : !u ? (
        <SkeletonBlock lines={6} />
      ) : (
        <div className="space-y-5">
          <Photo imageKey={u.imageKey} sizes="(min-width: 768px) 30rem, 100vw" className="aspect-[16/9] w-full rounded-card" />
          <div className="flex flex-wrap items-center gap-2">
            <StatusLabel kind="unit" status={u.status} />
            {u.hold && (
              <Badge tone="warning" icon={Clock3}>
                {t('crm:unit.heldFor', { lead: u.hold.leadRef, until: f.when(u.hold.until) })}
              </Badge>
            )}
          </div>
          <KeyValueList
            className="@container"
            items={[
              { label: t('crm:unit.type'), value: t(`crm:types.${u.type}`) },
              { label: t('crm:unit.area'), value: <bdi dir="ltr" className="ltr-ref">{f.area(u.areaSqft)}</bdi> },
              { label: t('crm:unit.price'), value: <bdi dir="ltr" className="ltr-ref font-semibold">{f.moneyExact(u.price)}</bdi> },
            ]}
          />
          <section aria-labelledby="unit-plan" className="space-y-2">
            <h3 id="unit-plan" className="text-sm font-semibold text-text">
              {t('crm:unit.plan')}
            </h3>
            <AmountStrip
              tone="primary"
              icon={Wallet}
              label={t('crm:unit.downPayment', { percent: u.plan.downPaymentPercent })}
              amount={<bdi dir="ltr" className="ltr-ref">{f.moneyExact(u.plan.downPayment)}</bdi>}
            />
            <AmountStrip
              tone="neutral"
              icon={Clock3}
              label={t('crm:unit.installments', { count: u.plan.installments })}
              amount={<bdi dir="ltr" className="ltr-ref">{f.moneyExact(u.plan.perInstallment)}</bdi>}
            />
          </section>
          <p className="rounded-control bg-sunken p-3 text-sm text-muted">{t('crm:unit.holdNote')}</p>
        </div>
      )}
    </Drawer>
  );
}
