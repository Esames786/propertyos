import { parseDate } from '@internationalized/date';
import { toDecimalAmount } from '@repo/i18n';
import { cn, DirectionalIcon, useT } from '@repo/ui';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Button as AriaButton,
  Calendar,
  CalendarCell,
  CalendarGrid,
  DateInput as DateInput_,
  DatePicker,
  DateSegment,
  Dialog,
  FieldError,
  Group,
  Heading,
  Input,
  Label,
  NumberField,
  Popover,
  Text,
  TextField,
} from 'react-aria-components';

/** Same look as the shared form fields (packages/ui fieldStyles), for controlled inputs outside a form. */
export const inputClass = (extra?: string) =>
  cn(
    'w-full min-h-10 rounded-control border border-border-control bg-panel px-3 py-2 text-sm text-text pointer-coarse:min-h-11',
    'placeholder:text-subtle data-invalid:border-2 data-invalid:border-error aria-invalid:border-2 aria-invalid:border-error',
    'data-disabled:bg-sunken data-disabled:text-muted disabled:bg-sunken',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus data-focused:outline-2 data-focused:outline-offset-2 data-focused:outline-focus',
    extra,
  );

const labelClass = (hidden?: boolean) => (hidden ? 'sr-only' : 'text-sm font-medium text-text');

interface Base {
  label: string;
  hideLabel?: boolean;
  description?: string;
  isInvalid?: boolean;
  /** Shown (and announced with the field) only while it is invalid. */
  errorMessage?: string;
  isDisabled?: boolean;
  testId?: string;
  className?: string;
}

/** A PKR amount as a fixed-decimal string ("1500.00"); the value never changes with locale. */
export function MoneyInput({ value, onChange, min = 0, ...b }: Base & { value: string; onChange: (amount: string) => void; min?: number }) {
  const numeric = value === '' ? Number.NaN : Number(value);
  return (
    <NumberField
      value={numeric}
      onChange={(n) => onChange(Number.isNaN(n) ? '' : toDecimalAmount(n))}
      minValue={min}
      formatOptions={{ style: 'currency', currency: 'PKR', minimumFractionDigits: 2, maximumFractionDigits: 2 }}
      isInvalid={b.isInvalid}
      isDisabled={b.isDisabled}
      className={cn('flex flex-col gap-1.5', b.className)}
      data-testid={b.testId}
    >
      <Label className={labelClass(b.hideLabel)}>{b.label}</Label>
      <Group className="flex">
        <Input dir="ltr" className={inputClass('ltr-input tabular')} />
      </Group>
      {b.errorMessage && <FieldError className="text-sm text-error">{b.errorMessage}</FieldError>}
      {b.description && (
        <Text slot="description" className="text-xs text-muted">
          {b.description}
        </Text>
      )}
    </NumberField>
  );
}

/** A whole number (flats, seats, months…). */
export function CountInput({ value, onChange, min = 0, max, step = 1, ...b }: Base & { value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <NumberField
      value={value}
      onChange={(n) => onChange(Number.isNaN(n) ? min : n)}
      minValue={min}
      maxValue={max}
      step={step}
      isInvalid={b.isInvalid}
      isDisabled={b.isDisabled}
      className={cn('flex flex-col gap-1.5', b.className)}
      data-testid={b.testId}
    >
      <Label className={labelClass(b.hideLabel)}>{b.label}</Label>
      <Group className="flex">
        <Input dir="ltr" className={inputClass('ltr-input tabular')} />
      </Group>
      {b.errorMessage && <FieldError className="text-sm text-error">{b.errorMessage}</FieldError>}
      {b.description && (
        <Text slot="description" className="text-xs text-muted">
          {b.description}
        </Text>
      )}
    </NumberField>
  );
}

function safeParse(iso: string) {
  try {
    return iso ? parseDate(iso.slice(0, 10)) : null;
  } catch {
    return null;
  }
}

/**
 * A calendar date (ISO yyyy-mm-dd): typed segments in the app's locale (day/month/year for en-PK,
 * mirrored for Urdu) plus an optional calendar, like the shared DateField but controlled.
 */
export function DateInput({ value, onChange, optional, ...b }: Base & { value: string; onChange: (iso: string) => void; optional?: boolean }) {
  const { t } = useT();
  return (
    <DatePicker
      value={safeParse(value)}
      onChange={(d) => onChange(d ? d.toString() : '')}
      isInvalid={b.isInvalid}
      isDisabled={b.isDisabled}
      isRequired={!optional}
      className={cn('flex min-w-0 flex-col gap-1.5', b.className)}
      data-testid={b.testId}
    >
      <Label className={labelClass(b.hideLabel)}>{b.label}</Label>
      <Group className={inputClass('flex min-w-[9.5rem] items-center gap-1 py-1.5')}>
        <DateInput_ className="flex flex-1 gap-0.5 tabular">
          {(segment) => (
            <DateSegment segment={segment} className="rounded-sm px-0.5 tabular-nums outline-none data-focused:bg-primary data-focused:text-on-primary data-placeholder:text-subtle" />
          )}
        </DateInput_>
        <AriaButton aria-label={t('platform:inputs.openCalendar')} className="grid size-8 shrink-0 place-items-center rounded-sm text-muted outline-none data-hovered:bg-sunken data-focus-visible:outline-2 data-focus-visible:outline-focus pointer-coarse:size-10">
          <CalendarDays aria-hidden className="size-4" />
        </AriaButton>
      </Group>
      {b.errorMessage && <FieldError className="text-sm text-error">{b.errorMessage}</FieldError>}
      {b.description && (
        <Text slot="description" className="text-xs text-muted">
          {b.description}
        </Text>
      )}
      <Popover className="rounded-card border border-border bg-panel p-3 shadow-overlay">
        <Dialog className="outline-none">
          <Calendar>
            <header className="mb-2 flex items-center justify-between gap-2">
              <AriaButton slot="previous" aria-label={t('common:actions.back')} className="grid size-9 place-items-center rounded-control data-hovered:bg-sunken">
                <DirectionalIcon icon={ChevronLeft} className="size-4" />
              </AriaButton>
              <Heading className="text-sm font-semibold" />
              <AriaButton slot="next" aria-label={t('common:actions.next')} className="grid size-9 place-items-center rounded-control data-hovered:bg-sunken">
                <DirectionalIcon icon={ChevronRight} className="size-4" />
              </AriaButton>
            </header>
            <CalendarGrid className="border-separate border-spacing-1">
              {(date) => (
                <CalendarCell
                  date={date}
                  className="grid size-9 place-items-center rounded-control text-sm outline-none data-outside-month:invisible data-hovered:bg-sunken data-selected:bg-primary data-selected:text-on-primary data-focus-visible:outline-2 data-focus-visible:outline-focus"
                />
              )}
            </CalendarGrid>
          </Calendar>
        </Dialog>
      </Popover>
    </DatePicker>
  );
}

/** Plain text (names, reasons). */
export function TextInput({
  value,
  onChange,
  optional,
  type = 'text',
  autoComplete,
  ...b
}: Base & { value: string; onChange: (v: string) => void; optional?: boolean; type?: 'text' | 'email' | 'tel'; autoComplete?: string }) {
  return (
    <TextField
      value={value}
      onChange={onChange}
      type={type}
      autoComplete={autoComplete}
      isInvalid={b.isInvalid}
      isDisabled={b.isDisabled}
      isRequired={!optional}
      className={cn('flex flex-col gap-1.5', b.className)}
      data-testid={b.testId}
    >
      <Label className={labelClass(b.hideLabel)}>{b.label}</Label>
      <Input dir={type === 'email' || type === 'tel' ? 'ltr' : undefined} className={inputClass(type === 'email' || type === 'tel' ? 'ltr-input' : undefined)} />
      {b.errorMessage && <FieldError className="text-sm text-error">{b.errorMessage}</FieldError>}
      {b.description && (
        <Text slot="description" className="text-xs text-muted">
          {b.description}
        </Text>
      )}
    </TextField>
  );
}
