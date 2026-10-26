import type { ActivityEvent, Lead, Party, Project } from '@repo/contracts';
import { formatCalendarDate, useLocale } from '@repo/i18n';
import {
  ActivityTimeline,
  Button,
  DateTime,
  ErrorState,
  ForbiddenState,
  KeyValueList,
  Money,
  Panel,
  Reference,
  RelatedDrawer,
  SkeletonBlock,
  StatusLabel,
  UrlTabs,
  useApiQuery,
  useSession,
  useT,
  WorkspaceHeader,
} from '@repo/ui';
import { ApiError } from '@repo/contracts';
import { CalendarPlus, Network } from 'lucide-react';
import { useState } from 'react';

const TABS = [
  'overview', 'crm', 'visits', 'quotes', 'bookings', 'properties', 'ownership', 'payments',
  'ledger', 'documents', 'handover', 'maintenance', 'visitors', 'parking', 'communications', 'activity',
] as const;

interface LeadResponse {
  lead: Lead;
  party: Party;
  project: Project;
  activity: ActivityEvent[];
}

/** The 360° workspace pattern on a fictional lead: header, metrics, 16 tabs with overflow, related drawer, activity. */
export default function WorkspaceLab({ leadId }: { leadId: string }) {
  const { t } = useT();
  const { locale } = useLocale();
  const { personas, persona } = useSession();
  const [relatedOpen, setRelatedOpen] = useState(false);
  const query = useApiQuery<LeadResponse>({ method: 'GET', path: `/leads/${leadId}` });

  if (query.isPending) return <SkeletonBlock lines={6} />;
  if (query.isError) {
    const forbidden = query.error instanceof ApiError && query.error.problem.status === 403;
    return forbidden ? <ForbiddenState role={t((persona?.roleKey ?? 'common:persona.manager') as 'common:persona.manager')} /> : <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const { lead, party, project, activity } = query.data;
  const owner = personas.find((p) => p.id === lead.ownerPersonaId)?.displayName ?? lead.ownerPersonaId;

  return (
    <>
      <WorkspaceHeader
        entityLabel={t('common:entity.lead')}
        title={party.displayName}
        reference={lead.ref}
        status={<StatusLabel kind="lead" status={lead.status} />}
        breadcrumbs={[{ label: t('nav:pages.lab'), href: '/backoffice/lab' }, { label: t('nav:pages.labWorkspace') }]}
        metrics={[
          { label: t('lab:workspace.metrics.budget'), value: <Money value={lead.budget} /> },
          { label: t('lab:workspace.metrics.status'), value: t(`status:lead.${lead.status}`) },
          { label: t('lab:workspace.metrics.nextFollowUp'), value: lead.nextFollowUp ? <DateTime value={lead.nextFollowUp} style="dateTime" /> : '—' },
          { label: t('lab:workspace.metrics.owner'), value: <bdi>{owner}</bdi> },
        ]}
        actions={
          <>
            <Button variant="secondary" icon={Network} onPress={() => setRelatedOpen(true)} data-testid="open-related">
              {t('common:actions.related')}
            </Button>
            <Button variant="primary" icon={CalendarPlus} isDisabled disabledReason={t('common:quickCreate.availableStage2')}>
              {t('lab:workspace.actions.scheduleVisit')}
            </Button>
          </>
        }
      />
      <UrlTabs label={t('lab:workspace.title')} items={TABS.map((id) => ({ id, label: t(`lab:workspace.tabs.${id}`) }))}>
        {(tab) =>
          tab === 'overview' ? (
            <div className="grid gap-6 lg:grid-cols-3">
              <Panel title={t('lab:workspace.contact')}>
                <KeyValueList
                  items={[
                    { label: t('forms:fields.phone'), value: <Reference value={party.phone.replace(/^\+92(\d{3})/, '+92 $1 ')} /> },
                    { label: t('forms:fields.email'), value: <Reference value={party.email} /> },
                    ...(party.cnic ? [{ label: t('forms:fields.cnic'), value: <Reference value={party.cnic} /> }] : []),
                  ]}
                />
              </Panel>
              <Panel title={t('lab:workspace.interest')}>
                <KeyValueList
                  items={[
                    { label: t('lab:workspace.relatedProject'), value: project.name },
                    { label: t('forms:fields.budget'), value: <Money value={lead.budget} /> },
                    { label: t('forms:fields.source'), value: t(`forms:sources.${lead.source}`) },
                  ]}
                />
              </Panel>
              <Panel title={t('common:activity.timelineLabel')}>
                <ActivityTimeline
                  events={activity}
                  renderParams={(e) => ({
                    ...e.params,
                    ...(e.params.date ? { date: formatCalendarDate(e.params.date, locale) } : {}),
                    ...(e.params.source ? { source: t(`forms:sources.${e.params.source as 'website'}`) } : {}),
                  })}
                />
              </Panel>
            </div>
          ) : (
            <p className="rounded-card border border-dashed border-border bg-panel p-6 text-sm text-muted">
              {t('lab:workspace.tabPlaceholder', { tab: t(`lab:workspace.tabs.${tab as 'overview'}`) })}
            </p>
          )
        }
      </UrlTabs>
      <RelatedDrawer
        isOpen={relatedOpen}
        onOpenChange={setRelatedOpen}
        recordName={party.displayName}
        groups={[
          { title: t('common:entity.party'), items: [{ id: party.id, ref: party.ref, title: party.displayName, href: `/backoffice/cus/customer-360-workspace?record=${party.id}` }] },
          { title: t('lab:workspace.relatedProject'), items: [{ id: project.id, ref: project.ref, title: project.name, href: `/backoffice/prj/project-360-workspace?record=${project.id}` }] },
          {
            title: t('lab:workspace.relatedUnit'),
            items: [{ id: 'unt_lh_a_1204', ref: 'LH-A-1204', title: t('common:unitType.apartment_3bed'), href: '/backoffice/inv/unit-360-workspace?record=unt_lh_a_1204', meta: <StatusLabel kind="unit" status="held" /> }],
          },
        ]}
      />
    </>
  );
}
