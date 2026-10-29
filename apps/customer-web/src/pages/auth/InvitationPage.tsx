import { ApiError, type InvitationAccepted, type InvitationView, type Persona, type SignInCodeSent } from '@repo/contracts';
import { formatCalendarDate, LOCALE_META, SUPPORTED_LOCALES, useLocale, type AppLocale } from '@repo/i18n';
import { Button, ChoiceCards, InlineAlert, Link, Skeleton, useAnnounce, useApiMutation, useApiQuery, useNavigation, useSession, useT, useTransport } from '@repo/ui';
import { BadgeCheck, CalendarClock, CircleAlert, House, KeyRound, ReceiptText, ShieldCheck, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { AuthFrame, AuthHeading, CodeStep, codeErrorOf, type CodeError } from './parts';

const SIGN_IN = '/shared/auth/customer-portal-login';
const WELCOME = '/customer/portal/welcome?from=invitation';

/**
 * AUTH-007 Accept invitation (Gate D.1). The link from the society office opens this page: it names
 * the society and the flat being joined, asks for the language, and confirms the person with a
 * one-time code (simulated: the demo shows it). Accepting binds the account to that organisation,
 * site, flat and verified person, re-checked by the server at that moment, then the resident sets
 * up the app (PORTAL-030). Expired, used and cancelled links explain what to do instead.
 */
export default function InvitationPage({ token }: { token: string }) {
  const { t } = useT();
  const { locale, setLocale } = useLocale();
  const { persona, signIn } = useSession();
  const { transport } = useTransport();
  const { navigate } = useNavigation();
  const announce = useAnnounce();
  const view = useApiQuery<InvitationView>({ method: 'GET', path: `/invitations/${encodeURIComponent(token)}` }, { retry: false, staleTime: Infinity });
  const sendCode = useApiMutation<SignInCodeSent>();
  const accept = useApiMutation<InvitationAccepted>();
  const [challenge, setChallenge] = useState<SignInCodeSent | null>(null);
  const [codeError, setCodeError] = useState<CodeError | null>(null);
  const [joined, setJoined] = useState(false);
  const [linkEnded, setLinkEnded] = useState(false);
  const v = view.data;

  const requestCode = () =>
    sendCode.mutate(
      { method: 'POST', path: `/invitations/${encodeURIComponent(token)}/code` },
      {
        onSuccess: (c) => {
          setChallenge(c);
          setCodeError(null);
          announce(t('identity:code.sentTo', { to: c.sentTo }));
        },
        onError: () => void view.refetch(),
      },
    );

  const join = async (code: string) => {
    if (!challenge) return;
    try {
      const r = await accept.mutateAsync({ method: 'POST', path: `/invitations/${encodeURIComponent(token)}/accept`, body: { challengeId: challenge.challengeId, code } });
      setJoined(true);
      // Someone else signed in on this device is signed out first (their session ends on the server).
      if (persona) await transport.request({ method: 'POST', path: '/me/sessions/current/sign-out' }).catch(() => undefined);
      announce(t('identity:accept.joinedAnnounce', { organisation: v?.organisation ?? '' }));
      signIn(r.personaId as Persona['id']);
      navigate(WELCOME, { replace: true });
    } catch (e) {
      const ce = codeErrorOf(e);
      if (ce) {
        setCodeError(ce);
        announce(t(ce.key as 'identity:code.wrong', ce.params?.count ? { ...ce.params, count: Number(ce.params.count) } : ce.params), 'assertive');
      } else if (e instanceof ApiError && e.problem.code === 'link_ended') setLinkEnded(true);
      else void view.refetch();
    }
  };

  if (view.isError) return <Closed state="not_found" />;
  if (!v || joined)
    return (
      <AuthFrame title={t('nav:pages.acceptInvitation')} testId="invitation-page">
        <p className="sr-only" role="status">
          {t('identity:accept.loading')}
        </p>
        <div className="space-y-4" aria-hidden>
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      </AuthFrame>
    );
  if (linkEnded) return <Closed state="revoked" organisation={v.organisation} />;
  if (v.state !== 'sent') return <Closed state={v.state} organisation={v.organisation} />;

  const name = v.firstName ?? '';
  return (
    <AuthFrame title={t('nav:pages.acceptInvitation')} organisation={v.organisation} testId="invitation-page">
      <div className="space-y-8" data-state="valid">
        <AuthHeading eyebrow={t('identity:accept.eyebrow')} title={t('identity:accept.title', { name })} intro={t('identity:accept.intro')} />

        <section aria-labelledby="joining" className="rounded-card border border-border/70 bg-panel p-5 shadow-card" data-testid="invitation-joining">
          <h2 id="joining" className="text-sm font-semibold text-muted">
            {t('identity:accept.joining')}
          </h2>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="flex items-center gap-2 text-xs text-muted">
                <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-tile bg-primary-soft text-primary">
                  <ShieldCheck className="size-4" />
                </span>
                {t('identity:accept.organisation')}
              </dt>
              <dd className="mt-1 font-semibold text-text">
                <bdi>{v.organisation}</bdi>
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="flex items-center gap-2 text-xs text-muted">
                <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-tile bg-primary-soft text-primary">
                  <House className="size-4" />
                </span>
                {t('identity:accept.flat')}
              </dt>
              <dd className="mt-1 font-semibold text-text" data-testid="invitation-flat">
                <bdi dir="ltr" className="ltr-ref">
                  {v.flatCode}
                </bdi>
              </dd>
              {v.site && (
                <dd className="text-sm text-muted">
                  <bdi>{v.site}</bdi>
                </dd>
              )}
            </div>
          </dl>
          {v.expiresAt && (
            <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
              <CalendarClock aria-hidden className="size-4" />
              {t('identity:accept.expires', { date: formatCalendarDate(v.expiresAt.slice(0, 10), locale) })}
            </p>
          )}
          <p className="mt-3 flex items-start gap-1.5 border-t border-border pt-3 text-sm text-text">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
            {t('identity:accept.notYou', { name })}
          </p>
        </section>

        <section aria-labelledby="benefits">
          <h2 id="benefits" className="text-base font-semibold text-text">
            {t('identity:accept.benefitsTitle')}
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {(
              [
                ['bills', ReceiptText],
                ['receipts', BadgeCheck],
                ['household', UsersRound],
                ['privacy', KeyRound],
              ] as const
            ).map(([k, Icon]) => (
              <li key={k} className="flex items-start gap-2.5 rounded-tile bg-sunken/60 p-3 text-sm text-text">
                <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                {t(`identity:accept.benefits.${k}`)}
              </li>
            ))}
          </ul>
        </section>

        <ChoiceCards<AppLocale>
          label={t('identity:accept.language')}
          description={t('identity:accept.languageHint')}
          value={locale}
          onChange={setLocale}
          columns={2}
          testId="invitation-language"
          options={SUPPORTED_LOCALES.map((l) => ({ id: l, label: LOCALE_META[l].nativeName }))}
        />

        <section aria-labelledby="confirm" className="space-y-4 rounded-card border border-border/70 bg-panel p-5 shadow-card" data-testid="invitation-confirm">
          <div>
            <h2 id="confirm" className="text-lg font-semibold text-text">
              {t('identity:accept.confirmTitle')}
            </h2>
            <p className="mt-1 text-sm text-muted">{v.codeSentTo ? t('identity:accept.confirmBody', { to: v.codeSentTo }) : t('identity:accept.confirmBodyNoPhone')}</p>
          </div>
          {persona && (
            <InlineAlert tone="info" data-testid="invitation-signed-in">
              {t('identity:accept.signedInAs', { name: persona.displayName })}
            </InlineAlert>
          )}
          {challenge ? (
            <CodeStep
              challenge={challenge}
              submitLabel={t('identity:accept.join')}
              isPending={accept.isPending}
              error={codeError}
              onSubmit={(code) => void join(code)}
              onResend={requestCode}
              resending={sendCode.isPending}
            />
          ) : (
            <Button variant="primary" className="w-full justify-center sm:w-auto" isPending={sendCode.isPending} onPress={requestCode} data-testid="invitation-send-code">
              {t('identity:accept.sendCode')}
            </Button>
          )}
        </section>
      </div>
    </AuthFrame>
  );
}

/** Expired, already used, cancelled or unknown: why, and what to do next. */
function Closed({ state, organisation }: { state: 'expired' | 'accepted' | 'revoked' | 'not_found'; organisation?: string }) {
  const { t } = useT();
  return (
    <AuthFrame title={t('nav:pages.acceptInvitation')} organisation={organisation} testId="invitation-page">
      <div className="space-y-6" data-state={state} data-testid="invitation-closed">
        <AuthHeading title={t(`identity:accept.states.${state}.title`)} />
        <InlineAlert tone={state === 'accepted' ? 'info' : 'warning'}>{t(`identity:accept.states.${state}.body`)}</InlineAlert>
        <Link href={SIGN_IN} className="inline-flex items-center gap-1.5 font-medium">
          {t('identity:accept.signIn')}
        </Link>
      </div>
    </AuthFrame>
  );
}
