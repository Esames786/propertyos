import { ORGANISATION_TYPES, type OrganisationType } from '@repo/contracts';
import { isValidPkPhone, LOCALE_META, SUPPORTED_LOCALES, type AppLocale } from '@repo/i18n';
import { Form, PhoneField, RadioGroupField, SelectField, TextField, useT, zodResolver } from '@repo/ui';
import { Clock3, Coins, Lock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { StepActions, StepFrame } from './chrome';
import { CITIES, type City, type SetupDraft } from './draft';
import { useDraftSync } from './useDraftSync';

const schema = z.object({
  name: z.string().trim().min(1, 'forms:errors.required').min(2, 'start:errors.nameShort'),
  type: z
    .string()
    .nullable()
    .refine((v) => ORGANISATION_TYPES.includes(v as OrganisationType), 'forms:errors.selectOne'),
  city: z
    .string()
    .nullable()
    .refine((v) => CITIES.includes(v as City), 'forms:errors.selectOne'),
  officePhone: z.string().trim().refine((v) => v === '' || isValidPkPhone(v), 'forms:errors.phoneInvalid'),
  language: z.enum(['en-PK', 'ur-PK'], { message: 'forms:errors.selectOne' }),
});
type OrganisationValues = z.input<typeof schema>;

/** Step 3: the developer company. Currency and time zone are fixed in the prototype and say so. */
export function OrganisationStep({
  draft,
  autoFocus,
  returning,
  onChange,
  onDone,
  onBack,
}: {
  draft: SetupDraft;
  autoFocus: boolean;
  returning: boolean;
  onChange: (organisation: SetupDraft['organisation']) => void;
  onDone: () => void;
  onBack: () => void;
}) {
  const { t } = useT();
  const methods = useForm<OrganisationValues>({ defaultValues: { ...draft.organisation }, resolver: zodResolver(schema) });
  useDraftSync(methods, (v) =>
    onChange({
      name: v.name ?? '',
      type: (v.type as OrganisationType | null) ?? null,
      city: (v.city as City | null) ?? null,
      officePhone: v.officePhone ?? '',
      language: (v.language as AppLocale) ?? draft.organisation.language,
    }),
  );

  return (
    <StepFrame step="organisation" title={t('start:setup.organisation.heading')} intro={t('start:setup.organisation.intro')} autoFocus={autoFocus} testId="setup-step-organisation">
      <Form methods={methods} onSubmit={onDone} testId="setup-form-organisation">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField name="name" label={t('start:setup.organisation.name')} description={t('start:setup.organisation.nameHint')} autoComplete="organization" className="sm:col-span-2" />
          <SelectField
            name="type"
            label={t('start:setup.organisation.type')}
            options={ORGANISATION_TYPES.map((id) => ({ id, label: t(`start:setup.organisation.types.${id}`) }))}
          />
          <SelectField name="city" label={t('start:setup.organisation.city')} options={CITIES.map((id) => ({ id, label: t(`start:cities.${id}`) }))} />
          <PhoneField name="officePhone" label={t('start:setup.organisation.officePhone')} description={t('start:setup.organisation.officePhoneHint')} optional />
          <RadioGroupField
            name="language"
            label={t('start:setup.organisation.language')}
            description={t('start:setup.organisation.languageHint')}
            orientation="horizontal"
            options={SUPPORTED_LOCALES.map((id) => ({ id, label: LOCALE_META[id].nativeName }))}
          />
        </div>

        <ul aria-label={t('start:setup.organisation.fixedLabel')} className="mt-6 grid gap-3 sm:grid-cols-2">
          <FixedValue icon={Coins} label={t('start:setup.organisation.currency')} value={t('start:setup.organisation.currencyValue')} />
          <FixedValue icon={Clock3} label={t('start:setup.organisation.timeZone')} value={t('start:setup.organisation.timeZoneValue')} />
        </ul>

        <StepActions
          onBack={onBack}
          submitLabel={returning ? t('start:setup.actions.saveReturn') : t('start:setup.actions.next')}
          testId="setup-organisation"
        />
      </Form>
    </StepFrame>
  );
}

function FixedValue({ icon: Icon, label, value }: { icon: typeof Coins; label: string; value: string }) {
  const { t } = useT();
  return (
    <li className="flex items-start gap-3 rounded-tile border border-border bg-raised p-3.5">
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
      <div className="min-w-0">
        <span className="block text-sm text-muted">{label}</span>
        <span className="block text-sm font-semibold text-text">{value}</span>
        <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted">
          <Lock aria-hidden className="size-3" />
          {t('start:setup.organisation.fixed')}
        </span>
      </div>
    </li>
  );
}
