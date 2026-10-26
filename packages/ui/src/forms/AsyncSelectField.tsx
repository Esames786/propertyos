import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button as AriaButton, ComboBox, Input, ListBox, ListBoxItem, Popover } from 'react-aria-components';
import { useController } from 'react-hook-form';
import { useSession } from '../permissions/SessionProvider';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { Spinner } from '../primitives/Spinner';
import { FieldDescription, FieldErrorText, FieldLabel } from './FieldParts';
import { useFieldMeta } from './Form';
import { fieldWrap, inputClass } from './fieldStyles';

export interface AsyncItem {
  id: string;
  label: string;
  /** Human reference shown LTR-isolated (e.g. customer number). */
  ref?: string;
  /** Secondary context (phone, project, status). */
  detail?: string;
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/**
 * Searchable select backed by the API (blueprint 01 §2: large selects are async searchable).
 * Results show context (name + reference + phone) so the right record is chosen. Server results
 * are not re-filtered on the client, so a match on phone or CNIC is never hidden.
 */
export function AsyncSelectField({
  name,
  label,
  description,
  optional,
  load,
  renderItem,
  testId,
}: {
  name: string;
  label: string;
  description?: string;
  optional?: boolean;
  load: (query: string, signal: AbortSignal) => Promise<AsyncItem[]>;
  renderItem?: (item: AsyncItem) => ReactNode;
  testId?: string;
}) {
  const { t } = useT();
  const { id } = useFieldMeta(name, label);
  const { field, fieldState } = useController({ name });
  const selected = field.value as AsyncItem | null;
  const { persona, projectId } = useSession();
  const [input, setInput] = useState(selected?.label ?? '');
  const debounced = useDebounced(input.trim(), 250);
  const searchable = debounced.length >= 2 && debounced !== selected?.label;

  useEffect(() => {
    setInput(selected?.label ?? '');
  }, [selected?.label]);

  const query = useQuery({
    queryKey: ['async-select', name, debounced, persona?.id, projectId],
    queryFn: ({ signal }) => load(debounced, signal),
    enabled: searchable,
  });
  const items = searchable ? (query.data ?? []) : [];

  return (
    <ComboBox
      id={id}
      name={name}
      inputValue={input}
      onInputChange={setInput}
      items={items}
      selectedKey={selected?.id ?? null}
      onSelectionChange={(key) => {
        const item = items.find((i) => i.id === key) ?? null;
        field.onChange(item);
        if (item) setInput(item.label);
      }}
      onBlur={field.onBlur}
      allowsEmptyCollection
      menuTrigger="input"
      isRequired={!optional}
      isInvalid={!!fieldState.error}
      validationBehavior="aria"
      data-testid={testId}
      className={fieldWrap}
    >
      <FieldLabel label={label} optional={optional} />
      <div className="relative">
        <Input ref={field.ref} className={inputClass('pe-16')} />
        <span className="absolute inset-y-0 end-2 flex items-center gap-1">
          {query.isFetching && <Spinner className="text-muted" />}
          <AriaButton className="grid size-8 place-items-center rounded-sm text-muted data-hovered:bg-sunken">
            <ChevronDown aria-hidden className="size-4" />
          </AriaButton>
        </span>
      </div>
      <FieldDescription>{description}</FieldDescription>
      <FieldErrorText messageKey={fieldState.error?.message} />
      <Popover className="max-h-80 w-(--trigger-width) overflow-auto rounded-card border border-border bg-panel p-1 shadow-overlay">
        <ListBox
          className="outline-none"
          renderEmptyState={() => (
            <p className="px-3 py-3 text-sm text-muted">
              {query.isError
                ? t('errors:network.unavailable')
                : !searchable
                  ? t('forms:asyncSelect.typeToSearch')
                  : query.isFetching
                    ? t('common:state.searching')
                    : t('forms:asyncSelect.noResults', { query: debounced })}
            </p>
          )}
        >
          {(item: AsyncItem) => (
            <ListBoxItem
              id={item.id}
              textValue={item.label}
              className={cn(
                'flex cursor-default flex-col rounded-control px-3 py-2 text-sm outline-none data-focused:bg-primary-soft pointer-coarse:py-3',
              )}
            >
              {renderItem ? (
                renderItem(item)
              ) : (
                <>
                  {/* Block wrapper keeps alignment with the list; inline bdi keeps the name's own script order. */}
                  <span className="font-medium text-text">
                    <bdi>{item.label}</bdi>
                  </span>
                  <span className="text-xs text-muted">
                    {item.ref && <bdi dir="ltr" className="ltr-ref">{item.ref}</bdi>}
                    {item.ref && item.detail && ' · '}
                    {item.detail && <bdi dir="ltr" className="ltr-ref">{item.detail}</bdi>}
                  </span>
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}
