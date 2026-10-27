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
  useSession,
  useT,
  useToast,
  type TileHue,
} from '@repo/ui';
import { Compass, LogOut, RotateCcw, Settings, ShieldCheck } from 'lucide-react';
import { Link } from 'react-aria-components';
import { HQ, HQ_NAV } from '../../nav.config';

const HUE: Record<string, TileHue> = { dashboard: 'emerald', tenants: 'teal', simulator: 'sky', help: 'violet' };

const cardClass =
  'flex min-h-16 items-center gap-3 rounded-card border border-border/70 bg-panel p-3.5 text-[0.9375rem] font-medium text-text shadow-card outline-none transition-[translate,box-shadow] duration-[var(--motion-regular)] data-hovered:-translate-y-0.5 data-hovered:shadow-lift data-pressed:translate-y-0 data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus';

/**
 * More (phone) for Platform HQ: the areas this identity may open (only built ones, flaw F-1), the
 * settings, the demo identity switch, reset and sign out. A short page by design (flaw F-12).
 */
export default function HqMorePage() {
  const { t } = useT();
  const { persona, personas, signIn, signOut, allows } = useSession();
  const announce = useAnnounce();
  const toast = useToast();
  const reset = useApiMutation();
  const areas = HQ_NAV.filter(allows);
  const settings = [
    { id: 'preferences', label: t('nav:pages.preferences'), href: HQ.preferences, icon: Settings, hue: 'slate' as TileHue },
    { id: 'tours', label: t('nav:pages.tourLibrary'), href: HQ.tours, icon: Compass, hue: 'emerald' as TileHue },
  ];
  return (
    <div className="space-y-8">
      <PageHeader title={t('nav:pages.more')} description={t('platform:more.description')} />

      <section aria-labelledby="more-role" className="rounded-card border border-border/70 bg-panel p-4 shadow-card">
        <SectionHeading id="more-role" title={t('platform:more.switchRole')} description={t('platform:more.switchRoleHint')} />
        <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="more-role">
          {personas.map((p) => {
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
                  announce(t('a11y:announce.identityChanged', { name: p.displayName, role: t(p.roleKey as 'platform:personas.supremeAdmin') }));
                }}
                data-testid={`more-role-${p.id}`}
              >
                {t(p.roleKey as 'platform:personas.supremeAdmin')}
              </Button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="more-areas">
        <SectionHeading id="more-areas" title={t('common:more.areas')} />
        <Stagger as="ul" className="grid grid-cols-1 gap-3 min-[26rem]:grid-cols-2 lg:grid-cols-3">
          {areas.map((item) => (
            <RevealItem as="li" key={item.id}>
              <Link href={item.href} className={cardClass} data-testid={`more-area-${item.id}`}>
                <IconTile icon={item.icon} hue={HUE[item.id] ?? 'slate'} size="md" />
                <span>{t(item.labelKey as 'platform:nav.dashboard')}</span>
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
        <p className="text-sm text-text">{t('platform:more.demoBody')}</p>
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
