import { Banknote, CalendarPlus, GraduationCap, Lock, Plus, Receipt, UserPlus, Wrench } from 'lucide-react';
import { useRef } from 'react';
import { Button as AriaButton, Menu, MenuItem, MenuSection, MenuTrigger, Popover, Header, Separator, Text } from 'react-aria-components';
import type { Permission } from '@repo/contracts';
import { NEW_LEAD_DRAWER, SCHEDULE_VISIT_DRAWER } from '../crm/drawerIds';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { useQueryParam } from '../navigation/RouterAdapter';
import { emitTourEvent } from '../onboarding/tourGuard';
import { PRACTICE_LEAD_DRAWER } from '../onboarding/PracticeLeadDrawer';
import { popoverClass } from '../overlays/Menu';
import { useSession } from '../permissions/SessionProvider';

/** Quick create entries (shared with the Platform HQ preview of a tenant role). */
export const LIVE: Array<{ id: string; key: 'newLead' | 'scheduleVisit'; icon: typeof Plus; permission: Permission; drawer: string }> = [
  { id: 'new-lead', key: 'newLead', icon: UserPlus, permission: 'lead.create', drawer: NEW_LEAD_DRAWER },
  { id: 'schedule-visit', key: 'scheduleVisit', icon: CalendarPlus, permission: 'visit.schedule', drawer: SCHEDULE_VISIT_DRAWER },
];

export const PLANNED: Array<{ id: string; key: 'holdUnit' | 'receivePayment' | 'newExpense' | 'newServiceRequest'; icon: typeof Plus; permission: Permission }> = [
  { id: 'hold-unit', key: 'holdUnit', icon: Lock, permission: 'unit.hold' },
  { id: 'receive-payment', key: 'receivePayment', icon: Banknote, permission: 'payment.receive' },
  { id: 'new-expense', key: 'newExpense', icon: Receipt, permission: 'expense.create' },
  { id: 'new-service-request', key: 'newServiceRequest', icon: Wrench, permission: 'operations.view' },
];

/** Whether Quick create has anything to offer this person (plan and role). */
export const quickCreateAvailable = (can: (p: Permission) => boolean) => can('quickcreate.use') && [...LIVE, ...PLANNED].some((p) => can(p.permission));

const itemClass =
  'flex cursor-default items-start gap-3 rounded-control px-3 py-2 text-sm text-text outline-none data-focused:bg-primary-soft data-disabled:cursor-not-allowed data-disabled:text-muted pointer-coarse:py-3';

const TRIGGER = {
  pill: 'on-primary inline-flex min-h-10 items-center gap-2 rounded-pill bg-primary ps-3 pe-4 text-sm font-medium text-on-primary shadow-[0_8px_18px_-10px_rgb(30_77_66/0.7)] pointer-coarse:min-h-11',
  compact: 'on-primary grid size-10 place-items-center rounded-pill bg-primary text-on-primary pointer-coarse:size-11',
  fab: 'on-primary grid size-14 place-items-center rounded-pill bg-primary text-on-primary shadow-fab ring-4 ring-bg animate-pop-in',
} as const;

/**
 * Quick create, limited to actions the persona may perform. New lead and Schedule visit work in the
 * demo (they write to the demo session); practice mode keeps its isolated version; actions whose
 * screens arrive later are listed but disabled with a visible reason. The phone variant is the
 * raised centre button of the bottom bar.
 */
export function QuickCreateMenu({ variant = 'pill' }: { variant?: keyof typeof TRIGGER }) {
  const { t } = useT();
  const { can } = useSession();
  const [, setDrawer] = useQueryParam('drawer');
  const chose = useRef(false);
  const live = LIVE.filter((p) => can(p.permission));
  const planned = PLANNED.filter((p) => can(p.permission));
  // Nothing this workspace's plan and this role allow: no button that opens an empty menu.
  if (!quickCreateAvailable(can)) return null;

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
        data-tour-id={variant === 'fab' ? 'quick-create-fab' : 'quick-create'}
        data-testid={variant === 'fab' ? 'quick-create-fab' : undefined}
        aria-label={t('common:quickCreate.label')}
        className={cn(
          TRIGGER[variant],
          'outline-none transition-[background-color,translate,scale] duration-[var(--motion-fast)] data-hovered:bg-primary-hover data-pressed:scale-95',
          'data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
        )}
      >
        <Plus aria-hidden className={variant === 'fab' ? 'size-7' : 'size-5'} strokeWidth={variant === 'fab' ? 2.4 : 2} />
        {variant === 'pill' && <span>{t('common:quickCreate.label')}</span>}
      </AriaButton>
      <Popover placement={variant === 'fab' ? 'top' : 'bottom end'} offset={variant === 'fab' ? 12 : 6} className={cn(popoverClass, 'w-72')}>
        <Menu
          aria-label={t('common:quickCreate.label')}
          onAction={(key) => {
            const target = key === 'practice-lead' ? PRACTICE_LEAD_DRAWER : LIVE.find((l) => l.id === key)?.drawer;
            if (target) {
              chose.current = true;
              setDrawer(target, { replace: false });
            }
          }}
          className="outline-none"
        >
          {live.length > 0 && (
            <MenuSection>
              <Header className="px-3 pt-2 pb-1 text-xs font-semibold text-muted">{t('common:quickCreate.demoGroup')}</Header>
              {live.map((p) => (
                <MenuItem key={p.id} id={p.id} textValue={t(`common:quickCreate.${p.key}`)} className={itemClass} data-testid={`quick-create-${p.id}`}>
                  <p.icon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="flex flex-col">
                    <Text slot="label">{t(`common:quickCreate.${p.key}`)}</Text>
                    <Text slot="description" className="text-xs text-muted">
                      {t(`common:quickCreate.${p.key}Description`)}
                    </Text>
                  </span>
                </MenuItem>
              ))}
            </MenuSection>
          )}
          {can('lead.create') && (
            <MenuSection>
              <Separator className="my-1 border-t border-border" />
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
