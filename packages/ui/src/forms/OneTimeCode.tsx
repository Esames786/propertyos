import { Trans } from '@repo/i18n';
import { MessageSquareOff } from 'lucide-react';
import { Input, TextField as AriaTextField } from 'react-aria-components';
import { useT } from '../lib/useT';
import { Button } from '../primitives/Button';
import { FieldDescription, FieldErrorText, FieldLabel } from './FieldParts';
import { inputClass } from './fieldStyles';

/**
 * Six-digit one-time code (Gate D.1 sign-in and invitations): digits only, left to right, large and
 * spaced for reading back, `one-time-code` so phones offer the code from the message.
 */
export function OneTimeCodeField({
  label,
  value,
  onChange,
  description,
  errorKey,
  errorParams,
  autoFocus,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  errorKey?: string;
  errorParams?: Record<string, string>;
  autoFocus?: boolean;
  testId?: string;
}) {
  return (
    <AriaTextField
      value={value}
      onChange={(v) => onChange(v.replace(/\D/g, '').slice(0, 6))}
      isRequired
      isInvalid={!!errorKey}
      validationBehavior="aria"
      autoComplete="one-time-code"
      inputMode="numeric"
      autoFocus={autoFocus}
      className="flex max-w-xs flex-col gap-1.5"
    >
      <FieldLabel label={label} />
      <Input
        dir="ltr"
        maxLength={6}
        placeholder="••••••"
        data-testid={testId}
        className={inputClass('ltr-input min-h-14 font-mono text-2xl tracking-[0.45em] tabular')}
      />
      <FieldDescription>{description}</FieldDescription>
      <FieldErrorText messageKey={errorKey} params={errorParams} />
    </AriaTextField>
  );
}

/**
 * The prototype never sends messages: the code a real system would send is shown here, clearly
 * labelled, with a button that fills it in.
 */
export function DemoCodeNotice({
  to,
  code,
  onUse,
}: {
  to: string;
  code: string;
  onUse?: () => void;
}) {
  const { t } = useT();
  return (
    <div className="@container">
      <div
        className="flex flex-col gap-3 rounded-card border-2 border-dashed border-demo/40 bg-demo-soft p-4 @lg:flex-row @lg:items-center"
        data-testid="demo-code-notice"
      >
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-tile bg-panel text-demo shadow-card"
        >
          <MessageSquareOff className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-text">{t('identity:code.demoTitle')}</p>
          <p className="mt-0.5 text-sm text-text">
            <Trans
              t={t}
              i18nKey="identity:code.demoBody"
              values={{ to }}
              components={{ b: <bdi dir="ltr" className="ltr-ref font-semibold" /> }}
            />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 @lg:shrink-0">
          <p className="rounded-control bg-panel px-3 py-1.5 text-center shadow-card">
            <span className="block text-xs text-muted">{t('identity:code.demoCodeLabel')}</span>
            <bdi
              dir="ltr"
              className="font-mono text-lg font-bold tracking-[0.3em] text-text"
              data-testid="demo-code"
            >
              {code}
            </bdi>
          </p>
          {onUse && (
            <Button size="sm" variant="secondary" onPress={onUse} data-testid="demo-code-use">
              {t('identity:code.useIt')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
