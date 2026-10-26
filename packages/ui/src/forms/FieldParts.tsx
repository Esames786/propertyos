import { CircleAlert } from 'lucide-react';
import { FieldError, Label, Text } from 'react-aria-components';
import { useT } from '../lib/useT';
import { descriptionClass, errorClass, labelClass } from './fieldStyles';

/** Persistent visible label; optional fields are marked (required is the default). */
export function FieldLabel({ label, optional }: { label: string; optional?: boolean }) {
  const { t } = useT();
  return (
    <Label className={labelClass}>
      {label}
      {optional && <span className="ms-1 font-normal text-muted">({t('common:state.optional')})</span>}
    </Label>
  );
}

export function FieldDescription({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <Text slot="description" className={descriptionClass}>
      {children}
    </Text>
  );
}

/** Error text linked to the control by React Aria (aria-describedby); icon + text, not colour alone. */
export function FieldErrorText({ messageKey }: { messageKey?: string; }) {
  const { t } = useT();
  if (!messageKey) return null;
  return (
    <FieldError className={errorClass}>
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{t(messageKey as 'forms:errors.required')}</span>
    </FieldError>
  );
}

/** Plain error paragraph for composite fields (fieldset) that are not a single React Aria field. */
export function StandaloneError({ id, messageKey, params }: { id: string; messageKey?: string; params?: Record<string, string> }) {
  const { t } = useT();
  if (!messageKey) return null;
  return (
    <p id={id} className={errorClass}>
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{t(messageKey as 'forms:errors.required', params)}</span>
    </p>
  );
}
