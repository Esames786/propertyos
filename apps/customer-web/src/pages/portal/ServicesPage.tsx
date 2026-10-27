import {
  SERVICE_CATEGORIES,
  VISITOR_PURPOSES,
  type CreateServiceRequestInput,
  type CreateVisitorPassInput,
  type PortalServices,
  type ServiceCategory,
  type ServiceRequest,
  type ServiceRequestStatus,
  type VisitorPass,
  type VisitorPassStatus,
} from '@repo/contracts';
import { formatPkPhone, isValidPkPhone } from '@repo/i18n';
import {
  Badge,
  Button,
  ContactButtons,
  DateField,
  Drawer,
  EmptyState,
  ErrorState,
  Form,
  IconButton,
  IconTile,
  PageHeader,
  PhoneField,
  RadioGroupField,
  RecordCard,
  RevealItem,
  SelectField,
  Stagger,
  TextAreaField,
  TextField,
  UrlTabs,
  useAnnounce,
  useApiMutation,
  useApiQuery,
  useQueryParam,
  useT,
  useToast,
  zodResolver,
  type StatusTone,
  type TileHue,
} from '@repo/ui';
import {
  AirVent,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Copy,
  Hammer,
  KeyRound,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Wrench,
  Zap,
  Droplets,
  CircleHelp,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PortalSkeleton, usePortalFormat, type PortalFormat } from './shared';

type TabId = 'maintenance' | 'visitors';

const CATEGORY: Record<ServiceCategory, [LucideIcon, TileHue]> = {
  plumbing: [Droplets, 'sky'],
  electrical: [Zap, 'amber'],
  carpentry: [Hammer, 'orange'],
  air_conditioning: [AirVent, 'teal'],
  cleaning: [Sparkles, 'violet'],
  other: [CircleHelp, 'slate'],
};

const REQUEST_STATUS: Record<ServiceRequestStatus, [StatusTone, LucideIcon]> = {
  submitted: ['info', Send],
  scheduled: ['info', CalendarClock],
  in_progress: ['warning', Wrench],
  resolved: ['success', CheckCircle2],
};

const PASS_STATUS: Record<VisitorPassStatus, [StatusTone, LucideIcon]> = {
  active: ['success', ShieldCheck],
  used: ['neutral', CheckCircle2],
  expired: ['neutral', Clock3],
};

/**
 * PORTAL-015 services home: maintenance requests and visitor passes, each with a create drawer
 * (deep-linkable with `?tab=…&new=1`). New records appear at the top of the list straight away.
 * Calls and WhatsApp are simulations; no facilities team or gate system is contacted.
 */
export default function ServicesPage() {
  const { t } = useT();
  const query = useApiQuery<PortalServices>({ method: 'GET', path: '/portal/services' });
  if (query.isPending) return <PortalSkeleton title={t('portal:services.title')} />;
  if (query.isError)
    return (
      <>
        <PageHeader title={t('portal:services.title')} />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </>
    );
  return <ServicesView data={query.data} />;
}

function ServicesView({ data }: { data: PortalServices }) {
  const { t } = useT();
  const fmt = usePortalFormat(data.asOf);
  const [tabParam] = useQueryParam('tab');
  const [newParam, setNew] = useQueryParam('new');
  const tab: TabId = tabParam === 'visitors' ? 'visitors' : 'maintenance';
  const [lastCreated, setLastCreated] = useState<string | null>(null);
  const open = newParam === '1';

  return (
    <div className="space-y-6" data-testid="portal-services">
      <PageHeader
        title={t('portal:services.title')}
        description={t('portal:services.description', { unit: data.unitRef })}
        actions={
          <Button variant="primary" icon={Plus} onPress={() => setNew('1')} data-testid="services-new">
            {tab === 'visitors' ? t('portal:services.visitors.new') : t('portal:services.maintenance.new')}
          </Button>
        }
      />
      <UrlTabs
        label={t('portal:services.tabs.label')}
        items={[
          { id: 'maintenance', label: t('portal:services.tabs.maintenance') },
          { id: 'visitors', label: t('portal:services.tabs.visitors') },
        ]}
      >
        {(selected) =>
          selected === 'visitors' ? (
            <PassList passes={data.passes} fmt={fmt} lastCreated={lastCreated} onNew={() => setNew('1')} />
          ) : (
            <RequestList requests={data.requests} fmt={fmt} lastCreated={lastCreated} onNew={() => setNew('1')} />
          )
        }
      </UrlTabs>
      {tab === 'maintenance' ? (
        <RequestDrawer isOpen={open} onClose={() => setNew(null)} onCreated={setLastCreated} />
      ) : (
        <PassDrawer isOpen={open} onClose={() => setNew(null)} onCreated={setLastCreated} />
      )}
    </div>
  );
}

function RequestList({ requests, fmt, lastCreated, onNew }: { requests: ServiceRequest[]; fmt: PortalFormat; lastCreated: string | null; onNew: () => void }) {
  const { t } = useT();
  const toast = useToast();
  if (!requests.length)
    return (
      <EmptyState
        title={t('portal:services.maintenance.emptyTitle')}
        body={t('portal:services.maintenance.emptyBody')}
        actions={
          <Button variant="primary" icon={Plus} onPress={onNew}>
            {t('portal:services.maintenance.new')}
          </Button>
        }
      />
    );
  return (
    <section aria-labelledby="requests-title" className="pt-4">
      <h2 id="requests-title" className="mb-3 text-lg font-bold text-text">
        {t('portal:services.maintenance.listTitle')}
      </h2>
      <Stagger as="ul" className="grid gap-3 lg:grid-cols-2">
        {requests.map((r) => {
          const [icon, hue] = CATEGORY[r.category];
          const [tone, statusIcon] = REQUEST_STATUS[r.status];
          return (
            <RevealItem as="li" key={r.id}>
              <RecordCard
                testId={`request-${r.id}`}
                highlight={r.id === lastCreated}
                accent={r.status === 'resolved' ? 'success' : r.status === 'in_progress' ? 'warning' : 'info'}
                eyebrow={<bdi dir="ltr" className="ltr-ref">{r.ref}</bdi>}
                title={
                  <span className="flex items-center gap-2.5">
                    <IconTile icon={icon} hue={hue} size="sm" />
                    {t(`portal:services.maintenance.category.${r.category}`)}
                  </span>
                }
                chips={
                  <>
                    <Badge tone={tone} icon={statusIcon}>
                      {t(`portal:services.maintenance.status.${r.status}`)}
                    </Badge>
                    <span className="text-xs text-muted">{t('portal:services.maintenance.raised', { date: fmt.instant(r.createdAt) })}</span>
                  </>
                }
                actions={
                  r.technician && r.status !== 'resolved' ? (
                    <ContactButtons
                      name={r.technician.name}
                      onCall={() => toast.info(t('portal:services.simulatedCall', { name: r.technician!.name }))}
                      onWhatsApp={() => toast.info(t('portal:services.simulatedWhatsApp', { name: r.technician!.name }))}
                    />
                  ) : undefined
                }
              >
                <p dir="auto" className="text-sm text-text">
                  {r.description}
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                  {r.visitAt ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-text">
                      <CalendarClock aria-hidden className="size-4 text-primary" />
                      {t('portal:services.maintenance.visit', { date: fmt.instantTime(r.visitAt) })}
                    </span>
                  ) : r.preferredDate ? (
                    <span>{t('portal:services.maintenance.preferred', { date: fmt.date(r.preferredDate) })}</span>
                  ) : null}
                  {r.technician && <span>{t('portal:services.maintenance.technician', { name: r.technician.name })}</span>}
                  {r.status === 'submitted' && <span>{t('portal:services.maintenance.nextStep')}</span>}
                </p>
              </RecordCard>
            </RevealItem>
          );
        })}
      </Stagger>
    </section>
  );
}

function PassList({ passes, fmt, lastCreated, onNew }: { passes: VisitorPass[]; fmt: PortalFormat; lastCreated: string | null; onNew: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t('portal:services.visitors.copied', { code }));
      announce(t('portal:services.visitors.copied', { code }));
    } catch {
      toast.error(t('portal:services.visitors.copyFailed'));
    }
  };
  if (!passes.length)
    return (
      <EmptyState
        title={t('portal:services.visitors.emptyTitle')}
        body={t('portal:services.visitors.emptyBody')}
        actions={
          <Button variant="primary" icon={Plus} onPress={onNew}>
            {t('portal:services.visitors.new')}
          </Button>
        }
      />
    );
  return (
    <section aria-labelledby="passes-title" className="pt-4">
      <h2 id="passes-title" className="mb-3 text-lg font-bold text-text">
        {t('portal:services.visitors.listTitle')}
      </h2>
      <Stagger as="ul" className="grid gap-3 lg:grid-cols-2">
        {passes.map((p) => {
          const [tone, statusIcon] = PASS_STATUS[p.status];
          const active = p.status === 'active';
          return (
            <RevealItem as="li" key={p.id}>
              <RecordCard
                testId={`pass-${p.id}`}
                highlight={p.id === lastCreated}
                accent={active ? 'success' : undefined}
                eyebrow={t(`portal:services.visitors.purpose.${p.purpose}`)}
                title={<bdi>{p.visitorName}</bdi>}
                chips={
                  <>
                    <Badge tone={tone} icon={statusIcon}>
                      {t(`portal:services.visitors.status.${p.status}`)}
                    </Badge>
                    {p.phone && (
                      <bdi dir="ltr" className="ltr-ref text-xs text-muted">
                        {formatPkPhone(p.phone)}
                      </bdi>
                    )}
                  </>
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold tracking-[0.06em] text-muted uppercase">{t('portal:services.visitors.code')}</p>
                    <p className={active ? 'text-text' : 'text-muted line-through decoration-1'}>
                      <bdi dir="ltr" className="ltr-ref font-mono text-2xl font-bold tracking-[0.12em]" data-testid="pass-code">
                        {p.code}
                      </bdi>
                    </p>
                    <p className="mt-0.5 text-sm text-muted">{t('portal:services.visitors.validOn', { date: fmt.date(p.visitDate) })}</p>
                  </div>
                  {active && <IconButton label={t('portal:services.visitors.copy', { code: p.code })} icon={Copy} onPress={() => void copy(p.code)} className="bg-sunken" />}
                </div>
                {active && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                    <KeyRound aria-hidden className="size-3.5 shrink-0" />
                    {t('portal:services.visitors.showAtGate')}
                  </p>
                )}
              </RecordCard>
            </RevealItem>
          );
        })}
      </Stagger>
    </section>
  );
}

const requestSchema = z.object({
  category: z
    .string()
    .nullable()
    .refine((v) => !!v, 'forms:errors.selectOne'),
  description: z.string().trim().min(5, 'forms:errors.required'),
  preferredDate: z.string(),
});
type RequestForm = z.input<typeof requestSchema>;

function RequestDrawer({ isOpen, onClose, onCreated }: { isOpen: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const mutation = useApiMutation<ServiceRequest>();
  const methods = useForm<RequestForm>({ resolver: zodResolver(requestSchema), mode: 'onTouched', defaultValues: { category: null, description: '', preferredDate: '' } });
  const submit = async (values: RequestForm) => {
    const body: CreateServiceRequestInput = {
      category: values.category as ServiceCategory,
      description: values.description.trim(),
      ...(values.preferredDate ? { preferredDate: values.preferredDate } : {}),
    };
    try {
      const created = await mutation.mutateAsync({ method: 'POST', path: '/portal/service-requests', body });
      const message = t('portal:services.maintenance.created', { ref: created.ref });
      methods.reset();
      onCreated(created.id);
      onClose();
      toast.success(message);
      announce(message);
    } catch {
      toast.error(t('errors:network.unavailable'));
    }
  };
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title={t('portal:services.maintenance.form.title')}
      subtitle={t('portal:services.maintenance.form.intro')}
      testId="request-drawer"
      footer={
        <>
          <Button variant="secondary" onPress={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" form="request-form" variant="primary" icon={Send} isPending={mutation.isPending} data-testid="request-submit">
            {t('portal:services.maintenance.form.submit')}
          </Button>
        </>
      }
    >
      <Form methods={methods} onSubmit={submit} id="request-form" className="space-y-5">
        <SelectField
          name="category"
          label={t('portal:services.maintenance.form.category')}
          options={SERVICE_CATEGORIES.map((c) => ({ id: c, label: t(`portal:services.maintenance.category.${c}`) }))}
        />
        <TextAreaField name="description" label={t('portal:services.maintenance.form.description')} description={t('portal:services.maintenance.form.descriptionHint')} rows={4} />
        <DateField name="preferredDate" label={t('portal:services.maintenance.form.preferredDate')} optional disallowPast />
      </Form>
    </Drawer>
  );
}

const passSchema = z.object({
  visitorName: z.string().trim().min(2, 'forms:errors.required'),
  phone: z.string().refine((v) => v.trim() === '' || isValidPkPhone(v), 'forms:errors.phoneInvalid'),
  purpose: z
    .string()
    .nullable()
    .refine((v) => !!v, 'forms:errors.selectOne'),
  visitDate: z.string().min(1, 'forms:errors.dateRequired'),
});
type PassForm = z.input<typeof passSchema>;

function PassDrawer({ isOpen, onClose, onCreated }: { isOpen: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const mutation = useApiMutation<VisitorPass>();
  const methods = useForm<PassForm>({ resolver: zodResolver(passSchema), mode: 'onTouched', defaultValues: { visitorName: '', phone: '', purpose: 'guest', visitDate: '' } });
  const submit = async (values: PassForm) => {
    const body: CreateVisitorPassInput = {
      visitorName: values.visitorName.trim(),
      purpose: values.purpose as CreateVisitorPassInput['purpose'],
      visitDate: values.visitDate,
      ...(values.phone.trim() ? { phone: values.phone } : {}),
    };
    try {
      const created = await mutation.mutateAsync({ method: 'POST', path: '/portal/visitor-passes', body });
      const message = t('portal:services.visitors.created', { code: created.code, name: created.visitorName });
      methods.reset();
      onCreated(created.id);
      onClose();
      toast.success(message);
      announce(message);
    } catch {
      toast.error(t('errors:network.unavailable'));
    }
  };
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title={t('portal:services.visitors.form.title')}
      subtitle={t('portal:services.visitors.form.intro')}
      testId="pass-drawer"
      footer={
        <>
          <Button variant="secondary" onPress={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" form="pass-form" variant="primary" icon={KeyRound} isPending={mutation.isPending} data-testid="pass-submit">
            {t('portal:services.visitors.form.submit')}
          </Button>
        </>
      }
    >
      <Form methods={methods} onSubmit={submit} id="pass-form" className="space-y-5">
        <TextField name="visitorName" label={t('portal:services.visitors.form.visitorName')} autoComplete="off" />
        <PhoneField name="phone" label={t('portal:services.visitors.form.phone')} description={t('portal:services.visitors.form.phoneHint')} optional />
        <RadioGroupField
          name="purpose"
          label={t('portal:services.visitors.form.purpose')}
          orientation="horizontal"
          options={VISITOR_PURPOSES.map((p) => ({ id: p, label: t(`portal:services.visitors.purpose.${p}`) }))}
        />
        <DateField name="visitDate" label={t('portal:services.visitors.form.visitDate')} disallowPast />
      </Form>
    </Drawer>
  );
}
