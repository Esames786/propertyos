import { C1_CATEGORIES, type ChargeCategoryKey, type Exemption, type SiteSummary } from '@repo/contracts';
import { Badge, Button, cn, ConfirmDialog, DateTime, Drawer, EmptyState, ErrorState, InlineAlert, Link, PageHeader, useAnnounce, useApiMutation, useApiQuery, useQueryParam, useSession, useT, useToast } from '@repo/ui';
import { BadgeCheck, Ban, Hourglass, Plus, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Label, TextArea, TextField } from 'react-aria-components';
import { SOCIETY } from '../../../nav.config';
import { FlatSelect, Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { ChoiceCards } from '../parts';

/**
 * BILL-009 exemptions, waivers and adjustments. A request names the flat, the charges, the
 * percentage and a reason; it applies only once someone other than the requester approves it. An
 * exempt flat is still assessed (at zero) and listed in every run, never silently left out.
 */
export default function ExemptionsPage() {
  const { t } = useT();
  const { can, persona } = useSession();
  const [focus] = useQueryParam('exemption');
  const [open, setOpen] = useState(false);
  const sites = useApiQuery<SiteSummary[]>({ method: 'GET', path: '/sites' });
  const q = useApiQuery<Exemption[]>({ method: 'GET', path: '/exemptions' });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data || !sites.data) return <Loading lines={6} />;
  const siteId = sites.data[0]?.id;
  return (
    <div className="@container space-y-6" data-testid="exemptions-page">
      <PageHeader
        title={t('nav:pages.exemptions')}
        description={t('billing:exemptions.intro')}
        actions={can('charges.manage') && siteId && (sites.data[0]?.flats ?? 0) > 0 ? <Button variant="primary" icon={Plus} onPress={() => setOpen(true)} data-testid="exemption-new">{t('billing:exemptions.new')}</Button> : undefined}
      />
      {q.data.length === 0 ? (
        <EmptyState title={t('billing:exemptions.emptyTitle')} body={t('billing:exemptions.emptyBody')} />
      ) : (
        <ul className="space-y-3" data-testid="exemptions-list">
          {q.data.map((e) => (
            <ExemptionCard key={e.id} exemption={e} siteId={siteId ?? ''} focused={focus === e.id} mine={e.requestedBy === persona?.principalId} canDecide={can('billing_run.approve')} />
          ))}
        </ul>
      )}
      {open && siteId && <RequestDrawer siteId={siteId} onClose={() => setOpen(false)} />}
    </div>
  );
}

function ExemptionCard({ exemption: e, siteId, focused, mine, canDecide }: { exemption: Exemption; siteId: string; focused: boolean; mine: boolean; canDecide: boolean }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const announce = useAnnounce();
  const decide = useApiMutation<Exemption>();
  const [confirm, setConfirm] = useState<null | 'approve' | 'reject'>(null);
  const act = async (d: 'approve' | 'reject') => {
    try {
      await decide.mutateAsync({ method: 'POST', path: `/exemptions/${e.id}/${d}` });
      const msg = t(d === 'approve' ? 'billing:exemptions.approvedToast' : 'billing:exemptions.rejectedToast', { flat: e.unitCode });
      toast.success(msg);
      announce(msg);
    } catch {
      /* shown below */
    }
  };
  const tone = e.state === 'approved' ? 'success' : e.state === 'rejected' ? 'neutral' : 'warning';
  const Icon = e.state === 'approved' ? BadgeCheck : e.state === 'rejected' ? XCircle : Hourglass;
  return (
    <li className={cn('rounded-card border bg-panel p-4 shadow-card', focused ? 'border-primary' : 'border-border/70')} data-testid="exemption-card" data-state={e.state} data-flat={e.unitCode}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-text">
            <Link href={SOCIETY.flat(siteId, e.unitId)}>{t('sites:flat.flatN', { code: e.unitCode })}</Link> · {t('billing:exemptions.what', { percent: e.percent, categories: e.categories === 'all' ? t('billing:exemptions.allCharges') : e.categories.map((c) => t(`billing:categories.${c}`)).join(', ') })}
          </p>
          <p className="text-sm text-muted"><bdi>{t('billing:quote', { text: e.reason })}</bdi> · {t('billing:exemptions.from', { period: fmt.period(e.from) })}</p>
          <p className="mt-1 text-xs text-muted">
            {t('billing:exemptions.requested', { name: e.requestedByName })} · <DateTime value={e.requestedAt} style="dateTime" />
            {e.decidedByName && <> · {t(e.state === 'approved' ? 'billing:exemptions.approvedBy' : 'billing:exemptions.rejectedBy', { name: e.decidedByName })}</>}
          </p>
        </div>
        <Badge tone={tone} icon={Icon}>{t(`billing:exemptions.state.${e.state}`)}</Badge>
      </div>
      {e.state === 'pending_approval' &&
        (canDecide && !mine ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" icon={BadgeCheck} onPress={() => setConfirm('approve')} isPending={decide.isPending} data-testid="exemption-approve">{t('billing:exemptions.approve')}</Button>
            <Button variant="secondary" size="sm" icon={Ban} onPress={() => setConfirm('reject')} data-testid="exemption-reject">{t('billing:exemptions.reject')}</Button>
          </div>
        ) : (
          <InlineAlert tone="info" className="mt-3" role="status">{mine ? t('billing:exemptions.waitingMine') : t('billing:exemptions.waiting')}</InlineAlert>
        ))}
      {decide.isError && <ProblemAlert error={decide.error} className="mt-3" />}
      <ConfirmDialog isOpen={confirm === 'approve'} onOpenChange={(o) => !o && setConfirm(null)} title={t('billing:exemptions.confirmTitle', { flat: e.unitCode })} effect={t('billing:exemptions.confirmEffect', { percent: e.percent, period: fmt.period(e.from) })} confirmLabel={t('billing:exemptions.approve')} onConfirm={() => act('approve')} />
      <ConfirmDialog isOpen={confirm === 'reject'} onOpenChange={(o) => !o && setConfirm(null)} title={t('billing:exemptions.rejectTitle', { flat: e.unitCode })} effect={t('billing:exemptions.rejectEffect')} confirmLabel={t('billing:exemptions.reject')} destructive onConfirm={() => act('reject')} />
    </li>
  );
}

function RequestDrawer({ siteId, onClose }: { siteId: string; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const save = useApiMutation<Exemption>();
  const [flatId, setFlatId] = useState<string | null>(null);
  const [scope, setScope] = useState<'all' | 'some'>('all');
  const [categories, setCategories] = useState<ChargeCategoryKey>('maintenance');
  const [percent, setPercent] = useState<'100' | '50'>('100');
  const [reason, setReason] = useState('');
  const submit = async () => {
    try {
      await save.mutateAsync({ method: 'POST', path: '/exemptions', body: { flatId, categories: scope === 'all' ? 'all' : [categories], percent: Number(percent), reason } });
      toast.success(t('billing:exemptions.requestedToast'));
      onClose();
    } catch {
      /* shown below */
    }
  };
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('billing:exemptions.new')}
      subtitle={t('billing:exemptions.newHint')}
      testId="exemption-drawer"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onPress={onClose}>{t('common:actions.cancel')}</Button>
          <Button variant="primary" onPress={() => void submit()} isPending={save.isPending} isDisabled={!flatId} data-testid="exemption-save">{t('billing:exemptions.send')}</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <FlatSelect siteId={siteId} value={flatId} onChange={setFlatId} label={t('billing:rules.flat')} testId="exemption-flat" />
        <ChoiceCards label={t('billing:exemptions.which')} value={scope} onChange={setScope} testId="exemption-scope" options={[{ id: 'all', title: t('billing:exemptions.allCharges') }, { id: 'some', title: t('billing:exemptions.oneCharge') }]} />
        {scope === 'some' && <ChoiceCards label={t('billing:rules.category')} value={categories} onChange={setCategories} testId="exemption-category" options={C1_CATEGORIES.map((c) => ({ id: c, title: t(`billing:categories.${c}`) }))} />}
        <ChoiceCards label={t('billing:exemptions.percent')} value={percent} onChange={setPercent} testId="exemption-percent" options={[{ id: '100', title: t('billing:exemptions.full') }, { id: '50', title: t('billing:exemptions.half') }]} />
        <TextField value={reason} onChange={setReason} isRequired className="flex flex-col gap-1.5">
          <Label className="text-sm font-medium text-text">{t('billing:exemptions.reason')}</Label>
          <TextArea rows={3} className="rounded-control border border-border-control bg-panel px-3 py-2 text-sm text-text outline-none focus:outline-2 focus:outline-focus" data-testid="exemption-reason" />
        </TextField>
        {save.isError && <ProblemAlert error={save.error} />}
      </div>
    </Drawer>
  );
}
