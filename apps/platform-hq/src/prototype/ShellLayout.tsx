import type { Persona } from '@repo/contracts';
import { AppShell, DemoSignIn, useCan, useSession, useT, type Destination } from '@repo/ui';
import { ShieldCheck } from 'lucide-react';
import { useMemo } from 'react';
import { Outlet, useMatches, useNavigate, useSearchParams } from 'react-router';
import { HQ, HQ_LINKS, HQ_NAV } from '../nav.config';
import { CreateTenantAction } from './CreateAction';
import type { RouteHandle } from './handle';

/** The central-plane chip in the header: HQ has no tenant project context, and says so. */
function PlaneChip() {
  const { t } = useT();
  return (
    <span className="inline-flex min-h-10 items-center gap-2 rounded-pill bg-panel px-3.5 text-sm font-medium text-text shadow-inset" data-testid="hq-plane">
      <ShieldCheck aria-hidden className="size-4 text-primary" />
      <span className="max-sm:sr-only">{t('platform:shell.plane')}</span>
    </span>
  );
}

/** Signed-out HQ: the demo sign-in with the three fictional platform identities. */
export function HqSignIn({ next }: { next?: string }) {
  const { t } = useT();
  const navigate = useNavigate();
  const describe = (p: Persona) => t(`platform:personaScope.${p.id}` as 'platform:personaScope.supreme_admin');
  return <DemoSignIn appName={t('platform:app.name')} describe={describe} onSignedIn={() => navigate(next && next.startsWith('/hq') ? next : HQ.dashboard, { replace: true })} />;
}

/**
 * Signed-in Platform HQ frame (D-1: a separate app from the tenant backoffice). Same shell, slots
 * filled for the central plane: no project switcher, Create tenant instead of Quick create, and no
 * tenant drawers. Without an identity the demo sign-in is shown on any address and returns there.
 */
export function ShellLayout() {
  const { t } = useT();
  const { persona } = useSession();
  const can = useCan();
  const matches = useMatches();
  const [params] = useSearchParams();
  const appName = t('platform:app.name');

  const match = [...matches].reverse().find((m) => (m.handle as RouteHandle | undefined)?.title);
  const handle = match?.handle as RouteHandle | undefined;
  const pageTitle = handle ? handle.title(t, match?.data) : appName;

  const destinations = useMemo<Destination[]>(
    () => [
      { id: 'create-tenant', label: t('platform:shell.createTenant'), href: HQ.createTenant, permission: 'platform.tenants.create', keywords: 'new tenant onboard society developer' },
      { id: 'requests', label: t('platform:tenants.tabs.requests'), href: `${HQ.tenants}?tab=requests`, permission: 'platform.tenants.view', keywords: 'signup request trial sales' },
      { id: 'approvals', label: t('platform:tenants.filters.awaiting_approval'), href: `${HQ.tenants}?status=awaiting_approval`, permission: 'platform.tenants.view', keywords: 'approval discount commercial' },
      { id: 'tours', label: t('nav:pages.tourLibrary'), href: HQ.tours, keywords: 'tour guide help' },
      { id: 'preferences', label: t('nav:pages.preferences'), href: HQ.preferences, keywords: 'language accessibility motion contrast' },
    ],
    [t],
  );

  const slots = useMemo(
    () => ({
      context: <PlaneChip />,
      create: can('platform.tenants.create')
        ? { header: <CreateTenantAction variant="header" />, compact: <CreateTenantAction variant="compact" />, fab: <CreateTenantAction variant="fab" /> }
        : null,
    }),
    [can],
  );

  if (!persona) return <HqSignIn next={`${window.location.pathname}${params.size ? `?${params}` : ''}`} />;

  return (
    <AppShell appName={appName} navItems={HQ_NAV} destinations={destinations} links={HQ_LINKS} pageTitle={pageTitle} helpKey={handle?.helpKey ?? 'default'} slots={slots} overlays={null}>
      <Outlet />
    </AppShell>
  );
}
