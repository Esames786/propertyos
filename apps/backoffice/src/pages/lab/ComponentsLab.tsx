import { LEAD_STATUSES, UNIT_STATUSES, type EvidenceStatus } from '@repo/contracts';
import { formatIban, formatPkPhone } from '@repo/i18n';
import {
  Button,
  ConfirmDialog,
  DateTime,
  DemoBadge,
  Drawer,
  IconButton,
  KeyValueList,
  MenuButton,
  Money,
  PageHeader,
  Panel,
  Reference,
  StatusLabel,
  Tooltip,
  UrlTabs,
  useT,
  useToast,
} from '@repo/ui';
import { Archive, CalendarPlus, Info, MoreHorizontal, Phone, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';

const EVIDENCE: EvidenceStatus[] = ['none', 'submitted', 'under_review', 'needs_information', 'rejected', 'verified'];

export default function ComponentsLab() {
  const { t } = useT();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const save = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success(t('lab:components.toastSuccessText'), { reference: 'LD-2026-00001' });
    }, 1200);
  };

  return (
    <>
      <PageHeader title={t('nav:pages.labComponents')} breadcrumbs={[{ label: t('nav:pages.lab'), href: '/backoffice/lab' }, { label: t('nav:pages.labComponents') }]} />
      <div className="space-y-6">
        <Panel title={t('lab:components.buttons')}>
          <div className="flex flex-wrap items-start gap-3">
            <Button variant="primary">{t('lab:components.primary')}</Button>
            <Button variant="secondary">{t('lab:components.secondary')}</Button>
            <Button variant="quiet">{t('lab:components.quiet')}</Button>
            <Button variant="danger" icon={Trash2} onPress={() => setConfirmOpen(true)}>
              {t('lab:components.danger')}
            </Button>
            <Button variant="primary" icon={Save} isPending={saving} onPress={save} data-testid="save-with-loading">
              {t('lab:components.loading')}
            </Button>
            <Button variant="secondary" isDisabled disabledReason={t('lab:components.disabledReason')}>
              {t('lab:components.disabled')}
            </Button>
          </div>
        </Panel>

        <Panel title={t('lab:components.statuses')}>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {UNIT_STATUSES.map((s) => (
                <StatusLabel key={s} kind="unit" status={s} />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {LEAD_STATUSES.map((s) => (
                <StatusLabel key={s} kind="lead" status={s} />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {EVIDENCE.map((s) => (
                <StatusLabel key={s} kind="evidence" status={s} />
              ))}
              <DemoBadge />
              <DemoBadge training />
            </div>
          </div>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title={t('lab:components.references')} description={t('lab:components.referencesIntro')}>
            <KeyValueList
              items={[
                { label: t('common:entity.invoice'), value: <Reference value="INV-2026-001284" /> },
                { label: t('common:entity.unit'), value: <Reference value="LH-A-1204" /> },
                { label: t('forms:fields.phone'), value: <Reference value={formatPkPhone('+923990012345')} /> },
                { label: t('forms:fields.cnic'), value: <Reference value="91234-1234567-1" /> },
                { label: 'IBAN', value: <Reference value={formatIban('PK52DEMO0000001234567890')} mono /> },
                { label: t('forms:fields.email'), value: <Reference value="farah.javed@example.com" /> },
                { label: t('forms:fields.fullName'), value: <bdi>{'عائشہ ملک' /* fictional name entered in Urdu script */}</bdi> },
              ]}
            />
          </Panel>
          <Panel title={t('lab:components.money')}>
            <KeyValueList
              items={[
                { label: t('forms:fields.budget'), value: <Money value={{ amount: '12500000.50', currency: 'PKR' }} /> },
                { label: 'PKR', value: <Money value={{ amount: '1250000', currency: 'PKR' }} display="code" /> },
                { label: t('lab:customer.dueOn', { date: '' }).trim(), value: <DateTime value="2026-11-05" style="calendar" /> },
                { label: t('lab:workspace.metrics.nextFollowUp'), value: <DateTime value="2026-10-27T05:30:00Z" style="dateTime" /> },
                { label: t('common:time.today'), value: <DateTime value={new Date(Date.now() - 2 * 3600_000).toISOString()} relative /> },
              ]}
            />
          </Panel>
        </div>

        <Panel title={t('lab:components.overlays')}>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onPress={() => setConfirmOpen(true)} data-testid="open-confirm">
              {t('lab:components.openDialog')}
            </Button>
            <Button variant="secondary" onPress={() => setDrawerOpen(true)} data-testid="open-drawer">
              {t('lab:components.openDrawer')}
            </Button>
            <Button variant="secondary" onPress={() => toast.success(t('lab:components.toastSuccessText'), { reference: 'LD-2026-00001' })} data-testid="show-toast-success">
              {t('lab:components.toastSuccess')}
            </Button>
            <Button variant="secondary" onPress={() => toast.error(t('lab:components.toastErrorText'), { reference: 'demo-00042' })} data-testid="show-toast-error">
              {t('lab:components.toastError')}
            </Button>
          </div>
        </Panel>

        <Panel title={t('lab:components.menus')}>
          <div className="flex flex-wrap items-center gap-3">
            <MenuButton
              label={t('lab:components.menuButton')}
              trigger={
                <AriaButton className="inline-flex min-h-10 items-center gap-2 rounded-control border border-border-control px-3 text-sm data-hovered:bg-sunken">
                  <MoreHorizontal aria-hidden className="size-4" />
                  {t('lab:components.menuButton')}
                </AriaButton>
              }
              onAction={(id) => toast.info(`${id} (demo)`)}
              groups={[
                {
                  id: 'main',
                  items: [
                    { id: 'call', label: t('lab:components.menuCall'), icon: Phone },
                    { id: 'visit', label: t('lab:components.menuVisit'), icon: CalendarPlus },
                  ],
                },
                { id: 'danger', items: [{ id: 'archive', label: t('lab:components.menuArchive'), icon: Archive, tone: 'danger' }] },
              ]}
            />
            <Tooltip content={t('lab:components.tooltipText')}>
              <IconButton label={t('lab:components.tooltipTarget')} icon={Info} />
            </Tooltip>
            <span className="text-sm text-muted">{t('lab:components.tooltipTarget')}</span>
          </div>
        </Panel>

        <Panel title={t('lab:components.tabs')}>
          <UrlTabs
            label={t('lab:components.tabs')}
            param="demoTab"
            items={[
              { id: 'overview', label: t('lab:workspace.tabs.overview') },
              { id: 'payments', label: t('lab:workspace.tabs.payments') },
              { id: 'documents', label: t('lab:workspace.tabs.documents') },
            ]}
          >
            {(id) => <p className="text-sm text-muted">{t('lab:workspace.tabPlaceholder', { tab: t(`lab:workspace.tabs.${id as 'overview'}`) })}</p>}
          </UrlTabs>
        </Panel>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('lab:components.dialogTitle')}
        effect={t('lab:components.dialogBody')}
        confirmLabel={t('lab:components.dialogConfirm')}
        destructive
        reasonLabel={t('lab:components.dialogReason')}
        onConfirm={async () => {
          await new Promise((r) => setTimeout(r, 600));
          toast.success(t('lab:components.dialogDone'));
        }}
      />
      <Drawer
        isOpen={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={t('lab:components.drawerTitle')}
        subtitle={<StatusLabel kind="unit" status="held" />}
        testId="demo-drawer"
        footer={
          <>
            <Button variant="secondary" onPress={() => setDrawerOpen(false)}>
              {t('common:actions.close')}
            </Button>
            <Button variant="primary" onPress={() => setDrawerOpen(false)}>
              {t('common:actions.save')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text">{t('lab:components.drawerBody')}</p>
        <div className="mt-4">
          <KeyValueList
            items={[
              { label: t('common:entity.unit'), value: <Reference value="LH-A-1204" /> },
              { label: t('forms:fields.budget'), value: <Money value={{ amount: '30525000.00', currency: 'PKR' }} /> },
            ]}
          />
        </div>
      </Drawer>
    </>
  );
}
