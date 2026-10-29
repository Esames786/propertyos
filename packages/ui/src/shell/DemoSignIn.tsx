import type { Persona } from '@repo/contracts';
import { ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAnnounce } from '../a11y/LiveAnnouncer';
import { Badge } from '../data/StatusLabel';
import { InlineAlert } from '../feedback/InlineAlert';
import { useT } from '../lib/useT';
import { useSession } from '../permissions/SessionProvider';
import { Button } from '../primitives/Button';
import { LocaleToggle } from './LocaleSwitcher';

/**
 * Simulated sign-in with fictional demo identities (prototype only; AUTH screens come in Stage 2).
 * Choosing an identity is that persona's "first login" for this app and tenant.
 */
export function DemoSignIn({
  appName,
  onSignedIn,
  footer,
  describe,
}: {
  appName: string;
  onSignedIn?: (personaId: string) => void;
  footer?: ReactNode;
  /** What this identity can see; defaults to the persona's project scope. */
  describe?: (persona: Persona) => string;
}) {
  const { t } = useT();
  const { personas: everyone, signIn, tenant, tenants, notice, clearNotice } = useSession();
  // Residents who joined by invitation sign in with their phone (AUTH-006), not by picking a name.
  const personas = everyone.filter((p) => !p.unlisted);
  const announce = useAnnounce();
  // One section per organisation when the app has people from more than one (e.g. a developer and a society).
  const groups = tenants
    .map((x) => ({ tenant: x, people: personas.filter((p) => p.tenantId === x.id) }))
    .filter((g) => g.people.length > 0);
  const grouped = groups.length > 1;
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <main id="main-content" className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {!grouped && (
              <>
                <bdi className="font-semibold text-text">{tenant.name}</bdi> ·{' '}
              </>
            )}
            {appName}
          </p>
          <LocaleToggle />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-text">{t('common:demo.signInTitle')}</h1>
          <p className="text-muted">{t('common:demo.signInIntro')}</p>
        </div>
        {notice && (
          <InlineAlert tone={notice.reason === 'portal_access_revoked' ? 'warning' : 'info'} title={t('identity:signIn.noticeTitle')} data-testid="sign-out-notice" data-reason={notice.reason}>
            {t(`identity:signIn.notice.${notice.reason}`)}
          </InlineAlert>
        )}
        <InlineAlert tone="info">{t('common:demo.fictional')}</InlineAlert>
        {(grouped ? groups : [{ tenant, people: personas }]).map((g) => (
          <section key={g.tenant.id} aria-labelledby={grouped ? `sign-in-org-${g.tenant.id}` : undefined} className="space-y-3" data-testid={`sign-in-org-${g.tenant.id}`}>
            {grouped && (
              <h2 id={`sign-in-org-${g.tenant.id}`} className="text-sm font-semibold tracking-[0.06em] text-muted uppercase">
                <bdi>{g.tenant.name}</bdi>
              </h2>
            )}
            <ul className="grid gap-3 sm:grid-cols-2">
              {g.people.map((p) => (
                <li key={p.id} className="flex flex-col gap-3 rounded-card border border-border bg-panel p-4 shadow-card">
                  <div className="flex items-start gap-3">
                    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-pill bg-primary-soft font-semibold text-primary">
                      {p.displayName.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-text">
                        <bdi>{p.displayName}</bdi>
                      </p>
                      <p className="text-sm text-muted">{t(p.roleKey as 'common:persona.manager')}</p>
                      <p className="mt-1 text-xs text-muted">
                        {describe ? describe(p) : p.projectScope === 'all' ? t('common:demo.scopeAll') : t('common:demo.scopeOne', { project: 'Larkspur Heights' })}
                      </p>
                    </div>
                  </div>
                  <Badge tone="demo" icon={ShieldCheck}>{t('common:badge.demo')}</Badge>
                  <Button
                    variant="primary"
                    onPress={() => {
                      clearNotice();
                      signIn(p.id);
                      announce(t('a11y:announce.identityChanged', { name: p.displayName, role: t(p.roleKey as 'common:persona.manager') }));
                      onSignedIn?.(p.id);
                    }}
                    data-testid={`sign-in-${p.id}`}
                  >
                    {t('common:demo.continueAs', { name: p.displayName })}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {footer}
      </main>
    </div>
  );
}
