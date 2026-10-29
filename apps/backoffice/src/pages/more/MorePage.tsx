import {
  Button,
  IconTile,
  LocaleToggle,
  PageHeader,
  RevealItem,
  SectionHeading,
  Stagger,
  useAnnounce,
  useApiMutation,
  useSession, useSignOut,
  useShell,
  useT,
  useToast,
  type NavItem,
  type TileHue,
} from '@repo/ui';
import { Accessibility, Bell, Compass, GraduationCap, LogOut, MonitorSmartphone, RotateCcw, Settings, ShieldCheck, KeyRound } from 'lucide-react';
import { Link } from 'react-aria-components';
import { LINKS } from '../../nav.config';

const HUE: Record<string, TileHue> = {
  home: 'emerald',
  sales: 'sky',
  projects: 'teal',
  customers: 'violet',
  finance: 'gold',
  procurement: 'orange',
  hr: 'rose',
  operations: 'amber',
  residents: 'teal',
  reports: 'slate',
  administration: 'slate',
  lab: 'violet',
  help: 'emerald',
};

const cardClass =
  'flex min-h-16 items-center gap-3 rounded-card border border-border/70 bg-panel p-3.5 text-md font-medium text-text shadow-card outline-none transition-[translate,box-shadow] duration-[var(--motion-regular)] data-hovered:-translate-y-0.5 data-hovered:shadow-lift data-pressed:translate-y-0 data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus';

/**
 * More (phone): every area the role can open, as large icon cards, plus the demo controls that do
 * not fit the bottom bar: switch demo role, settings, tours, language, reset the demo session.
 */
export default function MorePage() {
  const { t } = useT();
  const { persona, personas, signIn, allows } = useSession();
  const signOut = useSignOut();
  const announce = useAnnounce();
  const toast = useToast();
  const reset = useApiMutation();
  const { navItems } = useShell();
  const areas = navItems.filter(allows);
  // Another role of the same organisation; another organisation is a different sign-in (tenant switch).
  const colleagues = personas.filter((p) => p.tenantId === persona?.tenantId);

  const settings: Array<{ id: string; label: string; href: string; icon: typeof Settings; hue: TileHue }> = [
    { id: 'profile', label: t('nav:pages.profile'), href: LINKS.profile, icon: MonitorSmartphone, hue: 'slate' },
    { id: 'my-access', label: t('nav:pages.myAccess'), href: LINKS.myAccess, icon: KeyRound, hue: 'emerald' },
    { id: 'accessibility', label: t('nav:pages.accessibility'), href: LINKS.preferences, icon: Accessibility, hue: 'sky' },
    { id: 'notifications', label: t('nav:header.notifications'), href: '/backoffice/global/notifications', icon: Bell, hue: 'amber' },
    { id: 'tours', label: t('nav:pages.tourLibrary'), href: LINKS.tourLibrary, icon: Compass, hue: 'emerald' },
    { id: 'practice', label: t('nav:pages.practice'), href: '/backoffice/help/practice', icon: GraduationCap, hue: 'gold' },
  ];

  return (
    <div className="space-y-8">
      <PageHeader title={t('nav:pages.more')} description={t('common:more.description')} />

      {colleagues.length > 1 && (
        <section aria-labelledby="more-role" className="rounded-card border border-border/70 bg-panel p-4 shadow-card">
          <SectionHeading id="more-role" title={t('common:more.switchRole')} description={t('common:more.switchRoleHint')} />
          <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="more-role">
            {colleagues.map((p) => {
              const current = p.id === persona?.id;
              return (
                <Button
                  key={p.id}
                  variant={current ? 'primary' : 'secondary'}
                  aria-pressed={current}
                  className="min-h-12 flex-col gap-0.5 px-2 text-center whitespace-normal"
                  onPress={() => {
                    if (current) return;
                    signIn(p.id);
                    announce(t('a11y:announce.identityChanged', { name: p.displayName, role: t(p.roleKey as 'common:persona.manager') }));
                  }}
                  data-testid={`more-role-${p.id}`}
                >
                  {t(p.roleKey as 'common:persona.manager')}
                </Button>
              );
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="more-areas">
        <SectionHeading id="more-areas" title={t('common:more.areas')} />
        <Stagger as="ul" className="grid grid-cols-1 gap-3 min-[26rem]:grid-cols-2 lg:grid-cols-3">
          {areas.map((item: NavItem) => (
            <RevealItem as="li" key={item.id}>
              <Link href={item.href} className={cardClass} data-testid={`more-area-${item.id}`}>
                <IconTile icon={item.icon} hue={HUE[item.id] ?? 'slate'} size="md" />
                <span>{t(item.labelKey as 'nav:items.home')}</span>
              </Link>
            </RevealItem>
          ))}
        </Stagger>
      </section>

      <section aria-labelledby="more-settings">
        <SectionHeading id="more-settings" title={t('common:more.settings')} />
        <Stagger as="ul" className="grid grid-cols-1 gap-3 min-[26rem]:grid-cols-2 lg:grid-cols-3">
          {settings.map((s) => (
            <RevealItem as="li" key={s.id}>
              <Link href={s.href} className={cardClass}>
                <IconTile icon={s.icon} hue={s.hue} size="md" />
                <span>{s.label}</span>
              </Link>
            </RevealItem>
          ))}
        </Stagger>
        <div className="mt-3">
          <LocaleToggle className="w-full justify-center" />
        </div>
      </section>

      <section aria-labelledby="more-demo" className="space-y-3 rounded-card border border-demo/30 bg-demo-soft p-4">
        <h2 id="more-demo" className="flex items-center gap-2 text-sm font-semibold text-demo">
          <ShieldCheck aria-hidden className="size-4" />
          {t('nav:demoEnvironment')}
        </h2>
        <p className="text-sm text-text">{t('common:more.demoBody')}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={RotateCcw}
            isPending={reset.isPending}
            onPress={async () => {
              await reset.mutateAsync({ method: 'POST', path: '/demo/reset' });
              toast.success(t('common:more.resetDone'));
            }}
            data-testid="more-reset-demo"
          >
            {t('common:more.reset')}
          </Button>
          <Button variant="quiet" icon={LogOut} onPress={signOut} data-testid="more-sign-out">
            {t('common:demo.signOut')}
          </Button>
        </div>
      </section>
    </div>
  );
}
