import { isValidPkPhone } from '@repo/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { GraduationCap } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useTransport } from '../data/TransportProvider';
import { useToast } from '../feedback/Toast';
import { Form, zodResolver } from '../forms/Form';
import { PhoneField, TextAreaField, TextField } from '../forms/TextFields';
import { UnitPickerField } from '../forms/UnitPickerField';
import { useT } from '../lib/useT';
import { useQueryParam } from '../navigation/RouterAdapter';
import { Drawer } from '../overlays/Drawer';
import { Button } from '../primitives/Button';
import { TourInlineSlot } from './TourLayer';
import { tourAnchor } from './TourAnchor';
import { useTraining } from './TrainingProvider';
import { emitTourEvent } from './tourGuard';

export const PRACTICE_LEAD_DRAWER = 'practice-lead';

const schema = z.object({
  fullName: z.string().trim().min(1, 'forms:errors.required'),
  phone: z
    .string()
    .trim()
    .min(1, 'forms:errors.required')
    .refine((v) => isValidPkPhone(v), 'forms:errors.phoneInvalid'),
  unit: z
    .object({ projectId: z.string().optional(), unitId: z.string().optional(), unitRef: z.string().optional() })
    .passthrough()
    .refine((u) => !!u.unitId, 'forms:errors.selectOne'),
  notes: z.string().optional(),
});

type PracticeLead = z.input<typeof schema>;

/**
 * Practice version of "New lead" (doc 09 §2C): the real form and validation, but submission
 * goes to the training store with `training: true`. Nothing reaches normal records, and no
 * message is sent. Opened from Quick Create; deep-linkable as ?drawer=practice-lead.
 */
export function PracticeLeadDrawer() {
  const { t } = useT();
  const [drawer, setDrawer] = useQueryParam('drawer');
  const isOpen = drawer === PRACTICE_LEAD_DRAWER;
  const { transport } = useTransport();
  const training = useTraining();
  const toast = useToast();
  const queryClient = useQueryClient();
  const methods = useForm<PracticeLead>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { fullName: '', phone: '', unit: {}, notes: '' },
  });

  useEffect(() => {
    if (!isOpen) return;
    if (!training.active) training.start();
    emitTourEvent('quickCreate.practiceLead.opened');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const close = () => setDrawer(null);

  const submit = async (values: PracticeLead) => {
    const result = await transport.request<{ ref: string }>({
      method: 'POST',
      path: '/practice/leads',
      body: { fullName: values.fullName, phone: values.phone, unitId: values.unit.unitId },
      training: true,
      idempotencyKey: crypto.randomUUID(),
    });
    toast.success(t('forms:newLead.created', { ref: result.ref }));
    // Lists in practice mode show practice records (labelled), so refresh them.
    void queryClient.invalidateQueries({ queryKey: ['api'] });
    methods.reset();
    close();
    emitTourEvent('practice.lead.submitted');
  };

  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(open) => !open && close()}
      title={t('forms:newLead.title')}
      subtitle={t('forms:newLead.intro')}
      size="lg"
      testId="practice-lead-drawer"
      banner={
        <p role="note" className="flex items-center gap-2 border-b-2 border-demo bg-demo-soft px-5 py-2 text-sm font-medium text-demo">
          <GraduationCap aria-hidden className="size-4 shrink-0" />
          {t('onboarding:practice.banner')}
        </p>
      }
      footer={
        <>
          <Button variant="secondary" onPress={close}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="primary" type="submit" form="practice-lead-form" isPending={methods.formState.isSubmitting} data-testid="practice-lead-submit">
            {t('forms:newLead.submit')}
          </Button>
        </>
      }
    >
      <TourInlineSlot slot={PRACTICE_LEAD_DRAWER} />
      <div {...tourAnchor('practice-lead-form')}>
        <Form id="practice-lead-form" methods={methods} onSubmit={submit} className="@container space-y-5" testId="practice-lead-form">
          <fieldset className="space-y-4">
            <legend className="mb-2 text-sm font-semibold text-text">{t('forms:newLead.sectionContact')}</legend>
            <TextField name="fullName" label={t('forms:fields.fullName')} description={t('forms:hints.fullName')} autoComplete="off" />
            <PhoneField name="phone" label={t('forms:fields.phone')} description={t('forms:hints.phone')} />
          </fieldset>
          <UnitPickerField name="unit" label={t('forms:fields.unit')} />
          <TextAreaField name="notes" label={t('forms:fields.notes')} description={t('forms:hints.notes')} optional />
        </Form>
      </div>
    </Drawer>
  );
}
