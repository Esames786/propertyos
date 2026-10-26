import type { Invoice, Unit } from '@repo/contracts';
import { Button, DateTime, InlineAlert, KeyValueList, Link, Money, PageHeader, Panel, Reference, StatusLabel, Badge, useT } from '@repo/ui';
import { Building, CreditCard } from 'lucide-react';

export interface CustomerLabProps {
  unit: Unit;
  invoice: Invoice;
}

/**
 * Customer-personality preview (Stage 1). The same components as the backoffice with 16 px+ body,
 * calmer layout and bottom navigation on phones. Payment status says "Awaiting verification":
 * uploaded proof is never shown as paid (blueprint 05).
 */
export default function CustomerLab({ unit, invoice }: CustomerLabProps) {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t('lab:customer.title')} description={t('lab:customer.intro')} badge={<Badge tone="demo">{t('common:badge.demo')}</Badge>} />
      <InlineAlert tone="info" className="mb-6">
        {t('lab:customer.stageNote')}
      </InlineAlert>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={t('lab:customer.propertyCard')} actions={<StatusLabel kind="unit" status={unit.status} />}>
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-card bg-primary-soft text-primary">
              <Building aria-hidden className="size-6" />
            </span>
            <KeyValueList
              items={[
                { label: t('common:entity.unit'), value: <Reference value={unit.ref} /> },
                { label: t('forms:fields.project'), value: 'Larkspur Heights' },
                { label: t('lab:customer.unitType'), value: t(`common:unitType.${unit.type}`) },
              ]}
            />
          </div>
        </Panel>
        <Panel title={t('lab:customer.nextPayment')} actions={<StatusLabel kind="evidence" status={invoice.evidence} />}>
          <div className="space-y-4">
            <p className="text-3xl font-semibold text-text">
              <Money value={invoice.total} />
            </p>
            <KeyValueList
              items={[
                { label: t('lab:customer.reference'), value: <Reference value={invoice.ref} /> },
                { label: t('lab:customer.dueOn', { date: '' }).trim(), value: <DateTime value={invoice.dueDate} style="calendar" /> },
                { label: t('lab:workspace.metrics.status'), value: <StatusLabel kind="settlement" status={invoice.settlement} /> },
              ]}
            />
            <Button variant="primary" icon={CreditCard} isDisabled disabledReason={t('lab:customer.payDemo')}>
              {t('nav:customer.payments')}
            </Button>
          </div>
        </Panel>
      </div>
      <p className="mt-6 text-sm">
        <Link href="/customer/portal/accessibility-preferences">{t('nav:pages.accessibility')}</Link>
      </p>
    </>
  );
}
