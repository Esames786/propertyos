import { Button, PageHeader, Panel, useQueryParam, useSession, useT } from '@repo/ui';
import { PRACTICE_LEAD_DRAWER } from '@repo/ui/onboarding';
import type { Permission } from '@repo/contracts';
import { Banknote, CalendarPlus, GraduationCap, Lock, Receipt, UserPlus, type LucideIcon } from 'lucide-react';

const PLANNED: Array<{ key: 'newLead' | 'scheduleVisit' | 'holdUnit' | 'receivePayment' | 'newExpense'; icon: LucideIcon; permission: Permission }> = [
  { key: 'newLead', icon: UserPlus, permission: 'lead.create' },
  { key: 'scheduleVisit', icon: CalendarPlus, permission: 'visit.schedule' },
  { key: 'holdUnit', icon: Lock, permission: 'unit.hold' },
  { key: 'receivePayment', icon: Banknote, permission: 'payment.receive' },
  { key: 'newExpense', icon: Receipt, permission: 'expense.create' },
];

/** GLOBAL-003 as a page: the same permitted actions as the header menu, with reasons for unavailable ones. */
export default function QuickCreatePage() {
  const { t } = useT();
  const { can } = useSession();
  const [, setDrawer] = useQueryParam('drawer');
  return (
    <>
      <PageHeader title={t('common:quickCreate.label')} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {can('lead.create') && (
          <Panel>
            <div className="flex h-full flex-col gap-3">
              <GraduationCap aria-hidden className="size-6 text-demo" />
              <h2 className="font-semibold text-text">{t('common:quickCreate.practiceLead')}</h2>
              <p className="flex-1 text-sm text-muted">{t('common:quickCreate.practiceLeadDescription')}</p>
              <Button variant="primary" onPress={() => setDrawer(PRACTICE_LEAD_DRAWER, { replace: false })}>
                {t('common:actions.open')}
              </Button>
            </div>
          </Panel>
        )}
        {PLANNED.filter((p) => can(p.permission)).map((p) => (
          <Panel key={p.key}>
            <div className="flex h-full flex-col gap-3">
              <p.icon aria-hidden className="size-6 text-muted" />
              <h2 className="font-semibold text-text">{t(`common:quickCreate.${p.key}`)}</h2>
              <div className="flex-1" />
              <Button variant="secondary" isDisabled disabledReason={t('common:quickCreate.availableStage2')}>
                {t('common:actions.open')}
              </Button>
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
