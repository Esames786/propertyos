import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  FormProvider,
  type FieldErrors,
  type FieldValues,
  type Resolver,
  type UseFormReturn,
} from 'react-hook-form';
import type { z } from 'zod';
import { useTourBusyLock } from '../onboarding/tourGuard';
import { useT } from '../lib/useT';
import { useDraft } from './useDraft';

/**
 * zod → react-hook-form resolver. Issue messages are translation keys (e.g. "forms:errors.required"),
 * so errors re-translate when the language changes and never depend on English text.
 */
export function zodResolver<TIn extends FieldValues, TOut extends FieldValues>(
  schema: z.ZodType<TOut, TIn>,
): Resolver<TIn, unknown, TOut> {
  return async (values) => {
    const result = await schema.safeParseAsync(values);
    if (result.success) return { values: result.data, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? 'root');
      errors[key] ??= { type: issue.code, message: issue.message };
    }
    return { values: {}, errors: errors as FieldErrors<TIn> };
  };
}

interface FormContextValue {
  formId: string;
  fieldId: (name: string) => string;
  registerLabel: (name: string, label: string) => void;
  labels: Map<string, string>;
}

const FormMetaContext = createContext<FormContextValue | null>(null);

export function useFormMeta(): FormContextValue {
  const ctx = useContext(FormMetaContext);
  if (!ctx) throw new Error('Form fields must be used inside <Form>');
  return ctx;
}

/** Field registers its visible label so the validation summary can name it. */
export function useFieldMeta(name: string, label: string) {
  const meta = useFormMeta();
  meta.registerLabel(name, label);
  return { id: meta.fieldId(name) };
}

/**
 * Form shell: no native validation popups (they are not translatable or reliably accessible),
 * an error summary that receives focus on a failed submit, in-memory drafts and a tour busy-lock
 * while there are unsaved entries.
 */
export function Form<TValues extends FieldValues, TOutput = TValues>({
  methods,
  onSubmit,
  children,
  draftKey,
  className,
  testId,
  id,
}: {
  methods: UseFormReturn<TValues, unknown, TOutput>;
  onSubmit: (values: TOutput) => Promise<void> | void;
  children: ReactNode;
  /** When set, entries survive back/forward navigation (in memory only, never written to storage). */
  draftKey?: string;
  className?: string;
  testId?: string;
  /** Explicit id, needed when a submit button lives outside the form (e.g. a drawer footer). */
  id?: string;
}) {
  const generatedId = useId().replace(/:/g, '');
  const formId = id ?? generatedId;
  const labels = useRef(new Map<string, string>()).current;
  const summaryRef = useRef<HTMLDivElement>(null);
  const [failedAttempt, setFailedAttempt] = useState(0);
  const { clearDraft } = useDraft(draftKey, methods as unknown as UseFormReturn<FieldValues>);
  useTourBusyLock(methods.formState.isDirty);

  const meta = useMemo<FormContextValue>(
    () => ({
      formId,
      fieldId: (name) => `${formId}-${name}`,
      registerLabel: (name, label) => labels.set(name, label),
      labels,
    }),
    [formId, labels],
  );

  // Read during render so react-hook-form re-renders this form when errors change (it only
  // notifies subscribers of formState fields that were read).
  const errors = methods.formState.errors;

  // The summary, not the first field, receives focus after a failed submit (it lists every
  // problem with links). react-hook-form's own error focusing would race it, so it is turned off.
  methods.control._options.shouldFocusError = false;

  // react-hook-form focuses the first invalid field in a zero-delay timer after onInvalid; the
  // summary is focused after that, so keyboard and screen-reader users land on the full list.
  useEffect(() => {
    if (failedAttempt === 0) return;
    const id = setTimeout(() => summaryRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [failedAttempt]);

  const submit = methods.handleSubmit(
    async (values) => {
      await onSubmit(values);
      clearDraft();
      setFailedAttempt(0);
    },
    () => setFailedAttempt((n) => n + 1),
  );

  return (
    <FormMetaContext.Provider value={meta}>
      <FormProvider {...(methods as unknown as UseFormReturn<FieldValues>)}>
        <form id={formId} noValidate onSubmit={submit} className={className} data-testid={testId}>
          {failedAttempt > 0 && <ValidationSummary ref={summaryRef} errors={errors} />}
          {children}
        </form>
      </FormProvider>
    </FormMetaContext.Provider>
  );
}

function ValidationSummary({ ref, errors }: { ref: React.Ref<HTMLDivElement>; errors: FieldErrors }) {
  const { t } = useT();
  const meta = useFormMeta();
  const entries = Object.entries(errors).filter(([, e]) => e?.message);
  const focusField = useCallback(
    (name: string) => {
      const container = document.getElementById(meta.fieldId(name));
      const target =
        container?.matches('input,textarea,select,button,[tabindex]')
          ? container
          : container?.querySelector<HTMLElement>('input,textarea,select,button,[tabindex]:not([tabindex="-1"])');
      target?.focus();
      target?.scrollIntoView({ block: 'center' });
    },
    [meta],
  );
  if (entries.length === 0) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      aria-labelledby={`${meta.formId}-summary-title`}
      data-testid="validation-summary"
      className="mb-6 rounded-card border-2 border-error bg-error-soft p-4 outline-none"
    >
      <h2 id={`${meta.formId}-summary-title`} className="text-base font-semibold text-error">
        {t('forms:summary.title', { count: entries.length })}
      </h2>
      <p className="mt-1 text-sm text-text">{t('forms:summary.intro')}</p>
      <ul className="mt-3 list-disc space-y-1 ps-5 text-sm">
        {entries.map(([name, error]) => (
          <li key={name}>
            <a
              href={`#${meta.fieldId(name)}`}
              onClick={(e) => {
                e.preventDefault();
                focusField(name);
              }}
              className="text-error underline underline-offset-2"
            >
              {meta.labels.get(name) ?? name}: {t(String(error?.message) as 'forms:errors.required')}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
