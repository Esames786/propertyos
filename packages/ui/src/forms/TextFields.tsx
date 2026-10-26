import { formatPkPhone, maskCnic, normalizePkPhone } from '@repo/i18n';
import { Input, TextArea, TextField as AriaTextField } from 'react-aria-components';
import { useController } from 'react-hook-form';
import { cn } from '../lib/cn';
import { FieldDescription, FieldErrorText, FieldLabel } from './FieldParts';
import { useFieldMeta } from './Form';
import { fieldWrap, inputClass } from './fieldStyles';

interface BaseFieldProps {
  name: string;
  label: string;
  description?: string;
  optional?: boolean;
  autoComplete?: string;
  className?: string;
}

export function TextField({
  name,
  label,
  description,
  optional,
  autoComplete,
  type = 'text',
  inputMode,
  className,
}: BaseFieldProps & { type?: 'text' | 'email' | 'tel'; inputMode?: 'text' | 'email' | 'tel' | 'numeric' }) {
  const { id } = useFieldMeta(name, label);
  const { field, fieldState } = useController({ name });
  return (
    <AriaTextField
      id={id}
      name={name}
      type={type}
      value={field.value ?? ''}
      onChange={field.onChange}
      onBlur={field.onBlur}
      isRequired={!optional}
      isInvalid={!!fieldState.error}
      validationBehavior="aria"
      autoComplete={autoComplete}
      inputMode={inputMode}
      className={cn(fieldWrap, className)}
    >
      <FieldLabel label={label} optional={optional} />
      <Input ref={field.ref} className={inputClass(type === 'email' ? 'ltr-input' : undefined)} />
      <FieldDescription>{description}</FieldDescription>
      <FieldErrorText messageKey={fieldState.error?.message} />
    </AriaTextField>
  );
}

export function TextAreaField({ name, label, description, optional, className, rows = 3 }: BaseFieldProps & { rows?: number }) {
  const { id } = useFieldMeta(name, label);
  const { field, fieldState } = useController({ name });
  return (
    <AriaTextField
      id={id}
      name={name}
      value={field.value ?? ''}
      onChange={field.onChange}
      onBlur={field.onBlur}
      isRequired={!optional}
      isInvalid={!!fieldState.error}
      validationBehavior="aria"
      className={cn(fieldWrap, className)}
    >
      <FieldLabel label={label} optional={optional} />
      <TextArea ref={field.ref} rows={rows} className={inputClass('resize-y')} />
      <FieldDescription>{description}</FieldDescription>
      <FieldErrorText messageKey={fieldState.error?.message} />
    </AriaTextField>
  );
}

/**
 * Pakistani phone. Typed freely (0300…, +92…, with spaces); normalised to E.164 on blur and shown
 * grouped. The input is LTR so digits never reorder inside Urdu layout.
 */
export function PhoneField({ name, label, description, optional, className }: BaseFieldProps) {
  const { id } = useFieldMeta(name, label);
  const { field, fieldState } = useController({ name });
  return (
    <AriaTextField
      id={id}
      name={name}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={field.value ?? ''}
      onChange={field.onChange}
      onBlur={() => {
        const e164 = normalizePkPhone(field.value ?? '');
        if (e164) field.onChange(formatPkPhone(e164));
        field.onBlur();
      }}
      isRequired={!optional}
      isInvalid={!!fieldState.error}
      validationBehavior="aria"
      className={cn(fieldWrap, className)}
    >
      <FieldLabel label={label} optional={optional} />
      <Input ref={field.ref} dir="ltr" placeholder="0300 1234567" className={inputClass('ltr-input')} />
      <FieldDescription>{description}</FieldDescription>
      <FieldErrorText messageKey={fieldState.error?.message} />
    </AriaTextField>
  );
}

/** CNIC with a progressive #####-#######-# mask; accepts pasted values with or without dashes. */
export function CnicField({ name, label, description, optional, className }: BaseFieldProps) {
  const { id } = useFieldMeta(name, label);
  const { field, fieldState } = useController({ name });
  return (
    <AriaTextField
      id={id}
      name={name}
      inputMode="numeric"
      autoComplete="off"
      value={field.value ?? ''}
      onChange={(v) => field.onChange(maskCnic(v))}
      onBlur={field.onBlur}
      isRequired={!optional}
      isInvalid={!!fieldState.error}
      validationBehavior="aria"
      className={cn(fieldWrap, className)}
    >
      <FieldLabel label={label} optional={optional} />
      <Input ref={field.ref} dir="ltr" maxLength={15} placeholder="12345-1234567-1" className={inputClass('ltr-input tabular')} />
      <FieldDescription>{description}</FieldDescription>
      <FieldErrorText messageKey={fieldState.error?.message} />
    </AriaTextField>
  );
}
