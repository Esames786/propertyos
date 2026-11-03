import { ApiError, ROLE_DEPARTMENT, type Employee360, type EmployeeOptions, type EmploymentType, type HrRole } from '@repo/contracts';
import { Button, ErrorState, InlineAlert, Link, PageHeader, Panel, PlainTextArea, PlainTextField, SelectControl, useApiMutation, useApiQuery, useNavigation, useT, useToast } from '@repo/ui';
import { Save } from 'lucide-react';
import { useState } from 'react';
import { HR } from '../../../nav.config';
import { Loading, ProblemAlert } from '../kit';
import { DateInput, fieldErrorKey, HrNav, SearchSelect, useFieldError, useRole } from './hkit';

/**
 * HR-004 new employee: identity, employment and where they work, validated as typed and again by the
 * server (CNIC and phone formats, a start date, the employing legal entity and site of this
 * organisation only). The same identity card number is never recorded twice: the refusal names the
 * existing record and opens it. Saving opens Employee 360, where the first shift is assigned.
 */
interface Draft {
  name: string;
  cnic: string;
  phone: string;
  address: string;
  dateOfBirth: string;
  emergencyContact: string;
  legalEntityId: string;
  siteId: string;
  role: HrRole | null;
  employmentType: EmploymentType;
  startDate: string;
}

const CNIC = /^\d{5}-?\d{7}-?\d$/;

export default function NewEmployeePage() {
  const { t } = useT();
  const role = useRole();
  const toast = useToast();
  const { navigate } = useNavigation();
  const opts = useApiQuery<EmployeeOptions>({ method: 'GET', path: '/hr/employees/options' });
  const save = useApiMutation<Employee360>();
  const [error, setError] = useState<unknown>(null);
  const [touched, setTouched] = useState(false);
  const [d, setD] = useState<Draft | null>(null);
  const fieldError = useFieldError(error);
  if (opts.isError) return <ErrorState error={opts.error} onRetry={() => void opts.refetch()} />;
  if (!opts.data) return <Loading lines={10} />;
  const o = opts.data;
  const draft: Draft = d ?? { name: '', cnic: '', phone: '', address: '', dateOfBirth: '', emergencyContact: '', legalEntityId: o.legalEntities[0]!.id, siteId: o.sites[0]!.id, role: null, employmentType: 'permanent', startDate: o.today };
  const set = (patch: Partial<Draft>) => setD({ ...draft, ...patch });
  // Guidance once saving was tried (the server decides): what is still missing or malformed.
  const hints = {
    name: draft.name.trim().length < 3 ? 'hr:errors.nameShort' : undefined,
    cnic: !CNIC.test(draft.cnic.trim()) ? 'hr:errors.cnic' : undefined,
    phone: draft.phone.replace(/\D/g, '').length < 10 ? 'hr:errors.phone' : undefined,
    address: draft.address.trim().length < 5 ? 'hr:errors.addressShort' : undefined,
    role: draft.role ? undefined : 'forms:errors.required',
  };
  const shown = (field: keyof typeof hints) => fieldErrorKey(error, field) ?? (touched ? hints[field] : undefined);
  const duplicate = error instanceof ApiError && error.problem.code === 'duplicate_employee' ? error.problem.errors?.cnic?.[0]?.params : undefined;
  const sites = o.sites.filter((s) => s.legalEntityId === draft.legalEntityId);
  const submit = async () => {
    setTouched(true);
    setError(null);
    if (Object.values(hints).some(Boolean)) return;
    try {
      const created = await save.mutateAsync({ method: 'POST', path: '/hr/employees', body: { ...draft, role: draft.role } });
      toast.success(t('hr:newEmployee.saved', { name: created.name, code: created.code }));
      navigate(HR.employee(created.id, 'duty'));
    } catch (e) {
      setError(e);
    }
  };
  return (
    <div className="@container mx-auto max-w-4xl space-y-5" data-testid="hr-new-employee-page">
      <PageHeader title={t('hr:newEmployee.title')} description={t('hr:newEmployee.intro')} breadcrumbs={[{ label: t('hr:employees.title'), href: HR.employees() }]} />
      <HrNav current="employees" />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-5"
        data-testid="hr-employee-form"
      >
        <Panel title={t('hr:newEmployee.identity')} description={t('hr:newEmployee.identityNote')}>
          <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
            <PlainTextField label={t('hr:fields.name')} value={draft.name} onChange={(v) => set({ name: v })} autoComplete="off" testId="hr-field-name" {...(shown('name') ? { errorKey: shown('name') } : {})} />
            <PlainTextField label={t('hr:fields.cnic')} value={draft.cnic} onChange={(v) => set({ cnic: v })} inputMode="numeric" dir="ltr" placeholder="35202-1234567-1" description={t('hr:fields.cnicHint')} testId="hr-field-cnic" {...(shown('cnic') ? { errorKey: shown('cnic') } : {})} />
            <PlainTextField label={t('hr:fields.phone')} value={draft.phone} onChange={(v) => set({ phone: v })} type="tel" inputMode="tel" dir="ltr" placeholder="0300 1234567" testId="hr-field-phone" {...(shown('phone') ? { errorKey: shown('phone') } : {})} />
            <PlainTextField label={t('hr:fields.emergencyContact')} value={draft.emergencyContact} onChange={(v) => set({ emergencyContact: v })} type="tel" inputMode="tel" dir="ltr" optional testId="hr-field-emergency" {...(fieldErrorKey(error, 'emergencyContact') ? { errorKey: fieldErrorKey(error, 'emergencyContact')! } : {})} />
            <div className="@2xl:col-span-2">
              <PlainTextArea label={t('hr:fields.address')} value={draft.address} onChange={(v) => set({ address: v })} rows={2} testId="hr-field-address" {...(shown('address') ? { errorKey: shown('address') } : {})} />
            </div>
            <DateInput id="hr-dob" label={t('hr:fields.dateOfBirth')} value={draft.dateOfBirth} onChange={(v) => set({ dateOfBirth: v })} max={o.today} testId="hr-field-dob" description={fieldError('dateOfBirth') ?? t('hr:fields.optional')} />
          </div>
          {duplicate && (
            <InlineAlert tone="error" role="alert" className="mt-4" data-testid="hr-duplicate">
              {t('hr:newEmployee.duplicate', { code: duplicate.code, name: duplicate.name })}{' '}
              <Link href={HR.employee(duplicate.id!)}>{t('hr:newEmployee.openExisting')}</Link>
            </InlineAlert>
          )}
        </Panel>
        <Panel title={t('hr:newEmployee.employment')} description={t('hr:newEmployee.employmentNote')}>
          <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
            <SelectControl label={t('hr:fields.legalEntity')} value={draft.legalEntityId} onChange={(v) => v && set({ legalEntityId: v, siteId: o.sites.find((s) => s.legalEntityId === v)?.id ?? '' })} options={o.legalEntities.map((l) => ({ id: l.id, label: l.name }))} description={t('hr:fields.legalEntityHint')} testId="hr-field-entity" />
            <SelectControl label={t('hr:fields.site')} value={draft.siteId} onChange={(v) => v && set({ siteId: v })} options={sites.map((s) => ({ id: s.id, label: s.name }))} testId="hr-field-site" />
            <SearchSelect
              label={t('hr:fields.role')}
              value={draft.role}
              onChange={(v) => set({ role: v as HrRole })}
              options={o.roles.map((r) => ({ id: r, label: role(r), hint: t(`hr:department.${ROLE_DEPARTMENT[r]}`) }))}
              testId="hr-field-role"
              {...(shown('role') ? { errorText: t(shown('role') as 'forms:errors.required') } : {})}
            />
            <SelectControl label={t('hr:fields.employmentType')} value={draft.employmentType} onChange={(v) => v && set({ employmentType: v as EmploymentType })} options={o.types.map((x) => ({ id: x, label: t(`hr:type.${x}`) }))} testId="hr-field-type" />
            <DateInput id="hr-start" label={t('hr:fields.startDate')} value={draft.startDate} onChange={(v) => set({ startDate: v })} testId="hr-field-start" description={fieldError('startDate') ?? t('hr:fields.startDateHint')} />
          </div>
        </Panel>
        {error && !duplicate ? <ProblemAlert error={error} /> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Link href={HR.employees()} className="self-center text-sm">
            {t('common:actions.cancel')}
          </Link>
          <Button type="submit" variant="primary" icon={Save} isPending={save.isPending} data-testid="hr-employee-save">
            {t('hr:newEmployee.save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
