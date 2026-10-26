import { formatPkPhone, isDecimalAmount, isValidCnic, isValidPkPhone } from '@repo/i18n';
import {
  AsyncSelectField,
  Button,
  CheckboxField,
  CnicField,
  CurrencyField,
  DateField,
  FileUploadField,
  Form,
  Link,
  MultiSelectField,
  PageHeader,
  Panel,
  PhoneField,
  RadioGroupField,
  SelectField,
  TextAreaField,
  TextField,
  UnitPickerField,
  useT,
  useToast,
  useTransport,
  zodResolver,
  type AsyncItem,
} from '@repo/ui';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const asyncItem = z.object({ id: z.string(), label: z.string(), ref: z.string().optional(), detail: z.string().optional() });

const schema = z.object({
  customer: asyncItem.nullable(),
  fullName: z.string().trim().min(1, 'forms:errors.required'),
  phone: z.string().trim().min(1, 'forms:errors.required').refine((v) => isValidPkPhone(v), 'forms:errors.phoneInvalid'),
  cnic: z.string().trim().min(1, 'forms:errors.required').refine((v) => isValidCnic(v), 'forms:errors.cnicInvalid'),
  email: z.string().trim().refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), 'forms:errors.emailInvalid'),
  unit: z
    .object({ projectId: z.string().optional(), unitId: z.string().optional(), unitRef: z.string().optional() })
    .passthrough()
    .refine((u) => !!u.unitId, 'forms:errors.selectOne'),
  budget: z
    .string()
    .min(1, 'forms:errors.required')
    .refine((v) => isDecimalAmount(v) && Number(v) > 0, 'forms:errors.amountPositive'),
  visitDate: z.string().min(1, 'forms:errors.dateRequired'),
  source: z
    .string()
    .nullable()
    .refine((v) => !!v, 'forms:errors.selectOne'),
  interests: z.array(z.string()).min(1, 'forms:errors.selectAtLeastOne'),
  preferredContact: z
    .string()
    .nullable()
    .refine((v) => !!v, 'forms:errors.selectOne'),
  attachment: z.array(z.instanceof(File)),
  notes: z.string(),
  consent: z.boolean().refine((v) => v, 'forms:errors.consentRequired'),
});

type LeadForm = z.input<typeof schema>;

const DEFAULTS: LeadForm = {
  customer: null,
  fullName: '',
  phone: '',
  cnic: '',
  email: '',
  unit: {},
  budget: '',
  visitDate: '',
  source: null,
  interests: [],
  preferredContact: null,
  attachment: [],
  notes: '',
  consent: false,
};

const UNIT_TYPES = ['apartment_1bed', 'apartment_2bed', 'apartment_3bed', 'penthouse', 'villa', 'plot'] as const;
const SOURCES = ['website', 'walk_in', 'referral', 'social', 'broker', 'phone'] as const;
const CONTACT = ['phone', 'whatsapp', 'email'] as const;

/** A realistic, fully validated form built only from Stage 1 controls. Nothing is saved. */
export default function FormsLab() {
  const { t } = useT();
  const toast = useToast();
  const { transport } = useTransport();
  const methods = useForm<LeadForm>({ resolver: zodResolver(schema), mode: 'onTouched', defaultValues: DEFAULTS });

  const customer = methods.watch('customer');
  useEffect(() => {
    if (!customer) return;
    methods.setValue('fullName', customer.label, { shouldDirty: true, shouldValidate: true });
    if (customer.detail) methods.setValue('phone', customer.detail, { shouldDirty: true, shouldValidate: true });
  }, [customer, methods]);

  const loadCustomers = async (q: string, signal: AbortSignal): Promise<AsyncItem[]> => {
    const res = await transport.request<{ items: Array<{ id: string; ref: string; displayName: string; phone: string }> }>({
      method: 'GET',
      path: '/parties',
      query: { q, limit: 8 },
      signal,
    });
    return res.items.map((p) => ({ id: p.id, label: p.displayName, ref: p.ref, detail: formatPkPhone(p.phone) }));
  };

  return (
    <>
      <PageHeader
        title={t('lab:forms.title')}
        description={t('lab:forms.intro')}
        breadcrumbs={[{ label: t('nav:pages.lab'), href: '/backoffice/lab' }, { label: t('nav:pages.labForms') }]}
        actions={
          <Link href="/backoffice/help/practice" className="text-sm">
            {t('lab:forms.practiceLink')}
          </Link>
        }
      />
      <Form
        methods={methods}
        draftKey="lab-forms"
        testId="lab-form"
        className="space-y-6"
        onSubmit={async () => {
          await new Promise((r) => setTimeout(r, 700));
          toast.success(t('lab:forms.submitted'));
          methods.reset(DEFAULTS);
        }}
      >
        <Panel title={t('forms:newLead.sectionContact')}>
          <div className="grid gap-5 @2xl:grid-cols-2">
            <div className="@2xl:col-span-2">
              <AsyncSelectField name="customer" label={t('forms:fields.customer')} description={t('forms:hints.customer')} load={loadCustomers} optional testId="customer-search" />
            </div>
            <TextField name="fullName" label={t('forms:fields.fullName')} description={t('forms:hints.fullName')} autoComplete="name" />
            <PhoneField name="phone" label={t('forms:fields.phone')} description={t('forms:hints.phone')} />
            <CnicField name="cnic" label={t('forms:fields.cnic')} description={t('forms:hints.cnic')} />
            <TextField name="email" type="email" inputMode="email" autoComplete="email" label={t('forms:fields.email')} optional />
          </div>
        </Panel>

        <Panel title={t('forms:newLead.sectionInterest')}>
          <div className="space-y-5">
            <UnitPickerField name="unit" label={t('forms:fields.unit')} />
            <div className="grid gap-5 @2xl:grid-cols-2">
              <CurrencyField name="budget" label={t('forms:fields.budget')} description={t('forms:hints.budget')} />
              <DateField name="visitDate" label={t('forms:fields.visitDate')} description={t('forms:hints.visitDate')} disallowPast />
              <SelectField name="source" label={t('forms:fields.source')} options={SOURCES.map((s) => ({ id: s, label: t(`forms:sources.${s}`) }))} />
              <MultiSelectField
                name="interests"
                label={t('forms:fields.interests')}
                description={t('forms:hints.interests')}
                options={UNIT_TYPES.map((u) => ({ id: u, label: t(`common:unitType.${u}`) }))}
              />
            </div>
            <RadioGroupField
              name="preferredContact"
              label={t('forms:fields.preferredContact')}
              orientation="horizontal"
              options={CONTACT.map((c) => ({ id: c, label: t(`forms:contactMethods.${c}`) }))}
            />
            <FileUploadField name="attachment" label={t('forms:fields.attachment')} description={t('forms:hints.attachment')} optional />
            <TextAreaField name="notes" label={t('forms:fields.notes')} description={t('forms:hints.notes')} optional />
            <CheckboxField name="consent" label={t('forms:fields.contactConsent')} />
          </div>
        </Panel>

        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur md:mx-0 md:rounded-card md:border">
          <Button variant="secondary" onPress={() => methods.reset(DEFAULTS)}>
            {t('lab:forms.reset')}
          </Button>
          <Button variant="primary" type="submit" isPending={methods.formState.isSubmitting} data-testid="lab-form-submit">
            {t('lab:forms.submit')}
          </Button>
        </div>
      </Form>
    </>
  );
}
