import { LEAD_STATUSES, type ActivityEvent, type LeadDetail, type LeadStatus, type UnitSummary } from '@repo/contracts';
import {
  ActivityTimeline,
  Badge,
  Button,
  buttonClass,
  ContactButtons,
  DirectionalIcon,
  Dialog,
  EmptyState,
  ErrorState,
  HueChip,
  KeyValueList,
  Link,
  MenuButton,
  MetricCard,
  NotFoundState,
  PageHeader,
  Panel,
  RecordCard,
  RevealItem,
  SkeletonBlock,
  Stagger,
  StatusLabel,
  UrlTabs,
  useAnnounce,
  useApiMutation,
  useApiQuery,
  useNavigation,
  useQueryParam,
  useSession,
  useT,
  useToast,
} from '@repo/ui';
import { ApiError } from '@repo/contracts';
import { AlarmClock, ArrowLeft, CalendarDays, CalendarPlus, ChevronDown, Eye, Megaphone, NotebookPen, Sparkles, Wallet } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button as AriaButton, Label, TextArea, TextField } from 'react-aria-components';
import { LINKS } from '../../nav.config';
import { useContactSheet } from './ContactSheet';
import { initials, useCrmFormat, type CrmFormat } from './format';
import { UnitQuickView } from './UnitQuickView';

const SLOTS = ['10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'];

/** Only list addresses inside the backoffice are valid "back" targets (no open redirects). */
const safeFrom = (from: string | null) => (from && from.startsWith('/backoffice/crm/') ? from : LINKS.leads);

/**
 * Lead workspace (CRM-003): who the lead is, what happened, what's next. Contact, timeline, visits
 * and matching units in tabs; actions (note, call, WhatsApp, visit, follow-up, stage, unit hold) all
 * write to the demo session and appear in the timeline at once. "Back" restores the list filters.
 */
export default function LeadWorkspace() {
  const { t } = useT();
  const { location } = useNavigation();
  const params = new URLSearchParams(location.search);
  const leadId = params.get('record');
  const backHref = safeFrom(params.get('from'));
  const detail = useApiQuery<LeadDetail>(leadId ? { method: 'GET', path: `/leads/${leadId}` } : null);

  const back = (
    <Link href={backHref} variant="plain" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary data-hovered:underline" data-testid="lead-back">
      <DirectionalIcon icon={ArrowLeft} className="size-4" />
      {t('crm:lead.back')}
    </Link>
  );

  // Opened without a record (e.g. the register address): invite a choice rather than "not found".
  if (!leadId) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('nav:pages.leadWorkspace')} />
        <EmptyState
          title={t('crm:lead.chooseTitle')}
          body={t('crm:lead.chooseBody')}
          actions={
            <Link href={LINKS.leads} variant="plain" className={buttonClass('primary')}>
              {t('crm:home.viewAll')}
            </Link>
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
          {t('crm:lead.notFoundTitle')}
        </h1>
        <NotFoundState />
      </div>
    );
  }
  if (detail.isError) {
    return (
      <div className="space-y-4">
        {back}
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      </div>
    );
  }
  if (!detail.data) {
    return (
      <div className="space-y-4">
        {back}
        <SkeletonBlock lines={8} />
      </div>
    );
  }
  return <Workspace data={detail.data} back={back} />;
}

function Workspace({ data, back }: { data: LeadDetail; back: React.ReactNode }) {
  const { t } = useT();
  const { can } = useSession();
  const f = useCrmFormat();
  const toast = useToast();
  const announce = useAnnounce();
  const contact = useContactSheet();
  const { navigate, location } = useNavigation();
  const [, setTab] = useQueryParam('tab');
  const [unitParam, setUnit] = useQueryParam('unit');
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const stage = useApiMutation();
  const { lead, party } = data;
  const target = { leadId: lead.id, name: party.displayName, phone: party.phone, projectName: data.project.name };

  const openVisit = () => {
    const p = new URLSearchParams(location.search);
    p.set('drawer', 'schedule-visit');
    p.set('lead', lead.id);
    navigate(`${location.pathname}?${p}`);
  };

  const changeStatus = async (status: LeadStatus) => {
    await stage.mutateAsync({ method: 'POST', path: `/leads/${lead.id}/status`, body: { status } });
    const msg = t('crm:lead.statusChanged', { name: party.displayName, status: t(`status:lead.${status}`) });
    toast.success(msg);
    announce(msg);
  };

  return (
    <div className="space-y-6">
      {back}
      <section className="rounded-card border border-border/70 bg-panel p-5 shadow-card sm:p-6" aria-labelledby="page-title">
        <div className="flex flex-wrap items-start gap-4">
          <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-[1.125rem] bg-primary text-lg font-bold text-on-primary animate-pop-in">
            {initials(party.displayName)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 id="page-title" className="text-figure-xs leading-tight font-bold tracking-tight text-text outline-none sm:text-3xl">
              <bdi>{party.displayName}</bdi>
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <HueChip hue="slate">{lead.ref}</HueChip>
              <StatusLabel kind="lead" status={lead.status} />
              <HueChip hue="teal">{data.project.name}</HueChip>
              {lead.createdInSession && (
                <Badge tone="info" icon={Sparkles}>
                  {t('crm:lead.createdInSession')}
                </Badge>
              )}
            </div>
            <p className="mt-2 text-sm text-muted">
              {t('crm:lead.owner', { name: data.ownerName })} · {t('crm:lead.created', { when: f.date(lead.createdAt) })}
            </p>
          </div>
          <ContactButtons name={party.displayName} onCall={() => contact.open('call', target)} onWhatsApp={() => contact.open('whatsapp', target)} testId="lead-contact" />
        </div>
        <div role="group" aria-label={t('crm:lead.actions')} className="mt-5 flex flex-wrap gap-2 border-t border-border/80 pt-4">
          <Button variant="secondary" size="sm" icon={NotebookPen} onPress={() => setTab('activity')} data-testid="lead-add-note">
            {t('crm:lead.logNote')}
          </Button>
          {can('visit.schedule') && (
            <Button variant="secondary" size="sm" icon={CalendarPlus} onPress={openVisit} data-testid="lead-schedule-visit">
              {t('crm:lead.scheduleVisit')}
            </Button>
          )}
          <Button variant="secondary" size="sm" icon={AlarmClock} onPress={() => setFollowUpOpen(true)} data-testid="lead-set-follow-up">
            {t('crm:lead.setFollowUp')}
          </Button>
          <MenuButton
            label={t('crm:lead.changeStatus')}
            placement="bottom start"
            onAction={(id) => void changeStatus(id as LeadStatus)}
            groups={[{ id: 'stages', items: LEAD_STATUSES.filter((s) => s !== lead.status).map((s) => ({ id: s, label: t(`status:lead.${s}`), testId: `lead-status-${s}` })) }]}
            trigger={
              <AriaButton
                data-testid="lead-change-status"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-border-control bg-panel px-3 text-sm font-medium text-text outline-none data-hovered:bg-sunken data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus pointer-coarse:min-h-11"
              >
                {t('crm:lead.changeStatus')}
                <ChevronDown aria-hidden className="size-4" />
              </AriaButton>
            }
          />
        </div>
      </section>

      <Stagger className="grid grid-cols-1 gap-3 min-[24rem]:grid-cols-2 xl:grid-cols-4">
        <RevealItem>
          <MetricCard label={t('crm:lead.budget')} value={<bdi dir="ltr" className="ltr-ref">{f.money(lead.budget)}</bdi>} accessibleValue={f.moneyExact(lead.budget)} icon={Wallet} hue="gold" />
        </RevealItem>
        <RevealItem>
          <MetricCard
            label={t('crm:lead.nextFollowUp')}
            value={<span className="text-lg whitespace-normal">{lead.nextFollowUp ? f.when(lead.nextFollowUp) : t('crm:list.noFollowUp')}</span>}
            icon={AlarmClock}
            hue="amber"
            testId="lead-next-follow-up"
          />
        </RevealItem>
        <RevealItem>
          <MetricCard label={t('crm:lead.visits')} value={f.count(data.visits.length)} icon={CalendarDays} hue="violet" testId="lead-visit-count" />
        </RevealItem>
        <RevealItem>
          <MetricCard label={t('crm:lead.source')} value={<span className="text-lg whitespace-normal">{t(`crm:source.${lead.source}`)}</span>} icon={Megaphone} hue="sky" />
        </RevealItem>
      </Stagger>

      <UrlTabs
        label={t('crm:lead.tabs')}
        items={[
          { id: 'overview', label: t('crm:lead.tabOverview') },
          { id: 'activity', label: t('crm:lead.tabActivity') },
          { id: 'visits', label: t('crm:lead.tabVisits') },
          { id: 'units', label: t('crm:lead.tabUnits') },
        ]}
      >
        {(tab) =>
          tab === 'activity' ? (
            <ActivityTab data={data} f={f} />
          ) : tab === 'visits' ? (
            <VisitsTab data={data} f={f} onSchedule={can('visit.schedule') ? openVisit : undefined} />
          ) : tab === 'units' ? (
            <UnitsTab units={data.matchedUnits} project={data.project.name} f={f} onOpen={(id) => setUnit(id, { replace: false })} />
          ) : (
            <OverviewTab data={data} f={f} onOpenUnit={(id) => setUnit(id, { replace: false })} />
          )
        }
      </UrlTabs>

      <UnitQuickView unitId={unitParam} lead={{ id: lead.id, ref: lead.ref, name: party.displayName }} onClose={() => setUnit(null)} />
      <FollowUpDialog isOpen={followUpOpen} onClose={() => setFollowUpOpen(false)} leadId={lead.id} f={f} />
      {contact.sheet}
    </div>
  );
}

function useParamsRenderer(f: CrmFormat) {
  const { t } = useT();
  return (event: ActivityEvent) => {
    const p: Record<string, string> = { ...event.params };
    if (p.source) p.source = t(`crm:source.${p.source}` as 'crm:source.website');
    if (p.status) p.status = t(`status:lead.${p.status}` as 'status:lead.new');
    if (p.at) p.at = f.when(p.at);
    if (p.until) p.until = f.when(p.until);
    if (p.date) p.date = f.date(`${p.date}T09:00:00Z`);
    return p;
  };
}

function OverviewTab({ data, f, onOpenUnit }: { data: LeadDetail; f: CrmFormat; onOpenUnit: (id: string) => void }) {
  const { t } = useT();
  const renderParams = useParamsRenderer(f);
  const [, setTab] = useQueryParam('tab');
  return (
    <div className="grid gap-6 xl:grid-cols-12">
      <Panel title={t('crm:lead.contact')} className="xl:col-span-5">
        <KeyValueList
          items={[
            { label: t('crm:lead.phone'), value: <bdi dir="ltr" className="ltr-ref">{f.phone(data.party.phone)}</bdi> },
            { label: t('crm:lead.email'), value: data.party.email ? <bdi dir="ltr" className="ltr-ref">{data.party.email}</bdi> : t('crm:lead.notGiven') },
            { label: t('crm:lead.cnic'), value: data.party.cnic ? <bdi dir="ltr" className="ltr-ref">{data.party.cnic}</bdi> : t('crm:lead.notGiven') },
            { label: t('crm:lead.city'), value: data.party.city },
          ]}
        />
        <h3 className="mt-6 mb-2 text-sm font-semibold text-text">{t('crm:lead.interest')}</h3>
        {data.interestUnit ? <UnitRow unit={data.interestUnit} f={f} onOpen={onOpenUnit} /> : <p className="text-sm text-muted">{t('crm:lead.noInterest')}</p>}
      </Panel>
      <Panel
        title={t('crm:lead.latest')}
        className="xl:col-span-7"
        actions={
          <Button size="sm" variant="quiet" onPress={() => setTab('activity')}>
            {t('crm:lead.seeAll')}
          </Button>
        }
      >
        <ActivityTimeline events={data.activity.slice(0, 4)} renderParams={renderParams} />
      </Panel>
    </div>
  );
}

function ActivityTab({ data, f }: { data: LeadDetail; f: CrmFormat }) {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const renderParams = useParamsRenderer(f);
  const add = useApiMutation();
  const [note, setNote] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  const save = async () => {
    if (!note.trim()) {
      field.current?.focus();
      return;
    }
    await add.mutateAsync({ method: 'POST', path: `/leads/${data.lead.id}/activity`, body: { kind: 'note', note: note.trim() } });
    setNote('');
    toast.success(t('crm:lead.noteSaved'));
    announce(t('crm:lead.noteSaved'));
  };
  return (
    <div className="grid gap-6 xl:grid-cols-12">
      <Panel title={t('crm:lead.logNote')} className="h-fit xl:col-span-5">
        <TextField value={note} onChange={setNote} className="flex flex-col gap-1.5">
          <Label className="text-sm font-medium text-text">{t('crm:lead.noteLabel')}</Label>
          <TextArea
            ref={field}
            rows={4}
            placeholder={t('crm:lead.notePlaceholder')}
            data-testid="lead-note-input"
            className="rounded-control border border-border-control bg-panel px-3 py-2 text-sm text-text outline-none placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-focus"
          />
        </TextField>
        <Button variant="primary" className="mt-3" icon={NotebookPen} onPress={save} isPending={add.isPending} data-testid="lead-note-save">
          {t('crm:lead.saveNote')}
        </Button>
      </Panel>
      <Panel title={t('crm:lead.tabActivity')} className="xl:col-span-7">
        <div data-testid="lead-timeline">
          <ActivityTimeline events={data.activity} renderParams={renderParams} />
        </div>
      </Panel>
    </div>
  );
}

function VisitsTab({ data, f, onSchedule }: { data: LeadDetail; f: CrmFormat; onSchedule?: () => void }) {
  const { t } = useT();
  return (
    <div className="space-y-4">
      {onSchedule && (
        <Button variant="primary" icon={CalendarPlus} onPress={onSchedule}>
          {t('crm:lead.scheduleVisit')}
        </Button>
      )}
      {data.visits.length === 0 ? (
        <p className="rounded-card border border-dashed border-border bg-panel p-6 text-center text-sm text-muted">{t('crm:lead.visitsEmpty')}</p>
      ) : (
        <Stagger as="ul" className="grid gap-3 lg:grid-cols-2">
          {data.visits.map((v) => (
            <RevealItem as="li" key={v.id}>
              <RecordCard
                testId="lead-visit"
                title={f.when(v.at)}
                chips={
                  <>
                    <Badge tone={v.status === 'completed' || v.status === 'confirmed' ? 'success' : v.status === 'no_show' || v.status === 'cancelled' ? 'neutral' : 'info'} icon={CalendarDays}>
                      {t(`crm:visitStatus.${v.status}`)}
                    </Badge>
                    <HueChip hue="teal">{v.projectName}</HueChip>
                    {v.unitRef && <HueChip hue="slate">{v.unitRef}</HueChip>}
                  </>
                }
              />
            </RevealItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}

function UnitsTab({ units, project, f, onOpen }: { units: UnitSummary[]; project: string; f: CrmFormat; onOpen: (id: string) => void }) {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t('crm:lead.unitsDescription', { project })}</p>
      {units.length === 0 ? (
        <p className="rounded-card border border-dashed border-border bg-panel p-6 text-center text-sm text-muted">{t('crm:lead.unitsEmpty')}</p>
      ) : (
        <Stagger as="ul" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {units.map((u) => (
            <RevealItem as="li" key={u.id}>
              <UnitRow unit={u} f={f} onOpen={onOpen} />
            </RevealItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}

function UnitRow({ unit, f, onOpen }: { unit: UnitSummary; f: CrmFormat; onOpen: (id: string) => void }) {
  const { t } = useT();
  return (
    <RecordCard
      testId="matched-unit"
      title={<bdi dir="ltr" className="ltr-ref">{unit.ref}</bdi>}
      chips={
        <>
          <StatusLabel kind="unit" status={unit.status} />
          <HueChip hue="sky">{t(`crm:types.${unit.type}`)}</HueChip>
        </>
      }
      actions={
        <Button size="sm" variant="secondary" icon={Eye} onPress={() => onOpen(unit.id)} data-testid="matched-unit-open">
          {t('crm:lead.quickView')}
        </Button>
      }
    >
      <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <bdi dir="ltr" className="ltr-ref text-muted">{f.area(unit.areaSqft)}</bdi>
        <bdi dir="ltr" className="ltr-ref text-base font-bold text-text">{f.money(unit.price)}</bdi>
      </p>
    </RecordCard>
  );
}

function FollowUpDialog({ isOpen, onClose, leadId, f }: { isOpen: boolean; onClose: () => void; leadId: string; f: CrmFormat }) {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const set = useApiMutation();
  const [day, setDay] = useState(1);
  const [time, setTime] = useState('11:00');
  const options = [1, 2, 3, 7].map((d) => {
    const date = new Date(Date.now() + d * 86_400_000);
    const iso = date.toISOString().slice(0, 10);
    return { d, iso, label: f.date(`${iso}T09:00:00Z`) };
  });
  const save = async () => {
    const iso = options.find((o) => o.d === day)!.iso;
    const at = new Date(`${iso}T${time}:00+05:00`).toISOString();
    await set.mutateAsync({ method: 'POST', path: `/leads/${leadId}/follow-up`, body: { at } });
    const msg = t('crm:lead.followUpSaved', { when: f.when(at) });
    toast.success(msg);
    announce(msg);
    onClose();
  };
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title={t('crm:lead.followUpTitle')}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onPress={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="primary" onPress={save} isPending={set.isPending} data-testid="follow-up-save">
            {t('crm:lead.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text">{t('crm:lead.followUpDate')}</legend>
          <div className="flex flex-wrap gap-2">
            {options.map((o) => (
              <AriaButton
                key={o.d}
                aria-pressed={day === o.d}
                onPress={() => setDay(o.d)}
                className="min-h-10 rounded-pill border border-border px-3.5 text-sm text-text outline-none aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-on-primary data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus"
              >
                {o.label}
              </AriaButton>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text">{t('crm:lead.followUpTime')}</legend>
          <div className="flex flex-wrap gap-2">
            {SLOTS.map((s) => (
              <AriaButton
                key={s}
                aria-pressed={time === s}
                onPress={() => setTime(s)}
                className="min-h-10 rounded-pill border border-border px-3.5 text-sm text-text outline-none aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-on-primary data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus"
              >
                <bdi dir="ltr" className="ltr-ref">{s}</bdi>
              </AriaButton>
            ))}
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}
