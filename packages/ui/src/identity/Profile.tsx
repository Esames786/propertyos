import { ApiError, type ContactChannel, type ContactConsent, type MyProfile } from '@repo/contracts';
import { formatInstant, formatPkPhone, useLocale } from '@repo/i18n';
import { Building2, House, KeyRound, Save } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useAnnounce } from '../a11y/LiveAnnouncer';
import { Badge } from '../data/StatusLabel';
import { useApiQuery } from '../data/TransportProvider';
import { useApiMutation } from '../data/useApi';
import { Skeleton } from '../feedback/Skeleton';
import { ErrorState } from '../feedback/States';
import { useToast } from '../feedback/Toast';
import { Switch } from '../forms/ChoiceFields';
import { PlainTextField } from '../forms/PlainFields';
import { Panel } from '../layout/Panel';
import { useT } from '../lib/useT';
import { Button } from '../primitives/Button';

const CHANNELS: readonly ContactChannel[] = ['sms', 'whatsapp', 'email'];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

/** The signed-in person's profile (GLOBAL-008, PORTAL-024): who they are here. */
export function useMyProfile() {
  return useApiQuery<MyProfile>({ method: 'GET', path: '/me/profile' });
}

/**
 * Profile (GLOBAL-008 in the office app, PORTAL-024 in the resident app): who the person is in this
 * organisation, their contact details and which channels they agree to for service messages, and how
 * they sign in. The server checks every change again (a message channel needs a number).
 */
export function ProfileDetails({ aside }: { aside?: ReactNode }) {
  const { t } = useT();
  const { locale } = useLocale();
  const query = useMyProfile();
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const p = query.data;
  if (!p)
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  return (
    <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_20rem]" data-testid="profile-details">
      <div className="min-w-0 space-y-6">
        <section aria-labelledby="profile-who" className="rounded-card border border-border/70 bg-panel p-5 shadow-card sm:p-6">
          <h2 id="profile-who" className="sr-only">
            {t('identity:profile.details')}
          </h2>
          <div className="flex flex-wrap items-center gap-4">
            <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-pill bg-primary text-lg font-semibold text-on-primary">
              {initials(p.displayName)}
            </span>
            <div className="min-w-0">
              <p className="text-lg font-semibold text-text">
                <bdi>{p.displayName}</bdi>
              </p>
              <p className="text-sm text-muted">{t(p.roleKey as 'common:persona.manager')}</p>
            </div>
          </div>
          <dl className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs text-muted">
                <Building2 aria-hidden className="size-4 shrink-0" />
                {t('identity:profile.organisation')}
              </dt>
              <dd className="text-sm font-medium text-text">
                <bdi>{p.organisation}</bdi>
              </dd>
            </div>
            {p.flats && p.flats.length > 0 && (
              <div className="min-w-0">
                <dt className="flex items-center gap-1.5 text-xs text-muted">
                  <House aria-hidden className="size-4 shrink-0" />
                  {t('identity:profile.flats')}
                </dt>
                <dd className="text-sm font-medium text-text" data-testid="profile-flats">
                  <bdi dir="ltr" className="ltr-ref">
                    {p.flats.join(', ')}
                  </bdi>
                </dd>
              </div>
            )}
          </dl>
        </section>
        <ContactForm profile={p} />
      </div>
      <div className="min-w-0 space-y-6">
        {aside}
        <Panel title={t('identity:profile.signIn.title')}>
          <ul className="space-y-3" data-testid="profile-sign-in-methods">
            {p.signInMethods.map((m) => (
              <li key={m.kind} className="flex items-start gap-2.5">
                <KeyRound aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-text">
                    {t(`identity:profile.signIn.${m.kind}`)}
                    <Badge tone={m.enabled ? 'success' : 'neutral'}>{m.enabled ? t('identity:profile.signIn.on') : t('identity:profile.signIn.off')}</Badge>
                  </p>
                  {m.lastUsedAt && <p className="text-xs text-muted">{t('identity:profile.signIn.lastUsed', { date: formatInstant(m.lastUsedAt, locale, 'dateTime') })}</p>}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">{t('identity:profile.signIn.simulated')}</p>
        </Panel>
      </div>
    </div>
  );
}

function ContactForm({ profile }: { profile: MyProfile }) {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const save = useApiMutation<{ ok: true }>();
  const [phone, setPhone] = useState(profile.phone ? formatPkPhone(profile.phone) : '');
  const [email, setEmail] = useState(profile.email);
  const [consents, setConsents] = useState<ContactConsent[]>(profile.consents);
  const [errors, setErrors] = useState<{ phone?: string; email?: string }>({});
  // A refetch after saving (or a change in another tab) resets the form to what the server holds.
  useEffect(() => {
    setPhone(profile.phone ? formatPkPhone(profile.phone) : '');
    setEmail(profile.email);
    setConsents(profile.consents);
  }, [profile]);
  const consented = (c: ContactChannel) => consents.find((x) => x.channel === c)?.consented ?? false;

  return (
    <Panel title={t('identity:profile.contact.title')} description={t('identity:profile.contact.intro')}>
      <form
        className="space-y-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setErrors({});
          save.mutate(
            { method: 'PATCH', path: '/me/contact', body: { phone, email, consents } },
            {
              onSuccess: () => {
                toast.success(t('identity:profile.contact.saved'));
                announce(t('identity:profile.contact.saved'));
              },
              onError: (err) => {
                const fields = err instanceof ApiError ? err.problem.errors : undefined;
                const next = { phone: fields?.phone?.[0]?.code, email: fields?.email?.[0]?.code };
                setErrors(next);
                if (next.phone || next.email) announce(t((next.phone ?? next.email) as 'forms:errors.required'), 'assertive');
              },
            },
          );
        }}
        data-testid="contact-form"
      >
        <div className="grid gap-4 @xl:grid-cols-2">
          <PlainTextField label={t('identity:profile.contact.phone')} value={phone} onChange={setPhone} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" optional errorKey={errors.phone} testId="contact-phone" />
          <PlainTextField label={t('identity:profile.contact.email')} value={email} onChange={setEmail} type="email" autoComplete="email" dir="ltr" errorKey={errors.email} testId="contact-email" />
        </div>
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-text">{t('identity:profile.consents.title')}</legend>
          <p className="text-xs text-muted">{t('identity:profile.consents.hint')}</p>
          {CHANNELS.map((c) => (
            <Switch
              key={c}
              isSelected={consented(c)}
              onChange={(v) => setConsents((cur) => (cur.some((x) => x.channel === c) ? cur.map((x) => (x.channel === c ? { ...x, consented: v } : x)) : [...cur, { channel: c, consented: v }]))}
              label={t(`identity:profile.consents.${c}`)}
              testId={`consent-${c}`}
            />
          ))}
        </fieldset>
        <Button type="submit" variant="primary" icon={Save} className="max-w-full whitespace-normal text-start" isPending={save.isPending} data-testid="contact-save">
          {t('identity:profile.contact.save')}
        </Button>
      </form>
    </Panel>
  );
}
