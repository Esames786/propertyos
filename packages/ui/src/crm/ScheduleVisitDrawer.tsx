import type { LeadDetail, LeadListResponse } from '@repo/contracts';
import { CalendarCheck } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAnnounce } from '../a11y/LiveAnnouncer';
import { useApiQuery, useTransport } from '../data/TransportProvider';
import { useApiMutation } from '../data/useApi';
import { useToast } from '../feedback/Toast';
import { AsyncSelectField, type AsyncItem } from '../forms/AsyncSelectField';
import { SelectField } from '../forms/ChoiceFields';
import { DateField } from '../forms/DateField';
import { Form, zodResolver } from '../forms/Form';
import { useT } from '../lib/useT';
import { useNavigation, useQueryParam } from '../navigation/RouterAdapter';
import { emitTourEvent } from '../onboarding/tourGuard';
import { Drawer } from '../overlays/Drawer';
import { useSession } from '../permissions/SessionProvider';
import { Button } from '../primitives/Button';
import { SCHEDULE_VISIT_DRAWER } from './drawerIds';

const SLOTS = ['10:00', '10:30', '11:00', '11:30', '12:00', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];

const schema = z.object({
  lead: z.object({ id: z.string(), label: z.string() }).passthrough().nullable().refine((v) => !!v, 'forms:errors.selectOne'),
  date: z.string().min(1, 'forms:errors.dateRequired'),
  time: z.string().min(1, 'forms:errors.timeRequired'),
});

type VisitValues = z.input<typeof schema>;

/** Karachi wall-clock date + time → ISO instant (Pakistan has no daylight saving). */
const toInstant = (date: string, time: string) => new Date(`${date}T${time}:00+05:00`).toISOString();

/**
 * Schedule site visit (CRM-011, `?drawer=schedule-visit[&lead=…]`). Books a visit for a demo lead:
 * it appears on Sales home, on the lead's Visits tab and in its timeline. No invitation is sent.
 */
export function ScheduleVisitDrawer() {
  const { t } = useT();
  const { can } = useSession();
  const { location, navigate } = useNavigation();
  const [drawer] = useQueryParam('drawer');
  const isOpen = drawer === SCHEDULE_VISIT_DRAWER && can('visit.schedule');
  const leadParam = new URLSearchParams(location.search).get('lead');
  const preset = useApiQuery<LeadDetail>(isOpen && leadParam ? { method: 'GET', path: `/leads/${leadParam}` } : null);
  const { transport } = useTransport();
  const toast = useToast();
  const announce = useAnnounce();
  const book = useApiMutation();
  const methods = useForm<VisitValues>({ resolver: zodResolver(schema), mode: 'onTouched', defaultValues: { lead: null, date: '', time: '' } });

  useEffect(() => {
    if (preset.data && !methods.getValues('lead')) {
      methods.setValue('lead', { id: preset.data.lead.id, label: preset.data.party.displayName, ref: preset.data.lead.ref });
    }
  }, [preset.data, methods]);

  const close = () => {
    const params = new URLSearchParams(location.search);
    params.delete('drawer');
    params.delete('lead');
    const search = params.toString();
    navigate(`${location.pathname}${search ? `?${search}` : ''}`, { replace: true });
    methods.reset({ lead: null, date: '', time: '' });
  };

  const load = async (q: string, signal: AbortSignal): Promise<AsyncItem[]> => {
    const res = await transport.request<LeadListResponse>({ method: 'GET', path: '/leads', query: { q, sort: 'recent' }, signal });
    return res.items.map((l) => ({ id: l.id, label: l.displayName, ref: l.ref, detail: `${l.projectName}` }));
  };

  const submit = async (values: VisitValues) => {
    const at = toInstant(values.date, values.time);
    await book.mutateAsync({ method: 'POST', path: '/visits', body: { leadId: values.lead!.id, at } });
    const message = t('crm:visit.booked', { name: values.lead!.label });
    toast.success(message);
    announce(message);
    emitTourEvent('crm.visit.scheduled');
    close();
  };

  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(open) => !open && close()}
      title={t('crm:visit.title')}
      subtitle={t('crm:visit.subtitle')}
      testId="schedule-visit-drawer"
      footer={
        <>
          <Button variant="secondary" onPress={close}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="primary" icon={CalendarCheck} type="submit" form="schedule-visit-form" isPending={book.isPending} data-testid="schedule-visit-submit">
            {t('crm:visit.submit')}
          </Button>
        </>
      }
    >
      <Form id="schedule-visit-form" methods={methods} onSubmit={submit} className="space-y-5" testId="schedule-visit-form">
        <AsyncSelectField name="lead" label={t('crm:fields.lead')} description={t('crm:hints.lead')} load={load} testId="schedule-visit-lead" />
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField name="date" label={t('crm:fields.visitDate')} disallowPast />
          <SelectField name="time" label={t('crm:fields.visitTime')} options={SLOTS.map((s) => ({ id: s, label: s }))} />
        </div>
        <p className="rounded-control bg-sunken p-3 text-sm text-muted">{t('crm:visit.note')}</p>
      </Form>
    </Drawer>
  );
}
