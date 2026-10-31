import { Check, ChevronDown, CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Button as AriaButton,
  Checkbox as AriaCheckbox,
  ListBox,
  ListBoxItem,
  Popover,
  Radio,
  RadioGroup,
  Select,
  SelectValue,
  Switch as AriaSwitch,
} from 'react-aria-components';
import { useController } from 'react-hook-form';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { FieldDescription, FieldErrorText, FieldLabel } from './FieldParts';
import { useFieldMeta } from './Form';
import { descriptionClass, errorClass, fieldWrap, inputClass, labelClass } from './fieldStyles';

export interface Option {
  id: string;
  label: string;
  description?: string;
  isDisabled?: boolean;
}

const boxClass =
  'grid size-5 shrink-0 place-items-center rounded-sm border-2 border-border-control bg-panel text-on-primary group-data-selected:border-primary group-data-selected:bg-primary group-data-invalid:border-error group-data-focus-visible:outline-2 group-data-focus-visible:outline-offset-2 group-data-focus-visible:outline-focus';

export function CheckboxField({ name, label, description }: { name: string; label: string; description?: string }) {
  const { id } = useFieldMeta(name, label);
  const { field, fieldState } = useController({ name });
  return (
    <div className={fieldWrap}>
      <AriaCheckbox
        id={id}
        name={name}
        isSelected={!!field.value}
        onChange={field.onChange}
        onBlur={field.onBlur}
        isInvalid={!!fieldState.error}
        validationBehavior="aria"
        className="group flex cursor-default items-start gap-3 text-sm text-text pointer-coarse:py-1"
      >
        <span className={boxClass}>
          <Check aria-hidden className="size-3.5 opacity-0 group-data-selected:opacity-100" strokeWidth={3} />
        </span>
        <span>{label}</span>
      </AriaCheckbox>
      {description && <p className={cn(descriptionClass, 'ms-8')}>{description}</p>}
      {fieldState.error?.message && <ErrorLine messageKey={fieldState.error.message} />}
    </div>
  );
}

function ErrorLine({ messageKey }: { messageKey: string }) {
  const { t } = useT();
  return (
    <p className={cn(errorClass, 'ms-8')}>
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{t(messageKey as 'forms:errors.required')}</span>
    </p>
  );
}

export function RadioGroupField({
  name,
  label,
  options,
  description,
  orientation = 'vertical',
  optional,
}: {
  name: string;
  label: string;
  options: Option[];
  description?: string;
  orientation?: 'vertical' | 'horizontal';
  optional?: boolean;
}) {
  const { id } = useFieldMeta(name, label);
  const { field, fieldState } = useController({ name });
  return (
    <RadioGroup
      id={id}
      name={name}
      value={field.value ?? null}
      onChange={field.onChange}
      isRequired={!optional}
      isInvalid={!!fieldState.error}
      validationBehavior="aria"
      orientation={orientation}
      className={fieldWrap}
    >
      <FieldLabel label={label} optional={optional} />
      <FieldDescription>{description}</FieldDescription>
      <div className={cn('flex gap-x-6 gap-y-2', orientation === 'vertical' ? 'flex-col' : 'flex-wrap')}>
        {options.map((o) => (
          <RadioOption key={o.id} option={o} />
        ))}
      </div>
      <FieldErrorText messageKey={fieldState.error?.message} />
    </RadioGroup>
  );
}

export function RadioOption({ option }: { option: Option }) {
  return (
    <Radio value={option.id} isDisabled={option.isDisabled} className="group flex cursor-default items-start gap-3 text-sm text-text pointer-coarse:py-1">
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-pill border-2 border-border-control bg-panel group-data-selected:border-primary group-data-focus-visible:outline-2 group-data-focus-visible:outline-offset-2 group-data-focus-visible:outline-focus">
        <span className="size-2.5 rounded-pill bg-primary opacity-0 group-data-selected:opacity-100" />
      </span>
      <span className="flex flex-col">
        <span>{option.label}</span>
        {option.description && <span className={descriptionClass}>{option.description}</span>}
      </span>
    </Radio>
  );
}

/** Plain controlled switch for settings (not bound to a form). */
export function Switch({
  isSelected,
  onChange,
  label,
  description,
  testId,
}: {
  isSelected: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <AriaSwitch isSelected={isSelected} onChange={onChange} data-testid={testId} className="group flex cursor-default items-center gap-3 text-sm font-medium text-text pointer-coarse:py-1">
        <span className="relative h-6 w-11 shrink-0 rounded-pill border-2 border-border-control bg-sunken transition-colors duration-[var(--motion-fast)] group-data-selected:border-primary group-data-selected:bg-primary group-data-focus-visible:outline-2 group-data-focus-visible:outline-offset-2 group-data-focus-visible:outline-focus">
          <span className="absolute top-0.5 start-0.5 size-4 rounded-pill bg-panel shadow-card transition-transform duration-[var(--motion-fast)] group-data-selected:translate-x-5 rtl:group-data-selected:-translate-x-5" />
        </span>
        <span>{label}</span>
      </AriaSwitch>
      {description && <p className={cn(descriptionClass, 'ms-14')}>{description}</p>}
    </div>
  );
}

/** Styled React Aria Select (single choice, keyboard and type-ahead accessible). */
export function SelectControl({
  id,
  label,
  options,
  value,
  onChange,
  isDisabled,
  isInvalid,
  optional,
  description,
  errorKey,
  placeholder,
  renderOption,
  testId,
  onBlur,
}: {
  id?: string;
  label: string;
  options: Option[];
  value: string | null;
  onChange: (id: string | null) => void;
  isDisabled?: boolean;
  isInvalid?: boolean;
  optional?: boolean;
  description?: string;
  errorKey?: string;
  placeholder?: string;
  renderOption?: (o: Option) => ReactNode;
  testId?: string;
  onBlur?: () => void;
}) {
  const { t } = useT();
  return (
    <Select
      id={id}
      selectedKey={value}
      onSelectionChange={(key) => onChange(key === null ? null : String(key))}
      isDisabled={isDisabled}
      isRequired={!optional}
      isInvalid={isInvalid}
      validationBehavior="aria"
      // React Aria has no Urdu strings; its default "Select an item" would stay English.
      placeholder={placeholder ?? t('forms:selectPlaceholder')}
      disabledKeys={options.filter((o) => o.isDisabled).map((o) => o.id)}
      onBlur={onBlur}
      data-testid={testId}
      className={fieldWrap}
    >
      <FieldLabel label={label} optional={optional} />
      <AriaButton className={inputClass('flex items-center justify-between gap-2 text-start data-invalid:border-2 data-invalid:border-error')}>
        {/* The trigger repeats the option's content; its check mark (an svg, display: block) would add a second line. */}
        <SelectValue className="truncate data-placeholder:text-subtle [&>svg]:hidden" />
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted" />
      </AriaButton>
      <FieldDescription>{description}</FieldDescription>
      <FieldErrorText messageKey={errorKey} />
      <Popover className="max-h-72 w-(--trigger-width) overflow-auto rounded-card border border-border bg-panel p-1 shadow-overlay data-entering:animate-overlay-in">
        <ListBox items={options} className="outline-none">
          {(o) => (
            <ListBoxItem
              id={o.id}
              textValue={o.label}
              className="group flex cursor-default items-center gap-2 rounded-control px-3 py-2 text-sm text-text outline-none data-focused:bg-primary-soft data-disabled:text-muted pointer-coarse:py-3"
            >
              <span className="flex-1">{renderOption ? renderOption(o) : o.label}</span>
              <Check aria-hidden className="size-4 text-primary opacity-0 group-data-selected:opacity-100" />
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  );
}

export function SelectField({
  name,
  label,
  options,
  description,
  optional,
  placeholder,
}: {
  name: string;
  label: string;
  options: Option[];
  description?: string;
  optional?: boolean;
  placeholder?: string;
}) {
  const { id } = useFieldMeta(name, label);
  const { field, fieldState } = useController({ name });
  return (
    <SelectControl
      id={id}
      label={label}
      options={options}
      value={field.value ?? null}
      onChange={field.onChange}
      onBlur={field.onBlur}
      isInvalid={!!fieldState.error}
      errorKey={fieldState.error?.message}
      optional={optional}
      description={description}
      placeholder={placeholder}
    />
  );
}

export { labelClass };
