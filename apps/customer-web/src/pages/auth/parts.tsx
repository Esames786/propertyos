import { ApiError, type SignInCodeSent } from '@repo/contracts';
import { Button, DemoCodeNotice, LocaleToggle, OneTimeCodeField, useT } from '@repo/ui';
import { Building2, RotateCcw } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * Pages a resident sees before signing in (AUTH-006, AUTH-007): the organisation they belong to,
 * the language switch, and one narrow column that reads well on a phone and at 200 % text.
 */
export function AuthFrame({ title, organisation, children, testId }: { title: string; organisation?: string; children: ReactNode; testId?: string }) {
  const { t } = useT();
  useDocumentTitle(title);
  return (
    <div className="min-h-dvh bg-bg">
      <header className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 px-4 pt-5 sm:px-6">
        <span className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-primary text-on-primary">
            <Building2 className="size-5" />
          </span>
          <span className="min-w-0 leading-tight">
            <bdi className="block text-sm font-semibold [overflow-wrap:anywhere] text-text">{organisation ?? t('common:app.productName')}</bdi>
            <span className="block text-xs text-muted">{t('dues:shell.appName')}</span>
          </span>
        </span>
        <LocaleToggle />
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-xl px-4 pt-8 pb-12 outline-none sm:px-6 sm:pt-12" data-testid={testId}>
        {children}
      </main>
    </div>
  );
}

/** The browser tab names the page and the app (these pages sit outside the portal shell). */
export function useDocumentTitle(page: string) {
  const { t } = useT();
  useEffect(() => {
    document.title = t('common:app.pageTitle', { page, app: t('dues:shell.appName') });
  }, [page, t]);
}

export function AuthHeading({ eyebrow, title, intro, id }: { eyebrow?: string; title: string; intro?: ReactNode; id?: string }) {
  return (
    <div className="space-y-2 motion-safe:animate-rise-in">
      {eyebrow && <p className="text-xs font-semibold tracking-[0.12em] text-accent uppercase">{eyebrow}</p>}
      <h1 id={id ?? 'page-title'} className="text-figure-sm leading-tight font-bold tracking-tight text-text sm:text-4xl">
        {title}
      </h1>
      {intro && <div className="text-base text-muted">{intro}</div>}
    </div>
  );
}

export interface CodeError {
  key: string;
  params?: Record<string, string>;
}

/** The server's answer to a wrong, expired or locked code, as a field error (other problems pass through). */
export function codeErrorOf(error: unknown): CodeError | null {
  if (!(error instanceof ApiError)) return null;
  const p = error.problem;
  const field = p.errors?.code?.[0];
  if (field) return { key: field.code, ...(field.params ? { params: field.params } : {}) };
  if (p.code === 'code_expired' || p.code === 'code_locked' || p.code === 'code_wrong') return { key: p.messageKey };
  return null;
}

/**
 * Enter the one-time code (simulated delivery: the demo shows it). Wrong codes use up attempts;
 * an expired or locked code asks for a new one.
 */
export function CodeStep({
  challenge,
  submitLabel,
  isPending,
  error,
  onSubmit,
  onResend,
  resending,
  extra,
}: {
  challenge: SignInCodeSent;
  submitLabel: string;
  isPending: boolean;
  error: CodeError | null;
  onSubmit: (code: string) => void;
  onResend: () => void;
  resending: boolean;
  extra?: ReactNode;
}) {
  const { t } = useT();
  const [code, setCode] = useState('');
  const [local, setLocal] = useState<CodeError | null>(null);
  const shown = local ?? error;
  const needsNew = shown?.key === 'identity:code.expired' || shown?.key === 'identity:code.locked';
  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length !== 6) {
          setLocal({ key: 'identity:code.required' });
          return;
        }
        setLocal(null);
        onSubmit(code);
      }}
      data-testid="code-step"
    >
      <DemoCodeNotice to={challenge.sentTo} code={challenge.demoCode} onUse={() => setCode(challenge.demoCode)} />
      <OneTimeCodeField
        label={t('identity:code.label')}
        description={t('identity:code.hint')}
        value={code}
        onChange={(v) => {
          setCode(v);
          if (local) setLocal(null);
        }}
        errorKey={shown?.key}
        errorParams={shown?.params}
        autoFocus
        testId="code-input"
      />
      {extra}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" variant="primary" className="w-full justify-center sm:w-auto" isPending={isPending} isDisabled={needsNew} data-testid="code-submit">
          {submitLabel}
        </Button>
        <Button
          variant="quiet"
          icon={RotateCcw}
          className="w-full justify-center sm:w-auto"
          isPending={resending}
          onPress={() => {
            setCode('');
            setLocal(null);
            onResend();
          }}
          data-testid="code-resend"
        >
          {t('identity:code.resend')}
        </Button>
      </div>
    </form>
  );
}
