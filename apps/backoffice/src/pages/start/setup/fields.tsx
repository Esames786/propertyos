import { cn, useFormMeta, useT } from '@repo/ui';
import { CircleAlert, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Button as AriaButton, FieldError, Input, Label, Text, TextField as AriaTextField } from 'react-aria-components';
import { useController } from 'react-hook-form';
import { passwordStrength } from './draft';

/**
 * Wizard-only fields the shared form kit does not have yet (a password with show/hide and a
 * strength hint, and a one-time code). They follow the kit's contract: visible label, error text
 * linked to the control, registration with the form's validation summary, LTR for Latin data.
 */

const inputClass = (extra?: string) =>
  cn(
    'w-full min-h-11 rounded-control border border-border-control bg-panel px-3 py-2 text-sm text-text',
    'placeholder:text-subtle data-invalid:border-2 data-invalid:border-error aria-invalid:border-2 aria-invalid:border-error',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
    extra,
  );

function useRegistered(name: string, label: string) {
  const meta = useFormMeta();
  meta.registerLabel(name, label);
  return meta.fieldId(name);
}

function ErrorText({ messageKey }: { messageKey?: string }) {
  const { t } = useT();
  if (!messageKey) return null;
  return (
    <FieldError className="flex items-start gap-1.5 text-sm text-error">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{t(messageKey as 'forms:errors.required')}</span>
    </FieldError>
  );
}

const STRENGTH = ['', 'weak', 'fair', 'good', 'strong'] as const;
const STRENGTH_BAR = ['', 'bg-error', 'bg-tile-amber', 'bg-tile-teal', 'bg-success'];

export function PasswordField({
  name,
  label,
  description,
  autoComplete,
  showStrength = false,
  testId,
}: {
  name: string;
  label: string;
  description?: string;
  autoComplete: 'new-password' | 'current-password';
  showStrength?: boolean;
  testId?: string;
}) {
  const { t } = useT();
  const id = useRegistered(name, label);
  const { field, fieldState } = useController({ name });
  const [visible, setVisible] = useState(false);
  const value = String(field.value ?? '');
  const level = showStrength ? passwordStrength(value) : 0;
  const strengthText = level ? t('start:setup.account.strength.label', { level: t(`start:setup.account.strength.${STRENGTH[level]}`) }) : '';

  return (
    <AriaTextField
      id={id}
      name={name}
      type={visible ? 'text' : 'password'}
      value={value}
      onChange={field.onChange}
      onBlur={field.onBlur}
      isRequired
      isInvalid={!!fieldState.error}
      validationBehavior="aria"
      autoComplete={autoComplete}
      className="flex flex-col gap-1.5"
    >
      <Label className="text-sm font-medium text-text">{label}</Label>
      <div className="relative">
        <Input ref={field.ref} dir="ltr" spellCheck={false} className={inputClass('ltr-input pe-12')} data-testid={testId} />
        <AriaButton
          onPress={() => setVisible((v) => !v)}
          aria-label={visible ? t('start:setup.account.hidePassword') : t('start:setup.account.showPassword')}
          aria-pressed={visible}
          className="absolute inset-y-0 end-0 grid w-11 place-items-center rounded-control text-muted outline-none data-hovered:text-text data-focus-visible:outline-2 data-focus-visible:-outline-offset-2 data-focus-visible:outline-focus"
        >
          {visible ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
        </AriaButton>
      </div>
      {showStrength && (
        <div aria-hidden className="flex gap-1 pt-0.5" data-testid={testId ? `${testId}-strength` : undefined} data-level={level}>
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={cn('h-1.5 flex-1 rounded-pill transition-colors duration-[var(--motion-fast)]', n <= level ? STRENGTH_BAR[level] : 'bg-sunken')} />
          ))}
        </div>
      )}
      {(description || strengthText) && (
        <Text slot="description" className="text-xs text-muted">
          {strengthText && <span className="font-semibold text-text">{strengthText}</span>}
          {strengthText && description ? ' ' : null}
          {description}
        </Text>
      )}
      <ErrorText messageKey={fieldState.error?.message} />
    </AriaTextField>
  );
}

/** Six-digit one-time code: digits only, LTR, large and spaced for reading back. */
export function CodeField({ name, label, description, testId }: { name: string; label: string; description?: string; testId?: string }) {
  const id = useRegistered(name, label);
  const { field, fieldState } = useController({ name });
  return (
    <AriaTextField
      id={id}
      name={name}
      value={String(field.value ?? '')}
      onChange={(v) => field.onChange(v.replace(/\D/g, '').slice(0, 6))}
      onBlur={field.onBlur}
      isRequired
      isInvalid={!!fieldState.error}
      validationBehavior="aria"
      autoComplete="one-time-code"
      inputMode="numeric"
      className="flex max-w-xs flex-col gap-1.5"
    >
      <Label className="text-sm font-medium text-text">{label}</Label>
      <Input
        ref={field.ref}
        dir="ltr"
        maxLength={6}
        placeholder="••••••"
        data-testid={testId}
        className={inputClass('ltr-input min-h-14 font-mono text-2xl tracking-[0.45em] tabular')}
      />
      {description && (
        <Text slot="description" className="text-xs text-muted">
          {description}
        </Text>
      )}
      <ErrorText messageKey={fieldState.error?.message} />
    </AriaTextField>
  );
}
