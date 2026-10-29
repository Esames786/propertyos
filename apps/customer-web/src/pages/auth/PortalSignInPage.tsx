import { ApiError, type Persona, type SignInCodeSent } from '@repo/contracts';
import { Button, InlineAlert, Link, PlainTextField, useAnnounce, useApiMutation, useNavigation, useSession, useT, useTransport } from '@repo/ui';
import { ArrowLeft, Smartphone, UserRoundSearch } from 'lucide-react';
import { useState } from 'react';
import { AuthFrame, AuthHeading, CodeStep, codeErrorOf, type CodeError } from './parts';

const HOME = '/customer/portal/home';
type Sent = SignInCodeSent | { challengeId: null; sentTo: string };

/**
 * AUTH-006 Customer portal login (Gate D.1). A resident signs in with the mobile number the society
 * office has for them and a one-time code (simulated: the demo shows the code). The answer never
 * reveals whether a number has an account. Someone signed out by another device or by the office
 * is told why. Only residents whose portal access is active get in.
 */
export default function PortalSignInPage({ demoNumbers }: { demoNumbers: ReadonlyArray<{ name: string; phone: string }> }) {
  const { t } = useT();
  const { persona, signIn, notice, clearNotice } = useSession();
  const { transport } = useTransport();
  const { navigate } = useNavigation();
  const announce = useAnnounce();
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [sent, setSent] = useState<Sent | null>(null);
  const [codeError, setCodeError] = useState<CodeError | null>(null);
  const [denied, setDenied] = useState(false);
  const request = useApiMutation<Sent>();
  const verify = useApiMutation<{ personaId: string }>();

  const send = (number = phone) => {
    if (!number.trim()) {
      setPhoneError('forms:errors.required');
      return;
    }
    request.mutate(
      { method: 'POST', path: '/sign-in/code', body: { phone: number } },
      {
        onSuccess: (r) => {
          setPhoneError(undefined);
          setCodeError(null);
          setSent(r);
          announce(r.challengeId ? t('identity:code.sentTo', { to: r.sentTo }) : t('identity:signIn.noCode'));
        },
        onError: (e) => {
          const key = e instanceof ApiError ? e.problem.errors?.phone?.[0]?.code : undefined;
          setPhoneError(key ?? 'forms:errors.phoneInvalid');
        },
      },
    );
  };

  const check = async (code: string) => {
    if (!sent?.challengeId) return;
    try {
      const r = await verify.mutateAsync({ method: 'POST', path: '/sign-in/verify', body: { challengeId: sent.challengeId, code } });
      if (persona) await transport.request({ method: 'POST', path: '/me/sessions/current/sign-out' }).catch(() => undefined);
      clearNotice();
      announce(t('identity:signIn.welcomeBack'));
      signIn(r.personaId as Persona['id']);
      navigate(HOME, { replace: true });
    } catch (e) {
      const ce = codeErrorOf(e);
      if (ce) {
        setCodeError(ce);
        announce(t(ce.key as 'identity:code.wrong', ce.params?.count ? { ...ce.params, count: Number(ce.params.count) } : ce.params), 'assertive');
      }
      else if (e instanceof ApiError && e.problem.code === 'portal_access_revoked') setDenied(true);
    }
  };

  return (
    <AuthFrame title={t('nav:pages.portalSignIn')} testId="portal-sign-in">
      <div className="space-y-6">
        {notice && !sent && (
          <InlineAlert tone={notice.reason === 'portal_access_revoked' ? 'warning' : 'info'} title={t('identity:signIn.noticeTitle')} data-testid="sign-out-notice" data-reason={notice.reason}>
            {t(`identity:signIn.notice.${notice.reason}`)}
          </InlineAlert>
        )}
        <AuthHeading title={sent?.challengeId ? t('identity:signIn.verifyTitle') : t('identity:signIn.title')} intro={sent?.challengeId ? t('identity:code.sentTo', { to: sent.sentTo }) : t('identity:signIn.intro')} />

        {denied ? (
          <InlineAlert tone="warning" data-testid="sign-in-denied">
            {t('identity:signIn.notice.portal_access_revoked')}
          </InlineAlert>
        ) : sent?.challengeId ? (
          <CodeStep challenge={sent} submitLabel={t('identity:signIn.verify')} isPending={verify.isPending} error={codeError} onSubmit={(c) => void check(c)} onResend={() => send()} resending={request.isPending} />
        ) : sent ? (
          <div className="space-y-3" data-testid="sign-in-no-code">
            <InlineAlert tone="info">{t('identity:signIn.noCode')}</InlineAlert>
            <p className="rounded-tile border-2 border-dashed border-demo/40 bg-demo-soft p-3 text-sm text-text">{t('identity:signIn.noCodeDemo')}</p>
          </div>
        ) : (
          <form
            className="space-y-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <PlainTextField
              label={t('identity:signIn.phone')}
              description={t('identity:signIn.phoneHint')}
              value={phone}
              onChange={(v) => {
                setPhone(v);
                setPhoneError(undefined);
              }}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              errorKey={phoneError}
              testId="sign-in-phone"
            />
            <Button type="submit" variant="primary" icon={Smartphone} className="w-full justify-center sm:w-auto" isPending={request.isPending} data-testid="sign-in-send">
              {t('identity:signIn.sendCode')}
            </Button>
          </form>
        )}

        {sent && (
          <Button
            variant="quiet"
            icon={ArrowLeft}
            onPress={() => {
              setSent(null);
              setDenied(false);
              setCodeError(null);
            }}
            data-testid="sign-in-change"
          >
            {t('identity:signIn.changeNumber')}
          </Button>
        )}

        {!sent && (
          <section aria-labelledby="demo-numbers" className="rounded-card border-2 border-dashed border-demo/40 bg-demo-soft p-4" data-testid="demo-numbers">
            <h2 id="demo-numbers" className="text-sm font-semibold text-text">
              {t('identity:signIn.demoNumbersTitle')}
            </h2>
            <p className="mt-1 text-xs text-muted">{t('identity:signIn.demoNumbersBody')}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {demoNumbers.map((n) => (
                <li key={n.phone}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() => {
                      setPhone(n.phone);
                      send(n.phone);
                    }}
                  >
                    <bdi>{n.name}</bdi>
                    <bdi dir="ltr" className="ltr-ref text-muted">
                      {n.phone}
                    </bdi>
                  </Button>
                </li>
              ))}
            </ul>
            <Link href="/customer/portal" className="mt-3 inline-flex items-center gap-1.5 text-sm">
              <UserRoundSearch aria-hidden className="size-4" />
              {t('identity:signIn.demoIdentities')}
            </Link>
          </section>
        )}
      </div>
    </AuthFrame>
  );
}
