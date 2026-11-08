import { SITE_VISIT_INTEREST, SITE_VISIT_OUTCOMES, type SiteVisitInterest, type SiteVisitOutcome, type VisitDetail, type VisitEvent } from '@repo/contracts';
import { ApiError } from '@repo/contracts';
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  HueChip,
  InlineAlert,
  KeyValueList,
  Link,
  NotFoundState,
  PageHeader,
  Panel,
  PlainTextArea,
  SelectControl,
  useAnnounce,
  useApiMutation,
  useApiQuery,
  useNavigation,
  useSession,
  useT,
  useToast,
} from '@repo/ui';
import { CalendarCheck, CalendarClock, CalendarDays, CalendarPlus, ClipboardCheck, Eye, X } from 'lucide-react';
import { useState } from 'react';
import { FieldError, Label, Radio, RadioGroup, Text } from 'react-aria-components';
import { ACCESS_DATE } from '../../../nav.config';
import { DateInput, LinkButton, SearchSelect, unbroken, useFieldError } from '../../society/hr/hkit';
import { Loading, ProblemAlert } from '../../society/kit';
import { E1, ProjectLink, Ref, SLOTS, StageBadge, addDays, toInstant, useSalesFormat, withDrawer, type SalesFormat, WRAP } from './kit';
import { VISIT_TONE } from './VisitCalendarPage';

/**
 * CRM-011 Visit workspace (`?record=vst_…`): one site visit and everything around it. Confirm it,
 * reschedule it (a new half-hour slot 09:00–19:00 with a reason; it then needs confirming again), or
 * record what happened: completed (interest, feedback, the units shown), no-show, or cancelled (with a
 * reason), and set the next follow-up, which shows on the lead, the opportunity and Sales home. Links:
 * the lead (Lead 360), its opportunity (Opportunity 360), the project's page and each unit's quick view.
 */
export default function VisitWorkspace() {
  const { t } = useT();
  const { location } = useNavigation();
  const id = new URLSearchParams(location.search).get('record');
  const detail = useApiQuery<VisitDetail>(id ? { method: 'GET', path: `/visits/${id}` } : null);
  const back = (
    <LinkButton href={E1.calendar()} variant="quiet" size="sm" testId="visit-back">
      {t('sales:visit.back')}
    </LinkButton>
  );
  if (!id) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('sales:visit.chooseTitle')} />
        <EmptyState
          title={t('sales:visit.chooseHeading')}
          body={t('sales:visit.chooseBody')}
          actions={
            <LinkButton href={E1.calendar()} variant="primary">
              {t('sales:visit.openCalendar')}
            </LinkButton>
          }
        />
      </div>
    );
  }
  if (detail.isError && detail.error instanceof ApiError && [403, 404].includes(detail.error.problem.status)) {
    return (
      <div className="space-y-4">
        {back}
        <h1 id="page-title" className="sr-only">
          {t('sales:visit.notFound')}
        </h1>
        <NotFoundState />
      </div>
    );
  }
  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  if (!detail.data) {
    return (
      <div className="space-y-4">
        {back}
        <Loading lines={10} />
      </div>
    );
  }
  return <Workspace data={detail.data} back={back} />;
}

function Workspace({ data, back }: { data: VisitDetail; back: React.ReactNode }) {
  const { t } = useT();
  const f = useSalesFormat();
  const toast = useToast();
  const announce = useAnnounce();
  const { can } = useSession();
  const { navigate, location } = useNavigation();
  const v = data.visit;
  const confirm = useApiMutation<VisitDetail>();
  const [dialog, setDialog] = useState<'reschedule' | 'outcome' | null>(null);
  const [problem, setProblem] = useState<unknown>(null);

  const doConfirm = async () => {
    setProblem(null);
    try {
      await confirm.mutateAsync({ method: 'POST', path: `/visits/${v.id}/confirm`, body: { version: v.version } });
      const message = t('sales:visit.confirmed', { name: data.party.displayName, when: f.when(v.at) });
      toast.success(message);
      announce(message);
    } catch (e) {
      setProblem(e);
    }
  };

  return (
    <div className="space-y-6" data-testid="visit-360" data-status={v.status}>
      {back}
      <PageHeader
        title={t('sales:visit.title', { name: data.party.displayName })}
        breadcrumbs={[
          { label: t('nav:pages.salesHome'), href: '/backoffice/crm/sales-home' },
          { label: t('sales:calendar.title'), href: E1.calendar() },
        ]}
        badge={
          <Badge tone={VISIT_TONE[v.status]} icon={CalendarDays} data-testid="visit-status">
            {unbroken(t(`crm:visitStatus.${v.status}`))}
          </Badge>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-text" data-testid="visit-when">
              {f.when(v.at)}
            </span>
            <Link href={E1.lead(v.leadId)} data-testid="visit-lead-link">
              {t('sales:common.lead')} <Ref value={v.leadRef} />
            </Link>
            <ProjectLink id={v.projectId} name={v.projectName} testId="visit-project-link" />
          </span>
        }
      />
      <section aria-label={t('sales:visit.actions')} className="flex flex-wrap gap-2 rounded-card border border-border/70 bg-panel p-3 shadow-card" data-testid="visit-actions">
        {data.allowed.confirm && (
          <Button className={WRAP} variant="secondary" icon={CalendarCheck} onPress={() => void doConfirm()} isPending={confirm.isPending} data-testid="visit-confirm">
            {t('sales:visit.confirm')}
          </Button>
        )}
        {data.allowed.reschedule && (
          <Button className={WRAP} variant="secondary" icon={CalendarClock} onPress={() => setDialog('reschedule')} data-testid="visit-reschedule">
            {t('sales:visit.reschedule')}
          </Button>
        )}
        {data.allowed.outcome && (
          <Button className={WRAP} variant="primary" icon={ClipboardCheck} onPress={() => setDialog('outcome')} data-testid="visit-record-outcome">
            {t('sales:visit.recordOutcome')}
          </Button>
        )}
        {can('visit.schedule') && (
          <Button className={WRAP} variant="quiet" icon={CalendarPlus} onPress={() => navigate(withDrawer(location.pathname, location.search, 'schedule-visit', { lead: v.leadId }))} data-testid="visit-schedule-another">
            {t('sales:visit.scheduleAnother')}
          </Button>
        )}
        {data.opportunity ? (
          <LinkButton href={E1.opportunity(data.opportunity.id)} variant="quiet" testId="visit-opportunity-link">
            {t('sales:visit.openOpportunity', { ref: data.opportunity.ref })}
          </LinkButton>
        ) : null}
      </section>
      {!!problem && <ProblemAlert error={problem} />}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel title={t('sales:visit.details')} className="xl:col-span-5">
          <KeyValueList
            items={[
              { label: t('sales:visit.when'), value: f.when(v.at) },
              { label: t('sales:common.customer'), value: <bdi>{data.party.displayName}</bdi> },
              { label: t('sales:common.phone'), value: <bdi dir="ltr">{f.phone(data.party.phone)}</bdi> },
              { label: t('sales:calendar.host'), value: <bdi>{v.host.name}</bdi> },
              { label: t('sales:common.lead'), value: <Ref value={v.leadRef} /> },
              { label: t('sales:common.leadStatus'), value: t(`status:lead.${data.lead.status}`) },
              { label: t('sales:common.stage'), value: data.opportunity ? <StageBadge stage={data.opportunity.stage} /> : t('sales:visit.noOpportunity') },
              { label: t('sales:common.nextFollowUpLabel'), value: data.lead.nextFollowUp ? f.when(data.lead.nextFollowUp) : t('sales:common.none') },
              ...(v.unitRef ? [{ label: t('sales:visit.unitOfInterestLabel'), value: <Ref value={v.unitRef} /> }] : []),
            ]}
          />
        </Panel>
        <Panel title={t('sales:visit.outcomeTitle')} className="xl:col-span-7">
          <div data-testid="visit-outcome">
            {data.outcome ? (
              <div className="space-y-2">
                <p className="flex flex-wrap items-center gap-2">
                  <Badge tone={VISIT_TONE[data.outcome.outcome]} icon={ClipboardCheck}>
                    {unbroken(t(`crm:visitStatus.${data.outcome.outcome}`))}
                  </Badge>
                  {data.outcome.interest && <HueChip hue="violet">{t(`sales:interest.${data.outcome.interest}`)}</HueChip>}
                </p>
                {data.outcome.feedback && <p className="break-words text-text">{t('sales:visit.feedbackQuote', { text: data.outcome.feedback })}</p>}
                <p className="text-sm text-muted">{t('sales:visit.recordedBy', { name: data.outcome.recordedBy, when: f.when(data.outcome.recordedAt) })}</p>
                {data.followUpAt && <p className="text-sm text-text">{unbroken(t('sales:common.followUpOn', { when: f.when(data.followUpAt) }))}</p>}
              </div>
            ) : v.status === 'completed' || v.status === 'no_show' || v.status === 'cancelled' ? (
              <p className="text-sm text-muted">{t('sales:visit.outcomeBeforeDemo')}</p>
            ) : (
              <p className="text-sm text-muted">{t('sales:visit.outcomePending')}</p>
            )}
          </div>
          <h3 className="mt-5 mb-2 text-sm font-semibold text-text">{t('sales:visit.unitsShown')}</h3>
          {data.unitsShown.length === 0 ? (
            <p className="text-sm text-muted">{t('sales:visit.unitsShownEmpty')}</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="visit-units-shown">
              {data.unitsShown.map((u) => (
                <li key={u.id} className="rounded-tile border border-border/70 p-3">
                  <p className="flex flex-wrap items-center justify-between gap-2">
                    <Ref value={u.ref} className="font-semibold" />
                    <bdi dir="ltr" className="text-sm font-semibold">
                      {f.money(u.price)}
                    </bdi>
                  </p>
                  <p className="text-sm text-muted">{t(`crm:types.${u.type}`)}</p>
                  <Link href={E1.unit(v.leadId, u.id)} className="mt-1 inline-flex items-center gap-1 text-sm">
                    <Eye aria-hidden className="size-4" />
                    {t('sales:opportunity.unitQuickView', { unit: u.ref })}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title={t('sales:visit.history')}>
        <VisitHistory events={data.history} f={f} />
      </Panel>

      {dialog === 'reschedule' && <RescheduleDialog data={data} onClose={() => setDialog(null)} />}
      {dialog === 'outcome' && <OutcomeDialog data={data} onClose={() => setDialog(null)} />}
    </div>
  );
}

function VisitHistory({ events, f }: { events: VisitEvent[]; f: SalesFormat }) {
  const { t } = useT();
  if (events.length === 0) return <p className="text-sm text-muted">{t('sales:visit.historyEmpty')}</p>;
  return (
    <ol className="space-y-3" data-testid="visit-history">
      {events.map((e) => (
        <li key={e.id} className="text-sm" data-kind={e.kind}>
          <p className="text-text">
            {e.kind === 'rescheduled'
              ? t('sales:visit.event.rescheduled', { from: e.from ? f.when(e.from) : '', to: e.to ? f.when(e.to) : '' })
              : e.kind === 'outcome'
                ? t('sales:visit.event.outcome', { outcome: t(`crm:visitStatus.${e.outcome ?? 'completed'}`) })
                : e.kind === 'follow_up'
                  ? t('sales:visit.event.followUp', { when: e.to ? f.when(e.to) : '' })
                  : t('sales:visit.event.confirmed')}
          </p>
          {e.reason && <p className="break-words text-muted">{t('sales:event.note', { note: e.reason })}</p>}
          <p className="text-xs text-muted">{e.actorName ? t('sales:event.byAt', { name: e.actorName, when: f.when(e.at) }) : f.when(e.at)}</p>
        </li>
      ))}
    </ol>
  );
}

function SlotPicker({ date, setDate, time, setTime, idPrefix, dateLabel, timeLabel, dateError }: { date: string; setDate: (v: string) => void; time: string | null; setTime: (v: string | null) => void; idPrefix: string; dateLabel: string; timeLabel: string; dateError?: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <DateInput id={`${idPrefix}-date`} label={dateLabel} value={date} onChange={setDate} min={ACCESS_DATE} max={addDays(ACCESS_DATE, 90)} testId={`${idPrefix}-date`} description={dateError} />
      <SelectControl label={timeLabel} value={time} onChange={setTime} options={SLOTS.map((s) => ({ id: s, label: s }))} testId={`${idPrefix}-time`} />
    </div>
  );
}

function RescheduleDialog({ data, onClose }: { data: VisitDetail; onClose: () => void }) {
  const { t } = useT();
  const f = useSalesFormat();
  const toast = useToast();
  const announce = useAnnounce();
  const mutation = useApiMutation<VisitDetail>();
  const [date, setDate] = useState('');
  const [time, setTime] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [tried, setTried] = useState(false);
  const fieldError = useFieldError(error);
  const submit = async () => {
    setTried(true);
    if (!date || !time || reason.trim().length < 3) return;
    setError(null);
    try {
      const at = toInstant(date, time);
      await mutation.mutateAsync({ method: 'POST', path: `/visits/${data.visit.id}/reschedule`, body: { at, reason: reason.trim(), version: data.visit.version } });
      const message = t('sales:visit.rescheduled', { name: data.party.displayName, when: f.when(at) });
      onClose();
      toast.success(message);
      announce(message);
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Dialog
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('sales:visit.rescheduleTitle')}
      description={t('sales:visit.rescheduleIntro', { when: f.when(data.visit.at) })}
      footer={
        <>
          <Button className={WRAP} variant="secondary" onPress={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button className={WRAP} variant="primary" icon={CalendarClock} onPress={() => void submit()} isPending={mutation.isPending} data-testid="reschedule-submit">
            {t('sales:visit.rescheduleSubmit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4" data-testid="reschedule-dialog">
        {!!error && <ProblemAlert error={error} />}
        <SlotPicker date={date} setDate={setDate} time={time} setTime={setTime} idPrefix="reschedule" dateLabel={t('sales:visit.newDate')} timeLabel={t('sales:visit.newTime')} dateError={fieldError('at') ?? t('sales:visit.slotHint')} />
        {tried && (!date || !time) && (
          <InlineAlert tone="warning" role="alert">
            {t('sales:visit.slotRequired')}
          </InlineAlert>
        )}
        <PlainTextArea label={t('sales:visit.rescheduleReason')} value={reason} onChange={setReason} errorKey={tried && reason.trim().length < 3 ? 'sales:errors.reasonRequired' : undefined} testId="reschedule-reason" />
      </div>
    </Dialog>
  );
}

/** A labelled radio group (plain state, not a form library), with its error read out with the group. */
function Radios({ label, description, value, onChange, options, error, testId }: { label: string; description?: string; value: string | null; onChange: (v: string) => void; options: Array<{ id: string; label: string }>; error?: string; testId?: string }) {
  return (
    <RadioGroup value={value} onChange={onChange} isInvalid={!!error} validationBehavior="aria" className="space-y-2" data-testid={testId}>
      <Label className="text-sm font-medium text-text">{label}</Label>
      {description && (
        <Text slot="description" className="block text-xs text-muted">
          {description}
        </Text>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <Radio
            key={o.id}
            value={o.id}
            className="group flex min-h-11 cursor-default items-center gap-3 rounded-control border border-border px-3 text-sm text-text outline-none data-selected:border-primary data-selected:bg-primary-soft data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus"
          >
            <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-pill border-2 border-border-control group-data-selected:border-primary">
              <span className="size-2.5 rounded-pill bg-primary opacity-0 group-data-selected:opacity-100" />
            </span>
            {o.label}
          </Radio>
        ))}
      </div>
      {error && <FieldError className="block text-xs font-medium text-error">{error}</FieldError>}
    </RadioGroup>
  );
}

interface UnitOption {
  id: string;
  ref: string;
  status: string;
}

function OutcomeDialog({ data, onClose }: { data: VisitDetail; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const f = useSalesFormat();
  const mutation = useApiMutation<VisitDetail>();
  const units = useApiQuery<UnitOption[]>({ method: 'GET', path: '/units', query: { projectId: data.visit.projectId } });
  const [outcome, setOutcome] = useState<SiteVisitOutcome | null>(null);
  const [interest, setInterest] = useState<SiteVisitInterest | null>(null);
  const [feedback, setFeedback] = useState('');
  const [shown, setShown] = useState<string[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [followDate, setFollowDate] = useState('');
  const [followTime, setFollowTime] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tried, setTried] = useState(false);
  const fieldError = useFieldError(error);
  const completed = outcome === 'completed';
  const unitOptions = (units.data ?? []).filter((u) => !shown.includes(u.id)).map((u) => ({ id: u.id, label: u.ref, hint: t(`status:unit.${u.status}` as 'status:unit.available') }));
  const refOf = (id: string) => units.data?.find((u) => u.id === id)?.ref ?? id;

  const submit = async () => {
    setTried(true);
    if (!outcome || (outcome === 'cancelled' && feedback.trim().length < 3) || (!!followDate !== !!followTime)) return;
    setError(null);
    try {
      const followUpAt = followDate && followTime ? toInstant(followDate, followTime) : undefined;
      await mutation.mutateAsync({
        method: 'POST',
        path: `/visits/${data.visit.id}/outcome`,
        body: { outcome, ...(completed && interest ? { interest } : {}), feedback: feedback.trim(), ...(completed && shown.length ? { unitsShown: shown } : {}), ...(followUpAt ? { followUpAt } : {}), version: data.visit.version },
      });
      const message = followUpAt
        ? t('sales:visit.outcomeSavedFollowUp', { outcome: t(`crm:visitStatus.${outcome}`), when: f.when(followUpAt) })
        : t('sales:visit.outcomeSaved', { outcome: t(`crm:visitStatus.${outcome}`) });
      onClose();
      toast.success(message);
      announce(message);
    } catch (e) {
      setError(e);
    }
  };

  return (
    <Dialog
      isOpen
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={t('sales:visit.outcomeDialogTitle')}
      description={t('sales:visit.outcomeIntro', { name: data.party.displayName, when: f.when(data.visit.at) })}
      footer={
        <>
          <Button className={WRAP} variant="secondary" onPress={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button className={WRAP} variant="primary" icon={ClipboardCheck} onPress={() => void submit()} isPending={mutation.isPending} data-testid="outcome-submit">
            {t('sales:visit.outcomeSubmit')}
          </Button>
        </>
      }
    >
      <div className="space-y-5" data-testid="outcome-dialog">
        {!!error && <ProblemAlert error={error} />}
        <Radios
          label={t('sales:visit.outcomeLabel')}
          value={outcome}
          onChange={(v) => setOutcome(v as SiteVisitOutcome)}
          options={SITE_VISIT_OUTCOMES.map((o) => ({ id: o, label: t(`crm:visitStatus.${o}`) }))}
          error={tried && !outcome ? t('sales:errors.outcomeRequired') : fieldError('outcome')}
          testId="outcome-kind"
        />
        {completed && (
          <Radios
            label={t('sales:visit.interestLabel')}
            description={t('sales:common.optional')}
            value={interest}
            onChange={(v) => setInterest(v as SiteVisitInterest)}
            options={SITE_VISIT_INTEREST.map((o) => ({ id: o, label: t(`sales:interest.${o}`) }))}
            error={fieldError('interest')}
            testId="outcome-interest"
          />
        )}
        <PlainTextArea
          label={outcome === 'cancelled' ? t('sales:visit.cancelReason') : t('sales:visit.feedback')}
          value={feedback}
          onChange={setFeedback}
          optional={outcome !== 'cancelled'}
          rows={3}
          errorKey={tried && outcome === 'cancelled' && feedback.trim().length < 3 ? 'sales:errors.cancelReasonRequired' : undefined}
          testId="outcome-feedback"
        />
        {completed && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-text">{t('sales:visit.unitsShown')}</legend>
            <SearchSelect
              label={t('sales:visit.addUnit')}
              options={unitOptions}
              value={pick}
              onChange={(id) => {
                setShown((s) => (s.length >= 10 ? s : [...s, id]));
                setPick(null);
              }}
              testId="outcome-unit"
              description={t('sales:visit.addUnitHint')}
              errorText={fieldError('unitsShown')}
            />
            {shown.length > 0 && (
              <ul className="flex flex-wrap gap-2" data-testid="outcome-units">
                {shown.map((id) => (
                  <li key={id} className="inline-flex items-center gap-1 rounded-pill border border-border px-2 py-0.5 text-sm">
                    <Ref value={refOf(id)} />
                    <Button className={WRAP} size="sm" variant="quiet" icon={X} onPress={() => setShown((s) => s.filter((x) => x !== id))} aria-label={t('sales:visit.removeUnit', { unit: refOf(id) })}>
                      <span className="sr-only">{t('sales:visit.removeUnit', { unit: refOf(id) })}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        )}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-text">{t('sales:visit.followUpLegend')}</legend>
          <SlotPicker date={followDate} setDate={setFollowDate} time={followTime} setTime={setFollowTime} idPrefix="follow-up" dateLabel={t('sales:visit.followUpDate')} timeLabel={t('sales:visit.followUpTime')} dateError={fieldError('followUpAt') ?? t('sales:visit.followUpHint')} />
          {tried && !!followDate !== !!followTime && (
            <InlineAlert tone="warning" role="alert">
              {t('sales:visit.followUpBoth')}
            </InlineAlert>
          )}
        </fieldset>
      </div>
    </Dialog>
  );
}
