import { ApiError } from '@repo/contracts';
import { Trans } from '@repo/i18n';
import { Button, Form, InlineAlert, useAnnounce, useApiMutation, useT, zodResolver } from '@repo/ui';
import { MailX, PencilLine } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { StepActions, StepFrame } from './chrome';
import type { SetupDraft } from './draft';
import { CodeField } from './fields';

/** The only code the prototype accepts. Shown on screen: nothing is ever sent. */
const PROTOTYPE_CODE = '246810';

const schema = z.object({
  code: z
    .string()
    .min(1, 'forms:errors.required')
    .regex(/^\d{6}$/, 'start:errors.codeLength'),
});
type VerifyValues = z.infer<typeof schema>;

/**
 * Step 2: simulated verification. The screen says plainly that no email or SMS is sent and shows
 * the code; the check itself still goes through the API (POST /workspace/verify), like the real one.
 */
export function VerifyStep({
  draft,
  autoFocus,
  returning,
  onVerified,
  onChangeEmail,
}: {
  draft: SetupDraft;
  autoFocus: boolean;
  returning: boolean;
  onVerified: () => void;
  onChangeEmail: () => void;
}) {
  const { t } = useT();
  const announce = useAnnounce();
  const verify = useApiMutation<{ ok: true }>();
  const [failure, setFailure] = useState(false);
  const methods = useForm<VerifyValues>({ defaultValues: { code: '' }, resolver: zodResolver(schema) });

  const submit = async ({ code }: VerifyValues) => {
    setFailure(false);
    try {
      await verify.mutateAsync({ method: 'POST', path: '/workspace/verify', body: { code } });
      announce(t('start:setup.verify.accepted'));
      onVerified();
    } catch (error) {
      const fieldCode = error instanceof ApiError ? error.problem.errors?.code?.[0]?.code : undefined;
      if (fieldCode) {
        methods.setError('code', { type: 'server', message: fieldCode });
        methods.setFocus('code');
        announce(t(fieldCode as 'forms:errors.codeInvalid'), 'assertive');
      } else {
        setFailure(true);
        announce(t('start:setup.verify.failed'), 'assertive');
      }
    }
  };

  return (
    <StepFrame
      step="verify"
      title={t('start:setup.verify.heading')}
      intro={
        <p>
          <Trans
            t={t}
            i18nKey="start:setup.verify.intro"
            values={{ email: draft.account.email }}
            components={{ b: <bdi className="ltr-ref font-semibold text-text" data-testid="setup-verify-email" /> }}
          />
        </p>
      }
      autoFocus={autoFocus}
      testId="setup-step-verify"
    >
      <div className="mb-6 flex flex-col gap-4 rounded-card border-2 border-dashed border-demo/40 bg-demo-soft p-4 sm:flex-row sm:items-center sm:p-5" data-testid="setup-verify-notice">
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-tile bg-panel text-demo shadow-card">
          <MailX className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-text">{t('start:setup.verify.noMessageTitle')}</p>
          <p className="mt-0.5 text-sm text-text">{t('start:setup.verify.noMessageBody')}</p>
        </div>
        <p className="shrink-0 rounded-control bg-panel px-4 py-2 text-center shadow-card">
          <span className="block text-xs text-muted">{t('start:setup.verify.codeLabel')}</span>
          <bdi dir="ltr" className="ltr-ref block font-mono text-2xl font-bold tracking-[0.3em] text-text" data-testid="setup-verify-code">
            {PROTOTYPE_CODE}
          </bdi>
        </p>
      </div>

      <Form methods={methods} onSubmit={submit} testId="setup-form-verify">
        <CodeField name="code" label={t('start:setup.verify.code')} description={t('start:setup.verify.codeHint')} testId="setup-code" />
        <Button variant="quiet" size="sm" icon={PencilLine} onPress={onChangeEmail} className="mt-4 -ms-3" data-testid="setup-change-email">
          {t('start:setup.verify.changeEmail')}
        </Button>
        {failure && (
          <InlineAlert tone="error" role="alert" title={t('start:setup.verify.failed')} className="mt-4">
            {t('start:setup.verify.failedBody')}
          </InlineAlert>
        )}
        <StepActions
          onBack={onChangeEmail}
          submitLabel={returning ? t('start:setup.actions.verifyReturn') : t('start:setup.actions.verify')}
          pending={verify.isPending}
          testId="setup-verify"
        />
      </Form>
    </StepFrame>
  );
}
