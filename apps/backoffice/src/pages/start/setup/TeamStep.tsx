import { WORKSPACE_ROLES, type WorkspaceRole } from '@repo/contracts';
import { Button, Form, IconButton, SelectField, TextField, useAnnounce, useT, zodResolver } from '@repo/ui';
import { MailX, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { StepActions, StepFrame } from './chrome';
import { EMAIL_PATTERN, MAX_INVITES, newRow, type InviteRow, type SetupDraft } from './draft';
import { useDraftSync } from './useDraftSync';

type TeamValues = Record<string, string | null>;

const emailName = (key: string) => `email_${key}`;
const roleName = (key: string) => `role_${key}`;

/** One flat field per row (the form kit's summary and resolver work on top-level names). */
function teamSchema(keys: readonly string[]) {
  const shape: Record<string, z.ZodType<string | null>> = {};
  for (const key of keys) {
    shape[emailName(key)] = z.string().trim().min(1, 'forms:errors.required').regex(EMAIL_PATTERN, 'forms:errors.emailInvalid');
    shape[roleName(key)] = z
      .string()
      .nullable()
      .refine((v) => WORKSPACE_ROLES.includes(v as WorkspaceRole), 'forms:errors.selectOne');
  }
  return z.object(shape).superRefine((values, ctx) => {
    const seen = new Set<string>();
    for (const key of keys) {
      const email = String(values[emailName(key)] ?? '').trim().toLowerCase();
      if (!email) continue;
      if (seen.has(email)) ctx.addIssue({ code: 'custom', path: [emailName(key)], message: 'start:errors.duplicateEmail' });
      seen.add(email);
    }
  });
}

/** Step 5 (optional): colleagues and their roles. No invitation is sent in the prototype. */
export function TeamStep({
  draft,
  autoFocus,
  returning,
  onChange,
  onDone,
  onSkip,
  onBack,
}: {
  draft: SetupDraft;
  autoFocus: boolean;
  returning: boolean;
  onChange: (invites: InviteRow[]) => void;
  onDone: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const { t } = useT();
  const announce = useAnnounce();
  const [keys, setKeys] = useState(() => draft.invites.map((r) => r.key));
  const keysRef = useRef(keys);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);

  const methods = useForm<TeamValues>({
    defaultValues: Object.fromEntries(draft.invites.flatMap((r) => [[emailName(r.key), r.email], [roleName(r.key), r.role]])),
    // The rows change while the form is open, so the schema is built for the current rows on each check.
    resolver: (values, context, options) => (zodResolver(teamSchema(keysRef.current)) as unknown as Resolver<TeamValues>)(values, context, options),
  });

  const rowsFrom = (values: Partial<TeamValues>, rowKeys: readonly string[]): InviteRow[] =>
    rowKeys.map((key) => ({ key, email: String(values[emailName(key)] ?? ''), role: (values[roleName(key)] as WorkspaceRole | null) ?? null }));

  useDraftSync(methods, (values) => onChange(rowsFrom(values as Partial<TeamValues>, keysRef.current)));

  useEffect(() => {
    keysRef.current = keys;
  }, [keys]);

  useEffect(() => {
    if (!focusKey) return;
    methods.setFocus(emailName(focusKey));
    setFocusKey(null);
  }, [focusKey, methods]);

  const add = () => {
    if (keys.length >= MAX_INVITES) return;
    const row = newRow();
    const nextKeys = [...keys, row.key];
    keysRef.current = nextKeys;
    setKeys(nextKeys);
    setFocusKey(row.key);
    onChange(rowsFrom(methods.getValues(), nextKeys));
    announce(t('start:setup.team.added', { n: nextKeys.length }));
  };

  const remove = (key: string, index: number) => {
    const nextKeys = keys.filter((k) => k !== key);
    keysRef.current = nextKeys;
    methods.unregister([emailName(key), roleName(key)]);
    setKeys(nextKeys);
    onChange(rowsFrom(methods.getValues(), nextKeys));
    announce(t('start:setup.team.removed', { n: index + 1 }));
    const previous = nextKeys[Math.max(0, index - 1)];
    if (previous) setFocusKey(previous);
    else addRef.current?.focus();
  };

  const roleOptions = WORKSPACE_ROLES.map((id) => ({ id, label: t(`start:setup.team.roles.${id}`) }));

  return (
    <StepFrame step="team" title={t('start:setup.team.heading')} intro={t('start:setup.team.intro')} autoFocus={autoFocus} testId="setup-step-team">
      <Form methods={methods} onSubmit={onDone} testId="setup-form-team">
        <p className="mb-5 flex items-start gap-2 rounded-control bg-demo-soft px-3 py-2.5 text-sm text-text">
          <MailX aria-hidden className="mt-0.5 size-4 shrink-0 text-demo" />
          <span>{t('start:setup.team.noInvites')}</span>
        </p>
        <ol className="space-y-4" data-testid="setup-team-rows">
          {keys.map((key, i) => (
            <li key={key} className="rounded-tile border border-border bg-raised p-4" data-testid="setup-team-row">
              <div className="mb-3 flex min-h-10 items-center justify-between gap-3">
                <p aria-hidden className="text-sm font-semibold text-text">
                  {t('start:setup.team.person', { n: i + 1 })}
                </p>
                {keys.length > 1 && (
                  <IconButton icon={Trash2} label={t('start:setup.team.remove', { n: i + 1 })} onPress={() => remove(key, i)} data-testid={`setup-team-remove-${i}`} className="-me-2" />
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]">
                <TextField name={emailName(key)} type="email" inputMode="email" label={t('start:setup.team.email', { n: i + 1 })} autoComplete="off" />
                <SelectField name={roleName(key)} label={t('start:setup.team.role', { n: i + 1 })} options={roleOptions} />
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            ref={addRef}
            variant="secondary"
            icon={Plus}
            onPress={add}
            isDisabled={keys.length >= MAX_INVITES}
            disabledReason={t('start:setup.team.max', { max: MAX_INVITES })}
            data-testid="setup-team-add"
          >
            {t('start:setup.team.add')}
          </Button>
        </div>
        <StepActions
          onBack={onBack}
          onSkip={onSkip}
          submitLabel={returning ? t('start:setup.actions.saveReturn') : t('start:setup.actions.next')}
          testId="setup-team"
        />
      </Form>
    </StepFrame>
  );
}

