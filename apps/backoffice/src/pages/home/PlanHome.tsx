import { grantActive, type ModuleKey } from '@repo/contracts';
import { formatCalendarDate, useLocale } from '@repo/i18n';
import { Badge, dynamicT, IconTile, Link, Panel, QuickActions, useSession, useShell, useT, type QuickAction } from '@repo/ui';
import { CalendarClock, ClipboardList, Compass, HardHat, KeyRound, Package, ReceiptText, Settings2, Wrench } from 'lucide-react';
import { LINKS } from '../../nav.config';

/** The demo's frozen "today" (see ACCESS_TODAY in fixtures); figures and greetings use it. */
const TODAY = '2026-10-26';

/**
 * Maintenance work the register plans for later gates (MNT-002, MNT-004, MNT-006, MNT-010). Shown
 * as planned, with its gate, never as working buttons: nothing here can be opened yet.
 */
const PLANNED_MAINTENANCE = [
  { id: 'requests', screen: 'MNT-002', gate: 'D', icon: ClipboardList },
  { id: 'newRequest', screen: 'MNT-004', gate: 'D', icon: Wrench },
  { id: 'technicians', screen: 'MNT-006', gate: 'D', icon: HardHat },
  { id: 'preventive', screen: 'MNT-010', gate: 'G', icon: CalendarClock },
] as const;

/**
 * HOME-001 for a workspace whose plan has no developer modules (a maintenance-only society, or a
 * suspended organisation). Built from the organisation's licence and the person's role: quick
 * actions open only screens that work today, the areas list is what the person may open, and the
 * maintenance work still to come is listed as planned, honestly. Nothing from a module outside the
 * plan appears, and only administrators see which modules the plan includes.
 */
export function PlanHome() {
  const { t } = useT();
  const tr = dynamicT(t);
  const { locale } = useLocale();
  const { persona, tenant, access, allows, can } = useSession();
  const firstName = persona?.displayName.split(/\s+/)[0] ?? '';
  const suspended = access?.tenant.status === 'suspended';

  // Every action here opens a working screen that stays readable while the workspace is suspended.
  const actions = (
    [
      { id: 'invoices', label: t('nav:pages.invoices'), icon: ReceiptText, hue: 'sky', href: LINKS.invoices, permission: 'invoice.view', testId: 'plan-qa-invoices' },
      { id: 'my-access', label: t('nav:pages.myAccess'), icon: KeyRound, hue: 'emerald', href: LINKS.myAccess, testId: 'plan-qa-my-access' },
      { id: 'plan', label: t('nav:pages.plan'), icon: Package, hue: 'slate', href: LINKS.plan, permission: 'admin.view', testId: 'plan-qa-plan' },
      { id: 'help', label: t('nav:items.help'), icon: Compass, hue: 'gold', href: LINKS.tourLibrary, testId: 'plan-qa-help' },
      { id: 'preferences', label: t('nav:pages.preferences'), icon: Settings2, hue: 'violet', href: LINKS.preferences, testId: 'plan-qa-preferences' },
    ] as QuickAction[]
  ).map((a): QuickAction => ({ ...a, suspension: 'history_read' }));
  const { navItems } = useShell();
  const areas = navItems.filter((i) => !['home', 'lab', 'help'].includes(i.id) && allows(i));
  const licensed: ModuleKey[] = [...new Set((access?.grants ?? []).filter((g) => grantActive(g, TODAY)).map((g) => g.module))];
  const maintains = licensed.includes('maintenance') && !suspended;
  const admin = can('admin.view') || allows({ permission: 'admin.view', suspension: 'history_read' });

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
        <Panel title={admin ? t('workspace:home.planTitle') : t('nav:pages.myAccess')} description={admin ? t('workspace:home.planHint') : t('workspace:home.accessHint')} className="lg:col-span-5">
          {admin ? (
            <>
              <ul className="flex flex-wrap gap-2" data-testid="plan-home-modules">
                {licensed.map((m) => (
                  <li key={m} className="rounded-pill bg-primary-soft px-3 py-1 text-sm font-medium text-primary">
                    {tr(`platform:modules.${m}.name`)}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-muted">{t('workspace:home.planAdmin')}</p>
              <Link href={LINKS.plan} className="mt-2 inline-block text-sm font-medium" data-testid="plan-home-open-plan">
                {t('workspace:plan.open')}
              </Link>
            </>
          ) : (
            <Link href={LINKS.myAccess} className="inline-block text-sm font-medium" data-testid="plan-home-open-access">
              {t('workspace:home.openAccess')}
            </Link>
          )}
        </Panel>
      </div>

      {maintains && (
        <Panel title={t('workspace:home.plannedTitle')} description={t('workspace:home.plannedHint')}>
          <ul className="grid gap-3 @2xl:grid-cols-2" data-testid="plan-home-planned">
            {PLANNED_MAINTENANCE.map((p) => (
              <li key={p.id} className="flex items-start gap-3 rounded-tile border border-dashed border-border p-3" data-testid={`plan-planned-${p.id}`}>
                <IconTile icon={p.icon} hue="slate" size="md" />
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold text-text">{t(`workspace:home.actions.${p.id}`)}</p>
                  <Badge tone="neutral">{t('workspace:home.plannedFor', { gate: p.gate })}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
