import type { AppSwitchRedeemed, AppSwitchTicket, Persona } from '@repo/contracts';
import { ArrowLeftRight, BriefcaseBusiness, House, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAnnounce } from '../a11y/LiveAnnouncer';
import { useTransport } from '../data/TransportProvider';
import { useApiMutation } from '../data/useApi';
import { InlineAlert } from '../feedback/InlineAlert';
import { useToast } from '../feedback/Toast';
import { useT } from '../lib/useT';
import { useNavigation } from '../navigation/RouterAdapter';
import { useSession } from '../permissions/SessionProvider';
import { Button } from '../primitives/Button';
import { Link } from '../primitives/Link';
import { LocaleToggle } from '../shell/LocaleSwitcher';
import { useMyProfile } from './Profile';

export type SwitchableApp = 'backoffice' | 'customer';

/**
 * GLOBAL-015 app switch: a person with both a staff membership and a verified resident link moves
 * between the office app and the resident app. The server issues a one-time ticket (two minutes,
 * naming only who and where); the other app redeems it and starts its own session with its own
 * cache, so nothing from one app is ever shown in the other. `urlFor` is the other app's landing.
 */
export function useAppSwitch(urlFor: (token: string) => string) {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const profile = useMyProfile();
  const issue = useApiMutation<AppSwitchTicket>();
  const target = profile.data?.switchTo;
  const start = () => {
    if (!target) return;
    announce(t('identity:switch.opening', { app: t(`identity:switch.appName.${target.app}`) }));
    issue.mutate(
      { method: 'POST', path: '/me/app-switch' },
      {
        onSuccess: (ticket) => window.location.assign(urlFor(ticket.token)),
        onError: () => toast.error(t('identity:switch.failed')),
      },
    );
  };
  return { target, start, pending: issue.isPending };
}

/** The switch offered on the profile page, for people who have the other app as well. */
export function AppSwitchCard({ urlFor }: { urlFor: (token: string) => string }) {
  const { t } = useT();
  const { target, start, pending } = useAppSwitch(urlFor);
  if (!target) return null;
  const app = t(`identity:switch.appName.${target.app}`);
  return (
    <section aria-labelledby="app-switch-title" className="rounded-card border border-primary/30 bg-primary-soft/60 p-5 shadow-card" data-testid="app-switch-card" data-target={target.app}>
      <span aria-hidden className="grid size-10 place-items-center rounded-tile bg-primary text-on-primary">
        <ArrowLeftRight className="size-5" />
      </span>
      <h2 id="app-switch-title" className="mt-3 font-semibold text-text">
        {t('identity:switch.cardTitle', { app })}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('identity:switch.cardBody', { role: t(target.roleKey as 'common:persona.manager') })}</p>
      <Button variant="primary" icon={ArrowLeftRight} className="mt-4 w-full justify-center" isPending={pending} onPress={start} data-testid="app-switch">
        {t(`identity:switch.to.${target.app}`)}
      </Button>
    </section>
  );
}

/**
 * Which side the person is on, shown only to people who have both: "Management" in the office app,
 * "Resident" in the resident app. Icon and words, never colour alone.
 */
export function RoleModeChip({ app, compact = false, className }: { app: SwitchableApp; /** Icon only on phones (the label is still spoken). */ compact?: boolean; className?: string }) {
  const { t } = useT();
  const { persona } = useSession();
  const profile = useMyProfile();
  if (!persona || !profile.data?.switchTo) return null;
  const Icon = app === 'backoffice' ? BriefcaseBusiness : House;
  const label = t('identity:switch.modeLabel', { app: t(`identity:switch.appName.${app}`), role: t(persona.roleKey as 'common:persona.manager') });
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-testid="role-mode"
      data-mode={app}
      className={`inline-flex min-h-8 min-w-8 items-center justify-center gap-1.5 rounded-pill border text-xs font-semibold ${compact ? 'px-2 sm:px-3' : 'px-3'} ${app === 'backoffice' ? 'border-primary/40 bg-primary-soft text-primary' : 'border-accent/40 bg-panel text-accent'} ${className ?? ''}`}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span aria-hidden className={compact ? 'max-sm:hidden' : undefined}>
        {t(`identity:switch.mode.${app}`)}
      </span>
    </span>
  );
}

/**
 * Where a switch lands in the other app: redeem the ticket once, end whoever else was signed in on
 * this side, start this side's own session, then home. An expired or used ticket explains itself.
 */
export function AppSwitchLanding({ token, homeHref, signInHref }: { token: string; homeHref: string; signInHref: string }) {
  const { t } = useT();
  const { transport } = useTransport();
  const { persona, personas, signIn } = useSession();
  const { navigate } = useNavigation();
  const toast = useToast();
  const announce = useAnnounce();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const r = await transport.request<AppSwitchRedeemed>({ method: 'POST', path: `/app-switch/${encodeURIComponent(token)}` });
        if (persona?.id !== r.personaId) {
          if (persona) await transport.request({ method: 'POST', path: '/me/sessions/current/sign-out' }).catch(() => undefined);
          signIn(r.personaId as Persona['id']);
        }
        const target = personas.find((p) => p.id === r.personaId);
        const msg = t('identity:switch.arrived', { app: t(`identity:switch.appName.${r.app}`), role: target ? t(target.roleKey as 'common:persona.manager') : '' });
        toast.success(msg);
        announce(msg);
        navigate(homeHref, { replace: true });
      } catch {
        setFailed(true);
      }
    })();
  }, [token, transport, persona, personas, signIn, navigate, homeHref, toast, announce, t]);

  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <main id="main-content" tabIndex={-1} className="w-full max-w-md space-y-5 outline-none" data-testid="app-switch-landing" data-state={failed ? 'failed' : 'redeeming'}>
        <div className="flex justify-end">
          <LocaleToggle />
        </div>
        <h1 className="text-2xl font-semibold text-text">{failed ? t('identity:switch.expiredTitle') : t('identity:switch.landingTitle')}</h1>
        {failed ? (
          <>
            <InlineAlert tone="warning">{t('identity:switch.expiredBody')}</InlineAlert>
            <Link href={signInHref} className="font-medium">
              {t('identity:switch.signIn')}
            </Link>
          </>
        ) : (
          <p role="status" className="flex items-center gap-2 text-muted">
            <Loader2 aria-hidden className="size-5 motion-safe:animate-spin" />
            {t('identity:switch.landingTitle')}
          </p>
        )}
      </main>
    </div>
  );
}
