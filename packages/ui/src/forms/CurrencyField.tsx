import { toDecimalAmount } from '@repo/i18n';
import { Group, Input, NumberField } from 'react-aria-components';
import { useController } from 'react-hook-form';
import { FieldDescription, FieldErrorText, FieldLabel } from './FieldParts';
import { useFieldMeta } from './Form';
import { fieldWrap, inputClass } from './fieldStyles';

/**
 * PKR amount. The form value is a 2-decimal string ("12500000.50"), never a float that leaves the
 * field. Formatting follows the locale; the amount itself never changes with language.
 */
export function CurrencyField({
  name,
  label,
  description,
  optional,
  currency = 'PKR',
}: {
  name: string;
  label: string;
  description?: string;
  optional?: boolean;
  currency?: string;
}) {
  const { id } = useFieldMeta(name, label);
  const { field, fieldState } = useController({ name });
  const numeric = field.value === '' || field.value == null ? Number.NaN : Number(field.value);
  return (
    <NumberField
      id={id}
      name={name}
      value={numeric}
      onChange={(n) => field.onChange(Number.isNaN(n) ? '' : toDecimalAmount(n))}
      onBlur={field.onBlur}
      minValue={0}
      formatOptions={{ style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }}
      isRequired={!optional}
      isInvalid={!!fieldState.error}
      validationBehavior="aria"
      className={fieldWrap}
    >
      <FieldLabel label={label} optional={optional} />
      <Group className="flex">
        <Input ref={field.ref} dir="ltr" className={inputClass('ltr-input')} />
      </Group>
      <FieldDescription>{description}</FieldDescription>
      <FieldErrorText messageKey={fieldState.error?.message} />
    </NumberField>
  );
}
