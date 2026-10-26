import { getLocalTimeZone, parseDate, today } from '@internationalized/date';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Button as AriaButton,
  Calendar,
  CalendarCell,
  CalendarGrid,
  DateInput,
  DatePicker,
  DateSegment,
  Dialog,
  Group,
  Heading,
  Popover,
} from 'react-aria-components';
import { useController } from 'react-hook-form';
import { useT } from '../lib/useT';
import { DirectionalIcon } from '../primitives/DirectionalIcon';
import { FieldDescription, FieldErrorText, FieldLabel } from './FieldParts';
import { useFieldMeta } from './Form';
import { fieldWrap, inputClass } from './fieldStyles';

/**
 * Locale-aware date entry: typed segments (keyboard friendly, no picker required) plus an optional
 * calendar. Value is an ISO calendar date string ("2026-11-05").
 */
export function DateField({
  name,
  label,
  description,
  optional,
  disallowPast = false,
}: {
  name: string;
  label: string;
  description?: string;
  optional?: boolean;
  disallowPast?: boolean;
}) {
  const { t } = useT();
  const { id } = useFieldMeta(name, label);
  const { field, fieldState } = useController({ name });
  const parsed = safeParseDate(field.value);
  return (
    <DatePicker
      id={id}
      value={parsed}
      onChange={(d) => field.onChange(d ? d.toString() : '')}
      onBlur={field.onBlur}
      minValue={disallowPast ? today(getLocalTimeZone()) : undefined}
      isRequired={!optional}
      isInvalid={!!fieldState.error}
      validationBehavior="aria"
      className={fieldWrap}
    >
      <FieldLabel label={label} optional={optional} />
      <Group className={inputClass('flex items-center gap-2 py-1.5')}>
        <DateInput className="flex flex-1 gap-0.5">
          {(segment) => (
            <DateSegment
              segment={segment}
              className="rounded-sm px-0.5 tabular-nums outline-none data-focused:bg-primary data-focused:text-on-primary data-placeholder:text-subtle"
            />
          )}
        </DateInput>
        <AriaButton className="grid size-8 place-items-center rounded-sm text-muted data-hovered:bg-sunken pointer-coarse:size-10">
          <CalendarDays aria-hidden className="size-4" />
        </AriaButton>
      </Group>
      <FieldDescription>{description}</FieldDescription>
      <FieldErrorText messageKey={fieldState.error?.message} />
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
                  className="grid size-9 place-items-center rounded-control text-sm outline-none data-disabled:text-subtle data-outside-month:invisible data-hovered:bg-sunken data-selected:bg-primary data-selected:text-on-primary data-focus-visible:outline-2 data-focus-visible:outline-focus data-unavailable:line-through"
                />
              )}
            </CalendarGrid>
          </Calendar>
        </Dialog>
      </Popover>
    </DatePicker>
  );
}

function safeParseDate(value: unknown) {
  if (typeof value !== 'string' || !value) return null;
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}
