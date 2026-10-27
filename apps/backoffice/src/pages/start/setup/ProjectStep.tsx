import { PROJECT_TYPES, type ProjectTypeChoice } from '@repo/contracts';
import { Form, RadioGroupField, SelectField, TextField, useT, zodResolver } from '@repo/ui';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { StepActions, StepFrame } from './chrome';
import { CITIES, type City, type SetupDraft } from './draft';
import { useDraftSync } from './useDraftSync';

const MAX_UNITS = 100_000;

const schema = z.object({
  name: z.string().trim().min(1, 'forms:errors.required').min(2, 'start:errors.nameShort'),
  type: z
    .string()
    .nullable()
    .refine((v) => PROJECT_TYPES.includes(v as ProjectTypeChoice), 'forms:errors.selectOne'),
  city: z
    .string()
    .nullable()
    .refine((v) => CITIES.includes(v as City), 'forms:errors.selectOne'),
  expectedUnits: z
    .string()
    .trim()
    .min(1, 'forms:errors.required')
    .refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= MAX_UNITS, 'start:errors.unitsRange'),
});
type ProjectValues = z.input<typeof schema>;

/** Step 4 (optional): the first project. Towers, floors and units are added later in the product. */
export function ProjectStep({
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
  onChange: (project: SetupDraft['project']) => void;
  onDone: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const { t } = useT();
  const methods = useForm<ProjectValues>({
    // The head-office city is a sensible first guess for the first project.
    defaultValues: { ...draft.project, city: draft.project.city ?? draft.organisation.city },
    resolver: zodResolver(schema),
  });
  useDraftSync(methods, (v) =>
    onChange({
      name: v.name ?? '',
      type: (v.type as ProjectTypeChoice | null) ?? null,
      city: (v.city as City | null) ?? null,
      expectedUnits: v.expectedUnits ?? '',
    }),
  );

  return (
    <StepFrame step="project" title={t('start:setup.project.heading')} intro={t('start:setup.project.intro')} autoFocus={autoFocus} testId="setup-step-project">
      <Form methods={methods} onSubmit={onDone} testId="setup-form-project">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField name="name" label={t('start:setup.project.name')} description={t('start:setup.project.nameHint')} className="sm:col-span-2" />
          <div className="sm:col-span-2">
            <RadioGroupField
              name="type"
              label={t('start:setup.project.type')}
              options={PROJECT_TYPES.map((id) => ({ id, label: t(`start:setup.project.types.${id}`), description: t(`start:setup.project.typeHints.${id}`) }))}
            />
          </div>
          <SelectField name="city" label={t('start:setup.project.city')} options={CITIES.map((id) => ({ id, label: t(`start:cities.${id}`) }))} />
          <TextField name="expectedUnits" inputMode="numeric" label={t('start:setup.project.units')} description={t('start:setup.project.unitsHint')} />
        </div>
        <StepActions
          onBack={onBack}
          onSkip={onSkip}
          submitLabel={returning ? t('start:setup.actions.saveReturn') : t('start:setup.actions.next')}
          testId="setup-project"
        />
      </Form>
    </StepFrame>
  );
}
