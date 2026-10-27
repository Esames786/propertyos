import { isPkMobile, normalizePkPhone } from '@repo/i18n';
import { Form, PhoneField, TextField, useT, zodResolver } from '@repo/ui';
import { KeyRound } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { StepActions, StepFrame } from './chrome';
import { EMAIL_PATTERN, type SetupDraft, type SetupSecrets } from './draft';
import { PasswordField } from './fields';
import { useDraftSync } from './useDraftSync';

const schema = z
  .object({
    fullName: z.string().trim().min(1, 'forms:errors.required').min(2, 'start:errors.nameShort'),
    email: z.string().trim().min(1, 'forms:errors.required').regex(EMAIL_PATTERN, 'forms:errors.emailInvalid'),
    phone: z
      .string()
      .trim()
      .min(1, 'forms:errors.required')
      .refine((v) => {
        const e164 = normalizePkPhone(v);
        return !!e164 && isPkMobile(e164);
      }, 'forms:errors.phoneInvalid'),
    password: z.string().min(1, 'forms:errors.required').min(10, 'forms:errors.passwordShort').regex(/[\d\W_]/, 'forms:errors.passwordWeak'),
    confirm: z.string().min(1, 'forms:errors.required'),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'forms:errors.passwordMismatch',
    // Compare only once both are typed (object checks are skipped by default when a field fails).
    when: (payload) => {
      const v = payload.value as { password?: unknown; confirm?: unknown } | undefined;
      return typeof v?.password === 'string' && typeof v.confirm === 'string' && v.confirm !== '';
    },
  });

export type AccountValues = z.infer<typeof schema>;

/** Step 1: who is setting up the workspace. The password stays in memory only. */
export function AccountStep({
  draft,
  secrets,
  autoFocus,
  returning,
  onChange,
  onDone,
  onBack,
}: {
  draft: SetupDraft;
  secrets: SetupSecrets;
  autoFocus: boolean;
  returning: boolean;
  onChange: (account: SetupDraft['account'], secrets: SetupSecrets) => void;
  onDone: (values: AccountValues) => void;
  onBack: () => void;
}) {
  const { t } = useT();
  const methods = useForm<AccountValues>({
    defaultValues: { ...draft.account, ...secrets },
    resolver: zodResolver(schema),
  });
  useDraftSync(methods, (v) =>
    onChange({ fullName: v.fullName ?? '', email: v.email ?? '', phone: v.phone ?? '' }, { password: v.password ?? '', confirm: v.confirm ?? '' }),
  );
  const passwordForgotten = draft.accountDone && !secrets.password;

  return (
    <StepFrame step="account" title={t('start:setup.account.heading')} intro={t('start:setup.account.intro')} autoFocus={autoFocus} testId="setup-step-account">
      <Form methods={methods} onSubmit={onDone} testId="setup-form-account">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField name="fullName" label={t('start:setup.account.fullName')} autoComplete="name" className="sm:col-span-2" />
          <TextField name="email" type="email" inputMode="email" label={t('start:setup.account.email')} description={t('start:setup.account.emailHint')} autoComplete="email" />
          <PhoneField name="phone" label={t('start:setup.account.mobile')} description={t('start:setup.account.mobileHint')} />
          <PasswordField name="password" label={t('start:setup.account.password')} description={t('start:setup.account.passwordHint')} autoComplete="new-password" showStrength testId="setup-password" />
          <PasswordField name="confirm" label={t('start:setup.account.confirm')} autoComplete="new-password" testId="setup-confirm" />
        </div>
        <p className="mt-5 flex items-start gap-2 rounded-control bg-sunken px-3 py-2.5 text-sm text-text">
          <KeyRound aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
          <span>{passwordForgotten ? t('start:setup.account.passwordAgain') : t('start:setup.account.passwordNotKept')}</span>
        </p>
        <StepActions
          onBack={onBack}
          backLabel={t('start:frame.backToStart')}
          submitLabel={returning ? t('start:setup.actions.saveReturn') : t('start:setup.actions.next')}
          pending={methods.formState.isSubmitting}
          testId="setup-account"
        />
      </Form>
    </StepFrame>
  );
}
