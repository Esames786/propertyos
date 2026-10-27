import { cn } from '@repo/ui';
import { Checkbox, CheckboxGroup, Label, Text } from 'react-aria-components';

/**
 * A group of checkboxes (React Aria: one tab stop per box, the group is labelled, the state is
 * announced). Used for multi-choices in HQ editors: requirements, editions, modules and sites.
 */
export function CheckList({
  label,
  hideLabel,
  description,
  options,
  value,
  onChange,
  className,
  testId,
}: {
  label: string;
  hideLabel?: boolean;
  description?: string;
  options: ReadonlyArray<{ id: string; label: string; disabled?: boolean; hint?: string }>;
  value: readonly string[];
  onChange: (next: string[]) => void;
  className?: string;
  testId?: string;
}) {
  return (
    <CheckboxGroup value={[...value]} onChange={onChange} className="space-y-2" data-testid={testId}>
      <Label className={hideLabel ? 'sr-only' : 'text-sm font-medium text-text'}>{label}</Label>
      {description && (
        <Text slot="description" className="block text-xs text-muted">
          {description}
        </Text>
      )}
      <div className={cn('grid gap-1', className)}>
        {options.map((o) => (
          <Checkbox
            key={o.id}
            value={o.id}
            isDisabled={o.disabled}
            className="group flex cursor-default items-center gap-2.5 rounded-control px-2 py-1.5 text-sm text-text outline-none data-focus-visible:outline-2 data-focus-visible:outline-focus data-disabled:text-muted pointer-coarse:min-h-11"
            data-testid={testId ? `${testId}-${o.id}` : undefined}
          >
            <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-[0.35rem] border-2 border-border-control group-data-selected:border-primary group-data-selected:bg-primary">
              <svg viewBox="0 0 16 16" className="hidden size-3.5 text-on-primary group-data-selected:block">
                <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span>
              {o.label}
              {o.hint && <span className="ms-1 text-xs text-muted">({o.hint})</span>}
            </span>
          </Checkbox>
        ))}
      </div>
    </CheckboxGroup>
  );
}
