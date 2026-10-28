import type { DemoOverview, SiteSummary, SocietyDashboard } from '@repo/contracts';
import { formatNumber, Trans, useLocale } from '@repo/i18n';
import {
  Button,
  cn,
  DirectionalIcon,
  IconTile,
  InlineAlert,
  Link,
  RevealItem,
  Skeleton,
  Stagger,
  useApiQuery,
  useNavigation,
  useReducedMotion,
  useSession,
  useT,
  type TileHue,
} from '@repo/ui';
import { useGuidedTour } from '@repo/ui/onboarding';
import {
  Building2,
  CalendarCheck,
  ChevronRight,
  Compass,
  Contact,
  Info,
  KeyRound,
  MapPin,
  PhoneCall,
  Smartphone,
  Sparkles,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useId, useRef } from 'react';
import { COLLECTIONS, LINKS, SOCIETY } from '../../../nav.config';
import { demoOf, focusHeading, type DemoRole } from '../entry';

type CountId = keyof DemoOverview['counts'];

const COUNTS: Array<{ id: CountId; icon: LucideIcon; hue: TileHue }> = [
  { id: 'projects', icon: Building2, hue: 'emerald' },
  { id: 'units', icon: KeyRound, hue: 'teal' },
  { id: 'customers', icon: Contact, hue: 'sky' },
  { id: 'leads', icon: Target, hue: 'violet' },
  { id: 'siteVisits', icon: CalendarCheck, hue: 'amber' },
  { id: 'openFollowUps', icon: PhoneCall, hue: 'rose' },
];

const PRACTICE = '/backoffice/help/practice';

type Task = { id: string; href: string };

/** Society demo: the first tasks depend on the role and where the demo starts. */
function societyTasks(role: DemoRole, site: SiteSummary | undefined, mode: SocietyDashboard['mode'] | undefined): Task[] {
  const siteId = site?.id ?? 'site_alnoor';
  const fresh = (site?.flats ?? 0) === 0;
  const collecting = mode === 'collecting';
  if (role === 'alnoor_accounts') {
    return [
      { id: 'proofs', href: COLLECTIONS.inbox() },
      { id: 'bank', href: COLLECTIONS.bankFeed() },
      { id: 'payments', href: COLLECTIONS.payments() },
      { id: 'reconcile', href: COLLECTIONS.reconciliation },
    ];
  }
  if (role === 'alnoor_manager' && collecting) {
    return [
      { id: 'collections', href: COLLECTIONS.dashboard },
      { id: 'flat', href: SOCIETY.flat(siteId, 'unt_anr_a102') },
      { id: 'aging', href: COLLECTIONS.aging() },
      { id: 'people', href: SOCIETY.people() },
    ];
  }
  if (role === 'alnoor_treasurer' && collecting) {
    return [
      { id: 'collections', href: COLLECTIONS.dashboard },
      { id: 'settings', href: SOCIETY.site(siteId, 'payment-methods') },
      { id: 'account', href: SOCIETY.site(siteId, 'collection-settings') },
      { id: 'accounts', href: SOCIETY.accounts('arrears') },
    ];
  }
  if (role === 'alnoor_manager') {
    return fresh
      ? [
          { id: 'import', href: SOCIETY.importFlats(siteId) },
          { id: 'checklist', href: SOCIETY.site(siteId) },
          { id: 'structure', href: SOCIETY.structure(siteId) },
          { id: 'opening', href: SOCIETY.openingBalances(siteId) },
        ]
      : [
          { id: 'prepare', href: SOCIETY.newRun },
          { id: 'flat', href: SOCIETY.flat(siteId, 'unt_anr_a102') },
          { id: 'rules', href: SOCIETY.rules('unt_anr_a501') },
          { id: 'people', href: SOCIETY.people() },
        ];
  }
  if (role === 'alnoor_treasurer') {
    return [
      { id: 'approvals', href: LINKS.start },
      { id: 'runs', href: SOCIETY.runs },
      { id: 'exemptions', href: SOCIETY.exemptions },
      { id: 'accounts', href: SOCIETY.accounts('arrears') },
    ];
  }
  return [
    { id: 'access', href: LINKS.myAccess },
    { id: 'home', href: LINKS.start },
  ];
}

/** Suggested first tasks per role; each opens a built screen (no planned placeholders). */
const TASKS: Record<'manager' | 'sales' | 'finance', Task[]> = {
  manager: [
    { id: 'attention', href: LINKS.start },
    { id: 'pipeline', href: LINKS.salesHome },
    { id: 'project', href: LINKS.start },
    { id: 'practice', href: PRACTICE },
  ],
  sales: [
    { id: 'followUps', href: LINKS.salesHome },
    { id: 'leads', href: LINKS.leads },
    { id: 'units', href: LINKS.start },
    { id: 'practice', href: PRACTICE },
  ],
  finance: [
    { id: 'verify', href: LINKS.start },
    { id: 'collections', href: LINKS.start },
    { id: 'search', href: '/backoffice/global/command-palette' },
  ],
};

/**
 * Demo step 3: the demo is ready. Says what is inside (counted by the API for this identity),
 * suggests first tasks, and asks the welcome question the shell would otherwise ask: start the
 * guided tour on the real dashboard, or explore on my own.
 */
export function ReadyStep({ role, next, autoFocus, onSwitchRole }: { role: DemoRole; next: string | null; autoFocus: boolean; onSwitchRole: () => void }) {
  const { t } = useT();
  const { persona, tenant } = useSession();
  const tour = useGuidedTour();
  const { navigate } = useNavigation();
  const reduced = useReducedMotion();
  const heading = useRef<HTMLHeadingElement>(null);
  const actionsId = useId();
  const insideId = useId();
  const tasksId = useId();

  useEffect(() => {
    if (autoFocus) focusHeading(heading.current);
  }, [autoFocus]);

  const tourAvailable = !!tour.welcomeTourId && tour.available.some((d) => d.id === tour.welcomeTourId);
  const society = demoOf(role) === 'society';
  const sites = useApiQuery<SiteSummary[]>(society && persona?.permissions.includes('site.view') ? { method: 'GET', path: '/sites' } : null);
  const dashboard = useApiQuery<SocietyDashboard>(society && persona?.permissions.includes('site.view') ? { method: 'GET', path: '/society/dashboard' } : null);
  const tasks = society ? societyTasks(role, sites.data?.[0], dashboard.data?.mode) : TASKS[role as keyof typeof TASKS];

  const startTour = () => {
    tour.decideWelcome('accepted', true);
    // The essentials tour opens the dashboard itself; without one, go there directly.
    if (!tourAvailable) navigate(LINKS.start);
  };
  const exploreOnMyOwn = (href = next ?? LINKS.start) => {
    tour.decideWelcome('declined', true);
    navigate(href);
  };

  return (
    <div className="mx-auto max-w-6xl pt-1 sm:pt-4" data-testid="demo-ready-step">
      <header className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <motion.span
          initial={reduced ? false : { scale: 0.5, opacity: 0, rotate: -12 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', bounce: 0.5, duration: 0.6 }}
        >
          <IconTile icon={Sparkles} hue="emerald" variant="solid" size="xl" className="size-16 rounded-[1.25rem] shadow-lift [&_svg]:size-8" />
        </motion.span>
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.08em] text-accent uppercase">{t('start:demo.ready.eyebrow')}</p>
          <h1 id="page-title" ref={heading} tabIndex={-1} className="mt-1 font-display text-figure leading-tight text-text outline-none sm:text-figure-lg [:lang(ur)_&]:leading-[1.75] [:lang(ur)_&]:pt-1">
            {t('start:demo.ready.heading')}
          </h1>
          <p className="mt-2 text-base text-muted">
            <Trans
              t={t}
              i18nKey="start:demo.ready.intro"
              values={{ tenant: tenant.name, name: persona?.displayName ?? '', role: t(`common:persona.${role}`) }}
              components={{ b: <bdi className="font-semibold text-text" /> }}
            />{' '}
            <Button variant="quiet" size="sm" onPress={onSwitchRole} className="-ms-1 underline underline-offset-2" data-testid="demo-switch-role">
              {t('start:demo.ready.switchRole')}
            </Button>
          </p>
        </div>
      </header>

      <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]">
        {/* The decision comes first on phones and stays beside the details on wide screens. */}
        <section aria-labelledby={actionsId} className="self-start rounded-card border border-border bg-panel p-5 shadow-raised sm:p-6 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1" data-testid="demo-ready-actions">
          <div className="flex items-start gap-3">
            <IconTile icon={Compass} hue="emerald" size="lg" />
            <div className="min-w-0">
              <h2 id={actionsId} className="text-lg leading-snug font-bold text-text">
                {t('start:demo.ready.actionsTitle')}
              </h2>
              <p className="mt-1 text-sm text-muted">{t('start:demo.ready.actionsBody')}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-3">
            <Button variant="primary" size="lg" icon={Compass} onPress={startTour} data-testid="demo-start-tour" className="w-full">
              {t('start:demo.ready.startTour')}
            </Button>
            <Button variant="secondary" size="lg" onPress={() => exploreOnMyOwn()} data-testid="demo-explore" className="w-full">
              {t('start:demo.ready.explore')}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted">{t('start:demo.ready.tourLater')}</p>
          <p className="mt-4 flex items-start gap-2 border-t border-border pt-4 text-xs text-muted">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{t('start:demo.ready.sessionNote')}</span>
          </p>
        </section>

        <section aria-labelledby={insideId} className="min-w-0 rounded-card border border-border bg-panel p-5 shadow-card sm:p-6 lg:col-start-1 lg:row-start-1">
          <h2 id={insideId} className="text-lg font-bold text-text">
            {t('start:demo.ready.insideTitle')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('start:demo.ready.insideBody')}</p>
          {society ? <SocietyOverview /> : <Overview />}
        </section>

        <section aria-labelledby={tasksId} className="min-w-0 rounded-card border border-border bg-panel p-5 shadow-card sm:p-6 lg:col-start-1 lg:row-start-2">
          <h2 id={tasksId} className="text-lg font-bold text-text">
            {t('start:demo.ready.tasksTitle')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('start:demo.ready.tasksBody')}</p>
          <Stagger as="ol" className="mt-4 grid gap-3 sm:grid-cols-2">
            {tasks.map((task, i) => (
              <RevealItem as="li" key={task.id} className="min-w-0">
                <Link
                  href={task.href}
                  variant="plain"
                  onPress={() => tour.decideWelcome('declined', true)}
                  data-testid={`demo-task-link-${task.id}`}
                  className={cn(
                    'group flex h-full items-start gap-3 rounded-tile border border-border bg-raised p-4 outline-none',
                    'transition-[translate,box-shadow,border-color] duration-[var(--motion-regular)] ease-[var(--ease-emphasized)]',
                    'data-hovered:-translate-y-0.5 data-hovered:border-primary/40 data-hovered:bg-panel data-hovered:shadow-lift',
                    'data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
                  )}
                >
                  <span aria-hidden className={cn('grid size-8 shrink-0 place-items-center rounded-pill text-sm font-bold', 'bg-primary-soft text-primary')}>
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text">{t(`start:demo.ready.tasks.${role}.${task.id}.title` as 'start:demo.ready.tasks.manager.attention.title')}</span>
                    <span className="mt-0.5 block text-sm text-muted">{t(`start:demo.ready.tasks.${role}.${task.id}.body` as 'start:demo.ready.tasks.manager.attention.body')}</span>
                  </span>
                  <DirectionalIcon icon={ChevronRight} className="mt-1 size-4 shrink-0 text-muted transition-transform duration-[var(--motion-fast)] group-data-hovered:text-primary" />
                </Link>
              </RevealItem>
            ))}
          </Stagger>
        </section>
      </div>
    </div>
  );
}

/** Counts of what the demo holds for this identity, from GET /demo/overview. */
function Overview() {
  const { t } = useT();
  const { locale } = useLocale();
  const query = useApiQuery<DemoOverview>({ method: 'GET', path: '/demo/overview' });

  if (query.isPending) {
    return (
      <div role="status" aria-busy="true" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <span className="sr-only">{t('common:state.loading')}</span>
        {COUNTS.map((c) => (
          <Skeleton key={c.id} className="h-[5.5rem] rounded-tile" />
        ))}
      </div>
    );
  }
  if (query.isError) {
    return (
      <InlineAlert tone="error" role="alert" title={t('start:demo.ready.countsError')} className="mt-5">
        <Button variant="secondary" size="sm" className="mt-2" onPress={() => void query.refetch()}>
          {t('common:actions.retry')}
        </Button>
      </InlineAlert>
    );
  }

  const data = query.data;
  const visible = COUNTS.filter((c) => data.counts[c.id] !== null);
  return (
    <>
      <ul aria-label={t('start:demo.ready.insideTitle')} className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="demo-overview">
        {visible.map((c) => (
          <li key={c.id} className="flex min-w-0 flex-col items-start gap-2 rounded-tile border border-border bg-raised p-3.5 xs:flex-row xs:items-center xs:gap-3 sm:p-4" data-testid={`demo-count-${c.id}`}>
            <IconTile icon={c.icon} hue={c.hue} size="md" />
            <span className="block min-w-0">
              <span className="block text-2xl leading-tight font-bold tracking-tight text-text tabular">{formatNumber(data.counts[c.id] ?? 0, locale)}</span>
              <span className="block text-sm text-muted">{t(`start:demo.ready.counts.${c.id}`)}</span>
            </span>
          </li>
        ))}
      </ul>
      <ul aria-label={t('start:demo.ready.projectsLabel')} className="mt-4 flex flex-wrap gap-2">
        {data.projects.map((p) => (
          <li key={p.id} className="inline-flex items-center gap-1.5 rounded-pill bg-sunken px-3 py-1 text-xs font-medium text-text">
            <MapPin aria-hidden className="size-3.5 text-muted" />
            <bdi>{p.name}</bdi>
            <span aria-hidden>·</span>
            <span>{t(`start:cities.${p.city}` as 'start:cities.Lahore', { defaultValue: p.city })}</span>
          </li>
        ))}
      </ul>
    </>
  );
}


/**
 * The resident's side of the same story: the customer app of this browser shares the society demo
 * with the office (a proof sent there reaches finance here; the receipt goes back). Labelled as a
 * prototype link; nothing leaves the browser.
 */
function ResidentAppCard() {
  const { t } = useT();
  const href = `${window.location.protocol}//${window.location.hostname}:5174/customer/portal`;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="mt-4 flex items-start gap-3 rounded-tile border border-border bg-raised p-4 text-start hover:bg-panel focus-visible:outline-2 focus-visible:outline-focus" data-testid="demo-resident-app">
      <Smartphone aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-text">{t('start:demo.ready.society.residentTitle')}</span>
        <span className="block text-xs text-muted">{t('start:demo.ready.society.residentBody')}</span>
      </span>
    </a>
  );
}

/** What the society demo holds for this identity (counted by the API, like the developer demo). */
function SocietyOverview() {
  const { t } = useT();
  const { locale } = useLocale();
  const { persona } = useSession();
  const seesSites = persona?.permissions.includes('site.view') ?? false;
  const sites = useApiQuery<SiteSummary[]>(seesSites ? { method: 'GET', path: '/sites' } : null);
  const dash = useApiQuery<SocietyDashboard>(seesSites ? { method: 'GET', path: '/society/dashboard' } : null);
  if (!seesSites) return <p className="mt-5 text-sm text-muted" data-testid="demo-society-guard">{t('start:demo.ready.society.guard')}</p>;
  if (!sites.data || !dash.data) {
    return (
      <div role="status" aria-busy="true" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <span className="sr-only">{t('common:state.loading')}</span>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[5.5rem] rounded-tile" />
        ))}
      </div>
    );
  }
  const site = sites.data[0]!;
  const counts: Array<{ id: 'flats' | 'blocks' | 'occupied' | 'arrears'; value: number; icon: LucideIcon; hue: TileHue }> = [
    { id: 'flats', value: site.flats, icon: KeyRound, hue: 'teal' },
    { id: 'blocks', value: site.buildings, icon: Building2, hue: 'emerald' },
    { id: 'occupied', value: site.occupied, icon: Contact, hue: 'sky' },
    { id: 'arrears', value: dash.data.arrears.accounts, icon: Target, hue: 'amber' },
  ];
  return (
    <>
      <ul aria-label={t('start:demo.ready.insideTitle')} className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="demo-society-overview" data-flats={site.flats}>
        {counts.map((c) => (
          <li key={c.id} className="flex min-w-0 flex-col items-start gap-2 rounded-tile border border-border bg-raised p-3.5 sm:p-4" data-testid={`demo-society-count-${c.id}`}>
            <IconTile icon={c.icon} hue={c.hue} size="md" />
            <span className="block min-w-0">
              <span className="block text-2xl leading-tight font-bold tracking-tight text-text tabular">{formatNumber(c.value, locale)}</span>
              <span className="block text-sm text-muted">{t(`start:demo.ready.society.counts.${c.id}`)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 inline-flex items-center gap-1.5 rounded-pill bg-sunken px-3 py-1 text-xs font-medium text-text">
        <MapPin aria-hidden className="size-3.5 text-muted" />
        <bdi>{site.name}</bdi>
        <span aria-hidden>·</span>
        {site.flats === 0 ? t('start:demo.ready.society.fresh') : dash.data.mode === 'collecting' ? t('start:demo.ready.society.collecting') : t('start:demo.ready.society.ready')}
      </p>
      <ResidentAppCard />
    </>
  );
}
