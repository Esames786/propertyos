import { PAYABLE_INSTALMENT_STATUSES, type InstalmentItem, type PortalPayments, type SubmitProofInput } from '@repo/contracts';
import { formatMoney, isDecimalAmount, useLocale } from '@repo/i18n';
import {
  Badge,
  Button,
  buttonClass,
  cn,
  CurrencyField,
  DateField,
  EmptyState,
  ErrorState,
  FileUploadField,
  Form,
  InlineAlert,
  Link,
  PageHeader,
  RadioGroupField,
  SelectControl,
  TextField,
  useAnnounce,
  useApiMutation,
  useApiQuery,
  useQueryParam,
  useReducedMotion,
  useT,
  useToast,
  zodResolver,
} from '@repo/ui';
import { CreditCard, FlaskConical, Home, Hourglass, Landmark, ReceiptText, Send, Wallet } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Radio, RadioGroup } from 'react-aria-components';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { BankDetails } from './PaymentsPage';
import { Amount, InstalmentStatusChip, instalmentLabel, PORTAL, PortalSkeleton, usePortalFormat, type PortalFormat } from './shared';

type Mode = 'upload' | 'online';
const isPayable = (i: InstalmentItem) => PAYABLE_INSTALMENT_STATUSES.includes(i.status);

/**
 * PORTAL-008 "Upload proof mock" (also the target of the centre Pay button). Deep-linkable:
 * `?record=<instalment>&mode=upload|online`. Both paths end at "Awaiting verification"; nothing is
 * ever marked Paid and no payment gateway is contacted (online payment is a labelled simulation).
 */
export default function PayPage() {
  const { t } = useT();
  const query = useApiQuery<PortalPayments>({ method: 'GET', path: '/portal/payments' });
  if (query.isPending) return <PortalSkeleton title={t('portal:pay.title')} />;
  if (query.isError)
    return (
      <>
        <PageHeader title={t('portal:pay.title')} />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </>
    );
  return <PayView data={query.data} />;
}

function PayView({ data }: { data: PortalPayments }) {
  const { t } = useT();
  const fmt = usePortalFormat(data.asOf);
  const [record, setRecord] = useQueryParam('record');
  const [modeParam, setMode] = useQueryParam('mode');
  const mode: Mode = modeParam === 'online' ? 'online' : 'upload';
  const [done, setDone] = useState<InstalmentItem | null>(null);
  const payable = data.schedule.filter(isPayable);
  const requested = record ? data.schedule.find((i) => i.id === record) : undefined;
  // Without a record, the centre Pay button lands on what most needs paying: overdue, then due, then a re-upload.
  const preferred = (['overdue', 'due', 'needs_information', 'upcoming'] as const).map((s) => payable.find((i) => i.status === s)).find(Boolean);
  const selected = requested ?? preferred ?? null;

  const header = (
    <PageHeader
      title={t('portal:pay.title')}
      description={t('portal:pay.description')}
      breadcrumbs={[{ label: t('portal:pages.payments'), href: PORTAL.payments }, { label: t('portal:pay.title') }]}
    />
  );

  const another = () => {
    setDone(null);
    setRecord(null);
  };
  if (done) return <DoneState item={done} fmt={fmt} header={header} onAnother={another} hasMore={payable.length > 0} />;

  if (!selected) {
    return (
      <>
        {header}
        <EmptyState
          title={t('portal:pay.nothing.title')}
          body={t('portal:pay.nothing.body')}
          actions={
            <Link href={PORTAL.payments} variant="plain" className={buttonClass('primary', 'md')}>
              {t('portal:pay.done.toPayments')}
            </Link>
          }
        />
      </>
    );
  }

  const options = payable.map((i) => ({ id: i.id, label: `${instalmentLabel(t, i)} · ${fmt.date(i.dueDate)}` }));
  const selectable = isPayable(selected);

  return (
    <div data-testid="portal-pay">
      {header}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-7">
          <section aria-labelledby="pay-instalment-title" className="rounded-card border border-border/70 bg-panel p-4 shadow-card sm:p-5" data-testid="pay-instalment">
            <h2 id="pay-instalment-title" className="sr-only">
              {t('portal:pay.instalment')}
            </h2>
            {payable.length > 0 && (
              <SelectControl
                label={t('portal:pay.instalment')}
                options={options}
                value={selectable ? selected.id : null}
                onChange={(id) => id && setRecord(id)}
                testId="pay-select"
              />
            )}
            <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-tile bg-sunken/70 p-4">
              <div className="min-w-0">
                <p className="text-sm text-muted">{instalmentLabel(t, selected)}</p>
                <p className="text-[1.75rem] leading-tight font-bold tracking-tight text-text" data-testid="pay-amount">
                  <Amount value={selected.amount.amount} />
                </p>
                <p className="text-sm text-muted">{t('portal:instalment.dueOn', { date: fmt.date(selected.dueDate) })}</p>
              </div>
              <InstalmentStatusChip status={selected.status} />
            </div>
            {selected.status === 'needs_information' && selected.financeNoteKey && (
              <InlineAlert tone="warning" title={t('portal:payments.financeNote.label')} className="mt-4">
                {t(selected.financeNoteKey as 'portal:payments.financeNote.unclear')}
              </InlineAlert>
            )}
          </section>

          {!selectable ? (
            <InlineAlert tone="info" role="status">
              {t('portal:pay.notPayable', { label: instalmentLabel(t, selected), status: t(`portal:status.${selected.status}`) })}
            </InlineAlert>
          ) : (
            <>
              <ModeChoice mode={mode} onChange={(m) => setMode(m === 'upload' ? null : m)} />
              <InlineAlert tone="info">{t('portal:pay.rule')}</InlineAlert>
              {mode === 'upload' ? (
                <UploadForm key={selected.id} item={selected} fmt={fmt} onDone={setDone} />
              ) : (
                <OnlineSimulation key={selected.id} item={selected} onDone={setDone} />
              )}
            </>
          )}
        </div>
        <aside className="space-y-5 lg:col-span-5" aria-label={t('portal:payments.bank.title')}>
          <BankDetails account={data.collectionAccount} compact />
        </aside>
      </div>
    </div>
  );
}

function ModeChoice({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const { t } = useT();
  const reduced = useReducedMotion();
  const choices: Array<{ id: Mode; icon: typeof Landmark; label: string }> = [
    { id: 'upload', icon: Landmark, label: t('portal:pay.mode.upload') },
    { id: 'online', icon: CreditCard, label: t('portal:pay.mode.online') },
  ];
  return (
    <RadioGroup value={mode} onChange={(v) => onChange(v as Mode)} aria-label={t('portal:pay.mode.label')} className="space-y-2" data-testid="pay-mode">
      <p aria-hidden className="text-sm font-medium text-text">
        {t('portal:pay.mode.label')}
      </p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {choices.map((c) => (
          <Radio
            key={c.id}
            value={c.id}
            data-testid={`pay-mode-${c.id}`}
            className={cn(
              'group relative flex min-h-16 cursor-default items-center gap-3 rounded-card border border-border-control bg-panel p-3.5 text-start outline-none',
              'transition-colors duration-[var(--motion-fast)] data-hovered:border-primary',
              'data-selected:border-transparent data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
            )}
          >
            {({ isSelected }) => (
              <>
                {isSelected && (
                  <motion.span
                    layoutId="pay-mode-ring"
                    aria-hidden
                    transition={reduced ? { duration: 0 } : { type: 'spring', bounce: 0.2, duration: 0.4 }}
                    className="absolute inset-0 rounded-card border-2 border-primary bg-primary-soft"
                  />
                )}
                <span className={cn('relative grid size-10 shrink-0 place-items-center rounded-tile', isSelected ? 'bg-primary text-on-primary' : 'bg-sunken text-muted')}>
                  <c.icon aria-hidden className="size-5" />
                </span>
                <span className="relative min-w-0 flex-1 text-sm font-semibold text-text">{c.label}</span>
                <span
                  aria-hidden
                  className={cn('relative grid size-5 shrink-0 place-items-center rounded-pill border-2', isSelected ? 'border-primary' : 'border-border-control')}
                >
                  <span className={cn('size-2.5 rounded-pill bg-primary', isSelected ? 'opacity-100' : 'opacity-0')} />
                </span>
              </>
            )}
          </Radio>
        ))}
      </div>
    </RadioGroup>
  );
}

const schema = z.object({
  method: z
    .string()
    .nullable()
    .refine((v) => !!v, 'forms:errors.selectOne'),
  amount: z
    .string()
    .min(1, 'forms:errors.required')
    .refine((v) => isDecimalAmount(v) && Number(v) > 0, 'forms:errors.amountPositive'),
  paidOn: z.string().min(1, 'forms:errors.dateRequired'),
  reference: z.string().trim().min(4, 'forms:errors.required'),
  proof: z.array(z.instanceof(File)).min(1, 'forms:errors.fileRequired'),
});
type ProofForm = z.input<typeof schema>;

function UploadForm({ item, fmt, onDone }: { item: InstalmentItem; fmt: PortalFormat; onDone: (i: InstalmentItem) => void }) {
  const { t } = useT();
  const toast = useToast();
  const mutation = useApiMutation<InstalmentItem>();
  const methods = useForm<ProofForm>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { method: 'bank_transfer', amount: item.amount.amount, paidOn: fmt.today, reference: '', proof: [] },
  });
  const submit = async (values: ProofForm) => {
    const body: SubmitProofInput = {
      method: values.method as SubmitProofInput['method'],
      amount: values.amount,
      paidOn: values.paidOn,
      reference: values.reference.trim(),
      fileName: values.proof[0]?.name,
    };
    try {
      const updated = await mutation.mutateAsync({ method: 'POST', path: `/portal/instalments/${item.id}/proof`, body });
      methods.reset(methods.getValues());
      onDone(updated);
    } catch {
      toast.error(t('errors:network.unavailable'));
    }
  };
  return (
    <Form methods={methods} onSubmit={submit} testId="proof-form" className="space-y-5 rounded-card border border-border/70 bg-panel p-4 shadow-card sm:p-5">
      <RadioGroupField
        name="method"
        label={t('portal:pay.upload.method')}
        orientation="horizontal"
        options={(['bank_transfer', 'cheque', 'cash_deposit'] as const).map((m) => ({ id: m, label: t(`portal:method.${m}`) }))}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <CurrencyField name="amount" label={t('portal:pay.upload.amount')} />
        <DateField name="paidOn" label={t('portal:pay.upload.paidOn')} />
      </div>
      <TextField name="reference" label={t('portal:pay.upload.reference')} description={t('portal:pay.upload.referenceHint')} autoComplete="off" />
      <FileUploadField name="proof" label={t('portal:pay.upload.file')} description={t('portal:pay.upload.fileHint')} />
      <Button type="submit" variant="primary" size="lg" icon={Send} isPending={mutation.isPending} className="w-full sm:w-auto" data-testid="proof-submit">
        {t('portal:pay.upload.submit')}
      </Button>
    </Form>
  );
}

function OnlineSimulation({ item, onDone }: { item: InstalmentItem; onDone: (i: InstalmentItem) => void }) {
  const { t } = useT();
  const toast = useToast();
  const mutation = useApiMutation<InstalmentItem>();
  const { locale } = useLocale();
  const amountText = formatMoney(item.amount, locale);
  const run = async () => {
    try {
      onDone(await mutation.mutateAsync({ method: 'POST', path: `/portal/instalments/${item.id}/simulate-online`, body: {} }));
    } catch {
      toast.error(t('errors:network.unavailable'));
    }
  };
  return (
    <section aria-labelledby="online-title" className="space-y-4 rounded-card border-2 border-dashed border-demo/40 bg-panel p-4 shadow-card sm:p-5" data-testid="online-simulation">
      <div className="flex items-start gap-3 rounded-tile bg-demo-soft p-3.5 text-sm text-text">
        <FlaskConical aria-hidden className="mt-0.5 size-5 shrink-0 text-demo" />
        <div>
          <h2 id="online-title" className="font-semibold text-demo">
            {t('portal:pay.online.banner')}
          </h2>
          <p className="mt-1">{t('portal:pay.online.body')}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-tile border border-border p-3.5">
        <span aria-hidden className="grid h-9 w-14 place-items-center rounded-control bg-[linear-gradient(135deg,#1e4d42,#2a6a5a)] text-on-primary">
          <CreditCard className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">{t('portal:pay.online.method')}</p>
          <p className="text-sm font-semibold text-text">{t('portal:pay.online.card')}</p>
        </div>
        <Badge tone="demo">{t('portal:shell.demoShort')}</Badge>
      </div>
      <Button variant="primary" size="lg" icon={Wallet} isPending={mutation.isPending} onPress={() => void run()} className="h-auto w-full py-2.5 text-center whitespace-normal" data-testid="online-submit">
        {/* The amount is a plain string inside the label: isolate it left-to-right (LRI … PDI). */}
        {t('portal:pay.online.submit', { amount: `\u2066${amountText}\u2069` })}
      </Button>
    </section>
  );
}

function DoneState({ item, fmt, header, onAnother, hasMore }: { item: InstalmentItem; fmt: PortalFormat; header: ReactNode; onAnother: () => void; hasMore: boolean }) {
  const { t } = useT();
  const announce = useAnnounce();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const label = instalmentLabel(t, item);
  const simulated = item.proof?.simulated === true;
  useEffect(() => {
    headingRef.current?.focus();
    announce(t('portal:pay.done.announce', { label }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);
  return (
    <>
      {header}
      <section
        aria-labelledby="pay-done-title"
        role="status"
        data-testid="pay-done"
        data-status={item.status}
        className="mx-auto max-w-xl rounded-card border border-info/30 bg-panel p-6 text-center shadow-raised motion-safe:animate-pop-in sm:p-8"
      >
        <span className="mx-auto grid size-16 place-items-center rounded-pill bg-info-soft text-info">
          <Hourglass aria-hidden className="size-8" />
        </span>
        <h2 id="pay-done-title" ref={headingRef} tabIndex={-1} className="mt-4 text-2xl font-bold text-text outline-none">
          {t('portal:pay.done.title')}
        </h2>
        <div className="mt-2 flex justify-center">
          <InstalmentStatusChip status={item.status} />
        </div>
        <p className="mt-3 text-[1.75rem] font-bold text-info">
          <Amount value={item.amount.amount} />
        </p>
        <p className="mt-3 text-sm text-text">{simulated ? t('portal:pay.done.onlineBody', { label }) : t('portal:pay.done.uploadBody', { label })}</p>
        {item.proof && (
          <p className="mt-2 text-xs text-muted">{t(simulated ? 'portal:instalment.simulatedSent' : 'portal:instalment.proofSent', { date: fmt.instant(item.proof.submittedAt) })}</p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href={`${PORTAL.payments}?status=awaiting`} variant="plain" className={buttonClass('primary', 'md')} data-testid="done-payments">
            <ReceiptText aria-hidden className="size-4" />
            {t('portal:pay.done.toPayments')}
          </Link>
          <Link href={PORTAL.home} variant="plain" className={buttonClass('secondary', 'md')} data-testid="done-home">
            <Home aria-hidden className="size-4" />
            {t('portal:pay.done.home')}
          </Link>
          {hasMore && (
            <Button variant="quiet" onPress={onAnother}>
              {t('portal:pay.done.another')}
            </Button>
          )}
        </div>
      </section>
    </>
  );
}
