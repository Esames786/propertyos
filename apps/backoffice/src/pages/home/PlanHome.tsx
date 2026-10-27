import { grantActive, type ModuleKey } from '@repo/contracts';
import { formatCalendarDate, useLocale } from '@repo/i18n';
import { dynamicT, IconTile, Link, Panel, QuickActions, useSession, useT, type QuickAction } from '@repo/ui';
import { Building, CalendarClock, ClipboardList, Compass, HardHat, Package, Wrench } from 'lucide-react';
import { LINKS, NAV_ITEMS } from '../../nav.config';

/** The demo's frozen "today" (see ACCESS_TODAY in fixtures); figures and greetings use it. */
const TODAY = '2026-10-26';

/**
 * HOME-001 for a workspace whose plan has no developer modules (e.g. a maintenance-only society).
 * Built from the organisation's licence and the person's role: the areas they can open, the jobs
 * those areas offer, and what the plan includes. Nothing from a module outside the plan appears.
 */
export function PlanHome() {
  const { t } = useT();
  const tr = dynamicT(t);
  const { locale } = useLocale();
  const { persona, tenant, access, allows, can } = useSession();
  const firstName = persona?.displayName.split(/\s+/)[0] ?? '';

  const actions: QuickAction[] = [
    { id: 'new-request', label: t('workspace:home.actions.newRequest'), icon: Wrench, hue: 'emerald', href: '/backoffice/mnt/new-request', permission: 'operations.view', testId: 'plan-qa-new-request' },
    { id: 'requests', label: t('workspace:home.actions.requests'), icon: ClipboardList, hue: 'sky', href: '/backoffice/mnt/maintenance-list', permission: 'operations.view', testId: 'plan-qa-requests' },
    { id: 'technicians', label: t('workspace:home.actions.technicians'), icon: HardHat, hue: 'amber', href: '/backoffice/mnt/technician-board', permission: 'operations.view', testId: 'plan-qa-technicians' },
    { id: 'preventive', label: t('workspace:home.actions.preventive'), icon: CalendarClock, hue: 'violet', href: '/backoffice/mnt/preventive', permission: 'operations.view', testId: 'plan-qa-preventive' },
    { id: 'assets', label: t('workspace:home.actions.assets'), icon: Building, hue: 'teal', href: '/backoffice/mnt/assets', permission: 'operations.view', testId: 'plan-qa-assets' },
    { id: 'plan', label: t('nav:pages.plan'), icon: Package, hue: 'slate', href: LINKS.plan, permission: 'admin.view', testId: 'plan-qa-plan' },
    { id: 'help', label: t('nav:items.help'), icon: Compass, hue: 'gold', href: LINKS.tourLibrary, testId: 'plan-qa-help' },
  ];
  const areas = NAV_ITEMS.filter((i) => !['home', 'lab', 'help'].includes(i.id) && allows(i));
  const licensed: ModuleKey[] = [...new Set((access?.grants ?? []).filter((g) => grantActive(g, TODAY)).map((g) => g.module))];

  return (
    <div className="space-y-10" data-testid="plan-home">
      <header className="space-y-1.5">
        <p className="text-xs font-semibold tracking-[0.08em] text-accent uppercase">
          <bdi>{tenant.name}</bdi>
        </p>
        <h1 id="page-title" className="text-[1.75rem] leading-tight font-bold text-text outline-none sm:text-[2.25rem]">
          {t('workspace:home.greeting', { name: firstName })}
        </h1>
        <p className="text-muted">{t('workspace:home.subtitle', { date: formatCalendarDate(TODAY, locale) })}</p>
      </header>

      <QuickActions title={t('workspace:home.actionsTitle')} actions={actions} tourId="dashboard-quick-actions" testId="dashboard-quick-actions" />

      <div className="grid gap-6 lg:grid-cols-12 [&>*]:min-w-0">
        <Panel title={t('workspace:home.areasTitle')} description={t('workspace:home.areasHint')} className="lg:col-span-7">
          {areas.length ? (
            <ul className="grid gap-3 @xl:grid-cols-2" data-testid="plan-home-areas">
              {areas.map((a) => (
                <li key={a.id}>
                  <Link
                    variant="plain"
                    href={a.href}
                    className="flex items-center gap-3 rounded-tile border border-border/70 p-3 outline-none data-focus-visible:outline-2 data-focus-visible:outline-focus data-hovered:bg-sunken"
                    data-testid={`plan-area-${a.id}`}
                  >
                    <IconTile icon={a.icon} hue="emerald" size="md" />
                    <span className="font-semibold text-text">{tr(a.labelKey)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">{t('workspace:home.noAreas')}</p>
          )}
        </Panel>
        <Panel title={t('workspace:home.planTitle')} description={t('workspace:home.planHint')} className="lg:col-span-5">
          <ul className="flex flex-wrap gap-2" data-testid="plan-home-modules">
            {licensed.map((m) => (
              <li key={m} className="rounded-pill bg-primary-soft px-3 py-1 text-sm font-medium text-primary">
                {tr(`platform:modules.${m}.name`)}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">{can('admin.view') ? t('workspace:home.planAdmin') : t('workspace:home.planAsk')}</p>
          {can('admin.view') && (
            <Link href={LINKS.plan} className="mt-2 inline-block text-sm font-medium" data-testid="plan-home-open-plan">
              {t('workspace:plan.open')}
            </Link>
          )}
        </Panel>
      </div>
    </div>
  );
}
