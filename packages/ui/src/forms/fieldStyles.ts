import { cn } from '../lib/cn';

export const fieldWrap = 'flex flex-col gap-1.5';
export const labelClass = 'text-sm font-medium text-text';
export const descriptionClass = 'text-xs text-muted';
export const errorClass = 'flex items-start gap-1.5 text-sm text-error';

/** Control boundary uses the 3:1 control border token (C1); invalid state adds a thicker error border. */
export const inputClass = (extra?: string) =>
  cn(
    'w-full min-h-10 rounded-control border border-border-control bg-panel px-3 py-2 text-sm text-text pointer-coarse:min-h-11',
    'placeholder:text-subtle',
    'data-invalid:border-2 data-invalid:border-error aria-invalid:border-2 aria-invalid:border-error',
    'data-disabled:bg-sunken data-disabled:text-muted disabled:bg-sunken',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
    extra,
  );
