import { LEAD_SOURCES, type CreateLeadInput, type LeadSource } from '@repo/contracts';
import { isValidPkPhone } from '@repo/i18n';
import { GraduationCap, ShieldCheck } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAnnounce } from '../a11y/LiveAnnouncer';
import { useApiMutation } from '../data/useApi';
import { useToast } from '../feedback/Toast';
import { SelectField } from '../forms/ChoiceFields';
import { CurrencyField } from '../forms/CurrencyField';
import { Form, zodResolver } from '../forms/Form';
import { PhoneField, TextAreaField, TextField } from '../forms/TextFields';
import { UnitPickerField } from '../forms/UnitPickerField';
import { useT } from '../lib/useT';
import { useQueryParam } from '../navigation/RouterAdapter';
import { emitTourEvent } from '../onboarding/tourGuard';
import { useTraining } from '../onboarding/TrainingProvider';
import { Drawer } from '../overlays/Drawer';
import { useSession } from '../permissions/SessionProvider';
import { Button } from '../primitives/Button';
import { NEW_LEAD_DRAWER } from './drawerIds';

const schema = z.object({
  fullName: z.string().trim().min(1, 'forms:errors.required'),
  phone: z
    .string()
    .trim()
    .min(1, 'forms:errors.required')
    .refine((v) => isValidPkPhone(v), 'forms:errors.phoneInvalid'),
  email: z
    .string()
    .trim()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'forms:errors.emailInvalid'),
  interest: z
    .object({ projectId: z.string().optional(), unitId: z.string().optional(), unitRef: z.string().optional() })
    .passthrough()
    .refine((u) => !!u.projectId, 'forms:errors.selectOne'),
  budget: z.string().optional(),
  source: z.string().min(1, 'forms:errors.selectOne'),
  notes: z.string().optional(),
});

type NewLeadValues = z.input<typeof schema>;

const EMPTY: NewLeadValues = { fullName: '', phone: '', email: '', interest: {}, budget: '', source: 'walk_in', notes: '' };

/**
 * New lead (CRM-004, `?drawer=new-lead`), available from Quick create anywhere. In the demo it
 * writes to the demo session, so the lead appears at once on Sales home, in the lead list, in search
 * and with its own timeline. In practice mode the same form writes to the isolated training store.
 * Nothing is ever sent to the customer.
 */
export function NewLeadDrawer() {
  const { t } = useT();
  const { can } = useSession();
  const [drawer, setDrawer] = useQueryParam('drawer');
  const isOpen = drawer === NEW_LEAD_DRAWER && can('lead.create');
  const training = useTraining();
  const toast = useToast();
  const announce = useAnnounce();
  const create = useApiMutation<{ id: string; ref: string; training: boolean }>();
  const saved = useRef(false);
  const methods = useForm<NewLeadValues>({ resolver: zodResolver(schema), mode: 'onTouched', defaultValues: EMPTY });

  useEffect(() => {
    if (!isOpen) return;
    saved.current = false;
    emitTourEvent('crm.newLead.opened');
  }, [isOpen]);

  const close = () => {
    if (!saved.current) emitTourEvent('crm.newLead.closed');
    setDrawer(null);
  };

  const submit = async (values: NewLeadValues) => {
    const body: CreateLeadInput = {
      fullName: values.fullName.trim(),
      phone: values.phone.trim(),
      ...(values.email?.trim() ? { email: values.email.trim() } : {}),
      projectId: values.interest.projectId!,
      ...(values.interest.unitId ? { unitId: values.interest.unitId } : {}),
      ...(values.budget ? { budget: values.budget } : {}),
      source: values.source as LeadSource,
      ...(values.notes?.trim() ? { notes: values.notes.trim() } : {}),
    };
    const result = await create.mutateAsync({ method: 'POST', path: '/leads', body });
    saved.current = true;
    const message = result.training
      ? t('crm:newLead.createdPractice', { name: body.fullName, ref: result.ref })
      : t('crm:newLead.created', { name: body.fullName, ref: result.ref });
    toast.success(message, { reference: result.ref });
    announce(message);
    methods.reset(EMPTY);
    setDrawer(null);
    emitTourEvent('crm.lead.created');
  };

  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(open) => !open && close()}
      title={t('crm:newLead.title')}
      subtitle={t('crm:newLead.subtitle')}
      size="lg"
      testId="new-lead-drawer"
      banner={
        training.active ? (
          <p role="note" className="flex items-center gap-2 border-b-2 border-demo bg-demo-soft px-5 py-2 text-sm font-medium text-demo">
            <GraduationCap aria-hidden className="size-4 shrink-0" />
            {t('onboarding:practice.banner')}
          </p>
        ) : (
          <p role="note" className="flex items-center gap-2 border-b border-border bg-demo-soft/60 px-5 py-2 text-sm text-demo">
            <ShieldCheck aria-hidden className="size-4 shrink-0" />
            {t('crm:newLead.demoNote')}
          </p>
        )
      }
      footer={
        <>
          <Button variant="secondary" onPress={close}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="primary" type="submit" form="new-lead-form" isPending={create.isPending} data-testid="new-lead-submit">
            {t('crm:newLead.submit')}
          </Button>
        </>
      }
    >
      <Form id="new-lead-form" methods={methods} onSubmit={submit} className="@container space-y-5" testId="new-lead-form">
        <fieldset className="grid gap-4 @lg:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-text">{t('forms:newLead.sectionContact')}</legend>
          <TextField name="fullName" label={t('forms:fields.fullName')} description={t('forms:hints.fullName')} autoComplete="off" />
          <PhoneField name="phone" label={t('forms:fields.phone')} description={t('forms:hints.phone')} />
          <TextField name="email" type="email" inputMode="email" label={t('forms:fields.email')} optional />
          <SelectField name="source" label={t('crm:fields.source')} options={LEAD_SOURCES.map((s) => ({ id: s, label: t(`crm:source.${s}`) }))} />
        </fieldset>
        <UnitPickerField name="interest" label={t('crm:fields.interest')} description={t('crm:hints.interest')} />
        <CurrencyField name="budget" label={t('forms:fields.budget')} description={t('crm:hints.budget')} optional />
        <TextAreaField name="notes" label={t('forms:fields.notes')} description={t('forms:hints.notes')} optional />
      </Form>
    </Drawer>
  );
}
