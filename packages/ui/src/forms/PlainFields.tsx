import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { Checkbox, Input, TextArea, TextField as AriaTextField } from 'react-aria-components';
import { cn } from '../lib/cn';
import { FieldDescription, FieldLabel } from './FieldParts';
import { fieldWrap, inputClass } from './fieldStyles';

/**
 * Controlled fields for small, local forms (a reason, a note, one amount) outside a react-hook-form
 * `<Form>`: same look, labels and descriptions as the form fields, value and change handled by the
 * caller. The server still validates; these only collect.
 */
export function PlainTextField({
  label,
  value,
  onChange,
  description,
  optional,
  isDisabled,
  inputMode,
  dir,
  placeholder,
  testId,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  optional?: boolean;
  isDisabled?: boolean;
  inputMode?: 'text' | 'numeric' | 'decimal';
  /** Latin data (IBAN, references, amounts) stays left to right inside Urdu. */
  dir?: 'ltr';
  placeholder?: string;
  testId?: string;
  className?: string;
}) {
  return (
    <AriaTextField value={value} onChange={onChange} isDisabled={isDisabled} isRequired={!optional} className={cn(fieldWrap, className)}>
      <FieldLabel label={label} optional={optional} />
      <Input inputMode={inputMode} dir={dir} placeholder={placeholder} className={inputClass(dir === 'ltr' ? 'ltr-input' : undefined)} data-testid={testId} />
      <FieldDescription>{description}</FieldDescription>
    </AriaTextField>
  );
}

export function PlainTextArea({ label, value, onChange, description, optional, rows = 3, testId, className }: { label: string; value: string; onChange: (value: string) => void; description?: string; optional?: boolean; rows?: number; testId?: string; className?: string }) {
  return (
    <AriaTextField value={value} onChange={onChange} isRequired={!optional} className={cn(fieldWrap, className)}>
      <FieldLabel label={label} optional={optional} />
      <TextArea rows={rows} className={inputClass('resize-y')} data-testid={testId} />
      <FieldDescription>{description}</FieldDescription>
    </AriaTextField>
  );
}

export function PlainCheckbox({ isSelected, onChange, isDisabled, children, testId }: { isSelected: boolean; onChange: (v: boolean) => void; isDisabled?: boolean; children: ReactNode; testId?: string }) {
  return (
    <Checkbox isSelected={isSelected} onChange={onChange} isDisabled={isDisabled} className="group flex min-h-10 cursor-default items-start gap-3 text-sm text-text data-disabled:opacity-60 pointer-coarse:min-h-11" data-testid={testId}>
      <span
        aria-hidden
        className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-sm border-2 border-border-control bg-panel text-on-primary group-data-focus-visible:outline-2 group-data-focus-visible:outline-offset-2 group-data-focus-visible:outline-focus group-data-selected:border-primary group-data-selected:bg-primary"
      >
        <Check className="size-3.5 opacity-0 group-data-selected:opacity-100" strokeWidth={3} />
      </span>
      <span className="min-w-0">{children}</span>
    </Checkbox>
  );
}
