import { Banknote, CalendarPlus, GraduationCap, Lock, Plus, Receipt, UserPlus } from 'lucide-react';
import { useRef } from 'react';
import { Button as AriaButton, Menu, MenuItem, MenuSection, MenuTrigger, Popover, Header, Separator, Text } from 'react-aria-components';
import type { Permission } from '@repo/contracts';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { useQueryParam } from '../navigation/RouterAdapter';
import { emitTourEvent } from '../onboarding/tourGuard';
import { PRACTICE_LEAD_DRAWER } from '../onboarding/PracticeLeadDrawer';
import { popoverClass } from '../overlays/Menu';
import { useSession } from '../permissions/SessionProvider';

const PLANNED: Array<{ id: string; key: 'newLead' | 'scheduleVisit' | 'holdUnit' | 'receivePayment' | 'newExpense'; icon: typeof Plus; permission: Permission }> = [
  { id: 'new-lead', key: 'newLead', icon: UserPlus, permission: 'lead.create' },
  { id: 'schedule-visit', key: 'scheduleVisit', icon: CalendarPlus, permission: 'visit.schedule' },
  { id: 'hold-unit', key: 'holdUnit', icon: Lock, permission: 'unit.hold' },
  { id: 'receive-payment', key: 'receivePayment', icon: Banknote, permission: 'payment.receive' },
  { id: 'new-expense', key: 'newExpense', icon: Receipt, permission: 'expense.create' },
];

const itemClass =
  'flex cursor-default items-start gap-3 rounded-control px-3 py-2 text-sm text-text outline-none data-focused:bg-primary-soft data-disabled:cursor-not-allowed data-disabled:text-muted pointer-coarse:py-3';

/**
 * Quick create, limited to actions the persona may perform. Actions whose screens arrive in
 * Stage 2 are listed but disabled, each with a visible reason; the practice action works now.
 */
export function QuickCreateMenu({ compact = false }: { compact?: boolean }) {
  const { t } = useT();
  const { can } = useSession();
  const [, setDrawer] = useQueryParam('drawer');
  const chose = useRef(false);
  if (!can('quickcreate.use')) return null;
  const planned = PLANNED.filter((p) => can(p.permission));

  return (
    <MenuTrigger
      onOpenChange={(open) => {
        if (open) {
          chose.current = false;
          emitTourEvent('quickCreate.opened');
        } else if (!chose.current) emitTourEvent('quickCreate.closed');
      }}
    >
      <AriaButton
        data-tour-id="quick-create"
        aria-label={t('common:quickCreate.label')}
        className={cn(
          'on-primary inline-flex min-h-10 items-center gap-2 rounded-control bg-primary px-3 text-sm font-medium text-on-primary data-hovered:bg-primary-hover pointer-coarse:min-h-11',
          compact && 'size-10 justify-center px-0 pointer-coarse:size-11',
        )}
      >
        <Plus aria-hidden className="size-5" />
        {!compact && <span>{t('common:quickCreate.label')}</span>}
      </AriaButton>
      <Popover placement="bottom end" offset={6} className={cn(popoverClass, 'w-72')}>
        <Menu
          aria-label={t('common:quickCreate.label')}
          onAction={(key) => {
            if (key === 'practice-lead') {
              chose.current = true;
              setDrawer(PRACTICE_LEAD_DRAWER, { replace: false });
            }
          }}
          className="outline-none"
        >
          {can('lead.create') && (
            <MenuSection>
              <Header className="px-3 pt-2 pb-1 text-xs font-semibold text-muted">{t('common:quickCreate.practiceGroup')}</Header>
              <MenuItem id="practice-lead" textValue={t('common:quickCreate.practiceLead')} className={itemClass} data-testid="quick-create-practice-lead">
                <GraduationCap aria-hidden className="mt-0.5 size-4 shrink-0 text-demo" />
                <span className="flex flex-col">
                  <Text slot="label">{t('common:quickCreate.practiceLead')}</Text>
                  <Text slot="description" className="text-xs text-muted">
                    {t('common:quickCreate.practiceLeadDescription')}
                  </Text>
                </span>
              </MenuItem>
            </MenuSection>
          )}
          {planned.length > 0 && (
            <MenuSection>
              <Separator className="my-1 border-t border-border" />
              <Header className="px-3 pt-2 pb-1 text-xs font-semibold text-muted">{t('common:quickCreate.plannedGroup')}</Header>
              {planned.map((p) => (
                <MenuItem key={p.id} id={p.id} isDisabled textValue={t(`common:quickCreate.${p.key}`)} className={itemClass}>
                  <p.icon aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span className="flex flex-col">
                    <Text slot="label">{t(`common:quickCreate.${p.key}`)}</Text>
                    <Text slot="description" className="text-xs">
                      {t('common:quickCreate.availableStage2')}
                    </Text>
                  </span>
                </MenuItem>
              ))}
            </MenuSection>
          )}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
