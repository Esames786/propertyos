import { Check, ChevronDown, X } from 'lucide-react';
import {
  Button as AriaButton,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
  Tag,
  TagGroup,
  TagList,
} from 'react-aria-components';
import { useController } from 'react-hook-form';
import { useT } from '../lib/useT';
import type { Option } from './ChoiceFields';
import { FieldDescription, FieldErrorText, FieldLabel } from './FieldParts';
import { useFieldMeta } from './Form';
import { fieldWrap, inputClass } from './fieldStyles';

/**
 * Multiple choice from a list: a multi-select listbox plus removable tags for what is chosen.
 * Both are keyboard operable; tags announce "Remove …" buttons.
 */
export function MultiSelectField({
  name,
  label,
  options,
  description,
  optional,
}: {
  name: string;
  label: string;
  options: Option[];
  description?: string;
  optional?: boolean;
}) {
  const { t } = useT();
  const { id } = useFieldMeta(name, label);
  const { field, fieldState } = useController({ name });
  const value: string[] = field.value ?? [];
  const chosen = options.filter((o) => value.includes(o.id));

  return (
    <div className={fieldWrap}>
      <Select
        id={id}
        selectionMode="multiple"
        value={value}
        onChange={(keys) => field.onChange(keys.map(String))}
        onBlur={field.onBlur}
        isRequired={!optional}
        isInvalid={!!fieldState.error}
        validationBehavior="aria"
        placeholder={t('forms:multiSelect.add')}
        className={fieldWrap}
      >
        <FieldLabel label={label} optional={optional} />
        <AriaButton className={inputClass('flex items-center justify-between gap-2 text-start')}>
          <SelectValue className="truncate data-placeholder:text-subtle" />
          <ChevronDown aria-hidden className="size-4 shrink-0 text-muted" />
        </AriaButton>
        <FieldDescription>{description}</FieldDescription>
        <FieldErrorText messageKey={fieldState.error?.message} />
        <Popover className="max-h-72 w-(--trigger-width) overflow-auto rounded-card border border-border bg-panel p-1 shadow-overlay">
          <ListBox items={options} className="outline-none">
            {(o) => (
              <ListBoxItem
                id={o.id}
                textValue={o.label}
                className="group flex cursor-default items-center gap-3 rounded-control px-3 py-2 text-sm text-text outline-none data-focused:bg-primary-soft pointer-coarse:py-3"
              >
                <span className="grid size-5 place-items-center rounded-sm border-2 border-border-control group-data-selected:border-primary group-data-selected:bg-primary">
                  <Check aria-hidden className="size-3.5 text-on-primary opacity-0 group-data-selected:opacity-100" strokeWidth={3} />
                </span>
                {o.label}
              </ListBoxItem>
            )}
          </ListBox>
        </Popover>
      </Select>
      {chosen.length > 0 && (
        <TagGroup
          aria-label={`${label}: ${t('forms:multiSelect.selectedLabel')}`}
          onRemove={(keys) => field.onChange(value.filter((v) => !keys.has(v)))}
        >
          <TagList items={chosen} className="flex flex-wrap gap-2">
            {(o) => (
              <Tag
                id={o.id}
                textValue={o.label}
                className="flex items-center gap-1 rounded-pill border border-border bg-sunken py-1 ps-3 pe-1 text-xs text-text outline-none data-focus-visible:outline-2 data-focus-visible:outline-focus"
              >
                {o.label}
                <AriaButton
                  slot="remove"
                  aria-label={t('forms:multiSelect.removeItem', { item: o.label })}
                  className="grid size-6 place-items-center rounded-pill text-muted data-hovered:bg-border data-hovered:text-text pointer-coarse:size-8"
                >
                  <X aria-hidden className="size-3.5" />
                </AriaButton>
              </Tag>
            )}
          </TagList>
        </TagGroup>
      )}
    </div>
  );
}
